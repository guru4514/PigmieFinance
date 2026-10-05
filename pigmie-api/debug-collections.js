const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  const orgId = 'a58a402e-22eb-4003-bd3b-b05c480a0e8a';
  
  // 1. Check what's in the collections table
  const allCollections = await prisma.collection.findMany({
    where: { organizationId: orgId },
    orderBy: { collectedAt: 'desc' },
    take: 10,
    select: {
      id: true,
      amount: true,
      collectionDate: true,
      collectedAt: true,
      status: true,
      createdAt: true,
    }
  });
  console.log('\n=== LAST 10 COLLECTIONS ===');
  allCollections.forEach(c => {
    console.log(`  Date: ${c.collectionDate} | Amount: ${c.amount} | Status: ${c.status} | CollectedAt: ${c.collectedAt} | CreatedAt: ${c.createdAt}`);
  });

  // 2. Check IST date calculation
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const istDateStr = istNow.toISOString().split('T')[0];
  const todayStart = new Date(istDateStr + 'T00:00:00.000+05:30');
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  
  console.log('\n=== DATE BOUNDARIES ===');
  console.log(`  Now (UTC):       ${now.toISOString()}`);
  console.log(`  IST Date:        ${istDateStr}`);
  console.log(`  Today Start:     ${todayStart.toISOString()}`);
  console.log(`  Tomorrow Start:  ${tomorrowStart.toISOString()}`);
  
  // 3. Query collections with the same filter as dashboard
  const todayCollections = await prisma.collection.findMany({
    where: {
      organizationId: orgId,
      collectionDate: { gte: todayStart, lt: tomorrowStart },
      status: { in: ['recorded', 'verified'] },
    },
    select: {
      id: true,
      amount: true,
      collectionDate: true,
      status: true,
    }
  });
  console.log(`\n=== TODAY'S COLLECTIONS (using dashboard filter) ===`);
  console.log(`  Count: ${todayCollections.length}`);
  todayCollections.forEach(c => {
    console.log(`  Date: ${c.collectionDate} | Amount: ${c.amount} | Status: ${c.status}`);
  });

  // 4. Try with simple date string comparison  
  const todayDate = new Date(istDateStr);
  const todayCollections2 = await prisma.collection.findMany({
    where: {
      organizationId: orgId,
      collectionDate: todayDate,
      status: { in: ['recorded', 'verified'] },
    },
    select: {
      id: true,
      amount: true,
      collectionDate: true,
      status: true,
    }
  });
  console.log(`\n=== TODAY'S COLLECTIONS (exact date match: ${todayDate.toISOString()}) ===`);
  console.log(`  Count: ${todayCollections2.length}`);
  todayCollections2.forEach(c => {
    console.log(`  Date: ${c.collectionDate} | Amount: ${c.amount} | Status: ${c.status}`);
  });

  // 5. Raw SQL to see exact DB values
  const rawData = await prisma.$queryRaw`
    SELECT id, amount, collection_date, status, collected_at, created_at 
    FROM collections 
    WHERE organization_id = ${orgId}::uuid
    ORDER BY collected_at DESC 
    LIMIT 5
  `;
  console.log('\n=== RAW SQL COLLECTIONS ===');
  rawData.forEach((r) => {
    console.log(`  collection_date: ${r.collection_date} (type: ${typeof r.collection_date}) | amount: ${r.amount} | status: ${r.status}`);
  });

  await prisma.$disconnect();
}

debug().catch(console.error);
