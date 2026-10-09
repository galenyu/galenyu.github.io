// Run in the Console of the official ICLR 2027 OpenReview page that already displays papers.
// Only GET requests to the official API; cookies/tokens/passwords are never read or exported.
(async () => {
  'use strict';
  const venue = 'ICLR.cc/2027/Conference';
  const apiBase = 'https://api2.openreview.net';
  const source = 'https://openreview.net/group?id=' + venue + '#tab-active-submissions';
  const value = item => item && typeof item === 'object' && 'value' in item ? item.value : item;
  if (location.protocol !== 'https:' || location.hostname !== 'openreview.net' || location.pathname !== '/group' || new URLSearchParams(location.search).get('id') !== venue) throw new Error('Please run this on the official ICLR 2027 Conference group page.');
  if (window.__iclr2027OfficialExport?.running) throw new Error('An official export is already running.');
  const status = { running: true, state: 'collecting', collected: 0, total: null };
  window.__iclr2027OfficialExport = status;
  const started = new Date().toISOString();
  const nativeClient = window.Webfield2?.api;
  const useNative = typeof nativeClient?.get === 'function';
  const publicField = field => !field || typeof field !== 'object' || !Object.prototype.hasOwnProperty.call(field, 'readers') || (Array.isArray(field.readers) && field.readers.includes('everyone'));
  let active;
  const request = async (path, query) => {
    try {
      if (useNative) return await Promise.resolve(nativeClient.get(path, query, { handleErrors: false }));
      const url = new URL(path, apiBase);
      url.search = new URLSearchParams(query);
      const response = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!response.ok) throw Object.assign(new Error('Official API access failed'), { status: response.status });
      return await response.json();
    } catch (error) {
      const code = Number(error?.status) || '';
      throw new Error(`Official API request stopped${code ? ' (HTTP ' + code + ')' : ''}. Keep the normal OpenReview session open; if it requires verification, complete that on the website. No incomplete export was saved.`);
    }
  };
  const sanitize = note => {
    if (!note || typeof note.id !== 'string' || !note.id || !Array.isArray(note.readers) || !note.readers.includes('everyone')) throw new Error('A record is not explicitly public; export stopped.');
    const content = note.content || {};
    if (!publicField(content.title) || !publicField(content.venueid) || typeof value(content.title) !== 'string' || value(content.venueid) !== active) throw new Error('A title or active venue is missing, nonpublic, or inconsistent.');
    const cleaned = { id: note.id, readers: ['everyone'], content: {} };
    // Public-only research fields. Never export authors, private comments, account/session data.
    for (const field of ['title', 'abstract', 'keywords', 'pdf', 'venueid', 'venue', 'TL;DR']) {
      if (content[field] === undefined || !publicField(content[field])) continue;
      const item = value(content[field]);
      if (typeof item === 'string' || (field === 'keywords' && Array.isArray(item) && item.every(term => typeof term === 'string'))) cleaned.content[field] = { value: item };
    }
    if (typeof note.forum === 'string') cleaned.forum = note.forum;
    for (const field of ['number', 'cdate', 'mdate', 'tcdate', 'tmdate']) {
      if (typeof note[field] === 'number' && Number.isFinite(note[field])) cleaned[field] = note[field];
    }
    return cleaned;
  };
  try {
    if (useNative && new URL(window.OR_API_V2_URL || apiBase).origin !== apiBase) throw new Error('The webpage API client is not configured for the official API.');
    const groupResult = await request('/groups', { id: venue });
    const group = groupResult?.groups?.find(item => item.id === venue);
    active = value(group?.content?.submission_venue_id);
    if (typeof active !== 'string' || !active.startsWith(venue + '/')) throw new Error('The official group did not provide an active submission venue ID.');
    const notes = [];
    const seen = new Set();
    let count = null;
    let pages = 0;
    while (count === null || notes.length < count) {
      const data = await request('/notes', { domain: venue, 'content.venueid': active, limit: 1000, offset: notes.length, count: true, sort: 'number:asc' });
      if (!Number.isInteger(data?.count) || data.count < 0 || !Array.isArray(data.notes)) throw new Error('The official API returned invalid notes or count.');
      if (count === null) count = data.count;
      if (count !== data.count) throw new Error('The official submission count changed during pagination; export stopped. Please rerun.');
      if ((!data.notes.length && notes.length < count) || notes.length + data.notes.length > count) throw new Error('Official pagination is incomplete or inconsistent.');
      for (const raw of data.notes) {
        const note = sanitize(raw);
        if (seen.has(note.id)) throw new Error('Duplicate official note ID; export stopped.');
        seen.add(note.id);
        notes.push(note);
      }
      pages += 1;
      Object.assign(status, { collected: notes.length, total: count });
      console.log('Official public active submissions:', notes.length, '/', count);
      if (notes.length < count) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (notes.length !== count || seen.size !== count) throw new Error('The official export is incomplete.');
    const finalProbe = await request('/notes', { domain: venue, 'content.venueid': active, limit: 1, count: true, sort: 'number:asc' });
    if (finalProbe?.count !== count) throw new Error('The final official count changed; no export saved. Please rerun.');
    const exported = {
      active_venue_id: active, count, notes, fetched_at: new Date().toISOString(), source_url: source,
      provenance: { origin: 'official_openreview_browser_session', api_url: apiBase, transport: useNative ? 'official_Webfield2_api_get' : 'browser_fetch_with_credentials', started_at: started, page_count: pages, public_fields_only: true, final_count_verified: true }
    };
    const link = document.createElement('a');
    const blob = URL.createObjectURL(new Blob([JSON.stringify(exported)], { type: 'application/json' }));
    link.href = blob;
    link.download = 'iclr-2027-official-active-submissions.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(blob), 30000);
    status.state = 'complete';
    console.log('Official export downloaded:', link.download, 'Public active submission count:', count);
    return { count, filename: link.download };
  } catch (error) {
    status.state = 'failed';
    status.error = error.message;
    throw error;
  } finally {
    status.running = false;
  }
})().catch(error => console.error('Export stopped:', error.message));
