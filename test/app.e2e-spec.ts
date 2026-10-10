import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('GET /health returns ok without a database call', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('rejects a public booking page that has no tenant header', () => {
    return request(app.getHttpServer()).get('/book/profile').expect(403);
  });

  it('rejects a manage page that has no tenant header', () => {
    return request(app.getHttpServer()).get('/book/manage').expect(403);
  });

  it('does not take a tenant slug from the URL', () => {
    return request(app.getHttpServer()).get('/tenants/ada-studio').expect(404);
  });

  it('requires a signed-in user before reading the tenant header', () => {
    return request(app.getHttpServer()).get('/tenants/workspace').expect(401);
  });

  it('rejects a Stripe webhook that has no signature', () => {
    return request(app.getHttpServer())
      .post('/billing/webhook')
      .send({ id: 'evt_test' })
      .expect(400);
  });

  it('POST /auth/register rejects a short password without a database call', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'owner@example.com', password: 'short' })
      .expect(400)
      .expect({
        statusCode: 400,
        message: 'Invalid input',
        fields: ['password'],
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
