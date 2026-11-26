/* The kinds of notification, the five inbox categories they belong to, and which ones can never be switched off. */
export const CATEGORIES = ['Journal and streaks', 'Spaces', 'Community', 'Rewards', 'Account'];
export const KINDS = {
  journal_reminder: { category: 0, locked: false, label: 'Journal reminders' },
  streak_risk: { category: 0, locked: false, label: 'Streak at risk' },
  spaces: { category: 1, locked: false, label: 'Spaces and mentors' },
  community: { category: 2, locked: false, label: 'Community' },
  rewards: { category: 3, locked: false, label: 'Rewards and badges' },
  account: { category: 4, locked: false, label: 'Account and billing' },
  // Always on, for safety and records. The server ignores any attempt to switch these off.
  loss_limit: { category: 0, locked: true, label: 'Daily loss limit warnings' },
  security: { category: 4, locked: true, label: 'Sign-in and security alerts' },
  billing: { category: 4, locked: true, label: 'Receipts and plan changes' },
};
export const switchableKinds = (category) => Object.entries(KINDS).filter(([, k]) => k.category === category && !k.locked).map(([name]) => name);
export const lockedKinds = () => Object.entries(KINDS).filter(([, k]) => k.locked).map(([name]) => name);
