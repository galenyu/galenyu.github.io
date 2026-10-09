// Offline tests: synthetic public notes/PDF bytes remain in memory; no network or output files.
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash, webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', 'openreview-export-pdfs.js'), 'utf8');
const config = source.match(/\bconst expected = (\[[\s\S]*?\n  \]);/);
assert(config, 'Exporter must declare its public expected-paper configuration.');
const expected = JSON.parse(JSON.stringify(vm.runInNewContext(`(${config[1]})`, Object.create(null), { timeout: 1000 })));
assert.equal(expected.length, 6);
assert.equal(new Set(expected.map(paper => paper.id)).size, 6);
const venue = 'ICLR.cc/2027/Conference';
const activeVenue = `${venue}/Submission`;
const pageURL = `https://openreview.net/group?id=${venue}#tab-active-submissions`;
const modifiedAt = 1791217655339;
const clone = value => JSON.parse(JSON.stringify(value));

function makeNotes() {
  return expected.map(paper => ({
    id: paper.id, forum: paper.id, number: paper.number, readers: ['everyone'], mdate: modifiedAt,
    content: { title: { value: paper.title }, venueid: { value: activeVenue }, pdf: { value: paper.pdf } }
  }));
}

// Independent bit-by-bit CRC calculation; no dependency on the exporter's CRC table.
function crc32(bytes) {
  let result = 0xffffffff;
  for (const byte of bytes) {
    result ^= byte;
    for (let bit = 0; bit < 8; bit++) result = result & 1 ? (result >>> 1) ^ 0xedb88320 : result >>> 1;
  }
  return (result ^ 0xffffffff) >>> 0;
}

function parseStoreZip(bytes) {
  assert(bytes.length >= 22, 'ZIP is truncated.');
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50, 'ZIP end record is missing.');
  assert.equal(bytes.readUInt16LE(end + 4), 0, 'Multi-disk ZIP is unsupported.');
  assert.equal(bytes.readUInt16LE(end + 6), 0);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  const size = bytes.readUInt32LE(end + 12), offset = bytes.readUInt32LE(end + 16);
  assert.equal(offset + size, end, 'Central directory bounds differ from the end record.');
  const entries = new Map();
  let cursor = offset, localEnd = 0;
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, 'Invalid central directory entry.');
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16), length = bytes.readUInt32LE(cursor + 20);
    assert.equal(method, 0, 'Every entry must use STORE compression.');
    assert.equal(flags, 0x0800, 'ZIP names must be UTF-8 and unencrypted.');
    assert.equal(bytes.readUInt32LE(cursor + 24), length);
    const nameLength = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30);
    const comment = bytes.readUInt16LE(cursor + 32), localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    assert.match(name, /^(?:papers\/[0-9]+-[A-Za-z0-9]+\.pdf|manifest\.json)$/, 'Unsafe ZIP filename.');
    assert(!entries.has(name), 'Duplicate ZIP entry.');
    assert.equal(localOffset, localEnd, 'Local entries must be contiguous.');
    assert.equal(bytes.readUInt32LE(localOffset), 0x04034b50, 'Invalid local file header.');
    assert.equal(bytes.readUInt16LE(localOffset + 6), flags);
    assert.equal(bytes.readUInt16LE(localOffset + 8), method);
    assert.equal(bytes.readUInt32LE(localOffset + 14), checksum);
    assert.equal(bytes.readUInt32LE(localOffset + 18), length);
    assert.equal(bytes.readUInt32LE(localOffset + 22), length);
    const localNameLength = bytes.readUInt16LE(localOffset + 26), localExtra = bytes.readUInt16LE(localOffset + 28);
    assert.equal(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8'), name);
    const dataStart = localOffset + 30 + localNameLength + localExtra;
    const data = bytes.subarray(dataStart, dataStart + length);
    assert.equal(data.length, length, 'ZIP entry is truncated.');
    assert.equal(crc32(data), checksum, 'ZIP CRC32 mismatch.');
    entries.set(name, { bytes: data, dataStart });
    localEnd = dataStart + length;
    cursor += 46 + nameLength + extra + comment;
  }
  assert.equal(localEnd, offset);
  assert.equal(cursor, end);
  return entries;
}

