import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'dotenv';
import { validateStaging } from './staging.mjs';

const config = parse(readFileSync(new URL('../.env.staging', import.meta.url)));
validateStaging(
  config,
  parse(readFileSync(new URL('../.env', import.meta.url))),
);
if (config.STAGING_PROJECT_REF !== 'sjelnxrlkrvwjcgqbvre')
  throw new Error('Unexpected staging target');
process.env.APP_ENV = 'staging';
process.env.DATABASE_URL = config.DATABASE_URL;
const require = createRequire(import.meta.url);
const { PrismaService } = require('../dist/prisma/prisma.service.js');
const {
  ProvisioningReconciliationService,
} = require('../dist/modules/staff/provisioning-reconciliation.service.js');
const prisma = new PrismaService();
try {
  const candidates = await new ProvisioningReconciliationService(
    prisma,
  ).inspect();
  console.log(
    JSON.stringify({
      scope: 'staging only; read only',
      limit: 100,
      candidates,
    }),
  );
} catch {
  console.error(
    'Unable to inspect staging provisioning; no connection or provider details printed.',
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
