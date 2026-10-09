const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const scriptPath = path.join(__dirname, '..', 'assets', 'js', 'openreview-export.js');

const GROUP = 'ICLR.cc/2027/Conference';
const ACTIVE = GROUP + '/FixtureDynamicSubmission';
const PRIVATE = 'DO_NOT_EXPORT_PRIVATE_FIXTURE_VALUE';
const API = 'https://api2.openreview.net';
const clone = value => JSON.parse(JSON.stringify(value));
const note = number => ({
  id: 'official-fixture-' + number, forum: 'official-fixture-' + number, number,
  readers: ['everyone'], writers: ['fixture-private-writer'], signatures: ['fixture-private-signer'],
  cdate: 1000 + number, mdate: 2000 + number, tcdate: 3000 + number, tmdate: 4000 + number,
  content: {
    title: {value: 'Official Fixture Quantization Paper ' + number},
    abstract: {value: 'Public fixture abstract about model quantization.'},
    keywords: {value: ['model quantization', 'PTQ']},
    venueid: {value: ACTIVE}, venue: {value: 'ICLR 2027 Conference Submission'},
    pdf: {value: '/pdf/' + number + '.pdf'},
    authors: {value: [PRIVATE]}, authorids: {value: [PRIVATE]},
    api_key: {value: PRIVATE}, credential: {value: PRIVATE},
    confidential_review: {value: PRIVATE, readers: ['private-group']}
  },
  authors: [PRIVATE], credentials: PRIVATE, apiKey: PRIVATE, private_metadata: PRIVATE
});
function parseRequest(endpoint, supplied = {}) {
  let text = endpoint;
  let params = supplied;
  if (endpoint instanceof URL) text = endpoint.href;
  else if (endpoint && typeof endpoint === 'object') {
    text = endpoint.url || endpoint.path || endpoint.endpoint;
    params = endpoint.params || endpoint.query || endpoint.data || supplied;
  }
  assert.strictEqual(typeof text, 'string', 'Transport endpoint must be a string');
  const url = new URL(text.startsWith('http') ? text : API + '/' + text.replace(/^\/+/, ''));
  assert.strictEqual(url.protocol, 'https:', 'Only HTTPS requests allowed');
  assert.strictEqual(url.hostname, 'api2.openreview.net', 'Only the official OpenReview API host allowed');
  assert(['/groups', '/notes'].includes(url.pathname), 'Only public group and notes endpoints allowed');
  const nested = params?.params || params?.query || params;
  if (nested && typeof nested === 'object') {
    for (const [key, value] of Object.entries(nested)) {
      if (value !== undefined && value !== null && typeof value !== 'object') url.searchParams.set(key, String(value));
    }
  }
  return url;
}
async function runCase(name, configuration = {}) {
  const config = {total: 1001, webfield: true, ...configuration};
  const requests = [], downloads = [], blobs = [], logs = [], errors = [], privateAccess = [];
  let noteRequest = 0;
  const respond = url => {
    requests.push(url.href);
    if (url.pathname === '/groups') {
      assert.strictEqual(url.searchParams.get('id'), GROUP, 'Conference group must be discovered dynamically');
      const group = {id: GROUP, readers: ['everyone'], content: {submission_venue_id: {value: ACTIVE}}};
      if (config.missingActive) delete group.content.submission_venue_id;
      return {groups: [group], count: 1};
    }
    ++noteRequest;
    if (config.forbidden && noteRequest === 1) {
      const error = new Error('HTTP 403 ChallengeRequiredError fixture');
      error.status = 403; error.statusCode = 403;
      error.response = {status: 403, data: {error: {name: 'ChallengeRequiredError', message: error.message}}};
      throw error;
    }
    assert.strictEqual(url.searchParams.get('content.venueid'), ACTIVE, 'Must use the group-provided active venue, not a hard-coded ID');
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 1000);
    assert(Number.isSafeInteger(offset) && offset >= 0, 'Offset must be a nonnegative integer');
    assert(Number.isSafeInteger(limit) && limit > 0 && limit <= 1000, 'Page size must be bounded');
    let notes = Array.from({length: Math.max(0, Math.min(limit, config.total - offset))}, (_, index) => note(offset + index + 1));
    let count = config.total;
    if (config.changedCount && noteRequest > 1) count += 1;
    if (config.finalChanged && url.searchParams.get('limit') === '1' && !url.searchParams.has('offset')) count += 1;
    if (config.emptyPage && noteRequest === 1) notes = [];
    if (config.duplicate && noteRequest > 1 && notes.length) notes[0].id = 'official-fixture-1';
    if (config.wrongVenue && notes.length) notes[0].content.venueid.value = 'ICLR.cc/2026/Conference/Submission';
    if (config.nonpublicNote && notes.length) notes[0].readers = ['private-group'];
    if (config.missingReaders && notes.length) delete notes[0].readers;
    if (config.privateOptional && notes.length) notes[0].content.keywords = {value: [PRIVATE], readers: ['private-group']};
    if (config.privateRequired && notes.length) notes[0].content[config.privateRequired] = {...notes[0].content[config.privateRequired], readers: ['private-group']};
    if (config.wrapperMetadata && notes.length) notes[0].content.title.private_metadata = PRIVATE;
    if (config.explicitPublic && notes.length) {
      notes[0].content.title.readers = ['everyone'];
      notes[0].content.abstract.readers = ['everyone'];
      notes[0].content.venueid.readers = ['everyone'];
    }
    if (config.missingId && notes.length) delete notes[0].id;
    return {notes, count};
  };
  const guarded = kind => new Proxy({}, {
    get(_target, property) { privateAccess.push(kind + '.' + String(property)); throw new Error('Forbidden private-storage access: ' + kind + '.' + String(property)); },
    set(_target, property) { privateAccess.push(kind + '.' + String(property)); throw new Error('Forbidden private-storage write: ' + kind + '.' + String(property)); }
  });
  const FakeURL = class extends URL {};
  FakeURL.createObjectURL = blob => {blobs.push(blob); return 'blob:fixture-' + (blobs.length - 1);};
  FakeURL.revokeObjectURL = () => {};
  const document = {
    createElement(tag) {
      assert.strictEqual(tag, 'a', 'Exporter should create only a local download anchor');
      return {style: {}, setAttribute(key, value) {this[key] = value;}, click() {downloads.push({href: this.href, download: this.download});}, remove() {}};
    },
    body: {appendChild() {}, append() {}}, documentElement: {appendChild() {}}
  };
  Object.defineProperty(document, 'cookie', {get() {privateAccess.push('document.cookie'); throw new Error('Do not inspect browser credentials directly');}, set() {privateAccess.push('document.cookie'); throw new Error('Do not mutate browser credentials');}});
  const context = {
    location: {protocol: config.badOrigin ? 'http:' : 'https:', hostname: config.badOrigin ? 'example.test' : 'openreview.net', pathname: '/group', search: '?id=' + GROUP, href: 'https://openreview.net/group?id=' + GROUP + '#tab-active-submissions'},
    URL: FakeURL, URLSearchParams, Blob, Date, Promise, Set, Map,
    console: {log(...items) {logs.push(items.join(' '));}, info(...items) {logs.push(items.join(' '));}, warn(...items) {logs.push(items.join(' '));}, error(...items) {errors.push(items.map(item => item?.message || String(item)).join(' '));}},
    document, localStorage: guarded('localStorage'), sessionStorage: guarded('sessionStorage'),
    setTimeout(fn) {fn(); return 1;}, clearTimeout() {},
    fetch: async (endpoint, options = {}) => {
      assert.strictEqual((options.method || 'GET').toUpperCase(), 'GET', 'Exporter must use read-only GET');
      const url = parseRequest(endpoint);
      try {const data = respond(url); return {ok: true, status: 200, json: async () => clone(data), text: async () => JSON.stringify(data)};}
      catch (error) {if (error.status === 403) return {ok: false, status: 403, json: async () => ({error: {name: 'ChallengeRequiredError'}}), text: async () => 'Challenge required'}; throw error;}
    }
  };
  if (config.webfield) {
    const get = async (endpoint, params) => {
      const data = respond(parseRequest(endpoint, params));
      return clone(data);
    };
    context.Webfield2 = {api: new Proxy({get}, {
      get(target, property) {if (property === 'get') return target.get; throw new Error('Only Webfield2.api.get is permitted, attempted: ' + String(property));},
      set() {throw new Error('No API client mutation permitted');}
    })};
  }
  context.window = context; context.self = context;
  if (config.wrongApiHost) context.OR_API_V2_URL = 'https://third-party.example.test';
  const source = fs.readFileSync(scriptPath, 'utf8');
  try {await vm.runInNewContext(source, context, {filename: scriptPath, timeout: 10000});}
  catch (error) {errors.push(error.message);}
  const exported = downloads.length ? JSON.parse(await blobs[Number(downloads[0].href.split('-').at(-1))].text()) : null;
  assert.strictEqual(privateAccess.length, 0, name + ': touched browser credential storage');
  for (const request of requests) assert.strictEqual(new URL(request).hostname, 'api2.openreview.net', name + ': third-party request');
  if (config.fail) {
    assert.strictEqual(downloads.length, 0, name + ': must stop without saving partial data');
    assert(errors.length > 0, name + ': error should be visible');
  } else {
    assert.strictEqual(downloads.length, 1, name + ': one complete local JSON download expected. Errors: ' + errors.join('; '));
    assert.strictEqual(exported.count, config.total, name + ': count');
    assert.strictEqual(exported.notes.length, config.total, name + ': full collection');
    assert.strictEqual(exported.active_venue_id, ACTIVE, name + ': dynamic active ID');
    assert(!JSON.stringify(exported).includes(PRIVATE), name + ': private field values leaked');
    const forbiddenFields = ['authors', 'authorids', 'credentials', 'apiKey', 'api_key', 'credential', 'writers', 'signatures', 'private_metadata', 'confidential_review'];
    for (const record of exported.notes) {
      for (const key of forbiddenFields) {
        assert(!(key in record), name + ': forbidden note field ' + key);
        assert(!(key in (record.content || {})), name + ': forbidden content field ' + key);
      }
      assert.strictEqual(new Set(exported.notes.map(n => n.id)).size, exported.notes.length, name + ': unique IDs');
    }
  }
  if (context.__iclr2027OfficialExport) {
    assert.strictEqual(context.__iclr2027OfficialExport.running, false, name + ': status must release the running guard');
    assert.strictEqual(context.__iclr2027OfficialExport.state, config.fail ? 'failed' : 'complete', name + ': status state');
  }
  if (config.forbidden) assert.strictEqual(noteRequest, 1, name + ': HTTP 403 must stop immediately');
  console.log('PASS', name, 'requests=' + requests.length, 'downloads=' + downloads.length);
  return {name, requests: requests.length, downloads: downloads.length, failedSafely: Boolean(config.fail), errors};
}
(async () => {
  const cases = [
    ['Webfield2 full pagination and dynamic group ID', {}],
    ['explicit public field readers', {total: 2, explicitPublic: true}],
    ['true zero is a complete export', {total: 0}],
    ['count changes stop export', {changedCount: true, fail: true}],
    ['final count probe changes stop export', {total: 2, finalChanged: true, fail: true}],
    ['duplicate IDs stop export', {duplicate: true, fail: true}],
    ['wrong venue stops export', {total: 2, wrongVenue: true, fail: true}],
    ['nonpublic note stops export', {total: 2, nonpublicNote: true, fail: true}],
    ['missing public readers stops export', {total: 2, missingReaders: true, fail: true}],
    ['private optional fields are omitted', {total: 2, privateOptional: true}],
    ['public field wrapper metadata is not research content', {total: 2, wrapperMetadata: true}],
    ['private title stops export', {total: 2, privateRequired: 'title', fail: true}],
    ['private active venue stops export', {total: 2, privateRequired: 'venueid', fail: true}],
    ['HTTP 403 stops immediately', {forbidden: true, fail: true}],
    ['empty partial page stops export', {emptyPage: true, fail: true}],
    ['missing ID stops export', {total: 2, missingId: true, fail: true}],
    ['missing active group ID stops export', {missingActive: true, fail: true}],
    ['wrong browser origin stops export', {badOrigin: true, fail: true}],
    ['native client third-party host is rejected', {wrongApiHost: true, fail: true}],
    ['official GET fallback when Webfield2 unavailable', {total: 2, webfield: false}],
    ['official GET fallback 403 stops immediately', {webfield: false, forbidden: true, fail: true}]
  ];
  const results = [], failures = [];
  for (const [name, config] of cases) {
    try {results.push(await runCase(name, config));}
    catch (error) {failures.push({name, error: error.message}); console.error('FAIL', name, error.message);}
  }
  if (failures.length) throw new Error(failures.length + ' exporter validation case(s) failed.');
  console.log('PASS: official exporter VM validation; fixtures exist only in memory.');
})().catch(error => {console.error(error.stack); process.exit(1);});