function verifyManifest(entries, pdfBytes) {
  assert.equal(entries.size, expected.length + 1);
  const manifest = JSON.parse(entries.get('manifest.json').bytes.toString('utf8'));
  assert.equal(manifest.paperCount, expected.length);
  assert.equal(manifest.papers.length, expected.length);
  assert.equal(manifest.activeVenue, activeVenue);
  assert.equal(manifest.publicFieldsOnly, true);
  assert.equal(manifest.authenticatedDataReadOrExported, false);
  assert.equal(manifest.allPDFsHTTP200AndMagicVerified, true);
  assert.equal(manifest.groupURL, pageURL);
  assert(Number.isFinite(Date.parse(manifest.sourceSnapshotAt)));
  const ids = new Set();
  for (const paper of manifest.papers) {
    const target = expected.find(item => item.id === paper.ID);
    assert(target, 'Unexpected paper in manifest.');
    assert(!ids.has(paper.ID), 'Duplicate manifest ID.');
    ids.add(paper.ID);
    assert.equal(paper.title, target.title);
    assert.equal(paper.number, target.number);
    assert.equal(paper.activeVenue, activeVenue);
    assert.equal(paper.pdfField, target.pdf);
    assert.equal(paper.original_pdf_path, target.pdf);
    assert.equal(paper.sourceURL, `https://openreview.net${target.pdf}`);
    assert.equal(paper.canonicalPDFURL, `https://openreview.net/pdf?id=${target.id}`);
    assert.equal(paper.forumURL, `https://openreview.net/forum?id=${target.id}`);
    assert.equal(paper.updated_at, new Date(modifiedAt).toISOString());
    assert.equal(paper.noteModifiedAt, paper.updated_at);
    assert(Number.isFinite(Date.parse(paper.snapshotAt)));
    assert(Number.isFinite(Date.parse(paper.downloadedAt)));
    const name = `papers/${String(target.number).padStart(5, '0')}-${target.id}.pdf`;
    assert.equal(paper.filename, name);
    const bytes = entries.get(name).bytes;
    assert(bytes.equals(pdfBytes.get(paper.sourceURL)), 'ZIP bytes differ from the fetched PDF.');
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.equal(paper.bytes, bytes.length);
    assert.equal(paper.sha256, createHash('sha256').update(bytes).digest('hex'), 'Manifest SHA256 mismatch.');
  }
  return manifest;
}

function poison(object, name) {
  Object.defineProperty(object, name, { get() { throw new Error(`Forbidden account/session read: ${name}`); } });
}

