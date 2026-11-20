import pg from 'pg';
import { runStreakMaintenance } from '../src/streak-maintenance.js';
import { readMailConfig } from '../src/welcome-email.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
const mailConfig = readMailConfig(process.env);

export default {
  async fetch(request) {
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (!request.headers.has('x-neon-trigger-invocation-id')) return new Response(null, { status: 403 });
    const payload = await request.json().catch(() => null);
    const scheduledAt = new Date(payload?.data?.scheduled_at ?? NaN);
    if (payload?.trigger?.type !== 'schedule' || !Number.isFinite(+scheduledAt) || Math.abs(Date.now() - +scheduledAt) > 15 * 60_000) {
      return Response.json({ error: 'Invalid schedule trigger.' }, { status: 400 });
    }
    await runStreakMaintenance(pool, mailConfig);
    return Response.json({ ok: true });
  },
};
