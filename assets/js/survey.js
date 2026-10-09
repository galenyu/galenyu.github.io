(() => {
  'use strict';
  const root = document.querySelector('[data-survey-url]');
  if (!root) return;
  const byId = (id) => document.getElementById(`survey-${id}`);
  const SOURCE = 'https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions';
  const state = { data: null, query: '', category: 'all', review: 'all', sort: 'number', page: 1, size: 12 };
  const categoryLabels = new Map();
  const integer = (number) => Number.isInteger(number) && number >= 0;
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  };
  const formatDate = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
  };
  const safeLink = (value, label) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'openreview.net' || url.username || url.password || !['/forum', '/pdf'].includes(url.pathname)) return null;
      const link = element('a', '', label);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    } catch (_) { return null; }
  };
  const externalSource = (label) => {
    const link = element('a', '', label);
    link.href = SOURCE;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  };
  const showEmpty = (title, description, sourceLink = false) => {
    const box = element('div', 'survey-empty');
    const symbol = element('span', 'survey-empty-icon', '↗');
    symbol.setAttribute('aria-hidden', 'true');
    box.append(symbol, element('h3', '', title), element('p', '', description));
    if (sourceLink) box.append(externalSource('前往 OpenReview 查看公开投稿 ↗'));
    byId('paper-list').replaceChildren(box);
    byId('pagination').hidden = true;
  };
  const renderStatus = () => {
    const meta = state.data.metadata;
    const complete = meta.status === 'complete';
    const saved = Boolean(meta.fetched_at);
    const checked = formatDate(meta.checked_at);
    const fetched = formatDate(meta.fetched_at);
    root.querySelector('.survey-status').classList.toggle('is-complete', complete);
    byId('status-title').textContent = complete ? '公开投稿快照已获取' : (saved ? '本次同步未成功 · 正在展示历史快照' : '论文数据暂未取得');
    if (complete) {
      byId('status-message').textContent = '候选论文已按公开标题、摘要与关键词初筛；逐篇原文核验后才会添加中文阅读总结。';
    } else if (/Challenge|verification|403/i.test(meta.message || '')) {
      byId('status-message').textContent = 'OpenReview 的公开投稿接口要求访问验证，当前尚未取得完整列表。' + (saved ? `下方保留 ${fetched} 的上次成功数据；本次统计数量未知。` : '论文数量与方向分布为未知，取得数据后再逐篇整理。');
    } else {
      byId('status-message').textContent = '当前无法完整读取 OpenReview 的公开投稿列表。' + (saved ? `下方保留 ${fetched} 的历史数据；本次统计数量未知。` : '目前没有可核验的完整数据，数量显示为未知。');
    }
    byId('updated').textContent = checked ? `最近核查 ${checked}` : '';
    byId('total').textContent = complete && integer(meta.total_active_submissions) ? meta.total_active_submissions.toLocaleString('zh-CN') : '—';
    byId('candidates').textContent = complete && integer(meta.candidate_count) ? meta.candidate_count.toLocaleString('zh-CN') : '—';
    byId('reviewed').textContent = saved && integer(meta.reviewed_count) ? meta.reviewed_count.toLocaleString('zh-CN') : '—';
    root.querySelector('.survey-stats').dataset.stale = String(!complete);
    const reviewedSmall = byId('reviewed').nextElementSibling;
    reviewedSmall.textContent = !complete && saved ? `历史快照 · ${fetched}` : '已核对原文并补充总结';
    byId('method-detail').textContent = `${meta.method || 'OpenReview API v2 公开数据。'}${complete ? `本次成功快照：${fetched}。` : '同步失败时保留上次成功快照；未取得的数据不计为零。'}`;
  };
  const renderTaxonomy = () => {
    const data = state.data;
    const container = byId('taxonomy');
    const select = byId('category');
    const counts = new Map(data.categories.map(category => [category.id, 0]));
    data.papers.forEach(paper => paper.categories.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
    const known = Boolean(data.metadata.fetched_at);
    data.categories.forEach((category) => {
      categoryLabels.set(category.id, category.label);
      const option = element('option', '', category.label);
      option.value = category.id;
      select.append(option);
      const card = element('button', 'survey-taxonomy-card');
      card.type = 'button';
      card.dataset.category = category.id;
      card.setAttribute('aria-pressed', 'false');
      const top = element('div', 'survey-taxonomy-card-top');
      top.append(element('h3', '', category.label), element('span', 'survey-taxonomy-card-count', known ? counts.get(category.id) : '—'));
      card.append(top, element('p', '', category.description));
      card.addEventListener('click', () => {
        select.value = category.id;
        state.category = category.id;
        state.page = 1;
        renderPapers();
        byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' });
        byId('query').focus({ preventScroll: true });
      });
      container.append(card);
    });
  };
  const renderPaper = (paper) => {
    const article = element('article', 'survey-paper');
    const top = element('div', 'survey-paper-top');
    top.append(element('span', 'survey-paper-number', integer(paper.number) ? `#${String(paper.number).padStart(4, '0')}` : 'ICLR 2027'));
    const reviewed = paper.review_status === 'reviewed' && typeof paper.summary === 'string' && paper.summary.trim();
    top.append(element('span', `survey-review-badge${reviewed ? ' is-reviewed' : ''}`, reviewed ? '已核验' : '待核验候选'));
    const title = element('h3');
    title.append(safeLink(paper.forum_url, paper.title) || element('span', '', paper.title));
    article.append(top, title);
    const tags = element('div', 'survey-paper-tags');
    paper.categories.forEach(category => { if (categoryLabels.has(category)) tags.append(element('span', 'survey-tag', categoryLabels.get(category))); });
    if (tags.childElementCount) article.append(tags);
    if (reviewed) {
      article.append(element('span', 'survey-paper-note-title', '中文阅读笔记'), element('p', '', paper.summary));
      if (typeof paper.contribution === 'string' && paper.contribution.trim()) article.append(element('span', 'survey-paper-note-title', '核心贡献'), element('p', '', paper.contribution));
      if (typeof paper.limitations === 'string' && paper.limitations.trim()) article.append(element('span', 'survey-paper-note-title', '局限与待验证问题'), element('p', '', paper.limitations));
    } else {
      article.append(element('p', 'survey-paper-note', '标题、摘要或关键词命中量化线索；尚未完成原文核验与中文总结。'));
    }
    if (paper.abstract) {
      const details = element('details');
      details.append(element('summary', '', '查看原始摘要'), element('p', '', paper.abstract));
      article.append(details);
    }
    if (paper.matched_terms.length) article.append(element('p', 'survey-match-terms', `检索命中：${paper.matched_terms.join(' · ')}`));
    const footer = element('div', 'survey-paper-footer');
    const links = element('div', 'survey-paper-links');
    const forum = safeLink(paper.forum_url, 'OpenReview ↗');
    const pdf = safeLink(paper.pdf_url, '论文 PDF ↗');
    if (forum) links.append(forum);
    if (pdf) links.append(pdf);
    footer.append(links);
    const updated = formatDate(paper.updated_at);
    if (updated) footer.append(element('span', 'survey-paper-updated', `稿件更新 ${updated}`));
    article.append(footer);
    return article;
  };
  const renderPapers = () => {
    const data = state.data;
    byId('paper-list').setAttribute('aria-busy', 'false');
    root.querySelectorAll('.survey-taxonomy-card').forEach(card => {
      const selected = card.dataset.category === state.category;
      card.classList.toggle('is-active', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    if (!data.metadata.fetched_at && data.metadata.status !== 'complete') {
      byId('result-count').textContent = '数量未知';
      showEmpty('等待公开数据核验', 'OpenReview 投稿接口目前要求访问验证。尚未取得完整的 ICLR 2027 投稿列表，论文数量与方向分布暂不统计。', true);
      return;
    }
    const query = state.query.trim().toLocaleLowerCase();
    const papers = data.papers.filter(paper => {
      if (state.category !== 'all' && !paper.categories.includes(state.category)) return false;
      if (state.review !== 'all' && paper.review_status !== state.review) return false;
      return !query || [paper.title, paper.abstract, paper.summary, paper.contribution, paper.limitations, ...paper.keywords, ...paper.matched_terms].filter(value => typeof value === 'string').join(' ').toLocaleLowerCase().includes(query);
    });
    papers.sort((a, b) => {
      if (state.sort === 'title') return a.title.localeCompare(b.title);
      if (state.sort === 'updated') return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
      return (integer(a.number) ? a.number : Number.MAX_SAFE_INTEGER) - (integer(b.number) ? b.number : Number.MAX_SAFE_INTEGER);
    });
    const historical = data.metadata.status !== 'complete' ? ' · 历史快照' : '';
    byId('result-count').textContent = `${papers.length} / ${data.papers.length} 篇${historical}`;
    if (!papers.length) {
      if (!data.papers.length) showEmpty('本次公开快照中未检出相关候选', '完整公开列表已获取，但初筛规则未命中量化相关候选。可前往原始列表继续核对，关键词检索可能漏检。', true);
      else showEmpty('没有符合当前筛选条件的论文', '尝试其他关键词、选择全部方向，或点击“重置筛选”。');
      return;
    }
    const pages = Math.ceil(papers.length / state.size);
    state.page = Math.min(state.page, pages);
    const visible = papers.slice((state.page - 1) * state.size, state.page * state.size);
    byId('paper-list').replaceChildren(...visible.map(renderPaper));
    byId('pagination').hidden = pages < 2;
    byId('page-number').textContent = `第 ${state.page} / ${pages} 页`;
    byId('prev').disabled = state.page === 1;
    byId('next').disabled = state.page === pages;
  };
  const validateData = (data) => {
    if (!data || typeof data !== 'object' || !data.metadata || !['complete', 'unavailable'].includes(data.metadata.status) || !Array.isArray(data.papers) || !Array.isArray(data.categories)) throw new Error('Invalid survey data');
    const categoryIds = new Set();
    data.categories.forEach(category => {
      if (!category || typeof category.id !== 'string' || typeof category.label !== 'string' || typeof category.description !== 'string' || categoryIds.has(category.id)) throw new Error('Invalid taxonomy');
      categoryIds.add(category.id);
    });
    const paperIds = new Set();
    data.papers.forEach(paper => {
      if (!paper || typeof paper.id !== 'string' || paperIds.has(paper.id) || typeof paper.title !== 'string' || typeof paper.abstract !== 'string' || !Array.isArray(paper.categories) || !paper.categories.every(id => typeof id === 'string') || !['candidate', 'reviewed'].includes(paper.review_status)) throw new Error('Invalid paper');
      paperIds.add(paper.id);
      ['keywords', 'matched_terms'].forEach(field => {
        if (!Array.isArray(paper[field]) || !paper[field].every(term => typeof term === 'string')) throw new Error('Invalid paper terms');
      });
    });
    if (data.metadata.status === 'complete' && (!integer(data.metadata.total_active_submissions) || data.metadata.total_active_submissions < data.papers.length || data.metadata.candidate_count !== data.papers.length || data.metadata.reviewed_count !== data.papers.filter(paper => paper.review_status === 'reviewed' && typeof paper.summary === 'string' && paper.summary.trim()).length || !data.metadata.fetched_at)) throw new Error('Incomplete snapshot');
    return data;
  };
  byId('filters').addEventListener('submit', event => event.preventDefault());
  byId('query').addEventListener('input', event => { state.query = event.target.value; state.page = 1; if (state.data) renderPapers(); });
  ['category', 'review', 'sort'].forEach(field => byId(field).addEventListener('change', event => { state[field] = event.target.value; state.page = 1; if (state.data) renderPapers(); }));
  byId('reset').addEventListener('click', () => {
    Object.assign(state, { query: '', category: 'all', review: 'all', sort: 'number', page: 1 });
    byId('filters').reset();
    if (state.data) renderPapers();
    byId('query').focus();
  });
  ['prev', 'next'].forEach(direction => byId(direction).addEventListener('click', () => {
    state.page += direction === 'next' ? 1 : -1;
    renderPapers();
    byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' });
  }));
  fetch(root.dataset.surveyUrl, { credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error('Survey data unavailable'); return response.json(); })
    .then(validateData)
    .then(data => { state.data = data; renderStatus(); renderTaxonomy(); renderPapers(); })
    .catch(() => {
      byId('status-title').textContent = '数据快照暂时无法载入';
      byId('status-message').textContent = '请稍后刷新，或直接查看原始 OpenReview 投稿列表。当前数量未知。';
      byId('paper-list').setAttribute('aria-busy', 'false');
      byId('result-count').textContent = '数量未知';
      showEmpty('无法载入论文数据', '本地数据文件暂不可访问或尚未通过完整性校验，请稍后重试。', true);
    });
})();
