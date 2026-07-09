export async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers: options.body
      ? {
          'Content-Type': 'application/json'
        }
      : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error?.message || 'Request failed');
    error.payload = payload;
    throw error;
  }

  return payload;
}
