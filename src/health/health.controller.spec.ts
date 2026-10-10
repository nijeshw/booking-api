import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports liveness without touching the database', () => {
    const controller = new HealthController({
      $queryRaw: jest.fn(),
    } as never);
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('hides database errors on the readiness check', async () => {
    const controller = new HealthController({
      $queryRaw: jest
        .fn()
        .mockRejectedValue(
          new Error('password authentication failed for user "nexora"'),
        ),
    } as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(controller.ready()).rejects.toThrow('Database unavailable');
  });
});
