(() => {
  'use strict';
  const root = document.querySelector('.conference-survey');
  if (!root) return;
  const el = id => document.getElementById(id);
  const conferenceName = root.dataset.conference;
  const officialURL = root.dataset.sourceUrl;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const key = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const safeURL = value => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch (_) { return null; }
  };
  const externalLink = (url, label, className = '') => {
    const href = safeURL(url);
    return href ? `<a href="${escape(href)}" class="${escape(className)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(label);
  };
  const pageSize = 12;
  let program, papers = [], notesByTitle = new Map(), currentPage = 1;
  const controls = ['query', 'category', 'session', 'track', 'review', 'sort'];
  const categoryLabel = id => program.categories.find(category => category.id === id)?.label || id;
  const noteFor = paper => notesByTitle.get(key(paper.title));
  const depthLabel = note => note.reading_depth === 'fulltext' ? '公开原文解读' : '公开摘要解读';
  const jumpLink = paper => `<a class="conf-jump-link" href="#paper-${escape(paper.id)}" data-paper-id="${escape(paper.id)}">${escape(paper.title)}</a>`;

  async function getJSON(url) {
    const response = await fetch(url, {credentials: 'same-origin'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function validateProgram(data) {
    if (!data || !Array.isArray(data.papers) || !Array.isArray(data.categories) || !Array.isArray(data.sessions) || !data.metadata) throw new Error('索引格式不完整');
    const ids = new Set(), titles = new Set();
    const categories = new Set(data.categories.map(category => category.id));
    const sessions = new Map(data.sessions.map(session => [session.id, session]));
    if (categories.size !== data.categories.length || sessions.size !== data.sessions.length || data.metadata.session_count !== data.sessions.length || !data.papers.length) throw new Error('场次与分类身份不一致');
    for (const paper of data.papers) {
      const session = sessions.get(paper.session_id);
      if (!paper.title || !/^[a-zA-Z0-9_-]+$/.test(paper.id) || ids.has(paper.id) || titles.has(key(paper.title)) || !categories.has(paper.category) || !session || session.category !== paper.category || session.track !== paper.track || !['main', 'industry'].includes(paper.track) || !safeURL(paper.source_url)) throw new Error('论文身份或分类无法核对');
      if (!paper.authors || !session.title || !safeURL(session.source_url)) throw new Error('论文来源字段缺失');
      ids.add(paper.id); titles.add(key(paper.title));
    }
    const mainCount = data.papers.filter(paper => paper.track === 'main').length;
    if (data.metadata.total_papers !== data.papers.length || data.metadata.main_papers !== mainCount || data.metadata.industry_papers !== data.papers.length - mainCount) throw new Error('索引计数不一致');
    for (const session of data.sessions) {
      if (session.paper_count !== data.papers.filter(paper => paper.session_id === session.id).length) throw new Error('Session 计数不一致');
    }
    for (const category of data.categories) {
      if (!category.label || category.paper_count !== data.papers.filter(paper => paper.category === category.id).length) throw new Error('分类计数不一致');
    }
    return data;
  }

  function readNotes(data) {
    if (!data || !Array.isArray(data.papers) || !Array.isArray(data.trends) || !Array.isArray(data.recommendations)) throw new Error('笔记格式不完整');
    if (data.metadata?.program_source_sha256 !== program.metadata.source_sha256 || data.metadata?.program_count !== papers.length) throw new Error('笔记绑定的官方快照已变化');
    const indexTitles = new Set(papers.map(paper => key(paper.title)));
    for (const note of data.papers) {
      const title = key(note.title);
      if (!indexTitles.has(title) || notesByTitle.has(title) || !safeURL(note.source_url) || !['abstract', 'fulltext'].includes(note.reading_depth) || !note.reading_basis || !note.summary) throw new Error('笔记的论文身份或阅读依据无法核对');
      if (note.tags != null && (!Array.isArray(note.tags) || note.tags.some(tag => typeof tag !== 'string')) || note.evidence_urls != null && (!Array.isArray(note.evidence_urls) || note.evidence_urls.some(url => !safeURL(url)))) throw new Error('笔记标签或证据链接格式有误');
      notesByTitle.set(title, note);
    }
    for (const item of [...data.trends, ...data.recommendations, ...(data.consensus || [])]) {
      if (!Array.isArray(item.paper_titles) || !item.paper_titles.length || item.paper_titles.some(title => !notesByTitle.has(key(title)))) throw new Error('总结引用的论文缺少阅读依据');
    }
    if (data.metadata.reading_count !== data.papers.length || data.metadata.fulltext_count !== data.papers.filter(note => note.reading_depth === 'fulltext').length || data.metadata.abstract_count !== data.papers.filter(note => note.reading_depth === 'abstract').length) throw new Error('阅读计数不一致');
    return data;
  }

  function evidence(titles) {
    return `<details class="survey-landscape-evidence"><summary>依据论文 · ${titles.length} 篇</summary><ul>${titles.map(title => {
      const paper = papers.find(item => key(item.title) === key(title));
      const note = noteFor(paper);
      return `<li>${jumpLink(paper)}<small>${escape(depthLabel(note))} · ${escape(note.reading_basis)}</small></li>`;
    }).join('')}</ul></details>`;
  }

  function renderAnalysis(notes) {
    el('conf-trends').innerHTML = notes.trends.map((trend, index) => `<article class="survey-landscape-trend"><span class="survey-small-label">THEME ${String(index + 1).padStart(2, '0')}</span><h4>${escape(trend.title)}</h4><p>${escape(trend.summary)}</p>${evidence(trend.paper_titles)}</article>`).join('');
    el('conf-recommendations').innerHTML = notes.recommendations.map((item, index) => `<article class="survey-landscape-recommendation"><span class="survey-landscape-priority">选题 ${String(index + 1).padStart(2, '0')}</span><h4>${escape(item.title)}</h4>${item.summary ? `<p>${escape(item.summary)}</p>` : ''}<dl class="conf-note-grid"><div><dt>研究问题</dt><dd>${escape(item.question)}</dd></div><div><dt>可验证的实验</dt><dd>${escape(item.experiment)}</dd></div></dl>${evidence(item.paper_titles)}</article>`).join('');
    el('conf-consensus').innerHTML = (notes.consensus || []).map(item => `<li><p>${escape(item.summary)}</p>${evidence(item.paper_titles)}</li>`).join('');
    el('conf-consensus-section').hidden = !notes.consensus?.length;
    const representativePapers = notes.papers.map(note => papers.find(paper => key(paper.title) === key(note.title)));
    el('conf-observation-count').textContent = `${representativePapers.length} 篇有来源的解读`;
    el('conf-observations').innerHTML = representativePapers.map(paper => {
      const note = noteFor(paper);
      return `<article class="conf-observation"><span class="survey-review-badge ${note.reading_depth === 'fulltext' ? 'is-reviewed' : 'is-abstract'}">${escape(depthLabel(note))}</span><h3>${jumpLink(paper)}</h3><p>${escape(note.summary)}</p><p class="conf-reading-basis">${escape(categoryLabel(paper.category))} · ${escape(note.reading_basis)}</p></article>`;
    }).join('');
  }

  function renderOverview() {
    el('conf-total').textContent = papers.length;
    el('conf-session-count').textContent = program.sessions.length;
    el('conf-direction-count').textContent = program.categories.length;
    el('conf-reviewed').textContent = notesByTitle.size;
    const fulltextCount = [...notesByTitle.values()].filter(note => note.reading_depth === 'fulltext').length;
    el('conf-reading-depth').textContent = `原文解读 ${fulltextCount} · 摘要解读 ${notesByTitle.size - fulltextCount}`;
    const date = new Date(program.metadata.fetched_at);
    el('conf-updated').textContent = Number.isNaN(date.getTime()) ? '' : `快照 ${new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit'}).format(date)}`;
    el('conf-source-scope').textContent = `${papers.length} 篇议程论文（研究轨 ${program.metadata.main_papers} / 工业轨 ${program.metadata.industry_papers}） · ${program.sessions.length} 个官方 Session · ${notesByTitle.size} 篇代表论文解读。论文身份来自官方议程，技术笔记逐篇标明公开阅读来源。`;
    el('conf-directions').innerHTML = program.categories.map(category => {
      const sessions = program.sessions.filter(session => session.category === category.id);
      const count = papers.filter(paper => paper.category === category.id).length;
      const representatives = papers.filter(paper => paper.category === category.id && noteFor(paper)).slice(0, 2);
      return `<tr><th scope="row">${escape(category.label)}</th><td><button type="button" class="survey-landscape-count" data-category="${escape(category.id)}" aria-label="筛选${escape(category.label)}的 ${count} 篇论文">${count}</button></td><td>${representatives.length ? representatives.map(paper => `<div class="conf-table-paper">${jumpLink(paper)}</div>`).join('') : '<span class="conf-reading-pending">待补充代表解读</span>'}</td><td>${sessions.map(session => externalLink(session.source_url, session.title, 'conf-session-link')).join('')}</td></tr>`;
    }).join('');
    el('conf-taxonomy').innerHTML = program.categories.map(category => {
      const count = papers.filter(paper => paper.category === category.id).length;
      return `<button type="button" class="survey-taxonomy-card" data-category="${escape(category.id)}" aria-pressed="false"><span class="survey-taxonomy-card-top"><span>${escape(category.label)}</span><span class="survey-taxonomy-card-count">${count}</span></span><p>${escape(category.description)}</p></button>`;
    }).join('');
    program.categories.forEach(category => el('conf-category').add(new Option(category.label, category.id)));
    program.sessions.forEach(session => el('conf-session').add(new Option(session.title, session.id)));
  }

  function filteredPapers() {
    const query = key(el('conf-query').value);
    const category = el('conf-category').value, session = el('conf-session').value, track = el('conf-track').value, review = el('conf-review').value;
    const selected = papers.filter(paper => {
      const note = noteFor(paper);
      if (category !== 'all' && paper.category !== category || session !== 'all' && paper.session_id !== session || track !== 'all' && paper.track !== track) return false;
      if (review === 'noted' && !note || review === 'unread' && note || ['fulltext', 'abstract'].includes(review) && note?.reading_depth !== review) return false;
      return !query || paper.searchText.includes(query);
    });
    const sort = el('conf-sort').value;
    if (sort === 'title') selected.sort((a, b) => a.title.localeCompare(b.title, 'en'));
    else if (sort === 'noted') selected.sort((a, b) => Number(Boolean(noteFor(b))) - Number(Boolean(noteFor(a))) || a.programOrder - b.programOrder);
    return selected;
  }

  function renderPaper(paper) {
    const note = noteFor(paper);
    const badge = note ? depthLabel(note) : '仅议程索引';
    const readingClass = note ? note.reading_depth === 'fulltext' ? 'is-reviewed' : 'is-abstract' : '';
    const tags = [categoryLabel(paper.category), ...(note?.tags || [])];
    const reading = note ? `<p>${escape(note.summary)}</p><p class="conf-reading-basis">阅读依据：${escape(note.reading_basis)}</p><details class="conf-reading-details"><summary>展开中文阅读笔记与局限</summary><dl class="conf-note-grid">${[['问题', note.problem], ['方法', note.method], ['得到的认识', note.takeaway], ['阅读边界与研究局限', note.limitations]].filter(([,value]) => value).map(([label,value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><div class="conf-evidence-links">${[...new Set([note.source_url, ...(note.evidence_urls || [])])].map((url, index) => externalLink(url, `阅读来源 ${index + 1} ↗`)).join('')}</div></details>` : '<p class="survey-paper-note">已确认官方议程条目，尚未添加摘要或原文解读。可通过下方官方 Session 链接核对标题与作者。</p>';
    return `<article id="paper-${escape(paper.id)}" class="survey-paper" tabindex="-1"><div class="survey-paper-top"><span class="survey-paper-number">${String(paper.programOrder + 1).padStart(3, '0')}</span><span class="survey-review-badge ${readingClass}">${escape(badge)}</span><span>${paper.track === 'industry' ? 'Industry Track' : 'Research Track'}</span></div><h3 class="conf-paper-title">${externalLink(paper.source_url, paper.title)}</h3><p class="conf-paper-meta">${escape(paper.session)}</p><div class="survey-paper-tags">${tags.map(tag => `<span class="survey-tag">${escape(tag)}</span>`).join('')}</div>${reading}<details><summary>作者与官方议程信息</summary><p class="conf-paper-authors">${escape(Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors)}</p>${paper.time ? `<p>议程时间：${escape(paper.time)}</p>` : ''}</details><div class="survey-paper-footer"><div class="survey-paper-links">${externalLink(paper.source_url, '官方 Session ↗')}${note ? externalLink(note.source_url, note.reading_depth === 'fulltext' ? '公开论文原文 ↗' : '公开摘要 ↗') : ''}${!note && paper.paper_url ? externalLink(paper.paper_url, '论文原文 ↗') : ''}<a href="#paper-${escape(paper.id)}" data-paper-id="${escape(paper.id)}">本页直达链接</a></div></div></article>`;
  }

  function renderPapers() {
    const selected = filteredPapers();
    const pageCount = Math.max(1, Math.ceil(selected.length / pageSize));
    currentPage = Math.min(currentPage, pageCount);
    el('conf-result-count').textContent = `${selected.length} / ${papers.length} 篇`;
    const pagePapers = selected.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    el('conf-paper-list').innerHTML = pagePapers.length ? pagePapers.map(renderPaper).join('') : '<div class="survey-empty"><h3>没有符合筛选条件的论文</h3><p>可修改搜索词、选择其他方向，或重置筛选。</p></div>';
    el('conf-paper-list').setAttribute('aria-busy', 'false');
    el('conf-pagination').hidden = selected.length <= pageSize;
    el('conf-page-number').textContent = `第 ${currentPage} / ${pageCount} 页`;
    el('conf-prev').disabled = currentPage <= 1;
    el('conf-next').disabled = currentPage >= pageCount;
    root.querySelectorAll('.survey-taxonomy-card').forEach(button => {
      const active = button.dataset.category === el('conf-category').value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function resetFilters() {
    el('conf-filters').reset();
    currentPage = 1;
  }

  function openPaper(id, changeHash = true) {
    const paper = papers.find(item => item.id === id);
    if (!paper) return;
    resetFilters();
    const index = filteredPapers().findIndex(item => item.id === id);
    currentPage = Math.floor(index / pageSize) + 1;
    renderPapers();
    const card = el(`paper-${id}`);
    card.querySelector('.conf-reading-details')?.setAttribute('open', '');
    if (changeHash) history.pushState(null, '', `#paper-${id}`);
    card.focus({preventScroll:true});
    card.scrollIntoView({behavior:'auto', block:'start'});
  }

  function openHash() {
    const id = location.hash.startsWith('#paper-') ? location.hash.slice(7) : '';
    if (id) openPaper(id, false);
  }

  function attachEvents() {
    el('conf-filters').addEventListener('submit', event => event.preventDefault());
    controls.forEach(name => el(`conf-${name}`).addEventListener(name === 'query' ? 'input' : 'change', () => { currentPage = 1; renderPapers(); }));
    el('conf-reset').addEventListener('click', () => { resetFilters(); renderPapers(); });
    root.addEventListener('click', event => {
      const categoryButton = event.target.closest('button[data-category]');
      if (categoryButton) {
        resetFilters();
        el('conf-category').value = categoryButton.dataset.category;
        renderPapers();
        el('papers').scrollIntoView({behavior:'auto', block:'start'});
        el('conf-category').focus({preventScroll:true});
      }
      const link = event.target.closest('a[data-paper-id]');
      if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); openPaper(link.dataset.paperId); }
    });
    ['prev', 'next'].forEach(direction => el(`conf-${direction}`).addEventListener('click', () => {
      currentPage += direction === 'next' ? 1 : -1;
      renderPapers();
      el('papers').scrollIntoView({behavior:'auto', block:'start'});
    }));
    window.addEventListener('hashchange', openHash);
    window.addEventListener('popstate', openHash);
  }

  async function init() {
    const [programResult, notesResult] = await Promise.allSettled([getJSON(root.dataset.programUrl), getJSON(root.dataset.notesUrl)]);
    try {
      if (programResult.status !== 'fulfilled') throw programResult.reason;
      program = validateProgram(programResult.value);
      papers = program.papers.map((paper, programOrder) => ({...paper, programOrder}));
      let notesError = false;
      try {
        if (notesResult.status !== 'fulfilled') throw notesResult.reason;
        const notes = readNotes(notesResult.value);
        renderAnalysis(notes);
      } catch (_) {
        notesError = true;
        notesByTitle.clear();
        el('conf-recommendations').replaceChildren();
        el('conf-consensus-section').hidden = true;
        el('conf-consensus').replaceChildren();
        el('conf-observation-count').textContent = '';
        el('conf-trends').innerHTML = '<p class="survey-landscape-notice">中文笔记暂时无法载入或未通过来源核对。完整官方议程索引仍可浏览。</p>';
        el('conf-observations').innerHTML = '<p class="survey-overview-note">代表论文解读暂不可用，可从论文索引访问官方议程。</p>';
      }
      papers.forEach(paper => {
        const note = noteFor(paper);
        paper.searchText = key([paper.title, paper.authors, paper.session, categoryLabel(paper.category), note?.summary, note?.problem, note?.method, note?.takeaway, note?.limitations, ...(note?.tags || [])].join(' '));
      });
      renderOverview(); renderPapers(); attachEvents();
      el('conf-status').classList.toggle('is-complete', !notesError);
      el('conf-status-title').textContent = notesError ? '官方议程索引已载入 · 笔记暂不可用' : '官方议程索引与代表论文笔记已载入';
      el('conf-status-message').textContent = `${papers.length} 篇议程论文、${program.sessions.length} 个 Session；${notesByTitle.size} 篇代表论文已有中文解读。技术阅读来源逐篇注明。`;
      openHash();
    } catch (_) {
      notesByTitle.clear();
      ['total', 'session-count', 'direction-count', 'reviewed'].forEach(name => { el(`conf-${name}`).textContent = '—'; });
      ['recommendations', 'consensus', 'taxonomy'].forEach(name => el(`conf-${name}`).replaceChildren());
      el('conf-consensus-section').hidden = true;
      el('conf-observation-count').textContent = '';
      el('conf-reading-depth').textContent = '数据暂不可用';
      el('conf-result-count').textContent = '';
      el('conf-pagination').hidden = true;
      el('conf-status').classList.remove('is-complete');
      el('conf-status-title').textContent = '暂时无法载入官方议程索引';
      el('conf-status-message').textContent = '数据读取失败或快照未通过身份与计数核对。可使用页面中的官方议程和数据下载链接。';
      el('conf-paper-list').innerHTML = `<div class="survey-empty"><h3>论文索引暂不可用</h3><p>请刷新页面，或直接访问 ${escape(conferenceName)} 官方技术议程。</p><a href="${escape(officialURL)}" target="_blank" rel="noopener noreferrer">打开官方议程 ↗</a></div>`;
      el('conf-paper-list').setAttribute('aria-busy', 'false');
      el('conf-trends').textContent = '索引未载入，暂不展示总结。';
      el('conf-directions').innerHTML = '<tr><td colspan="4">方向统计暂不可用。</td></tr>';
      el('conf-observations').textContent = '代表论文暂不可用。';
      controls.forEach(name => { el(`conf-${name}`).disabled = true; });
      el('conf-reset').disabled = true;
    }
  }
  init();
})();
