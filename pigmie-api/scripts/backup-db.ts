import { spawn } from 'child_process';
import * as crypto from 'crypto';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { resolve } from 'path';
import { backupProcessEnvironment } from '../src/common/utils/backup-process.util';

// Ensure required environment variables are set
const requiredEnvVars = [
  'DATABASE_URL',
  'BACKUP_ENCRYPTION_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);
if (missingVars.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVars.join(', ')}`,
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL!;
const encryptionKeyRaw = process.env.BACKUP_ENCRYPTION_KEY!;
const accountId = process.env.R2_ACCOUNT_ID!;
const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
const bucketName = process.env.R2_BUCKET_NAME!;

// Create a 32-byte key using SHA-256 to ensure proper length for aes-256-cbc
const key = crypto.createHash('sha256').update(encryptionKeyRaw).digest();
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const filename = `backup-${timestamp}.sql.enc`;

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

  const pgDumpProcess = spawn('pg_dump', ['--no-password'], {
    env: backupProcessEnvironment(
      dbUrl,
      process.env.BACKUP_CA_PATH ||
        resolve(__dirname, '../prisma/supabase-ca.crt'),
    ),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (!pgDumpProcess.stdout) {
    throw new Error('Failed to get stdout from pg_dump process');
  }

  if (pgDumpProcess.stderr) {
    // Drain diagnostics without echoing connection details or database content.
    pgDumpProcess.stderr.resume();
  }

  const uploadStream = new PassThrough();

  // Prepend IV to the output so it can be used for decryption
  uploadStream.write(iv);

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
