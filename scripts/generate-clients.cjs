const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const prisma = join(__dirname, '..', 'node_modules', '.bin', 'prisma');
const schemas = [
  'prisma/master/schema.prisma',
  'prisma/tenant/schema.prisma',
];

for (const schema of schemas) {
  const result = spawnSync(prisma, ['generate', '--schema', schema], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
