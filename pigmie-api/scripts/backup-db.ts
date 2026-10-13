import { spawn } from 'child_process';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { resolve } from 'path';
import { backupProcessEnvironment } from '../src/common/utils/backup-process.util';
import { encryptedBackupStream } from '../src/common/utils/backup-format.util';

// Ensure required environment variables are set
const requiredEnvVars = [
  'BACKUP_ENCRYPTION_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

function configuredConnection() {
  if (process.env.DIRECT_URL || process.env.DATABASE_URL)
    return process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (
    ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].every(
      (name) => process.env[name],
    )
  ) {
    const connection = new URL('postgresql://placeholder');
    connection.hostname = process.env.DB_HOST!;
    connection.port = process.env.DB_PORT || '5432';
    connection.username = process.env.DB_USER!;
    connection.password = process.env.DB_PASSWORD!;
    connection.pathname = '/' + process.env.DB_NAME!;
    return connection.toString();
  }
  return undefined;
}
const dbUrl = configuredConnection();
const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (!dbUrl) missingVars.push('DIRECT_URL or database connection variables');
if (missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(', ')}`,
  );
  process.exit(1);
}

const encryptionKeyRaw = process.env.BACKUP_ENCRYPTION_KEY!;
const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const bucketName = process.env.R2_BUCKET_NAME!;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `backups/backup-${timestamp}.pgbk`;

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function runBackup() {
  console.log(`Starting backup: ${filename}`);

  const cipher = encryptedBackupStream(encryptionKeyRaw);
  const pgDumpProcess = spawn(
    process.env.PG_DUMP_PATH || 'pg_dump',
    ['--no-password', '--format=custom'],
    {
      env: backupProcessEnvironment(
        dbUrl!,
        process.env.BACKUP_CA_PATH ||
          resolve(__dirname, '../prisma/supabase-ca.crt'),
      ),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  if (!pgDumpProcess.stdout) {
    throw new Error('Failed to get stdout from pg_dump process');
  }

  if (pgDumpProcess.stderr) {
    // Drain diagnostics without echoing connection details or database content.
    pgDumpProcess.stderr.resume();
  }

  const uploadStream = new PassThrough();

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      Key: filename,
      Body: uploadStream,
    },
  });

  upload.on('httpUploadProgress', (progress) => {
    console.log(`Upload progress: ${progress.loaded} bytes`);
  });

  const timeout = setTimeout(
    () => {
      pgDumpProcess.kill();
      uploadStream.destroy(new Error('Backup exceeded time limit'));
      void upload.abort().catch(() => undefined);
    },
    60 * 60 * 1000,
  );
  try {
    await Promise.all([
      upload.done(),
      pipeline(pgDumpProcess.stdout, cipher, uploadStream),
      new Promise<void>((resolve, reject) => {
        pgDumpProcess.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`pg_dump exited with code ${code}`));
        });
        pgDumpProcess.on('error', () =>
          reject(new Error('Database dump unavailable')),
        );
      }),
    ]);
    console.log(
      'Encrypted backup upload completed. Restore verification is still required.',
    );
  } catch {
    pgDumpProcess.kill();
    uploadStream.destroy();
    await upload.abort().catch(() => undefined);
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: bucketName, Key: filename }))
      .catch(() => {
        console.error('Failed backup object cleanup could not be confirmed.');
      });
    throw new Error('Backup failed; provider diagnostics suppressed');
  } finally {
    clearTimeout(timeout);
  }
}

runBackup().catch(() => {
  console.error(
    'Backup failed; credentials and provider diagnostics suppressed.',
  );
  process.exitCode = 1;
});
