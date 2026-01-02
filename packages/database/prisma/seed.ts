import { createPrismaClient } from '../index.js';
import { seedDatabase } from '../seed/seedDatabase.js';

const prisma = createPrismaClient({ log: ['error', 'warn'] });

async function main() {
  console.log('Seeding database...');
  await seedDatabase(prisma);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
