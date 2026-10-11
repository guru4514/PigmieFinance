import { backupProcessEnvironment } from './backup-process.util';

describe('backup child environment', () => {
  it('decodes credentials without forwarding application secrets or disabling TLS', () => {
    const result = backupProcessEnvironment(
      'postgresql://test_user:dummy_encoded%40password@db.example.invalid:5432/test_db?sslmode=require',
      '/test/ca.crt',
      {
        PATH: '/test/bin',
        BACKUP_ENCRYPTION_KEY: 'dummy',
        R2_SECRET_ACCESS_KEY: 'dummy',
        PGSSLMODE: 'disable',
      },
    );
    expect(result.PGPASSWORD).toBe('dummy_encoded@password');
    expect(result.PGSSLMODE).toBe('verify-full');
    expect(result.PGSSLROOTCERT).toBe('/test/ca.crt');
    expect(result.PATH).toBe('/test/bin');
    expect(result.BACKUP_ENCRYPTION_KEY).toBeUndefined();
    expect(result.R2_SECRET_ACCESS_KEY).toBeUndefined();
  });
  it.each([
    'invalid dummy input',
    'https://example.invalid/test',
    'postgresql://user:dummy@db.example.invalid/test?options=unsupported',
  ])('rejects unsupported configuration with a fixed diagnostic', (input) => {
    expect(() => backupProcessEnvironment(input, '/test/ca.crt')).toThrow(
      'Unsupported backup database configuration',
    );
  });
});
