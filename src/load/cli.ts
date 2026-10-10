import { runPublicRead } from './public-read';

const requests = Number(process.env.LOAD_REQUESTS ?? 100);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 10);

runPublicRead({
  baseUrl: process.env.LOAD_BASE_URL ?? 'http://localhost:3200',
  requests: Number.isFinite(requests) ? requests : 100,
  concurrency: Number.isFinite(concurrency) ? concurrency : 10,
  slug: process.env.LOAD_SLUG,
})
  .then((report) => {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  })
  .catch(() => {
    process.stderr.write('Load run failed\n');
    process.exitCode = 1;
  });
