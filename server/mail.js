import { randomBytes, createHash } from 'node:crypto';
import { ServiceError } from './provider.js';
export class Gmail {
  constructor(store, { clientId, clientSecret, redirectUri = 'http://localhost:3000/api/mail/callback', fetchImpl = fetch } = {}) {
    this.store = store; this.config = { clientId, clientSecret, redirectUri }; this.fetch = fetchImpl; this.states = new Map(); this.refreshing = null;
  }
  get configured() { return Boolean(this.config.clientId && this.config.clientSecret); }
  async status() { return { configured: this.configured, connected: Boolean((await this.store.read('gmail', null))?.refresh_token), redirectUri: this.config.redirectUri }; }
  connect() {
    if (!this.configured) throw new ServiceError('Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI. See INTEGRATIONS.md.', 503, 'OAUTH_NOT_CONFIGURED');
    for (const [state, item] of this.states) if (item.expires < Date.now()) this.states.delete(state);
    if (this.states.size >= 20) throw new ServiceError('Too many pending sign-ins. Wait ten minutes.', 429, 'BUSY');
    const state = randomBytes(32).toString('hex'), verifier = randomBytes(32).toString('base64url'), browser = randomBytes(32).toString('hex');
    this.states.set(state, { verifier, browser, expires: Date.now() + 600000 });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly', access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return { url: url.href, browser };
  }
  async callback(query, browser) {
    const state = query.get('state'); const pending = this.states.get(state); this.states.delete(state);
    if (!pending || pending.expires < Date.now() || !browser || pending.browser !== browser) throw new ServiceError('Gmail sign-in expired or came from another browser. Connect again.', 403, 'OAUTH_STATE');
    if (query.has('error') || !query.get('code')) throw new ServiceError('Google sign-in was not completed. No account was connected.', 400, 'OAUTH_DENIED');
    const token = await this.tokenRequest({ code: query.get('code'), code_verifier: pending.verifier, grant_type: 'authorization_code', redirect_uri: this.config.redirectUri });
    if (!token.refresh_token) throw new ServiceError('Google did not return offline access. Disconnect the app in Google account permissions and reconnect.', 502, 'OAUTH_NO_REFRESH');
    await this.store.write('gmail', { ...token, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000 });
  }
  async tokenRequest(values) {
    let res;
    try { res = await this.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000), body: new URLSearchParams({ ...values, client_id: this.config.clientId, client_secret: this.config.clientSecret }) }); }
    catch { throw new ServiceError('Could not reach Google sign-in. Check your connection.', 502, 'OAUTH_NETWORK'); }
    if (!res.ok) throw new ServiceError('Google authorization failed or expired. Check OAuth settings and reconnect Gmail.', 401, 'OAUTH_RECONNECT');
    const token = await res.json(); if (!token.access_token) throw new ServiceError('Google returned no access token.', 502, 'OAUTH_RECONNECT'); return token;
  }
  async accessToken() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const token = await this.store.read('gmail', null);
      if (!token?.refresh_token || !this.configured) throw new ServiceError('Connect Gmail in the Mail panel first.', 409, 'MAIL_DISCONNECTED');
      if (token.expiresAt > Date.now() + 60000) return token.access_token;
      const refreshed = await this.tokenRequest({ refresh_token: token.refresh_token, grant_type: 'refresh_token' });
      await this.store.write('gmail', { ...token, ...refreshed, expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000 }); return refreshed.access_token;
    })();
    try { return await this.refreshing; } finally { this.refreshing = null; }
  }
  async request(route, init = {}) {
    const token = await this.accessToken(); let response;
    try { response = await this.fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + route, { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000) }); }
    catch { throw new ServiceError('Could not reach Gmail. Check your connection.', 502, 'MAIL_NETWORK'); }
    if (!response.ok) throw new ServiceError(response.status === 401 ? 'Gmail authorization expired. Reconnect your account.' : response.status === 403 ? 'Gmail denied access. Enable the Gmail API and check the consent scopes.' : 'Gmail could not complete this request. Check quota and try again.', response.status === 401 ? 401 : 502, 'MAIL_ERROR');
    return response.json();
  }
  async list(query = '') {
    if (typeof query !== 'string' || query.length > 200) throw new ServiceError('Mail search must be at most 200 characters.', 400, 'INVALID_REQUEST');
    const result = await this.request('messages?' + new URLSearchParams({ q: query || 'in:inbox', maxResults: '10' }));
    return Promise.all((result.messages || []).map(async message => {
      const data = await this.request(`messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      const header = name => data.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return { id: data.id, from: header('From'), subject: header('Subject'), date: header('Date'), snippet: data.snippet || '' };
    }));
  }
  async send({ to, subject, body }) {
    const words = []; let word = '';
    for (const char of subject) { if (Buffer.byteLength(word + char) > 36) { words.push(word); word = ''; } word += char; } if (word) words.push(word);
    const encodedSubject = words.map(part => '=?UTF-8?B?' + Buffer.from(part).toString('base64') + '?=').join('\r\n ');
    const encodedBody = Buffer.from(body).toString('base64').match(/.{1,76}/g).join('\r\n');
    const raw = Buffer.from(`To: ${to}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encodedBody}`).toString('base64url');
    const result = await this.request('messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
    if (!result.id) throw new ServiceError('Gmail did not confirm a message ID. Check Sent before trying again to avoid duplicates.', 502, 'SEND_UNCERTAIN');
    return { message: 'Gmail accepted the message.', id: result.id };
  }
  async calendarEvents(from, to) {
    const token = await this.accessToken(); const events = []; let pageToken = '';
    do {
      const query = new URLSearchParams({ timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: 'true', maxResults: '100', ...(pageToken ? { pageToken } : {}) });
      let response; try { response = await this.fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || 'primary') + '/events?' + query, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) }); } catch { throw new ServiceError('Could not reach Google Calendar.',502,'CALENDAR_NETWORK'); }
      if (!response.ok) throw new ServiceError('Calendar access failed. Enable Calendar API, reconnect Google with Calendar consent, and check permissions.',502,'CALENDAR_ACCESS');
      const data = await response.json();
      for (const e of data.items || []) if (e.status !== 'cancelled' && e.end?.dateTime && new Date(e.end.dateTime).getTime() > from && new Date(e.end.dateTime).getTime() <= to) events.push({ startAt:e.start?.dateTime||null,endAt:e.end.dateTime,key: e.id + ':' + e.end.dateTime, notes: ('Meeting: ' + (e.summary || '(untitled)') + '\nScheduled end: ' + e.end.dateTime + '\nNotes: ' + (e.description || '')).slice(0,12000) });
      pageToken = data.nextPageToken || ''; if (events.length > 500) throw new ServiceError('Too many calendar events to process safely. Narrow the calendar.',409,'CALENDAR_LIMIT');
    } while (pageToken);
    return events;
  }
  async disconnect() { await this.store.remove('gmail'); return { message: 'Local Gmail tokens removed. Revoke JARVIS in your Google account permissions to remove account access.' }; }
}
