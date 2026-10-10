export type LoadReport = {
  requests: number;
  errors: number;
  p50Ms: number;
  p95Ms: number;
};

export function percentile(samples: number[], rank: number): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

export async function runPublicRead(input: {
  baseUrl: string;
  requests: number;
  concurrency: number;
  slug?: string;
  fetchImpl?: typeof fetch;
}): Promise<LoadReport> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = input.slug
    ? `${input.baseUrl.replace(/\/$/, '')}/book/profile`
    : `${input.baseUrl.replace(/\/$/, '')}/health`;
  const headers = input.slug ? { 'x-tenant-slug': input.slug } : undefined;
  const samples: number[] = [];
  let errors = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < input.requests) {
      const current = cursor;
      cursor += 1;
      if (current >= input.requests) {
        return;
      }
      const started = performance.now();
      try {
        const response = await fetchImpl(url, { headers });
        if (!response.ok) {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
      samples.push(performance.now() - started);
    }
  }

  const workers = Array.from({ length: Math.max(1, input.concurrency) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return {
    requests: input.requests,
    errors,
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
  };
}
