import { databaseUrlFor } from './database-url';

const master =
  'postgresql://nexora:secret@nexora.example.eu-west-2.rds.amazonaws.com:5432/nexora_master?sslmode=require';

describe('databaseUrlFor', () => {
  it('keeps the server and swaps only the database name', () => {
    const url = new URL(
      databaseUrlFor(master, 'nexora_t_018f3c2a6c1e7b2a8d4e9a0b1c2d3e4f'),
    );
    expect(url.hostname).toBe('nexora.example.eu-west-2.rds.amazonaws.com');
    expect(url.username).toBe('nexora');
    expect(url.pathname).toBe('/nexora_t_018f3c2a6c1e7b2a8d4e9a0b1c2d3e4f');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('rejects a database name that is not a safe identifier', () => {
    expect(() => databaseUrlFor(master, 'nexora_master;drop')).toThrow(
      'Invalid database name',
    );
  });
});
