/* Every page the app serves. main.js routes with it and the build uses it to write the host's rewrite rules, so a page can never be missing from one of them. */
export const appPages = {
  '/dashboard': 'Dashboard',
  '/billing':'Plans and billing',
  '/mentor-verification':'Verify you teach',
  '/mentor-review':'Mentor reviews',
  '/tickets':'My tickets',
  '/notifications':'Notifications',
  '/ticket-admin':'Ticket queue',
  '/billing-admin':'Billing admin',
  '/newsletter-admin':'Newsletter',
  '/mentorship':'Mentorship',
  '/mentor/join':'Join a mentor',
  '/journal': 'Trade journal',
  '/history': 'Trade history',
  '/forecast': 'Forecast ledger',
  '/calendar': 'Trading calendar',
  '/sizing': 'Sizing lab',
  '/clubs': 'Clubs',
  '/coach': 'AI coach',
  '/plan': 'Plan',
  '/mistake': 'Mistake lab',
  '/reports': 'AI Reports',
  '/badges': 'Badges',
  '/portfolio': 'Portfolio',
  '/people': 'People',
  '/spaces': 'Mentor spaces',
  '/settings': 'Settings',
  '/profile': 'Profile',
};

export const publicPages = ['/', '/about', '/support', '/terms', '/privacy', '/cookies', '/legal', '/auth', '/onboarding', '/streak/share', '/streak/invite'];
export const prefixPages = ['/p/*', '/newsletter/*', '/clubs/*', '/spaces/*', '/community/*'];