async function simulate(kind) {
  const notes = makeNotes(), requests = [], pdfRequests = [], downloads = [], blobs = [], pdfBytes = new Map();
  if (kind === 'private_note') notes[0].readers = ['Some_Private_Group'];
  if (kind === 'private_pdf') notes[0].content.pdf.readers = ['Some_Private_Group'];
  if (kind === 'private_title') notes[0].content.title.readers = ['Some_Private_Group'];
  if (kind === 'private_venue') notes[0].content.venueid.readers = ['Some_Private_Group'];
  if (kind === 'wrong_title') notes[0].content.title.value += ' changed';
  if (kind === 'wrong_number') notes[0].number += 1;
  if (kind === 'wrong_pdf_path') notes[0].content.pdf.value = '/pdf/' + '0'.repeat(40) + '.pdf';
  if (kind === 'path_traversal') notes[0].content.pdf.value = '/pdf/../../private.pdf';
  if (kind === 'missing_pdf') delete notes[0].content.pdf;
  if (kind === 'inactive_note') notes[0].content.venueid.value = `${venue}/Withdrawn_Submission`;
  const locations = {
    wrong_origin: `https://example.org/group?id=${venue}`,
    wrong_protocol: `http://openreview.net/group?id=${venue}`,
    wrong_group: 'https://openreview.net/group?id=Other/Conference'
  };
  const window = {
    OR_API_V2_URL: kind === 'foreign_api' ? 'https://example.org' : 'https://api2.openreview.net',
    Webfield2: { api: { get: async (endpoint, query, options) => {
      requests.push({ endpoint, query: clone(query) });
      assert.equal(options.handleErrors, false);
      if (endpoint === '/groups') {
        assert.equal(query.id, venue);
        const field = { value: kind === 'wrong_active' ? 'Other/Venue' : activeVenue };
        if (kind === 'private_group_field') field.readers = ['Some_Private_Group'];
        return { groups: [{ id: venue, content: { submission_venue_id: field } }] };
      }
      assert.equal(endpoint, '/notes');
      assert.deepEqual(Object.keys(query), ['id']);
      assert(expected.some(paper => paper.id === query.id));
      if (kind === 'api_challenge') throw Object.assign(new Error('ChallengeRequiredError'), { status: 403 });
      if (kind === 'missing_note') return { notes: [] };
      const result = notes.filter(note => note.id === query.id);
      return { notes: kind === 'duplicate_note' ? result.concat(result) : result };
    } } }
  };
  if (kind === 'missing_client') delete window.Webfield2;
  if (kind === 'already_running') window.__iclr2027OfficialPdfExport = { running: true };
  const document = { createElement(tag) {
    assert.equal(tag, 'a');
    return { click() { downloads.push({ name: this.download, href: this.href }); } };
  } };
  class TestURL extends URL {
    static createObjectURL(blob) { blobs.push(blob); return 'blob:offline-test'; }
    static revokeObjectURL() {}
  }
  const context = {
    window, document, location: new URL(locations[kind] || pageURL), URL: TestURL, URLSearchParams,
    Blob, TextEncoder, Uint8Array, Uint32Array, DataView,
    crypto: kind === 'bad_sha256' ? { subtle: { digest: async () => new Uint8Array(32).buffer } } : webcrypto,
    setTimeout() { return 1; }, console: { log() {}, error() {} },
    fetch: async (url, options) => {
      pdfRequests.push(url);
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'include');
      assert.equal(options.headers, undefined, 'No explicit account/session headers are allowed.');
      assert(expected.some(paper => url === `https://openreview.net${paper.pdf}`));
      if (kind === 'fetch_failure') throw new Error('Simulated network failure');
      const html = kind === 'html_challenge' && pdfRequests.length === 3;
      const bytes = Buffer.from(kind === 'empty_pdf' ? '' : html ? '<html>Challenge required</html>' : `%PDF-1.7\nOFFLINE TEST ONLY: ${url}\n%%EOF\n`);
      pdfBytes.set(url, bytes);
      let finalURL = url;
      if (kind === 'redirect_challenge') finalURL = 'https://openreview.net/challenge';
      if (kind === 'foreign_redirect') finalURL = 'https://example.org/paper.pdf';
      if (kind === 'official_api_redirect') finalURL = url.replace('https://openreview.net', 'https://api2.openreview.net');
      return { status: kind === 'http_challenge' ? 403 : 200, url: finalURL,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    }
  };
  poison(document, 'cookie');
  for (const object of [window, context]) {
    for (const name of ['cookie', 'token', 'accessToken', 'localStorage', 'sessionStorage']) poison(object, name);
  }
  let result, failure;
  try { result = await vm.runInNewContext(source, context, { timeout: 1000 }); } catch (error) { failure = error; }
  return { kind, window, result, failure, requests, pdfRequests, downloads, blobs, pdfBytes };
}

