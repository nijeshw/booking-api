import { percentile, runPublicRead } from './public-read';

describe('public read load', () => {
  it('reports the 95th percentile of the sample', () => {
    expect(percentile([10, 30, 20, 40], 95)).toBe(40);
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
  });

  it('counts failed responses without throwing', async () => {
    const fetchImpl = (() =>
      Promise.resolve({ ok: false })) as unknown as typeof fetch;
    const report = await runPublicRead({
      baseUrl: 'http://localhost:3200',
      requests: 4,
      concurrency: 2,
      fetchImpl,
    });
    expect(report.requests).toBe(4);
    expect(report.errors).toBe(4);
  });
});
