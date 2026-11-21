const inviteCodePattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function streakInviteCode(search) {
  const code = new URLSearchParams(search).get('streakInvite');
  return inviteCodePattern.test(code ?? '') ? code : '';
}

export function streakInvitePath(path, code) {
  return code ? path + '?' + new URLSearchParams({ streakInvite: code }) : path;
}

export async function fetchStreakInviter(code) {
  const response = await fetch('/api/streak/friends/preview?' + new URLSearchParams({ code }), {
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return (await response.json()).name;
}

export function parseStreakInvite(value) {
  const input = value.trim();
  if (inviteCodePattern.test(input)) return input;
  try {
    const url = new URL(input);
    return ['https:', 'http:'].includes(url.protocol) && ['/dashboard', '/streak/invite'].includes(url.pathname)
      ? streakInviteCode(url.search) : '';
  } catch { return ''; }
}
