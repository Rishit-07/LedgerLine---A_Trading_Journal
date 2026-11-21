export const legacyBillingRoute = (path,search) => path === '/settings/billing' || new URLSearchParams(search).get('tab') === 'billing';
