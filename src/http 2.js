const TIMEOUT_MS = 60_000;

// Never include the request URL or headers in errors: they can carry access tokens,
// and error text ends up in the Google Sheet.
export async function request(url, { method = 'GET', headers = {}, json, form, body } = {}) {
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (form !== undefined) {
    init.body = new URLSearchParams(form);
  } else if (body !== undefined) {
    init.body = body;
  }

  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { data, headers: response.headers };
}
