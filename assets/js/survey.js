(() => {
  'use strict';
  const root = document.querySelector('[data-survey-url]');
  if (!root) return;
  const byId = (id) => document.getElementById(`survey-${id}`);
  const SOURCE = 'https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions';
  const state = { data: null, reading: null, loaded: false, query: '', category: 'all', source: 'all', review: 'all', sort: 'reviewed', page: 1, size: 12 };
  const fallbackCategories = [
    ['ptq', '训练后量化', '校准、舍入、旋转与重建等训练后量化方法。'],
    ['qat', '量化感知训练', '将量化误差引入训练或微调过程。'],
    ['training', '低精度训练', '低比特数值格式与训练稳定性。'],
    ['kv-cache', 'KV Cache', '注意力缓存与长上下文推理中的量化。'],
    ['hardware', '硬件与系统', '内核、部署和真实运行效率。'],
    ['reasoning', '推理能力', '量化与推理、数学和代码能力的关系。'],
    ['diffusion', '扩散模型', '图像、视频与其他扩散模型的量化。'],
    ['multimodal', '多模态', '视觉语言及其他多模态模型的量化。'],
    ['theory', '理论与分析', '量化误差、界、鲁棒性和机理分析。']
  ].map(([id, label, description]) => ({ id, label, description }));
  const categoryLabels = new Map();
  const integer = value => Number.isInteger(value) && value >= 0;
  const reviewed = paper => paper.review_status === 'reviewed' && typeof paper.summary === 'string' && Boolean(paper.summary.trim());
  const isPreprint = paper => paper.source_kind === 'public_preprint';
  const isMirror = paper => paper.source_kind === 'mirror_candidate';
  const submissionEvidenceLabel = paper => paper.submission_evidence === 'mirror_snapshot' ? '镜像关联 ICLR 2027' : '作者声明 ICLR 2027';
  const sourceLabel = paper => isPreprint(paper) ? `公开预印本 ${submissionEvidenceLabel(paper)} 活跃状态待核对` : (isMirror(paper) ? '第三方快照候选 活跃状态待核验' : 'OpenReview 投稿');
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  };
  const formatDate = value => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
  };
  // Research URLs are constrained to the primary sources. Author evidence is HTTPS only.
  const safeLink = (value, label, evidence = false) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      if (!evidence) {
        const openreview = url.hostname === 'openreview.net' && ['/forum', '/pdf', '/group'].includes(url.pathname);
        const arxiv = url.hostname === 'arxiv.org' && /^\/(?:abs|html|pdf)\/[\w.\/-]+$/.test(url.pathname);
        if (!openreview && !arxiv) return null;
      }
      const link = element('a', '', label);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    } catch (_) { return null; }
  };
  const externalSource = label => safeLink(SOURCE, label);
  const allPapers = () => {
    const official = (state.data?.papers || []).map(paper => ({ ...paper, source_kind: 'openreview' }));
    const inputs = [...(state.reading?.papers || []), ...official, ...(state.reading?.candidates || [])];
    const ids = new Set();
    const titles = new Set();
    return inputs.filter(paper => {
      const title = paper.title.trim().toLocaleLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
      const aliases = [paper.id, paper.candidate_openreview_id].filter(Boolean);
      if (aliases.some(id => ids.has(id)) || titles.has(title)) return false;
      aliases.forEach(id => ids.add(id)); titles.add(title);
      return true;
    });
  };
  const showEmpty = (title, description, sourceLink = false) => {
    const box = element('div', 'survey-empty');
    const symbol = element('span', 'survey-empty-icon', '↗');
    symbol.setAttribute('aria-hidden', 'true');
    box.append(symbol, element('h3', '', title), element('p', '', description));
    if (sourceLink) box.append(externalSource('查看 OpenReview 公开投稿 ↗'));
    byId('paper-list').replaceChildren(box);
    byId('pagination').hidden = true;
  };
  const renderStatus = () => {
    const meta = state.data?.metadata;
    const complete = meta?.status === 'complete';
    const saved = Boolean(meta?.fetched_at);
    const readingCount = state.reading?.papers.filter(reviewed).length;
    const reviewedCount = allPapers().filter(reviewed).length;
    const hasReading = Boolean(readingCount);
    const checked = formatDate(meta?.checked_at || state.reading?.metadata.checked_at);
    const fetched = formatDate(meta?.fetched_at);
    root.querySelector('.survey-status').classList.toggle('is-complete', complete);
    byId('status-title').textContent = complete ? '公开投稿快照已获取' : (hasReading ? '公开全文阅读笔记已整理 · 官方活跃投稿列表待核对' : (saved ? '本次同步未成功 · 正在展示历史快照' : '官方投稿列表暂未取得'));
    const readingMessage = hasReading ? `已整理 ${readingCount} 篇公开全文笔记；投稿关联来源逐篇标注，活跃投稿状态仍待核对。` : '';
    if (complete) {
      byId('status-message').textContent = 'OpenReview 候选按公开标题、摘要与关键词初筛；公开预印本的来源与投稿声明另行标注。';
    } else if (/Challenge|verification|403/i.test(meta?.message || '')) {
      byId('status-message').textContent = 'OpenReview 公开接口要求访问验证，完整投稿数量与候选总数未知。' + readingMessage + (saved ? `另保留 ${fetched} 的官方历史快照。` : '');
    } else {
      byId('status-message').textContent = '当前无法完整读取 OpenReview 投稿列表，官方统计数量未知。' + readingMessage + (saved ? `另保留 ${fetched} 的官方历史快照。` : '');
    }
    byId('updated').textContent = checked ? `最近核查 ${checked}` : '';
    byId('total').textContent = complete && integer(meta.total_active_submissions) ? meta.total_active_submissions.toLocaleString('zh-CN') : '—';
    byId('candidates').textContent = complete && integer(meta.candidate_count) ? meta.candidate_count.toLocaleString('zh-CN') : '—';
    byId('reviewed').textContent = state.reading || complete || saved ? reviewedCount.toLocaleString('zh-CN') : '—';
    byId('reviewed').nextElementSibling.textContent = '去重后的已读数量，投稿状态见逐篇来源';
    byId('method-detail').textContent = `${meta?.method || 'OpenReview 官方投稿索引当前未能完整读取。'}${complete ? `本次官方快照：${fetched}。` : '官方数量未知；同步失败时保留历史快照。'}${hasReading ? `另有 ${readingCount} 篇公开全文阅读笔记，附投稿关联的来源；不计入官方候选总数。` : '公开阅读笔记单独加载。'}`;
    const mirror = state.reading?.mirror_metadata;
    const mirrorDetail = byId('mirror-detail');
    if (mirror && state.reading.candidates?.length) {
      mirrorDetail.hidden = false;
      mirrorDetail.append(element('span', '', `${mirror.snapshot_built_at} 第三方公开快照提供 ${state.reading.candidates.length.toLocaleString('zh-CN')} 条自动初筛线索；尚未逐篇确认相关性或阅读全文。同一论文的已读笔记与候选记录合并展示，当前活跃状态未核验。`));
      const link = safeLink(mirror.source_url, '查看快照出处 ↗', true);
      if (link) mirrorDetail.append(' ', link);
    }
  };
  const renderTaxonomy = () => {
    const categories = state.data?.categories || fallbackCategories;
    const papers = allPapers();
    const counts = new Map(categories.map(category => [category.id, 0]));
    papers.forEach(paper => paper.categories.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
    const known = Boolean(papers.length || state.data?.metadata.fetched_at || state.data?.metadata.status === 'complete' || state.reading);
    categories.forEach(category => {
      categoryLabels.set(category.id, category.label);
      const option = element('option', '', category.label);
      option.value = category.id;
      byId('category').append(option);
      const card = element('button', 'survey-taxonomy-card');
      card.type = 'button';
      card.dataset.category = category.id;
      card.setAttribute('aria-pressed', 'false');
      const top = element('div', 'survey-taxonomy-card-top');
      const count = element('span', 'survey-taxonomy-card-count', known ? `${counts.get(category.id)} 已展示` : '—');
      top.append(element('h3', '', category.label), count);
      card.append(top, element('p', '', category.description));
      card.addEventListener('click', () => {
        byId('category').value = category.id;
        state.category = category.id;
        state.page = 1;
        renderPapers();
        byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' });
        byId('query').focus({ preventScroll: true });
      });
      byId('taxonomy').append(card);
    });
  };
  const resetFilters = () => {
    Object.assign(state, { query: '', category: 'all', source: 'all', review: 'all', sort: 'reviewed', page: 1 });
    byId('filters').reset();
  };
  const paperAnchor = paper => `survey-paper-${paper.id}`;
  const paperLink = (id, label) => {
    const paper = allPapers().find(item => item.id === id);
    if (!paper) return null;
    const link = element('a', '', label || paper.title);
    link.href = '#' + encodeURIComponent(paperAnchor(paper));
    link.addEventListener('click', event => {
      event.preventDefault();
      resetFilters();
      const sorted = sortedPapers(allPapers());
      state.page = Math.floor(sorted.findIndex(item => item.id === id) / state.size) + 1;
      renderPapers();
      document.getElementById(paperAnchor(paper))?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return link;
  };
  const renderObservations = () => {
    const reading = state.reading;
    byId('reading-count').textContent = reading ? `${reading.papers.length} 篇公开全文 · 部分范围` : '公开阅读笔记暂未载入';
    const nodes = (reading?.observations || []).map((observation, index) => {
      const card = element('article', 'survey-observation');
      card.append(element('span', 'survey-observation-number', `OBSERVATION ${String(index + 1).padStart(2, '0')}`), element('h3', '', observation.title), element('p', '', observation.text));
      const sources = element('div', 'survey-observation-sources');
      observation.paper_ids.forEach(id => { const link = paperLink(id); if (link) sources.append(link); });
      if (sources.childElementCount) card.append(element('span', 'survey-small-label', '对应阅读笔记'), sources);
      return card;
    });
    byId('observations').replaceChildren(...(nodes.length ? nodes : [element('p', 'survey-overview-note', '暂无可载入的阶段性观察。论文与笔记的其他可用来源仍会正常展示。')]));
    const leads = reading?.leads || [];
    byId('leads').hidden = !leads.length;
    leads.forEach(lead => {
      const item = element('div', 'survey-lead');
      item.append(element('strong', '', lead.title), element('p', '', lead.message));
      const evidence = safeLink(lead.venue_evidence_url, '查看公开投稿线索 ↗', true);
      if (evidence) item.append(evidence);
      byId('leads-list').append(item);
    });
  };
  const renderPaper = paper => {
    const article = element('article', 'survey-paper');
    article.id = paperAnchor(paper);
    const preprint = isPreprint(paper);
    const mirror = isMirror(paper);
    const top = element('div', 'survey-paper-top');
    top.append(element('span', 'survey-paper-number', preprint ? `arXiv ${paper.arxiv_id || ''}` : (integer(paper.number) ? `#${String(paper.number).padStart(4, '0')}` : 'OpenReview')));
    top.append(element('span', `survey-review-badge${reviewed(paper) ? ' is-reviewed' : ''}`, reviewed(paper) ? '全文已读' : '待阅读候选'));
    top.append(element('span', 'survey-source-label', preprint ? submissionEvidenceLabel(paper) : (mirror ? '第三方快照候选' : 'OpenReview 投稿')));
    const title = element('h3');
    title.append(safeLink(preprint ? paper.source_url : paper.forum_url, paper.title) || element('span', '', paper.title));
    article.append(top, title);
    if (preprint) article.append(element('p', 'survey-provenance', `公开预印本 · ${submissionEvidenceLabel(paper)} · 当前 Active submissions 状态待核对`));
    if (mirror) article.append(element('p', 'survey-provenance', '第三方历史快照 · 关键词初筛，全文尚未阅读 · 当前活跃投稿状态待核验'));
    const tags = element('div', 'survey-paper-tags');
    paper.categories.forEach(category => { if (categoryLabels.has(category)) tags.append(element('span', 'survey-tag', categoryLabels.get(category))); });
    if (tags.childElementCount) article.append(tags);
    if (preprint) {
      const facts = element('dl', 'survey-paper-facts');
      [['模型 / 场景', paper.target], ['量化精度', paper.precision], ['硬件证据', paper.hardware_evidence]].forEach(([label, value]) => {
        if (typeof value === 'string' && value.trim()) { const cell = element('div'); cell.append(element('dt', '', label), element('dd', '', value)); facts.append(cell); }
      });
      if (facts.childElementCount) article.append(facts);
    }
    const addNotes = (label, value) => {
      const values = Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : (typeof value === 'string' && value.trim() ? [value] : []);
      if (!values.length) return;
      article.append(element('span', 'survey-paper-note-title', label));
      if (values.length === 1) article.append(element('p', '', values[0]));
      else { const list = element('ul', 'survey-note-list'); values.forEach(item => list.append(element('li', '', item))); article.append(list); }
    };
    if (reviewed(paper)) {
      addNotes('中文阅读笔记', paper.summary);
      addNotes('核心贡献', paper.contribution);
      addNotes('原文实验结果', paper.results);
      addNotes('阅读理解', paper.interpretation);
      addNotes('局限与待验证问题', paper.limitations);
      addNotes('阅读依据', paper.reading_basis);
    } else article.append(element('p', 'survey-paper-note', '标题、摘要或关键词命中量化线索；尚未完成全文阅读与中文总结。'));
    if (paper.abstract) {
      const details = element('details');
      details.append(element('summary', '', '查看原始摘要'), element('p', '', paper.abstract));
      article.append(details);
    }
    if ((preprint || mirror) && paper.venue_evidence) {
      const provenance = element('details', 'survey-evidence');
      provenance.append(element('summary', '', mirror ? '查看快照来源与状态边界' : '查看投稿关联与状态边界'), element('p', '', paper.venue_evidence));
      const evidence = safeLink(paper.venue_evidence_url, mirror || paper.submission_evidence === 'mirror_snapshot' ? '第三方快照原始来源 ↗' : '作者投稿声明 ↗', true);
      if (evidence) provenance.append(evidence);
      article.append(provenance);
    }
    if (paper.matched_terms.length) article.append(element('p', 'survey-match-terms', `检索命中：${paper.matched_terms.join(' · ')}`));
    const footer = element('div', 'survey-paper-footer');
    const links = element('div', 'survey-paper-links');
    [[paper.forum_url, 'OpenReview ↗'], [paper.source_url, 'arXiv 摘要页 ↗'], [paper.fulltext_url, '公开全文 ↗'], [paper.pdf_url, '论文 PDF ↗']].forEach(([url, label]) => { const link = safeLink(url, label); if (link) links.append(link); });
    if (mirror) {
      const mirrorLink = safeLink(paper.mirror_source_url || paper.source_url, '第三方快照 ↗', true);
      if (mirrorLink) links.append(mirrorLink);
    }
    footer.append(links);
    const updated = formatDate(paper.updated_at);
    if (updated) footer.append(element('span', 'survey-paper-updated', `记录更新 ${updated}`));
    article.append(footer);
    return article;
  };
  const sortedPapers = papers => papers.sort((a, b) => {
    if (state.sort === 'reviewed' && reviewed(a) !== reviewed(b)) return Number(reviewed(b)) - Number(reviewed(a));
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'updated') return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
    return (integer(a.number) ? a.number : Number.MAX_SAFE_INTEGER) - (integer(b.number) ? b.number : Number.MAX_SAFE_INTEGER);
  });
  const renderPapers = () => {
    byId('paper-list').setAttribute('aria-busy', 'false');
    root.querySelectorAll('.survey-taxonomy-card').forEach(card => {
      const selected = card.dataset.category === state.category;
      card.classList.toggle('is-active', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    const all = allPapers();
    const query = state.query.trim().toLocaleLowerCase();
    const papers = sortedPapers(all.filter(paper => {
      if (state.category !== 'all' && !paper.categories.includes(state.category)) return false;
      if (state.source !== 'all' && paper.source_kind !== state.source) return false;
      if (state.review !== 'all' && paper.review_status !== state.review) return false;
      return !query || [paper.title, paper.abstract, paper.summary, paper.contribution, paper.limitations, paper.results, paper.interpretation, paper.reading_basis, paper.venue_evidence, paper.target, paper.precision, paper.hardware_evidence, sourceLabel(paper), ...paper.keywords, ...paper.matched_terms].flat().filter(value => typeof value === 'string').join(' ').toLocaleLowerCase().includes(query);
    }));
    byId('result-count').textContent = all.length ? `${papers.length} / ${all.length} 篇已展示` : (state.data?.metadata.status === 'complete' ? '0 篇候选' : '官方数量未知');
    if (!papers.length) {
      if (state.source === 'openreview' && !state.data?.metadata.fetched_at && state.data?.metadata.status !== 'complete') showEmpty('官方活跃投稿列表暂未取得', 'OpenReview 接口要求访问验证，官方候选总数未知。可在“论文来源”中选择公开预印本，阅读已有的全文笔记。', true);
      else if (all.length) showEmpty('没有符合当前筛选条件的论文', '尝试其他关键词、选择全部方向和来源，或点击“重置筛选”。');
      else if (state.data?.metadata.status === 'complete') showEmpty('本次官方公开快照中未检出相关候选', '完整列表已获取，但初筛规则未命中量化相关候选。关键词检索仍可能漏检。', true);
      else showEmpty('可用论文数据暂未载入', '官方投稿索引与公开阅读笔记分别加载。当前未取得官方完整列表，数量仍为未知。', true);
      return;
    }
    const pages = Math.ceil(papers.length / state.size);
    state.page = Math.max(1, Math.min(state.page, pages));
    byId('paper-list').replaceChildren(...papers.slice((state.page - 1) * state.size, state.page * state.size).map(renderPaper));
    byId('pagination').hidden = pages < 2;
    byId('page-number').textContent = `第 ${state.page} / ${pages} 页`;
    byId('prev').disabled = state.page === 1;
    byId('next').disabled = state.page === pages;
  };
  const validatePapers = papers => {
    if (!Array.isArray(papers)) throw new Error('Missing papers');
    const ids = new Set();
    papers.forEach(paper => {
      if (!paper || typeof paper.id !== 'string' || ids.has(paper.id) || typeof paper.title !== 'string' || typeof paper.abstract !== 'string' || !Array.isArray(paper.categories) || !paper.categories.every(id => typeof id === 'string') || !['candidate', 'reviewed'].includes(paper.review_status)) throw new Error('Invalid paper');
      ids.add(paper.id);
      ['keywords', 'matched_terms'].forEach(field => { if (!Array.isArray(paper[field]) || !paper[field].every(term => typeof term === 'string')) throw new Error('Invalid terms'); });
    });
  };
  const validateData = data => {
    if (!data?.metadata || !['complete', 'unavailable'].includes(data.metadata.status) || !Array.isArray(data.categories)) throw new Error('Invalid survey data');
    const categoryIds = new Set();
    data.categories.forEach(category => {
      if (!category || typeof category.id !== 'string' || typeof category.label !== 'string' || typeof category.description !== 'string' || categoryIds.has(category.id)) throw new Error('Invalid taxonomy');
      categoryIds.add(category.id);
    });
    validatePapers(data.papers);
    if (data.metadata.status === 'complete' && (!integer(data.metadata.total_active_submissions) || data.metadata.total_active_submissions < data.papers.length || data.metadata.candidate_count !== data.papers.length || data.metadata.reviewed_count !== data.papers.filter(reviewed).length || !data.metadata.fetched_at)) throw new Error('Incomplete snapshot');
    return data;
  };
  const validateReading = data => {
    if (data?.metadata?.status !== 'partial' || !['author_reported_iclr_2027', 'partial_iclr2027_public_research'].includes(data.metadata.scope)) throw new Error('Invalid reading-note scope');
    validatePapers(data.papers);
    if (data.metadata.count !== data.papers.length || data.papers.some(paper => !isPreprint(paper) || paper.active_submission_verified !== false || !reviewed(paper))) throw new Error('Invalid reading provenance');
    if (data.candidates !== undefined) {
      if (!Array.isArray(data.candidates)) throw new Error('Invalid mirror candidates');
      data.candidates = data.candidates.map(paper => ({ abstract: '', keywords: [], matched_terms: [], ...paper }));
      validatePapers(data.candidates);
      if (data.candidates.some(paper => !isMirror(paper) || paper.review_status !== 'candidate' || paper.active_submission_verified !== false)) throw new Error('Invalid mirror provenance');
    }
    if (!Array.isArray(data.observations) || !Array.isArray(data.leads)) throw new Error('Invalid reading context');
    const ids = new Set(data.papers.map(paper => paper.id));
    data.observations.forEach(item => { if (typeof item.title !== 'string' || typeof item.text !== 'string' || !Array.isArray(item.paper_ids) || !item.paper_ids.every(id => ids.has(id))) throw new Error('Invalid observation sources'); });
    data.leads.forEach(item => { if (typeof item.title !== 'string' || typeof item.message !== 'string') throw new Error('Invalid lead'); });
    return data;
  };
  byId('filters').addEventListener('submit', event => event.preventDefault());
  byId('query').addEventListener('input', event => { state.query = event.target.value; state.page = 1; if (state.loaded) renderPapers(); });
  ['category', 'source', 'review', 'sort'].forEach(field => byId(field).addEventListener('change', event => { state[field] = event.target.value; state.page = 1; if (state.loaded) renderPapers(); }));
  byId('reset').addEventListener('click', () => { resetFilters(); if (state.loaded) renderPapers(); byId('query').focus(); });
  ['prev', 'next'].forEach(direction => byId(direction).addEventListener('click', () => { state.page += direction === 'next' ? 1 : -1; renderPapers(); byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' }); }));
  const load = (url, validate) => fetch(url, { credentials: 'same-origin' }).then(response => { if (!response.ok) throw new Error('Data unavailable'); return response.json(); }).then(validate);
  Promise.allSettled([load(root.dataset.surveyUrl, validateData), load(root.dataset.readingUrl, validateReading)]).then(results => {
    state.data = results[0].status === 'fulfilled' ? results[0].value : null;
    state.reading = results[1].status === 'fulfilled' ? results[1].value : null;
    state.loaded = true;
    renderStatus();
    renderTaxonomy();
    renderObservations();
    renderPapers();
  });
})();
