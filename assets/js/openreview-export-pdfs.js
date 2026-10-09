// Paste into the browser Console on the official ICLR 2027 Conference group page.
// Uses the website's normal API client and session. It never reads cookies or tokens.
// Stops at any access challenge. Saves one ZIP only after all six public PDFs pass validation.
(async () => {
  'use strict';
  const venue = 'ICLR.cc/2027/Conference';
  const expectedActive = venue + '/Submission';
  const apiOrigin = 'https://api2.openreview.net';
  const groupURL = 'https://openreview.net/group?id=' + venue + '#tab-active-submissions';
  const sourceSnapshotAt = '2026-10-09T05:19:57.757Z';
  const expected = [
    { id: 'eg16jDMikI', number: 15271, title: 'Softmax Reparameterization For Output-Head Quantization', pdf: '/pdf/edfb16959e35b959974ba36f61c701323ed6fcef.pdf' },
    { id: 'mRLcwDPSTy', number: 20964, title: 'Chameleon: Dynamic Format Adapter for Efficient Diffusion', pdf: '/pdf/fbae86d38377a6439870982a884faa695c7f6cb5.pdf' },
    { id: 'e1LpPIjhQW', number: 31757, title: 'HeadGuard: Selective Head Protection for Low-Bit VLM KV-Cache Quantization', pdf: '/pdf/ebd3636379d2f2ccdaad7cf4b21d588b9d78d3fe.pdf' },
    { id: 'nhL3D1XE2R', number: 6027, title: 'QuantMLA: Function-Aligned Dual-Path Quantization for Low-Bit MLA KV Caching', pdf: '/pdf/edb4d9d1e065c40550e876a415ddd702950a98f5.pdf' },
    { id: '3xpzqlgCgE', number: 5943, title: 'JustQuant: You Don’t Need Smoothing, SVD, or Rotation for 4-Bit Activation Quantization', pdf: '/pdf/fb92d6de045df8daba7bbffe829bd2984b27e226.pdf' },
    { id: 'UuAAvOn17o', number: 16568, title: 'Attend to Your Own Thoughts: Calibration Matters for 1.58-Bit Reasoning LLMs', pdf: '/pdf/72c255bce33869ef285cdd417161a247e5f65236.pdf' }
  ];
  if (location.protocol !== 'https:' || location.hostname !== 'openreview.net' ||
      location.pathname !== '/group' || new URLSearchParams(location.search).get('id') !== venue) {
    throw new Error('Run this only on the official ICLR 2027 Conference group page.');
  }
  if (window.__iclr2027OfficialPdfExport?.running) throw new Error('A PDF export is already running.');
  const nativeClient = window.Webfield2?.api;
  if (typeof nativeClient?.get !== 'function') throw new Error('The official page API client is unavailable. Wait for the group page to load normally.');
  if (new URL(window.OR_API_V2_URL || apiOrigin).origin !== apiOrigin) throw new Error('The page API client is not configured for the official API.');
  if (!globalThis.crypto?.subtle || !globalThis.TextEncoder) throw new Error('This browser cannot compute the required PDF hashes.');
  const status = { running: true, state: 'validating_public_notes', collected: 0, total: expected.length };
  window.__iclr2027OfficialPdfExport = status;
  const startedAt = new Date().toISOString();
  const value = field => field && typeof field === 'object' && 'value' in field ? field.value : field;
  const publicField = field => field !== undefined && (!field || typeof field !== 'object' ||
    !Object.prototype.hasOwnProperty.call(field, 'readers') ||
    (Array.isArray(field.readers) && field.readers.includes('everyone')));
  const request = async (path, query) => {
    try {
      return await Promise.resolve(nativeClient.get(path, query, { handleErrors: false }));
    } catch (error) {
      const code = Number(error?.status) || '';
      throw new Error(`Official API stopped${code ? ' (HTTP ' + code + ')' : ''}. Complete any verification normally on the website. No ZIP was saved.`);
    }
  };
  const encoder = new TextEncoder();
  const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = bytes => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const makeStoreZip = (files, date) => {
    const localParts = [], centralParts = [];
    let offset = 0, centralSize = 0;
    const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()));
    const dosDate = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
    const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >>> 1);
    const seen = new Set();
    for (const file of files) {
      if (!/^(?:papers\/[0-9]+-[A-Za-z0-9]+\.pdf|manifest\.json)$/.test(file.name) || seen.has(file.name)) throw new Error('Unsafe or duplicate ZIP filename.');
      seen.add(file.name);
      const name = encoder.encode(file.name), bytes = file.bytes;
      if (!(bytes instanceof Uint8Array) || name.length > 65535 || bytes.length >= 0xffffffff) throw new Error('ZIP entry exceeds the supported format.');
      const crc = crc32(bytes);
      const local = new Uint8Array(30), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true); lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true);
      lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
      localParts.push(local, name, bytes);
      const central = new Uint8Array(46), cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
      cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      centralParts.push(central, name);
      offset += local.length + name.length + bytes.length;
      centralSize += central.length + name.length;
      if (offset + centralSize >= 0xffffffff) throw new Error('ZIP exceeds the supported format.');
    }
    if (files.length > 65535) throw new Error('Too many ZIP entries.');
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
  };
  try {
    const groupData = await request('/groups', { id: venue });
    const group = groupData?.groups?.find(item => item.id === venue);
    if (!publicField(group?.content?.submission_venue_id) || value(group.content.submission_venue_id) !== expectedActive) {
      throw new Error('The official group did not confirm the expected public active submission venue.');
    }
    const publicNotes = [];
    for (const target of expected) {
      const result = await request('/notes', { id: target.id });
      const note = result?.notes?.find(item => item.id === target.id);
      if (!Array.isArray(result?.notes) || result.notes.length !== 1 || !note ||
          note.forum !== target.id || note.number !== target.number ||
          !Array.isArray(note.readers) || !note.readers.includes('everyone')) {
        throw new Error(`Submission ${target.id} is missing, changed, or not explicitly public.`);
      }
      const c = note.content || {};
      if (!['title', 'venueid', 'pdf'].every(key => publicField(c[key])) ||
          value(c.title) !== target.title || value(c.venueid) !== expectedActive ||
          value(c.pdf) !== target.pdf || !/^\/pdf\/[a-f0-9]{40,64}\.pdf$/.test(value(c.pdf))) {
        throw new Error(`Submission ${target.id} public title, active venue, or PDF changed from the supplied official snapshot. Export stopped.`);
      }
      publicNotes.push({ id: target.id, number: target.number, title: value(c.title), pdfField: value(c.pdf),
        activeVenue: value(c.venueid), snapshotAt: new Date().toISOString(),
        noteModifiedAt: Number.isFinite(note.mdate) ? new Date(note.mdate).toISOString() : null });
    }
    status.state = 'downloading_public_pdfs';
    const files = [], manifestPapers = [];
    for (const note of publicNotes) {
      const sourceURL = 'https://openreview.net' + note.pdfField;
      const canonicalPDFURL = 'https://openreview.net/pdf?id=' + encodeURIComponent(note.id);
      const forumURL = 'https://openreview.net/forum?id=' + encodeURIComponent(note.id);
      let response;
      try {
        response = await fetch(sourceURL, { method: 'GET', credentials: 'include' });
      } catch (error) {
        throw new Error(`Official PDF request ${note.id} failed. No retry or ZIP download was attempted.`);
      }
      if (response.status !== 200 || /\/challenge(?:[/?#]|$)/.test(response.url || '')) {
        throw new Error(`Official PDF ${note.id} stopped (HTTP ${response.status}). Complete any website verification normally. No ZIP was saved.`);
      }
      const finalURL = new URL(response.url || sourceURL);
      if (!['https://openreview.net', apiOrigin].includes(finalURL.origin)) throw new Error('The PDF request redirected outside official OpenReview.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
        throw new Error(`Official response ${note.id} is not a PDF; it may be a verification page. No ZIP was saved.`);
      }
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const sha256 = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
      const filename = 'papers/' + String(note.number).padStart(5, '0') + '-' + note.id + '.pdf';
      files.push({ name: filename, bytes });
      manifestPapers.push({ sourceURL, canonicalPDFURL, forumURL, title: note.title, ID: note.id, number: note.number,
        activeVenue: note.activeVenue, snapshotAt: note.snapshotAt, pdfField: note.pdfField,
        original_pdf_path: note.pdfField, updated_at: note.noteModifiedAt,
        noteModifiedAt: note.noteModifiedAt, filename, bytes: bytes.length, sha256,
        downloadedAt: new Date().toISOString(), finalURL: finalURL.href });
      status.collected += 1;
      console.log('Official public PDFs validated:', status.collected, '/', status.total);
    }
    if (manifestPapers.length !== expected.length) throw new Error('The six-paper export is incomplete.');
    const completedAt = new Date().toISOString();
    const manifest = { formatVersion: 1, origin: 'official_openreview_browser_session', groupURL,
      sourceSnapshotAt, activeVenue: expectedActive, startedAt, completedAt,
      transport: 'official_Webfield2_api_get_then_normal_browser_pdf_fetch',
      publicFieldsOnly: true, authenticatedDataReadOrExported: false,
      allPDFsHTTP200AndMagicVerified: true, paperCount: manifestPapers.length,
      readingCaution: 'These are original submission PDFs. Matching to a separately read preprint still requires comparison of the actual text.',
      papers: manifestPapers };
    files.push({ name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2) + '\n') });
    const zip = makeStoreZip(files, new Date(completedAt));
    const objectURL = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = objectURL; link.download = 'iclr-2027-six-official-papers.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectURL), 30000);
    status.state = 'complete'; status.filename = link.download;
    console.log('Official six-paper ZIP downloaded:', link.download);
    return { count: manifestPapers.length, filename: link.download, bytes: zip.size };
  } catch (error) {
    status.state = 'failed'; status.error = error.message;
    throw error;
  } finally {
    status.running = false;
  }
})().catch(error => { console.error('PDF export stopped:', error.message); throw error; });
