import { PrismaClient, UserRole, InterestType, CollectionFrequency, LoanStatus, ScheduleStatus, CollectionMethod } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding demo data...\n');

  // Find existing org and staff
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('❌ No organization found. Please sign up and create an organization first.');
    process.exit(1);
  }

  const admin = await prisma.staff.findFirst({ where: { organizationId: org.id, role: 'org_admin' } });
  if (!admin) {
    console.error('❌ No admin staff found.');
    process.exit(1);
  }

  const branch = await prisma.branch.findFirst({ where: { organizationId: org.id } });
  if (!branch) {
    console.error('❌ No branch found.');
    process.exit(1);
  }

  console.log(`  Organization: ${org.name} (${org.id})`);
  console.log(`  Admin: ${admin.fullName} (${admin.id})`);
  console.log(`  Branch: ${branch.name} (${branch.id})\n`);

  // ── 1. Create Loan Products ──
  console.log('📦 Creating loan products...');

  const dailyProduct = await prisma.loanProduct.create({
    data: {
      organizationId: org.id,
      name: 'Daily Gold Loan',
      interestType: 'flat',
      interestRateAnnual: 24.0,
      collectionFrequency: 'daily',
      minAmount: 5000,
      maxAmount: 100000,
      minTenure: 30,
      maxTenure: 365,
      lateFeeType: 'flat',
      lateFeeValue: 50,
      processingFee: 200,
    },
  });

  const weeklyProduct = await prisma.loanProduct.create({
    data: {
      organizationId: org.id,
      name: 'Weekly Business Loan',
      interestType: 'reducing_balance',
      interestRateAnnual: 18.0,
      collectionFrequency: 'weekly',
      minAmount: 10000,
      maxAmount: 500000,
      minTenure: 12,
      maxTenure: 52,
      lateFeeType: 'percentage',
      lateFeeValue: 2,
      processingFee: 500,
    },
  });

  const monthlyProduct = await prisma.loanProduct.create({
    data: {
      organizationId: org.id,
      name: 'Monthly Agriculture Loan',
      interestType: 'flat',
      interestRateAnnual: 12.0,
      collectionFrequency: 'monthly',
      minAmount: 25000,
      maxAmount: 1000000,
      minTenure: 3,
      maxTenure: 24,
      lateFeeType: 'flat',
      lateFeeValue: 200,
      processingFee: 1000,
    },
  });

  console.log(`  ✅ Created 3 loan products\n`);

  // ── 2. Create Customers ──
  console.log('👥 Creating customers...');

  const customerData = [
    { fullName: 'Ramesh Kumar', phone: '9876543210', email: 'ramesh@example.com', address: '12, MG Road, Bangalore', gender: 'male', idProofType: 'aadhaar' as const },
    { fullName: 'Lakshmi Devi', phone: '9876543211', email: 'lakshmi@example.com', address: '45, Gandhi Nagar, Mysuru', gender: 'female', idProofType: 'aadhaar' as const },
    { fullName: 'Suresh Babu', phone: '9876543212', email: 'suresh@example.com', address: '78, KR Puram, Bangalore', gender: 'male', idProofType: 'pan' as const },
    { fullName: 'Anita Sharma', phone: '9876543213', email: 'anita@example.com', address: '23, Jayanagar, Bangalore', gender: 'female', idProofType: 'voter_id' as const },
    { fullName: 'Prasad Reddy', phone: '9876543214', email: 'prasad@example.com', address: '56, Whitefield, Bangalore', gender: 'male', idProofType: 'aadhaar' as const },
    { fullName: 'Kavitha Naik', phone: '9876543215', email: 'kavitha@example.com', address: '89, Koramangala, Bangalore', gender: 'female', idProofType: 'pan' as const },
    { fullName: 'Venkatesh Gowda', phone: '9876543216', email: 'venkatesh@example.com', address: '34, Malleshwaram, Bangalore', gender: 'male', idProofType: 'aadhaar' as const },
    { fullName: 'Deepa Rao', phone: '9876543217', email: 'deepa@example.com', address: '67, HSR Layout, Bangalore', gender: 'female', idProofType: 'passport' as const },
    { fullName: 'Mohammed Rafi', phone: '9876543218', email: 'rafi@example.com', address: '90, Shivajinagar, Bangalore', gender: 'male', idProofType: 'aadhaar' as const },
    { fullName: 'Priya Desai', phone: '9876543219', email: 'priya@example.com', address: '12, Indiranagar, Bangalore', gender: 'female', idProofType: 'driving_license' as const },
    { fullName: 'Rajesh Patil', phone: '9876543220', email: 'rajesh@example.com', address: '45, Electronic City, Bangalore', gender: 'male', idProofType: 'aadhaar' as const },
    { fullName: 'Sunita Bhat', phone: '9876543221', email: 'sunita@example.com', address: '78, Yelahanka, Bangalore', gender: 'female', idProofType: 'pan' as const },
  ];

  const customers = [];
  for (let i = 0; i < customerData.length; i++) {
    const c = customerData[i];
    const customer = await prisma.customer.upsert({
      where: { organizationId_phone: { organizationId: org.id, phone: c.phone } },
      update: {},
      create: {
        organizationId: org.id,
        branchId: branch.id,
        customerCode: `CUST-${String(i + 1).padStart(4, '0')}`,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        address: c.address,
        gender: c.gender,
        idProofType: c.idProofType,
        assignedAgentId: admin.id,
      },
    });
    customers.push(customer);
  }

  console.log(`  ✅ Created ${customers.length} customers\n`);

  // ── 3. Create Loans ──
  console.log('💰 Creating loans...');

  const today = new Date();
  const loans = [];

  // Helper: create date N days ago
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };

  // Helper: create date N days from now
  const daysFromNow = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };

  // Loan configs: [customer_index, product, principal, tenure, startDaysAgo, status]
  const loanConfigs = [
    { ci: 0, product: dailyProduct, principal: 50000, tenure: 100, startDaysAgo: 30, status: 'active' as LoanStatus },
    { ci: 1, product: dailyProduct, principal: 25000, tenure: 50, startDaysAgo: 20, status: 'active' as LoanStatus },
    { ci: 2, product: weeklyProduct, principal: 100000, tenure: 24, startDaysAgo: 60, status: 'active' as LoanStatus },
    { ci: 3, product: weeklyProduct, principal: 75000, tenure: 16, startDaysAgo: 45, status: 'active' as LoanStatus },
    { ci: 4, product: monthlyProduct, principal: 200000, tenure: 12, startDaysAgo: 90, status: 'active' as LoanStatus },
    { ci: 5, product: dailyProduct, principal: 30000, tenure: 60, startDaysAgo: 55, status: 'active' as LoanStatus },
    { ci: 6, product: dailyProduct, principal: 40000, tenure: 80, startDaysAgo: 10, status: 'active' as LoanStatus },
    { ci: 7, product: weeklyProduct, principal: 150000, tenure: 30, startDaysAgo: 100, status: 'active' as LoanStatus },
    { ci: 8, product: monthlyProduct, principal: 500000, tenure: 6, startDaysAgo: 120, status: 'active' as LoanStatus },
    { ci: 9, product: dailyProduct, principal: 20000, tenure: 40, startDaysAgo: 38, status: 'closed' as LoanStatus },
    { ci: 10, product: dailyProduct, principal: 15000, tenure: 30, startDaysAgo: 5, status: 'pending_approval' as LoanStatus },
    { ci: 11, product: weeklyProduct, principal: 80000, tenure: 20, startDaysAgo: 0, status: 'pending_approval' as LoanStatus },
  ];

  for (let i = 0; i < loanConfigs.length; i++) {
    const cfg = loanConfigs[i];
    const customer = customers[cfg.ci];
    const product = cfg.product;
    const startDate = daysAgo(cfg.startDaysAgo);

    // Calculate interest and installments
    const annualRate = Number(product.interestRateAnnual);
    let totalInterest: number;
    let installmentAmount: number;

    if (product.interestType === 'flat') {
      totalInterest = (cfg.principal * annualRate * cfg.tenure) / (365 * 100);
    } else {
      // Reducing balance simplified
      const periodicRate = annualRate / 100 / (product.collectionFrequency === 'daily' ? 365 : product.collectionFrequency === 'weekly' ? 52 : product.collectionFrequency === 'biweekly' ? 26 : 12);
      const emi = (cfg.principal * periodicRate * Math.pow(1 + periodicRate, cfg.tenure)) / (Math.pow(1 + periodicRate, cfg.tenure) - 1);
      installmentAmount = Math.round(emi * 100) / 100;
      totalInterest = (installmentAmount * cfg.tenure) - cfg.principal;
    }

    const totalPayable = cfg.principal + totalInterest;
    if (product.interestType === 'flat') {
      installmentAmount = Math.round((totalPayable / cfg.tenure) * 100) / 100;
    }

    // Determine collected amounts for active loans
    let totalCollected = 0;
    if (cfg.status === 'closed') {
      totalCollected = totalPayable;
    }

    const loan = await prisma.loan.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        loanProductId: product.id,
        loanCode: `LN-${String(i + 1).padStart(4, '0')}`,
        principalAmount: cfg.principal,
        interestType: product.interestType,
        interestRateAnnual: annualRate,
        collectionFrequency: product.collectionFrequency,
        tenure: cfg.tenure,
        installmentAmount: installmentAmount!,
        totalPayable: totalPayable,
        totalCollected: totalCollected,
        outstandingBalance: totalPayable - totalCollected,
        status: cfg.status,
        assignedAgentId: admin.id,
        appliedById: admin.id,
        approvedById: cfg.status !== 'pending_approval' ? admin.id : null,
        approvedAt: cfg.status !== 'pending_approval' ? daysAgo(cfg.startDaysAgo + 1) : null,
        disbursedById: cfg.status === 'active' || cfg.status === 'closed' ? admin.id : null,
        disbursedAt: cfg.status === 'active' || cfg.status === 'closed' ? startDate : null,
        startDate: cfg.status === 'active' || cfg.status === 'closed' ? startDate : null,
        closedAt: cfg.status === 'closed' ? daysAgo(0) : null,
      },
    });

    // Create schedule entries for active/closed loans
    if (cfg.status === 'active' || cfg.status === 'closed') {
      const scheduleEntries = [];
      const freqDays = product.collectionFrequency === 'daily' ? 1 : product.collectionFrequency === 'weekly' ? 7 : product.collectionFrequency === 'biweekly' ? 14 : 30;
      const principalPerInstallment = Math.round((cfg.principal / cfg.tenure) * 100) / 100;
      const interestPerInstallment = Math.round((totalInterest / cfg.tenure) * 100) / 100;

      for (let j = 0; j < cfg.tenure; j++) {
        const dueDate = new Date(startDate);
        dueDate.setDate(dueDate.getDate() + (j + 1) * freqDays);

        const isPast = dueDate < today;
        let status: ScheduleStatus = 'pending';
        let paidAmount = 0;

        if (cfg.status === 'closed') {
          status = 'paid';
          paidAmount = installmentAmount!;
        } else if (isPast) {
          // 70% chance paid, 20% partially paid, 10% overdue
          const roll = Math.random();
          if (roll < 0.70) {
            status = 'paid';
            paidAmount = installmentAmount!;
          } else if (roll < 0.90) {
            status = 'partially_paid';
            paidAmount = Math.round(installmentAmount! * 0.5 * 100) / 100;
          } else {
            status = 'overdue';
            paidAmount = 0;
          }
        }

        totalCollected += paidAmount;

        scheduleEntries.push({
          loanId: loan.id,
          installmentNumber: j + 1,
          dueDate: dueDate,
          principalComponent: principalPerInstallment,
          interestComponent: interestPerInstallment,
          dueAmount: installmentAmount!,
          paidAmount: paidAmount,
          status: status,
        });
      }

      await prisma.loanSchedule.createMany({ data: scheduleEntries });

      // Update loan totals
      await prisma.loan.update({
        where: { id: loan.id },
        data: {
          totalCollected: totalCollected,
          outstandingBalance: totalPayable - totalCollected,
        },
      });
    }

    loans.push(loan);
  }

  console.log(`  ✅ Created ${loans.length} loans with schedules\n`);

  // ── 4. Create Collections (for past paid installments) ──
  console.log('💵 Creating collections...');

  let collectionCount = 0;
  const activeLoanIds = loans.filter(l => l.status === 'active' || l.status === 'closed').map(l => l.id);

  for (const loanId of activeLoanIds) {
    const paidSchedules = await prisma.loanSchedule.findMany({
      where: { loanId, status: { in: ['paid', 'partially_paid'] } },
    });

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });

    for (const schedule of paidSchedules) {
      await prisma.collection.create({
        data: {
          clientGeneratedId: randomUUID(),
          organizationId: org.id,
          loanId: loanId,
          customerId: loan!.customerId,
          collectedById: admin.id,
          amount: schedule.paidAmount,
          collectionDate: schedule.dueDate,
          collectedAt: schedule.dueDate,
          collectionMethod: Math.random() > 0.3 ? 'cash' : 'cheque',
          receiptNumber: `RCP-${String(collectionCount + 1).padStart(5, '0')}`,
          notes: schedule.status === 'partially_paid' ? 'Partial payment collected' : null,
        },
      });
      collectionCount++;
    }
  }

  console.log(`  ✅ Created ${collectionCount} collections\n`);

  // ── 5. Create Audit Logs ──
  console.log('📝 Creating audit logs...');

  const auditActions = [
    { action: 'CUSTOMER_ADDED', entityType: 'customer' },
    { action: 'LOAN_CREATED', entityType: 'loan' },
    { action: 'LOAN_APPROVED', entityType: 'loan' },
    { action: 'LOAN_DISBURSED', entityType: 'loan' },
    { action: 'COLLECTION_RECORDED', entityType: 'collection' },
    { action: 'LOGIN', entityType: 'auth' },
  ];

  for (let i = 0; i < 20; i++) {
    const action = auditActions[i % auditActions.length];
    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        actorStaffId: admin.id,
        action: action.action,
        entityType: action.entityType,
        entityId: customers[i % customers.length].id,
        createdAt: daysAgo(Math.floor(Math.random() * 30)),
      },
    });
  }

  console.log(`  ✅ Created 20 audit log entries\n`);

  // ── 6. Create Notifications ──
  console.log('🔔 Creating notifications...');

  const notifMessages = [
    { title: 'New loan application', message: 'Ramesh Kumar applied for a ₹50,000 Daily Gold Loan', type: 'loan_application' },
    { title: 'Payment overdue', message: 'Suresh Babu has an overdue payment of ₹4,167', type: 'payment_overdue' },
    { title: 'Loan approved', message: 'Lakshmi Devi\'s loan of ₹25,000 has been approved', type: 'loan_approved' },
    { title: 'Collection recorded', message: '₹1,500 collected from Anita Sharma', type: 'collection_recorded' },
    { title: 'System alert', message: '3 loans have been marked as overdue by the system', type: 'system_alert' },
  ];

  for (const notif of notifMessages) {
    await prisma.notification.create({
      data: {
        organizationId: org.id,
        recipientType: 'staff',
        recipientStaffId: admin.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        isRead: Math.random() > 0.5,
      },
    });
  }

  console.log(`  ✅ Created ${notifMessages.length} notifications\n`);

  console.log('─'.repeat(50));
  console.log('🎉 Demo data seeded successfully!');
  console.log(`   📦 3 loan products`);
  console.log(`   👥 ${customers.length} customers`);
  console.log(`   💰 ${loans.length} loans (${loans.filter(l => l.status === 'active').length} active, ${loans.filter(l => l.status === 'closed').length} closed, ${loans.filter(l => l.status === 'pending_approval').length} pending)`);
  console.log(`   💵 ${collectionCount} collections`);
  console.log(`   📝 20 audit logs`);
  console.log(`   🔔 ${notifMessages.length} notifications`);
  console.log('─'.repeat(50));
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
