import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // List all staff with their org
  const staff = await prisma.staff.findMany({
    include: { organization: { select: { name: true } } },
  });

  console.log('=== ALL STAFF RECORDS ===');
  for (const s of staff) {
    console.log(`  ${s.fullName} | role: ${s.role} | org: ${s.organization.name} | authUserId: ${s.authUserId} | staffId: ${s.id}`);
  }

  // List all orgs with loan counts
  const orgs = await prisma.organization.findMany();
  console.log('\n=== ORGANIZATIONS ===');
  for (const org of orgs) {
    const loanCount = await prisma.loan.count({ where: { organizationId: org.id } });
    const custCount = await prisma.customer.count({ where: { organizationId: org.id } });
    console.log(`  ${org.name} (${org.id}) | loans: ${loanCount} | customers: ${custCount}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
