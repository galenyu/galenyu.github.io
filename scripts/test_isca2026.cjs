/* Run against a real Jekyll build: node scripts/test_isca2026.cjs _site [artifact-directory] */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || process.argv[4] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const build = path.resolve(process.argv[2] || '_site');
const output = path.resolve(process.argv[3] || os.tmpdir());
const base = 'http://isca-preview.local';
const mime = {'.css':'text/css', '.js':'application/javascript', '.html':'text/html', '.json':'application/json', '.svg':'image/svg+xml', '.woff':'font/woff'};
const program = JSON.parse(fs.readFileSync(path.join(build, 'assets/data/isca-2026-program.json')));
const notes = JSON.parse(fs.readFileSync(path.join(build, 'assets/data/isca-2026-notes.json')));
const programFile = path.join(build, 'assets/data/isca-2026-program.json');
const notesFile = path.join(build, 'assets/data/isca-2026-notes.json');
let programOverride = null, notesOverride = null, failProgram = false, failNotes = false;
const normalize = title => title.replace(/\s+/g, ' ').trim().toLowerCase();

(async () => {
  assert.equal(program.metadata.total_papers, 172);
  assert.equal(program.metadata.main_papers, 161);
  assert.equal(program.metadata.industry_papers, 11);
  assert.equal(program.sessions.length, 37);
  assert.equal(program.excluded_slots.length, 1);
  assert.equal(notes.papers.length, 17);
  assert(notes.trends.length >= 5);
  assert(notes.recommendations.length >= 3);
  assert(!fs.existsSync(path.join(build, 'assets/data/isca-2026-source.html')), 'Raw official HTML must stay out of the published site');
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(base + '/**', async route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const filename = path.join(build, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
      if (filename === programFile && failProgram || filename === notesFile && failNotes) return route.fulfill({status:503, body:'Test-only unavailable data'});
      if (filename === programFile && programOverride) return route.fulfill({contentType:'application/json', body:JSON.stringify(programOverride)});
      if (filename === notesFile && notesOverride) return route.fulfill({contentType:'application/json', body:JSON.stringify(notesOverride)});
      if (!fs.existsSync(filename)) return route.fulfill({status:404, body:'Not found'});
      await route.fulfill({contentType:mime[path.extname(filename)] || 'application/octet-stream', body:fs.readFileSync(filename)});
    });
    const layouts = [];
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({width, height:1000});
      for (const route of ['/research/', '/isca-2026/']) {
        await page.goto(base + route, {waitUntil:'networkidle'});
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('.site-nav .is-active').innerText(), 'Research');
        assert.equal(await page.locator('.site-nav .is-active').getAttribute('href'), '/research/');
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        assert(scrollWidth <= width, `${route} overflow at ${width}: ${scrollWidth}`);
        layouts.push({route, width, scrollWidth});
      }
      assert.equal(await page.locator('#isca-total').innerText(), '172');
      assert.equal(await page.locator('#isca-main').innerText(), '161');
      assert.equal(await page.locator('#isca-industry').innerText(), '11');
      assert.equal(await page.locator('#isca-reviewed').innerText(), '17');
      assert.equal(await page.locator('.survey-landscape-trend').count(), notes.trends.length);
      assert.equal(await page.locator('.isca-observation').count(), notes.papers.length);
      assert.equal(await page.locator('#isca-category option').count(), program.categories.length + 1);
      assert.equal(await page.locator('#isca-session option').count(), 38);
      if (width === 1440 || width === 375) {
        await page.screenshot({path:path.join(output, `isca-2026-top-${width}.png`)});
        await page.locator('#landscape').scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output, `isca-2026-landscape-${width}.png`)});
      }
    }
    await page.setViewportSize({width:1440, height:1000});
    await page.goto(base + '/isca-2026/', {waitUntil:'networkidle'});
    assert.equal(await page.locator('.survey-paper').count(), 12);
    assert.equal(await page.locator('#isca-page-number').innerText(), '第 1 / 15 页');
    await page.locator('#isca-next').click();
    assert.equal(await page.locator('#isca-page-number').innerText(), '第 2 / 15 页');
    await page.locator('#isca-prev').click();
    assert.equal(await page.locator('#isca-page-number').innerText(), '第 1 / 15 页');
    await page.locator('#isca-query').fill('PuDGhost');
    assert.equal(await page.locator('.survey-paper').count(), 1);
    assert((await page.locator('.survey-paper').innerText()).includes('DRAM'));
    await page.locator('#isca-query').fill('no-such-paper-in-this-conference');
    assert.equal(await page.locator('.survey-paper').count(), 0);
    assert((await page.locator('.survey-empty h3').innerText()).includes('没有符合'));
    await page.locator('#isca-reset').click();
    assert.equal(await page.locator('#isca-result-count').innerText(), '172 / 172 篇');
    await page.locator('#isca-review').selectOption('noted');
    assert.equal(await page.locator('#isca-result-count').innerText(), '17 / 172 篇');
    for (const depth of ['fulltext', 'abstract']) {
      await page.locator('#isca-review').selectOption(depth);
      assert.equal(await page.locator('#isca-result-count').innerText(), `${notes.papers.filter(note => note.reading_depth === depth).length} / 172 篇`);
    }
    await page.locator('#isca-reset').click();
    await page.locator('#isca-track').selectOption('industry');
    assert.equal(await page.locator('.survey-paper').count(), 11);
    await page.locator('#isca-reset').click();
    await page.locator('.survey-taxonomy-card[data-category="quantum"]').click();
    assert.equal(await page.locator('#isca-category').inputValue(), 'quantum');
    assert.equal(await page.locator('#isca-result-count').innerText(), '12 / 172 篇');
    assert.equal(await page.locator('.survey-taxonomy-card[data-category="quantum"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#isca-reset').click();
    await page.locator('#isca-session').selectOption('4b');
    assert.equal(await page.locator('#isca-result-count').innerText(), `${program.sessions.find(session => session.id === '4b').paper_count} / 172 篇`);
    await page.locator('#isca-reset').click();
    await page.locator('#isca-sort').selectOption('program');
    assert((await page.locator('.survey-paper h3').first().innerText()).includes(program.papers[0].title));
    await page.locator('#isca-sort').selectOption('title');
    assert((await page.locator('.survey-paper h3').first().innerText()).includes([...program.papers].sort((a,b) => a.title.localeCompare(b.title, 'en'))[0].title));

    // A note link must locate its paper even when it sits on a later page or outside the current filter.
    const representative = notes.papers[notes.papers.length - 1];
    const notedPaper = program.papers.find(paper => normalize(paper.title) === normalize(representative.title));
    await page.locator(`#isca-observations a[data-paper-id="${notedPaper.id}"]`).click();
    assert.equal(new URL(page.url()).hash, `#paper-${notedPaper.id}`);
    assert.equal(await page.locator(`#paper-${notedPaper.id} .isca-reading-details`).getAttribute('open'), '');
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator(`#paper-${notedPaper.id}`).count(), 1);
    await page.locator(`#paper-${notedPaper.id}`).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output, 'isca-2026-reading-1440.png')});
    await page.locator('.isca-breadcrumb a').click();
    await page.locator('.research-card[href="/isca-2026/"]').click();
    assert.equal(new URL(page.url()).pathname, '/isca-2026/');

    // Missing or stale notes leave the complete index usable and never inflate the reading counter.
    failNotes = true;
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#isca-total').innerText(), '172');
    assert.equal(await page.locator('#isca-reviewed').innerText(), '0');
    assert.equal(await page.locator('.survey-paper').count(), 12);
    failNotes = false;
    notesOverride = structuredClone(notes);
    notesOverride.papers[0].title = 'TEST ONLY: mismatched source title';
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#isca-reviewed').innerText(), '0');
    notesOverride = structuredClone(notes);
    notesOverride.papers[0].tags = {};
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#isca-total').innerText(), '172');
    assert.equal(await page.locator('#isca-reviewed').innerText(), '0');
    notesOverride = structuredClone(notes);
    notesOverride.metadata.program_source_sha256 = 'TEST ONLY: stale hash';
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#isca-total').innerText(), '172');
    assert.equal(await page.locator('#isca-reviewed').innerText(), '0');
    notesOverride = null;
    failProgram = true;
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#isca-total').innerText(), '—');
    assert((await page.locator('#isca-status-title').innerText()).includes('无法载入'));
    failProgram = false;
    programOverride = structuredClone(program);
    programOverride.metadata.total_papers += 1;
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#isca-total').innerText(), '—');
    programOverride = null;
    await page.goto(base + '/iclr-2027-quantization/', {waitUntil:'networkidle'});
    assert.equal(await page.locator('.site-nav .is-active').innerText(), 'Research');
    assert.equal(await page.locator('#survey-candidates').innerText(), '994');
    await page.locator('nav[aria-label="返回 Research"] a').click();
    assert.equal(new URL(page.url()).pathname, '/research/');
    assert.deepEqual(errors, []);
    const report = {passed:true, layouts, indexedPapers:program.papers.length, readings:notes.papers.length, trends:notes.trends.length, recommendations:notes.recommendations.length, pageErrors:errors, checks:['Conference navigation', 'Official counts and reading coverage', 'Search and empty state', 'Category/session/track/depth filters', 'Pagination and sorting', 'Note links and reloadable deep links', 'Missing/stale notes preserve index', 'Unavailable/inconsistent index keeps unknown counts', 'Existing ICLR survey', 'Responsive layout']};
    fs.writeFileSync(path.join(output, 'isca-2026-browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exit(1); });