async function main() {
  const cases = ['success', 'official_api_redirect', 'wrong_origin', 'wrong_protocol', 'wrong_group',
    'wrong_active', 'private_group_field', 'private_note', 'private_pdf', 'private_title', 'private_venue',
    'wrong_title', 'wrong_number', 'wrong_pdf_path', 'path_traversal', 'missing_pdf', 'inactive_note',
    'missing_note', 'duplicate_note', 'missing_client', 'foreign_api', 'already_running',
    'api_challenge', 'http_challenge', 'html_challenge', 'redirect_challenge', 'foreign_redirect',
    'empty_pdf', 'fetch_failure', 'bad_sha256'];
  let checks = 0;
  for (const kind of cases) {
    const test = await simulate(kind);
    const success = ['success', 'official_api_redirect', 'bad_sha256'].includes(kind);
    if (success) {
      assert.equal(test.failure, undefined, `${kind}: unexpected error ${test.failure?.message}`);
      assert.equal(test.result.count, expected.length);
      assert.equal(test.requests.length, expected.length + 1);
      assert.equal(test.pdfRequests.length, expected.length);
      assert.equal(test.downloads.length, 1);
      assert.equal(test.downloads[0].name, 'iclr-2027-six-official-papers.zip');
      assert.equal(test.blobs.length, 1);
      assert.equal(test.window.__iclr2027OfficialPdfExport.state, 'complete');
      assert.equal(test.window.__iclr2027OfficialPdfExport.running, false);
      const bytes = Buffer.from(await test.blobs[0].arrayBuffer());
      const entries = parseStoreZip(bytes);
      if (kind === 'bad_sha256') {
        assert.throws(() => verifyManifest(entries, test.pdfBytes), /Manifest SHA256 mismatch/);
      } else {
        const manifest = verifyManifest(entries, test.pdfBytes);
        for (const paper of manifest.papers) assert.equal(new URL(paper.finalURL).origin,
          kind === 'official_api_redirect' ? 'https://api2.openreview.net' : 'https://openreview.net');
        if (kind === 'success') {
          const altered = Buffer.from(bytes), firstPDF = [...entries.entries()].find(([name]) => name.endsWith('.pdf'))[1];
          altered[firstPDF.dataStart + 6] ^= 1;
          assert.throws(() => parseStoreZip(altered), /ZIP CRC32 mismatch/);
          const badManifest = new Map(entries), raw = JSON.parse(entries.get('manifest.json').bytes.toString('utf8'));
          raw.papers[0].bytes += 1;
          badManifest.set('manifest.json', { bytes: Buffer.from(JSON.stringify(raw)) });
          assert.throws(() => verifyManifest(badManifest, test.pdfBytes));
          checks += 2;
        }
      }
    } else {
      assert(test.failure, `${kind}: export must stop.`);
      assert.equal(test.downloads.length, 0, `${kind}: no partial ZIP may be downloaded.`);
      assert.equal(test.blobs.length, 0);
      if (test.window.__iclr2027OfficialPdfExport && kind !== 'already_running') {
        assert.equal(test.window.__iclr2027OfficialPdfExport.running, false);
        assert.equal(test.window.__iclr2027OfficialPdfExport.state, 'failed');
      }
      if (kind === 'html_challenge') assert.equal(test.pdfRequests.length, 3);
      else if (['http_challenge', 'redirect_challenge', 'foreign_redirect', 'empty_pdf', 'fetch_failure'].includes(kind)) {
        assert.equal(test.pdfRequests.length, 1, `${kind}: request must not be retried.`);
      } else assert.equal(test.pdfRequests.length, 0);
      if (['wrong_origin', 'wrong_protocol', 'wrong_group', 'missing_client', 'foreign_api', 'already_running'].includes(kind)) {
        assert.equal(test.requests.length, 0);
      }
    }
    checks += 1;
  }
  console.log(`OpenReview PDF export: ${checks} offline checks passed; no network or output files.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
