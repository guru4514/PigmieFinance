import { exec } from 'child_process';
import * as crypto from 'crypto';
import { Upload } from '@aws-sdk/lib-storage';
import { S3Client } from '@aws-sdk/client-s3';
import { PassThrough } from 'stream';

// Ensure required environment variables are set
const requiredEnvVars = [
  'DATABASE_URL',
  'BACKUP_ENCRYPTION_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
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

  const pgDumpProcess = exec(`pg_dump "${dbUrl}"`);

  if (!pgDumpProcess.stdout) {
    throw new Error('Failed to get stdout from pg_dump process');
  }
  
  if (pgDumpProcess.stderr) {
    pgDumpProcess.stderr.on('data', (data) => {
      console.warn(`pg_dump stderr: ${data}`);
    });
  }

  const uploadStream = new PassThrough();

  // Prepend IV to the output so it can be used for decryption
  uploadStream.write(iv);
  
  pgDumpProcess.stdout.pipe(cipher).pipe(uploadStream);

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

  try {
    const result = await upload.done();
    console.log('Backup uploaded successfully:', result);
    process.exit(0);
  } catch (error) {
    console.error('Backup failed during upload:', error);
    process.exit(1);
  }
}

runBackup();
