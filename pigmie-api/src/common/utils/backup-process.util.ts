/** Pass database credentials only to the child environment, never process arguments. */
export function backupProcessEnvironment(
  connection: string,
  caPath: string,
  parent: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  try {
    const url = new URL(connection);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname)
      throw new Error();
    if (!url.username || !url.password || url.pathname.length <= 1 || !caPath)
      throw new Error();
    const allowed = new Set([
      'sslmode',
      'sslaccept',
      'sslrootcert',
      'sslcert',
      'sslkey',
    ]);
    if ([...url.searchParams.keys()].some((name) => !allowed.has(name)))
      throw new Error();
    // Client certificates need an explicitly designed configuration, not silent omission.
    if (url.searchParams.has('sslcert') || url.searchParams.has('sslkey'))
      throw new Error();
    const environment: NodeJS.ProcessEnv = {};
    for (const name of [
      'PATH',
      'Path',
      'SystemRoot',
      'WINDIR',
      'TEMP',
      'TMP',
      'HOME',
      'LANG',
      'LC_ALL',
    ])
      if (parent[name]) environment[name] = parent[name];
    return {
      ...environment,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGSSLMODE: 'verify-full',
      PGSSLROOTCERT: caPath,
      PGCONNECT_TIMEOUT: '15',
      PGPASSFILE: process.platform === 'win32' ? 'NUL' : '/dev/null',
    };
  } catch {
    throw new Error('Unsupported backup database configuration');
  }
}
