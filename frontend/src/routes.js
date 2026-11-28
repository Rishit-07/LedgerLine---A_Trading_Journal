/* Every page the app serves. main.js routes with it and the build uses it to write the host's rewrite rules, so a page can never be missing from one of them. */
export const appPages = {
  '/dashboard': 'Dashboard',
  '/billing':'Plans and billing',
  '/mentor-verification':'Verify you teach',
  '/tickets':'My tickets',
  '/notifications':'Notifications',
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

/* The admin console. Served like any page, but only the reviewer account can open it; everyone else gets the 404 page. */
export const adminPages = {
  '/admin': 'Admin',
  '/admin/users': 'Users',
  '/admin/mentors': 'Mentor verification',
  '/admin/tickets': 'Support tickets',
  '/admin/billing': 'Billing',
  '/admin/newsletter': 'Newsletter',
  '/admin/audit': 'Audit log',
};

export const publicPages = ['/', '/about', '/support', '/terms', '/privacy', '/cookies', '/legal', '/auth', '/onboarding', '/streak/share', '/streak/invite'];
export const prefixPages = ['/p/*', '/newsletter/*', '/clubs/*', '/spaces/*', '/community/*'];
