export const SESSION_COOKIE_NAME = 'rls_session';
export const OWNER_SESSION_COOKIE_NAME = 'rls_owner_session';

export function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf('=');

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());

      cookies[name] = value;
      return cookies;
    }, {});
}

export function buildSessionCookie(name, value, { maxAgeSeconds, secure }) {
  const attributes = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

export function buildExpiredCookie(name, { secure }) {
  const attributes = [
    `${encodeURIComponent(name)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}
