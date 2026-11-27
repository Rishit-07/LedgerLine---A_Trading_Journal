/* Numbers for the opening screen. Real counts from the signed-in account; a row is left out when that feature is not set up, so the screen never shows a made-up number. */
import { send } from './http.js';

export function createOpeningApi(pool, { authenticate }) {
  const count = async (sql, params) => Number((await pool.query(sql, params)).rows[0].n);
  const opening = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    try {
      const uid = claims.uid;
      const [rules, entries, importedEver, importedNew, mentorEver, mentorUnread] = await Promise.all([
        count('SELECT count(*)::int AS n FROM rules WHERE user_id=$1', [uid]),
        count('SELECT count(*)::int AS n FROM trades WHERE user_id=$1', [uid]),
        count('SELECT count(*)::int AS n FROM mt_imported WHERE user_id=$1', [uid]),
        count("SELECT count(*)::int AS n FROM mt_imported WHERE user_id=$1 AND imported_at>now()-interval '7 days'", [uid]),
        count("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='spaces'", [uid]),
        count("SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND kind='spaces' AND read_at IS NULL", [uid]),
      ]);
      const rows = [{ key: 'rules', label: 'Your rules', value: rules, unit: 'rules' }, { key: 'entries', label: 'Journal', value: entries, unit: 'entries' }];
      if (importedEver) rows.push({ key: 'imported', label: 'MetaTrader trades', value: importedNew, unit: 'new this week' });
      if (mentorEver) rows.push({ key: 'mentor', label: 'Mentor notes', value: mentorUnread, unit: 'unread' });
      return send(response, 200, { rows });
    } catch { console.error('Opening counts failed.'); return send(response, 503, { error: 'Unavailable.' }); }
  };
  /** Broken links. Only the path and where the visitor came from are kept, never who they are. */
  const notFound = async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 2000) { request.destroy(); break; }
    }
    let data = {}; try { data = JSON.parse(body); } catch { /* ignore */ }
    const clean = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200);
    console.info('404', JSON.stringify({ path: clean(data.path), referrer: clean(data.referrer) }));
    if (!response.writableEnded) { response.writeHead(204); response.end(); }
  };
  return { opening, notFound };
}
