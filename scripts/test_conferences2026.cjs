/* node scripts/test_conferences2026.cjs _site [artifact-directory]
 * Uses the same Playwright runtime options as test_isca2026.cjs. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || process.argv[4] || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const build = path.resolve(process.argv[2] || '_site');
const output = path.resolve(process.argv[3] || require('node:os').tmpdir());
const base = 'http://conference-preview.local';
const mime = {'.css':'text/css', '.js':'application/javascript', '.html':'text/html', '.json':'application/json', '.svg':'image/svg+xml', '.woff':'font/woff'};
const normalize = value => value.replace(/\s+/g, ' ').trim().toLowerCase();
const conferences = ['micro', 'asplos', 'hpca'];
const expectedCounts = {micro:220, asplos:168, hpca:122};
const programs = {}, notes = {};
let override = null;

(async () => {
  fs.mkdirSync(output, {recursive:true});
  for (const name of conferences) {
    programs[name] = JSON.parse(fs.readFileSync(path.join(build, `assets/data/${name}-2026-program.json`)));
    notes[name] = JSON.parse(fs.readFileSync(path.join(build, `assets/data/${name}-2026-notes.json`)));
    const p = programs[name], n = notes[name];
    assert.equal(p.papers.length, expectedCounts[name]);
    assert.equal(p.metadata.total_papers, p.papers.length);
    assert.equal(new Set(p.papers.map(paper => normalize(paper.title))).size, p.papers.length);
    assert.equal(new Set(p.papers.map(paper => paper.id)).size, p.papers.length);
    assert.equal(p.categories.reduce((sum, category) => sum + category.paper_count, 0), p.papers.length);
    assert.equal(p.sessions.reduce((sum, session) => sum + session.paper_count, 0), p.papers.length);
    assert(n.papers.length >= 12);
    assert(n.trends.length >= 5 && n.recommendations.length >= 4 && n.consensus.length >= 3);
    assert.equal(n.metadata.reading_count, n.papers.length);
    assert.equal(n.metadata.fulltext_count + n.metadata.abstract_count, n.papers.length);
    assert.equal(n.metadata.program_source_sha256, p.metadata.source_sha256);
    const source = fs.readFileSync(path.join(build, '..', p.metadata.source_file));
    assert.equal(crypto.createHash('sha256').update(source).digest('hex'), p.metadata.source_sha256);
    assert(!fs.existsSync(path.join(build, p.metadata.source_file)), 'Source HTML must not be published');
    for (const note of n.papers) {
      assert(p.papers.some(paper => normalize(paper.title) === normalize(note.title)));
      for (const field of ['summary','problem','method','takeaway','limitations','reading_basis','source_url']) assert(note[field], `${name}: missing ${field}`);
    }
  }
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)});
  const report = {passed:false, conferences:{}, layouts:[], checks:['Source integrity and exact title membership', 'Conference navigation', 'Category/session/track/depth filters', 'Search, empty state and reset', 'Pagination and sorting', 'Evidence links and reloadable deep links', 'Missing/stale/malformed notes preserve index', 'Invalid source counts fail closed', 'Escaped source strings', '320–1440px responsive layout']};
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(base + '/**', async route => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const filename = path.join(build, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
      if (override && pathname === override.pathname) return route.fulfill({status:override.status || 200, contentType:'application/json', body:JSON.stringify(override.data || {})});
      if (!fs.existsSync(filename)) return route.fulfill({status:404, body:'Not found'});
      await route.fulfill({contentType:mime[path.extname(filename)] || 'application/octet-stream', body:fs.readFileSync(filename)});
    });
    for (const width of [1440, 768, 375, 320]) {
      await page.setViewportSize({width, height:1000});
      await page.goto(base+'/research/', {waitUntil:'networkidle'});
      assert.equal(await page.locator('.research-card').count(), 5);
      for (const name of conferences) assert.equal(await page.locator(`.research-card[href="/${name}-2026/"]`).count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Research overflow at ${width}`);
      if (width === 1440 || width === 375) await page.screenshot({path:path.join(output, `research-2026-${width}.png`), fullPage:true});
      for (const name of conferences) {
        const p = programs[name], n = notes[name];
        await page.goto(`${base}/${name}-2026/`, {waitUntil:'networkidle'});
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('.site-nav .is-active').innerText(), 'Research');
        assert.equal(await page.locator('.conference-switcher [aria-current="page"]').innerText(), name.toUpperCase()+' 2026');
        assert.equal(await page.locator('#conf-total').innerText(), String(p.papers.length));
        assert.equal(await page.locator('#conf-reviewed').innerText(), String(n.papers.length));
        assert.equal(await page.locator('#conf-session-count').innerText(), String(p.sessions.length));
        assert.equal(await page.locator('#conf-direction-count').innerText(), String(p.categories.length));
        assert.equal(await page.locator('#conf-directions tr').count(), p.categories.length);
        assert.equal(await page.locator('.survey-landscape-trend').count(), n.trends.length);
        assert.equal(await page.locator('.conf-observation').count(), n.papers.length);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow at ${width}`);
        report.layouts.push({name,width});
        if (width === 1440 || width === 375) {
          await page.screenshot({path:path.join(output, `${name}-2026-top-${width}.png`)});
          await page.locator('#landscape').scrollIntoViewIfNeeded();
          await page.screenshot({path:path.join(output, `${name}-2026-landscape-${width}.png`)});
        }
      }
    }
    await page.setViewportSize({width:1440, height:1000});
    for (const name of conferences) {
      const p = programs[name], n = notes[name], total = p.papers.length;
      const count = async value => assert.equal(await page.locator('#conf-result-count').innerText(), `${value} / ${total} 篇`);
      await page.goto(`${base}/${name}-2026/`, {waitUntil:'networkidle'});
      await count(total);
      assert.equal(await page.locator('.survey-paper').count(), 12);
      await page.locator('#conf-next').click();
      assert((await page.locator('#conf-page-number').innerText()).startsWith('第 2 /'));
      await page.locator('#conf-prev').click();
      const noted = p.papers.find(paper => normalize(paper.title) === normalize(n.papers[0].title));
      await page.locator('#conf-query').fill(noted.title);
      await count(1);
      await page.locator('#conf-query').fill(n.papers[0].summary);
      await count(1);
      await page.locator('#conf-query').fill('no-match-conference-2026');
      await count(0);
      assert.equal(await page.locator('.survey-empty h3').innerText(), '没有符合筛选条件的论文');
      await page.locator('#conf-reset').click();
      for (const category of p.categories) {
        await page.locator('#conf-category').selectOption(category.id);
        await count(category.paper_count);
      }
      await page.locator('#conf-reset').click();
      for (const session of p.sessions) {
        await page.locator('#conf-session').selectOption(session.id);
        await count(session.paper_count);
      }
      await page.locator('#conf-reset').click();
      for (const track of ['main','industry']) {
        await page.locator('#conf-track').selectOption(track);
        await count(p.papers.filter(paper => paper.track === track).length);
      }
      await page.locator('#conf-reset').click();
      for (const review of ['noted','fulltext','abstract','unread']) {
        await page.locator('#conf-review').selectOption(review);
        const expected = review === 'noted' ? n.papers.length : review === 'unread' ? total-n.papers.length : n.papers.filter(note => note.reading_depth === review).length;
        await count(expected);
      }
      await page.locator('#conf-reset').click();
      await page.locator('.survey-taxonomy-card').first().click();
      await count(p.categories[0].paper_count);
      assert.equal(await page.locator('.survey-taxonomy-card').first().getAttribute('aria-pressed'), 'true');
      await page.locator('#conf-reset').click();
      await page.locator('#conf-directions button').last().click();
      await count(p.categories.at(-1).paper_count);
      await page.locator('#conf-reset').click();
      await page.locator('#conf-sort').selectOption('program');
      assert.equal(await page.locator('.survey-paper h3').first().innerText(), p.papers[0].title);
      await page.locator('#conf-sort').selectOption('title');
      assert.equal(await page.locator('.survey-paper h3').first().innerText(), [...p.papers].sort((a,b) => a.title.localeCompare(b.title, 'en'))[0].title);
      const target = p.papers.find(paper => normalize(paper.title) === normalize(n.papers.at(-1).title));
      await page.locator(`#conf-observations a[data-paper-id="${target.id}"]`).click();
      assert.equal(new URL(page.url()).hash, '#paper-'+target.id);
      assert.equal(await page.locator(`#paper-${target.id} .conf-reading-details`).getAttribute('open'), '');
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator(`#paper-${target.id}`).count(), 1);
      await page.screenshot({path:path.join(output, `${name}-2026-reading.png`)});
      const notesPath = `/assets/data/${name}-2026-notes.json`, programPath = `/assets/data/${name}-2026-program.json`;
      for (const failure of ['missing','stale','count','member','tags','consensus']) {
        const data = structuredClone(n);
        if (failure === 'stale') data.metadata.program_source_sha256 = 'outdated';
        if (failure === 'count') data.metadata.reading_count++;
        if (failure === 'member') data.papers[0].title = 'wrong paper';
        if (failure === 'tags') data.papers[0].tags = {};
        if (failure === 'consensus') data.consensus[0].paper_titles = ['unknown title'];
        override = {pathname:notesPath, data, status:failure === 'missing' ? 503 : 200};
        await page.goto(`${base}/${name}-2026/`, {waitUntil:'networkidle'});
        assert.equal(await page.locator('#conf-total').innerText(), String(total));
        assert.equal(await page.locator('#conf-reviewed').innerText(), '0');
        assert.equal(await page.locator('.survey-landscape-recommendation').count(), 0);
        assert.equal(await page.locator('.survey-paper').count(), 12);
      }
      const unsafe = structuredClone(n);
      unsafe.papers[0].summary = '<img src=x onerror="window.injected=true">';
      override = {pathname:notesPath, data:unsafe};
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator('#conf-reviewed').innerText(), String(n.papers.length));
      assert.equal(await page.locator('.conf-observation img').count(), 0);
      assert.equal(await page.evaluate(() => window.injected), undefined);
      for (const failure of ['missing','count','category','session']) {
        const data = structuredClone(p);
        if (failure === 'count') data.metadata.total_papers++;
        if (failure === 'category') data.categories[0].paper_count++;
        if (failure === 'session') data.sessions[0].paper_count++;
        override = {pathname:programPath,data,status:failure === 'missing' ? 503 : 200};
        await page.reload({waitUntil:'networkidle'});
        assert.equal(await page.locator('#conf-total').innerText(), '—');
        assert(await page.locator('#conf-query').isDisabled());
        assert.equal(await page.locator('.survey-landscape-trend').count(), 0);
        assert.equal(await page.locator('.survey-paper').count(), 0);
        assert.equal(await page.locator('.survey-empty a').getAttribute('href'), p.metadata.source_url);
      }
      override = null;
      await page.goto(`${base}/${name}-2026/`, {waitUntil:'networkidle'});
      await page.locator('.conf-breadcrumb a').click();
      await page.locator(`.research-card[href="/${name}-2026/"]`).click();
      assert.equal(new URL(page.url()).pathname, `/${name}-2026/`);
      report.conferences[name] = {indexed:total, readings:n.papers.length,fulltext:n.metadata.fulltext_count,abstract:n.metadata.abstract_count,trends:n.trends.length,recommendations:n.recommendations.length};
    }
    assert.deepEqual(errors, []);
    report.passed = true;
    fs.writeFileSync(path.join(output, 'conferences-2026-browser-report.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => {console.error(error.stack);process.exit(1);});
