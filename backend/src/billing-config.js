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
