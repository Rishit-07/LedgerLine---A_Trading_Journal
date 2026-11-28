// The operator's home page: what needs attention now (most urgent first), a few platform numbers, and links to every admin tool.
// Reviewer only. It counts rows and shows no customer text, so it is cheap and safe to open often.
import { eligibleReviewer } from './mentor-verification.js';
import { send } from './http.js';

export const TOOLS = [
  { key: 'users', title: 'Users', detail: 'Every account, filter by plan, plan controls, notes', href: '/admin/users' },
  { key: 'billing', title: 'Billing', detail: 'Payments, orders to review, refunds', href: '/admin/billing' },
  { key: 'tickets', title: 'Support tickets', detail: 'Answer and resolve customer messages', href: '/admin/tickets' },
  { key: 'mentors', title: 'Mentor review', detail: 'Verify mentor applications', href: '/admin/mentors' },
  { key: 'newsletter', title: 'Newsletter', detail: 'Write, schedule and send issues', href: '/admin/newsletter' },
  { key: 'audit', title: 'Audit log', detail: 'Everything done in the admin role', href: '/admin/audit' },
];

export function createAdminHubApi(pool, { authenticate }) {
  async function summary() {
    const [counts, stats] = await Promise.all([
      pool.query(`SELECT
          (SELECT count(*) FROM billing_refunds WHERE status='owed')::int refunds_owed,
          (SELECT coalesce(sum(amount_usd_cents),0) FROM billing_refunds WHERE status='owed')::int refunds_owed_cents,
          (SELECT count(*) FROM report_checkouts WHERE needs_review)::int payments_review,
          (SELECT count(*) FROM support_tickets WHERE status<>'resolved' AND priority='Urgent')::int tickets_urgent,
          (SELECT count(*) FROM support_tickets WHERE status='open' AND priority<>'Urgent')::int tickets_open,
          (SELECT count(*) FROM mentor_verifications WHERE status='pending')::int mentors_pending,
          (SELECT count(*) FROM billing_invoices WHERE mailed_at IS NULL AND created_at < now() - interval '15 minutes')::int invoices_unsent,
          (SELECT count(*) FROM newsletter_issues WHERE status='scheduled')::int issues_scheduled,
          (SELECT count(*) FROM report_subscriptions WHERE valid_until BETWEEN now() AND now() + interval '7 days')::int ending_soon`),
      pool.query(`SELECT
          (SELECT count(*) FROM ledgerline_accounts)::int users,
          (SELECT count(*) FROM ledgerline_accounts WHERE created_at > now() - interval '7 days')::int new_7d,
          (SELECT count(*) FROM user_profile WHERE onboarded_at IS NOT NULL)::int onboarded,
          (SELECT count(*) FROM trades WHERE opened_at > now() - interval '7 days')::int trades_7d,
          (SELECT count(*) FROM report_subscriptions WHERE valid_until > now())::int paid_now,
          (SELECT count(*) FROM mentor_entitlements WHERE active AND (expires_at IS NULL OR expires_at > now()))::int mentors_now,
          (SELECT count(*) FROM mt_links WHERE revoked_at IS NULL AND last_seen_at > now() - interval '10 minutes')::int mt_connected,
          (SELECT count(*) FROM ai_tool_runs WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC'))::int ai_runs_month,
          (SELECT count(*) FROM newsletter_subscribers WHERE status='subscribed')::int subscribers`),
    ]);
    const c = counts.rows[0];
    const usd = (cents) => '$' + (cents / 100).toFixed(2);
    // Most urgent first. An item appears only when there is something to do.
    const attention = [
      c.refunds_owed && { key: 'refunds', level: 'urgent', title: `${c.refunds_owed} refund${c.refunds_owed > 1 ? 's' : ''} owed`, detail: `${usd(c.refunds_owed_cents)} to send from your wallet, then mark as sent.`, href: '/billing-admin?filter=refunded' },
      c.payments_review && { key: 'payments', level: 'urgent', title: `${c.payments_review} payment${c.payments_review > 1 ? 's' : ''} need a decision`, detail: 'Underpaid, overpaid or unmatched. Customers are waiting.', href: '/billing-admin?filter=review' },
      c.tickets_urgent && { key: 'tickets-urgent', level: 'urgent', title: `${c.tickets_urgent} urgent ticket${c.tickets_urgent > 1 ? 's' : ''}`, detail: 'Answer these first.', href: '/admin/tickets' },
      c.invoices_unsent && { key: 'invoices', level: 'normal', title: `${c.invoices_unsent} invoice email${c.invoices_unsent > 1 ? 's' : ''} not sent`, detail: 'Delivery keeps retrying. If this stays, check the email sender settings.', href: '/admin/billing' },
      c.tickets_open && { key: 'tickets', level: 'normal', title: `${c.tickets_open} open ticket${c.tickets_open > 1 ? 's' : ''}`, detail: 'Waiting for a first reply.', href: '/admin/tickets' },
      c.mentors_pending && { key: 'mentors', level: 'normal', title: `${c.mentors_pending} mentor application${c.mentors_pending > 1 ? 's' : ''} to review`, detail: 'Applicants are waiting for a decision.', href: '/admin/mentors' },
      c.issues_scheduled && { key: 'newsletter', level: 'info', title: `${c.issues_scheduled} newsletter issue${c.issues_scheduled > 1 ? 's' : ''} scheduled`, detail: 'Check them before they go out.', href: '/admin/newsletter' },
      c.ending_soon && { key: 'ending', level: 'info', title: `${c.ending_soon} plan${c.ending_soon > 1 ? 's' : ''} end in 7 days`, detail: 'Reminder emails go out on their own. Nothing to do unless you want to reach out.', href: '/billing-admin?filter=paid' },
    ].filter(Boolean);
    return { attention, stats: stats.rows[0], tools: TOOLS };
  }

  const handler = async (request, response) => {
    try {
      const claims = await authenticate(request, response);
      if (!claims) return;
      if (!eligibleReviewer(claims)) return send(response, 403, { error: 'Reviewers only.' });
      return send(response, 200, await summary());
    } catch {
      console.error('Admin hub failed.');
      return send(response, 503, { error: 'The admin page is temporarily unavailable.' });
    }
  };
  return { handler };
}
