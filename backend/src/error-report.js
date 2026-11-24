/* Optional error tracking. Off unless SENTRY_DSN is set. Sends no request bodies, headers, emails or message text:
   only the error name and code, the top stack frames and the route class, so it cannot leak personal data.
   Uses Sentry's HTTP endpoint directly, so there is no extra dependency. */
let target = null;

export function configureErrorReport(dsn = process.env.SENTRY_DSN, env = process.env) {
  target = null;
  if (!dsn) return false;
  try {
    const url = new URL(dsn);
    const project = url.pathname.replace(/^\//, '');
    if (!url.username || !project) return false;
    target = { endpoint: `${url.protocol}//${url.host}/api/${project}/store/`, key: url.username, environment: env.NODE_ENV ?? 'production', release: env.RELEASE ?? undefined };
    return true;
  } catch {
    return false;
  }
}

export function reportError(error, where = 'server') {
  if (!target) return;
  const frames = String(error?.stack ?? '').split('\n').slice(1, 6).map((line) => line.replace(/\(?file:\/\/|\)/g, '').trim().replace(/^at /, '').replace(/^.*\/(?=[^/]+:\d+:\d+)/, ''));
  const event = {
    event_id: crypto.randomUUID().replaceAll('-', ''),
    timestamp: new Date().toISOString(),
    platform: 'node',
    level: 'error',
    environment: target.environment,
    release: target.release,
    message: `${error?.name ?? 'Error'} ${error?.code ?? ''}`.trim(),
    tags: { where },
    extra: { frames },
  };
  fetch(target.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${target.key}, sentry_client=ledgerline/1` },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}
