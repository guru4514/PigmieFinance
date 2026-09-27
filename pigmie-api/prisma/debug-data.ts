import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Direct count (no RLS)
  const orgs = await prisma.organization.findMany();
  console.log('Organizations:', orgs.length, orgs.map(o => `${o.name} (${o.id})`));

  const customers = await prisma.customer.count();
  console.log('Customers:', customers);

  const loans = await prisma.loan.findMany({ select: { id: true, loanCode: true, status: true, outstandingBalance: true } });
  console.log('Loans:', loans.length);
  for (const l of loans) {
    console.log(`  ${l.loanCode} | status: ${l.status} | outstanding: ${l.outstandingBalance}`);
  }

  const collections = await prisma.collection.count();
  console.log('Collections:', collections);

  const schedules = await prisma.loanSchedule.count();
  console.log('Schedules:', schedules);

  // Check overdue
  const overdueSchedules = await prisma.loanSchedule.count({ where: { status: 'overdue' } });
  console.log('Overdue schedules:', overdueSchedules);

  // Check today's due
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dueTodayCount = await prisma.loanSchedule.count({
    where: { dueDate: { gte: today, lt: tomorrow }, status: { in: ['pending', 'partially_paid'] } }
  });
  console.log('Due today:', dueTodayCount);

  // Test RLS
  console.log('\n--- Testing RLS ---');
  const orgId = orgs[0]?.id;
  if (orgId) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_org_id', ${orgId}, true)`;
        const activeLoans = await tx.loan.count({ where: { organizationId: orgId, status: 'active' } });
        return activeLoans;
      });
      console.log('Active loans via RLS:', result);
    } catch (e: any) {
      console.log('RLS ERROR:', e.message);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
