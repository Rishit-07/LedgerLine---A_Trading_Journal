import { isEmail, readJson, send } from './http.js';

const inbox = 'ledgerline.team@gmail.com';
const topics = new Set(['Bug', 'Billing', 'Feature idea', 'Data request']);
const priorities = new Set(['Low', 'Normal', 'Urgent']);
const trimmed = (value) => typeof value === 'string' ? value.trim() : '';

export function createSupportHandler(mailConfig) {
  let windowEnds = 0;
  let attempts = 0;
  const attemptsByEmail = new Map();

  return async (request, response) => {
    const { error, data } = await readJson(request, 8192);
    if (error) {
      send(response, error, { error: 'Enter a valid support request.' });
      return;
    }
    const email = trimmed(data?.email).toLowerCase();
    const subject = trimmed(data?.subject);
    const message = trimmed(data?.message);
    const { topic, priority } = data ?? {};
    if (!isEmail(email) || !subject || subject.length > 100 || /[\r\n]/.test(subject) ||
      !message || message.length > 1200 || !topics.has(topic) || !priorities.has(priority)) {
      send(response, 400, { error: 'Check the email address, subject, and message.' });
      return;
    }
    if (!mailConfig?.transporter) {
      send(response, 503, { error: 'Direct sending is unavailable. Open an email draft instead.' });
      return;
    }
    const now = Date.now();
    if (now >= windowEnds) {
      windowEnds = now + 60 * 60_000;
      attempts = 0;
      attemptsByEmail.clear();
    }
    const personalAttempts = attemptsByEmail.get(email) ?? 0;
    if (attempts >= 30 || personalAttempts >= 3) {
      response.setHeader('Retry-After', String(Math.ceil((windowEnds - now) / 1000)));
      send(response, 429, { error: 'Too many requests. Try again later or open an email draft.' });
      return;
    }
    attempts++;
    attemptsByEmail.set(email, personalAttempts + 1);
    try {
      const result = await mailConfig.transporter.sendMail({
        from: mailConfig.from,
        to: inbox,
        replyTo: { address: email },
        subject: `[Ledgerline Support • ${topic}] ${subject}`,
        text: `Reply email: ${email}\nTopic: ${topic}\nPriority: ${priority}\n\n${message}`,
      });
      if (!result.accepted?.includes(inbox)) throw new Error('Gmail did not accept the support message');
      send(response, 200, { sent: true });
    } catch {
      console.error('Gmail support delivery could not be confirmed.');
      send(response, 503, { error: 'Delivery could not be confirmed. Try again or use the email draft.' });
    }
  };
}
