/* Every price and billing rule lives here. Prices are in US dollars, in cents. Raised a little from the sample prices ($4.99 / $14.99). Confirm before launch. */
export const PRICES = {
  pro: { monthly: 599, yearly: 5900, intro: 299 },
  mentor: { monthly: 1799, yearly: 17900, intro: 899 },
};
export const PERIODS = [1, 3, 12];          // months a customer can prepay
export const INTRO_MONTHS = 2;              // first 2 monthly periods, once per account per plan
export const GRACE_DAYS = 3;                // crypto grace after a period ends
export const QUOTE_MINUTES = 15;            // the hosted checkout locks the price for this long
export const REMIND_DAYS = [7, 1];

/** The price in cents for buying `months` of `plan`, and how many intro months it uses. Only a single month can use the intro. */
export function priceFor(plan, months, introUsed = 0) {
  const p = PRICES[plan];
  if (!p || !PERIODS.includes(months)) return null;
  if (months === 12) return { cents: p.yearly, intro: 0 };
  if (months === 1 && introUsed < INTRO_MONTHS) return { cents: p.intro, intro: 1 };
  return { cents: p.monthly * months, intro: 0 };
}

/* Plan limits. Free accounts can bring in this many MetaTrader trades per calendar month (UTC); Pro and Mentor have no cap.
   Live sync (the installed bridge) is a Pro feature. Change the number here and nowhere else. */
export const FREE_MT_IMPORTS_PER_MONTH = 25;

/* Monthly use of the analysis tools (calendar month, UTC). Free accounts get a taste; Pro and Mentor get a generous cap that exists to stop abuse.
   replay = replays opened, mistake = new mistake tags, coach = Ask your journal questions. Change the numbers here and nowhere else. */
export const FEATURE_LIMITS = {
  replay:          { free: 5, pro: 150, mentor: 1000 },
  mistake:         { free: 5, pro: 300, mentor: 2000 },
  coach:           { free: 5, pro: 300, mentor: 2000 },
  replay_review:   { free: 2, pro: 60,  mentor: 400 },   // AI review of one closed trade
  mistake_insight: { free: 2, pro: 60,  mentor: 400 },   // AI read of your logged habits
};
export const FEATURE_NAMES = { replay: 'Trade replay', mistake: 'Mistake lab', coach: 'Ask your journal', replay_review: 'AI replay review', mistake_insight: 'AI habit insight' };

/* The AI token wallet shared by Ask your journal, the AI trade review and the AI habit insight.
   Free: a small wallet that refills at midnight IST. Pro: enough for the month, spent at no more than `hour` tokens in any rolling hour (the cooldown).
   Mentor: a very large month and hour. Change the numbers here and nowhere else. */
export const AI_TOKENS = {
  free:   { day: 8000 },
  pro:    { month: 600_000, hour: 40_000 },
  mentor: { month: 3_000_000, hour: 150_000 },
};
