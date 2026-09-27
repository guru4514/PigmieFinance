import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const OLD_ORG = '49e902f5-0295-4f73-8d95-cdb44cf6d71b'; // acme finance (has data)
  const NEW_ORG = 'a58a402e-22eb-4003-bd3b-b05c480a0e8a'; // Finanace (Developer2's org)
  const OLD_STAFF = '452a50fa-e177-4839-89d6-822e7eb91c60'; // Dev (old admin)
  const NEW_STAFF = '5fee4992-193e-4e66-88dc-10fa5616604d'; // Developer2 (new admin)

  // Get the new org's branch
  const newBranch = await prisma.branch.findFirst({ where: { organizationId: NEW_ORG } });
  if (!newBranch) {
    console.error('No branch found in new org');
    return;
  }
  console.log(`New branch: ${newBranch.name} (${newBranch.id})`);

  // 1. Move loan products
  const products = await prisma.loanProduct.updateMany({
    where: { organizationId: OLD_ORG },
    data: { organizationId: NEW_ORG },
  });
  console.log(`Moved ${products.count} loan products`);

  // 2. Move customers — update branch + agent
  const customers = await prisma.customer.updateMany({
    where: { organizationId: OLD_ORG },
    data: { organizationId: NEW_ORG, branchId: newBranch.id, assignedAgentId: NEW_STAFF },
  });
  console.log(`Moved ${customers.count} customers`);

  // 3. Move loans — update all staff references
  const loans = await prisma.loan.updateMany({
    where: { organizationId: OLD_ORG },
    data: {
      organizationId: NEW_ORG,
      assignedAgentId: NEW_STAFF,
      appliedById: NEW_STAFF,
      approvedById: NEW_STAFF,
      disbursedById: NEW_STAFF,
    },
  });
  console.log(`Moved ${loans.count} loans`);

  // 4. Move collections
  const collections = await prisma.collection.updateMany({
    where: { organizationId: OLD_ORG },
    data: { organizationId: NEW_ORG, collectedById: NEW_STAFF },
  });
  console.log(`Moved ${collections.count} collections`);

  // 5. Move notifications
  const notifications = await prisma.notification.updateMany({
    where: { organizationId: OLD_ORG },
    data: { organizationId: NEW_ORG, recipientStaffId: NEW_STAFF },
  });
  console.log(`Moved ${notifications.count} notifications`);

  // 6. Move audit logs
  const auditLogs = await prisma.auditLog.updateMany({
    where: { organizationId: OLD_ORG },
    data: { organizationId: NEW_ORG, actorStaffId: NEW_STAFF },
  });
  console.log(`Moved ${auditLogs.count} audit logs`);

  // Verify
  const newLoans = await prisma.loan.count({ where: { organizationId: NEW_ORG } });
  const newCustomers = await prisma.customer.count({ where: { organizationId: NEW_ORG } });
  const newCollections = await prisma.collection.count({ where: { organizationId: NEW_ORG } });
  console.log(`\n✅ Developer2's org now has: ${newCustomers} customers, ${newLoans} loans, ${newCollections} collections`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
