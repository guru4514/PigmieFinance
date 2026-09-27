import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.findFirst();
  const admin = await prisma.staff.findFirst({ where: { organizationId: org!.id, role: 'org_admin' } });

  const msgs = [
    { title: 'New loan application', message: 'Ramesh Kumar applied for a ₹50,000 Daily Gold Loan', type: 'loan_application' },
    { title: 'Payment overdue', message: 'Suresh Babu has an overdue payment of ₹4,167', type: 'payment_overdue' },
    { title: 'Loan approved', message: "Lakshmi Devi's loan of ₹25,000 has been approved", type: 'loan_approved' },
    { title: 'Collection recorded', message: '₹1,500 collected from Anita Sharma', type: 'collection_recorded' },
    { title: 'System alert', message: '3 loans have been marked as overdue by the system', type: 'system_alert' },
  ];

  for (const m of msgs) {
    await prisma.notification.create({
      data: {
        organizationId: org!.id,
        recipientType: 'staff',
        recipientStaffId: admin!.id,
        type: m.type,
        title: m.title,
        message: m.message,
        isRead: false,
      },
    });
  }

  console.log(`✅ Created ${msgs.length} notifications`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
