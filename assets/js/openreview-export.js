// Run on https://openreview.net after completing its browser check.
// Uses the browser's normal request credentials; never exports credentials.
(async () => {
  if (location.protocol !== 'https:' || location.hostname !== 'openreview.net') throw new Error('Run this only on the official OpenReview website.');
  const active = 'ICLR.cc/2027/Conference/Submission';
  const notes = [];
  const seen = new Set();
  let count = null;
  let offset = 0;
  const value = v => v && typeof v === 'object' && 'value' in v ? v.value : v;
  while (count === null || offset < count) {
    const url = new URL('https://api2.openreview.net/notes');
    url.search = new URLSearchParams({'content.venueid': active, limit: '1000', offset: String(offset), sort: 'number:asc'});
    const response = await fetch(url, {credentials: 'include'});
    const data = await response.json();
    if (!response.ok) throw new Error('OpenReview verification or access is still required (HTTP ' + response.status + ').');
    if (!Number.isInteger(data.count) || data.count < 0 || !Array.isArray(data.notes)) throw new Error('Invalid API response.');
    if (count === null) count = data.count;
    if (count !== data.count) throw new Error('Submission count changed during export. Please retry.');
    if (!data.notes.length && offset < count) throw new Error('Incomplete response.');
    for (const note of data.notes) {
      if (!Array.isArray(note.readers) || !note.readers.includes('everyone')) throw new Error('A record is not explicitly public; export stopped.');
      if (!note.id || seen.has(note.id) || value(note.content?.venueid) !== active) throw new Error('Duplicate or inconsistent record.');
      seen.add(note.id);
      notes.push(note);
    }
    offset += data.notes.length;
    console.log('Public submissions collected:', notes.length, '/', count);
  }
  if (notes.length !== count) throw new Error('Incomplete export.');
  const exported = {active_venue_id: active, count, notes, fetched_at: new Date().toISOString(), source_url: 'https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions'};
  const download = document.createElement('a');
  const blob = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], {type: 'application/json'}));
  download.href = blob;
  download.download = 'iclr-2027-public-submissions.json';
  download.click();
  setTimeout(() => URL.revokeObjectURL(blob), 30000);
  console.log('Complete public export saved. Count:', count);
})().catch(error => console.error(error.message));
