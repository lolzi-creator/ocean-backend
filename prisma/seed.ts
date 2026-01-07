import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear all existing data
  console.log('🗑️  Clearing existing data...');
  await prisma.expense.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.timeLog.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  console.log('👥 Creating workers and admin...');

  // Create 4 workers with PIN 1234
  const workers = [
    { name: 'Max Müller', email: 'max.mueller@ocean-garage.ch', pin: '1234' },
    { name: 'Anna Schmidt', email: 'anna.schmidt@ocean-garage.ch', pin: '1234' },
    { name: 'Tom Weber', email: 'tom.weber@ocean-garage.ch', pin: '1234' },
    { name: 'Lisa Fischer', email: 'lisa.fischer@ocean-garage.ch', pin: '1234' },
  ];

  const createdWorkers: any[] = [];
  for (const worker of workers) {
    const user = await prisma.user.create({
      data: {
        email: worker.email,
        name: worker.name,
        role: 'worker',
        pin: worker.pin,
        isActive: true,
      },
    });
    createdWorkers.push(user);
    console.log(`✅ Created worker: ${worker.name}`);
  }

  // Create admin with PIN 1111
  const admin = await prisma.user.create({
    data: {
      email: 'admin@ocean-garage.ch',
      name: 'Admin',
      role: 'admin',
      pin: '1111',
      isActive: true,
    },
  });
  console.log(`✅ Created admin: ${admin.name}`);

  console.log('✅ Seed completed successfully!');
  console.log('\n📋 Created users:');
  console.log('Workers (PIN: 1234):');
  createdWorkers.forEach((w) => console.log(`  - ${w.name} (${w.email})`));
  console.log(`Admin (PIN: 1111):`);
  console.log(`  - ${admin.name} (${admin.email})`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

