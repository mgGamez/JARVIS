export class ServiceError extends Error {
  constructor(message, status = 502, code = 'UPSTREAM_ERROR') { super(message); this.status = status; this.code = code; }
}
export async function providerRequest(model, body, { apiKey, fetchImpl = fetch, timeout = 60000 }) {
  if (!apiKey) throw new ServiceError('Add GEMINI_API_KEY to the server .env file and restart JARVIS.', 503, 'NOT_CONFIGURED');
  let response;
  try {
    response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(timeout), body: JSON.stringify(body)
    });
  } catch { throw new ServiceError('Could not reach Gemini. Check your connection and try again.', 502, 'NETWORK_ERROR'); }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new ServiceError('Gemini rejected the server credentials or API access. Check your key and project permissions.', 502, 'AUTH_ERROR');
    if (response.status === 429) throw new ServiceError('Gemini quota or rate limit reached. Check Google AI Studio quota and billing.', 429, 'RATE_LIMITED');
    throw new ServiceError(response.status === 404 ? 'The configured Gemini model is unavailable. Check the model setting in .env.' : 'Gemini is temporarily unavailable. Try again later.', 502, 'UPSTREAM_ERROR');
  }
  try { return await response.json(); } catch { throw new ServiceError('Gemini returned an unreadable response.'); }
}
