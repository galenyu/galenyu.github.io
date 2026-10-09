(() => {
  'use strict';
  const root = document.querySelector('[data-survey-url]');
  if (!root) return;
  const byId = id => document.getElementById('survey-' + id);
  const SOURCE = 'https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions';
  const state = { data: null, indexHash: null, loaded: false, query: '', category: 'all', review: 'all', sort: 'reviewed', page: 1, size: 12 };
  const categoryLabels = new Map();
  const integer = value => Number.isInteger(value) && value >= 0;
  const hasSummary = paper => typeof paper.summary === 'string' && Boolean(paper.summary.trim());
  const reviewed = paper => paper.review_status === 'reviewed' && paper.review_basis === 'official_pdf' &&
    paper.official_pdf_verified === true && hasSummary(paper) && /^[a-f0-9]{64}$/.test(paper.pdf_sha256 || '') &&
    paper.reviewed_pdf_url === paper.pdf_url && paper.reviewed_source_updated_at === paper.updated_at;
  const abstractReviewed = paper => paper.review_status === 'abstract' && paper.review_basis === 'official_abstract' && hasSummary(paper);
  const readingState = paper => reviewed(paper) ? 'reviewed' : (abstractReviewed(paper) ? 'abstract' : 'candidate');
  const rank = paper => reviewed(paper) ? 2 : (abstractReviewed(paper) ? 1 : 0);
  const allPapers = () => state.data?.papers || [];
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined && content !== null) node.textContent = String(content);
    return node;
  };
  const formatDate = (value, time = false) => {
    const date = new Date(value);
    const options = { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' };
    if (time) Object.assign(options, { hour: '2-digit', minute: '2-digit', hour12: false });
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('zh-CN', options) : '';
  };
  const safeLink = (value, label) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'openreview.net' || url.username || url.password ||
          !(['/forum', '/pdf', '/group'].includes(url.pathname) || /^\/pdf\/[a-f0-9]+\.pdf$/.test(url.pathname))) return null;
      const link = element('a', '', label);
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      return link;
    } catch (_) { return null; }
  };
  const showEmpty = (title, description, sourceLink = false) => {
    const box = element('div', 'survey-empty');
    const symbol = element('span', 'survey-empty-icon', '↗'); symbol.setAttribute('aria-hidden', 'true');
    box.append(symbol, element('h3', '', title), element('p', '', description));
    if (sourceLink) box.append(safeLink(SOURCE, '查看 OpenReview 官方投稿 ↗'));
    byId('paper-list').replaceChildren(box); byId('pagination').hidden = true;
  };
  const renderStatus = () => {
    const meta = state.data?.metadata, complete = meta?.status === 'complete', saved = Boolean(meta?.fetched_at);
    const fetched = formatDate(meta?.fetched_at, true), papers = allPapers();
    byId('export-help').hidden = complete;
    root.querySelector('.survey-status').classList.toggle('is-complete', complete);
    byId('status-title').textContent = complete ? '官方公开活跃投稿快照已完整核验' :
      (saved ? '本次同步未成功 · 正在展示官方历史快照' : '官方投稿数据暂未取得');
    byId('status-message').textContent = complete ?
      '已核对完整分页、唯一 ID、公开权限与活跃 venue；中文解读直接依据官网摘要，全文阅读另行计数。' :
      '当前官方完整列表无法核验，本次数量未知。' + (saved ? '保留 ' + fetched + ' 的官方历史记录与阅读进度。' : '可用正常浏览器导出完整公开投稿。');
    byId('updated').textContent = fetched ? '官网快照 ' + fetched + '（北京时间）' : '';
    byId('total').textContent = complete && integer(meta.total_active_submissions) ? meta.total_active_submissions.toLocaleString('zh-CN') : '—';
    byId('candidates').textContent = complete && integer(meta.candidate_count) ? meta.candidate_count.toLocaleString('zh-CN') : '—';
    byId('abstract-reviewed').textContent = complete || saved ? papers.filter(abstractReviewed).length.toLocaleString('zh-CN') : '—';
    byId('reviewed').textContent = complete || saved ? papers.filter(reviewed).length.toLocaleString('zh-CN') : '—';
    const screening = integer(meta?.automated_candidate_count) && integer(meta?.scope_excluded_count) ?
      ' 自动初筛 ' + meta.automated_candidate_count.toLocaleString('zh-CN') + ' 条，按官网摘要排除范围外记录 ' + meta.scope_excluded_count + ' 条。' : '';
    byId('method-detail').textContent = (meta?.method || '当前未载入可核验的官方投稿数据。') + screening +
      (fetched ? ' 官网快照：' + fetched + '（北京时间）。' : '') +
      (complete ? ' 仅发布量化候选与解读，完整原始导出保留在本地。' : ' 本次数量未知，历史记录不代表当前活跃状态。');
  };
  const renderTaxonomy = () => {
    const categories = state.data?.categories || [], counts = new Map(categories.map(category => [category.id, 0]));
    allPapers().forEach(paper => paper.categories.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
    categories.forEach(category => {
      categoryLabels.set(category.id, category.label);
      const option = element('option', '', category.label); option.value = category.id; byId('category').append(option);
      const card = element('button', 'survey-taxonomy-card');
      card.type = 'button'; card.dataset.category = category.id; card.setAttribute('aria-pressed', 'false');
      const top = element('div', 'survey-taxonomy-card-top');
      top.append(element('h3', '', category.label), element('span', 'survey-taxonomy-card-count', counts.get(category.id) + ' 候选'));
      card.append(top, element('p', '', category.description));
      card.addEventListener('click', () => {
        byId('category').value = category.id; state.category = category.id; state.page = 1;
        renderPapers(); byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' });
        byId('query').focus({ preventScroll: true });
      });
      byId('taxonomy').append(card);
    });
  };
  const resetFilters = () => {
    Object.assign(state, { query: '', category: 'all', review: 'all', sort: 'reviewed', page: 1 }); byId('filters').reset();
  };
  const paperAnchor = paper => 'survey-paper-' + paper.id;
  const paperLink = (id, label) => {
    const paper = allPapers().find(item => item.id === id);
    if (!paper) return null;
    const link = element('a', '', label || paper.title); link.href = '#' + encodeURIComponent(paperAnchor(paper));
    if (label) link.title = paper.title;
    link.addEventListener('click', event => {
      event.preventDefault(); resetFilters();
      state.page = Math.floor(sortedPapers([...allPapers()]).findIndex(item => item.id === id) / state.size) + 1;
      renderPapers(); document.getElementById(paperAnchor(paper))?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return link;
  };
  const validateLandscape = (stats, notes) => {
    const sameIds = (a, b) => {
      if (!Array.isArray(a) || a.length !== b.length || a.some(id => typeof id !== 'string')) return false;
      const expected = [...b].sort(); return [...a].sort().every((id, index) => id === expected[index]);
    };
    const papers = allPapers(), ids = papers.map(paper => paper.id), categoryIds = state.data.categories.map(category => category.id);
    if (state.data.metadata.status !== 'complete' || !state.indexHash) throw new Error('No complete snapshot');
    [stats, notes].forEach(data => {
      const meta = data?.metadata;
      if (!meta || meta.schema_version !== 1 || meta.source_url !== SOURCE || meta.source_sha256 !== state.data.metadata.source_sha256 || meta.index_sha256 !== state.indexHash ||
          meta.fetched_at !== state.data.metadata.fetched_at || meta.candidate_count !== papers.length) throw new Error('Stale landscape');
    });
    if (!Array.isArray(stats.directions) || stats.directions.length !== categoryIds.length ||
        !sameIds(stats.directions.map(direction => direction.id), categoryIds) || !Array.isArray(stats.term_signals)) throw new Error('Invalid landscape scope');
    const isText = value => typeof value === 'string' && Boolean(value.trim());
    const hasSources = item => item && Array.isArray(item.paper_ids) && item.paper_ids.length > 0 &&
      new Set(item.paper_ids).size === item.paper_ids.length && item.paper_ids.every(id => ids.includes(id));
    const share = count => Math.round(count / papers.length * 10000) / 100;
    stats.directions.forEach(direction => {
      const matches = papers.filter(paper => paper.categories.includes(direction.id)).map(paper => paper.id);
      const level = direction.count >= 200 ? 'high' : (direction.count >= 100 ? 'medium' : 'relatively-low');
      if (!isText(direction.label) || !sameIds(direction.paper_ids, matches) || direction.count !== matches.length ||
          direction.share_percent !== share(direction.count) || direction.statistical_saturation?.level !== level || !isText(direction.statistical_saturation?.label)) throw new Error('Invalid direction statistics');
      const representatives = notes.representatives?.[direction.id];
      if (!Array.isArray(representatives) || !representatives.length || representatives.some(item =>
        !item || !matches.includes(item.id) || !isText(item.label))) throw new Error('Invalid representatives');
    });
    const signalIds = new Set();
    stats.term_signals.forEach(signal => {
      if (!signal || !isText(signal.id) || signalIds.has(signal.id) || !isText(signal.label) || !integer(signal.count) ||
          !Array.isArray(signal.paper_ids) || signal.count !== signal.paper_ids.length || new Set(signal.paper_ids).size !== signal.count ||
          signal.paper_ids.some(id => !ids.includes(id)) || signal.share_percent !== share(signal.count)) throw new Error('Invalid term statistics');
      signalIds.add(signal.id);
    });
    if (stats.metadata.tag_assignments !== stats.directions.reduce((sum, direction) => sum + direction.count, 0) ||
        stats.metadata.unclassified_count !== papers.filter(paper => !paper.categories.length).length) throw new Error('Invalid tag totals');
    ['trends', 'consensus', 'recommendations'].forEach(field => {
      if (!Array.isArray(notes[field]) || !notes[field].length || notes[field].some(item => !hasSources(item) || !isText(item.title))) throw new Error('Invalid synthesis');
    });
    notes.trends.forEach(item => {
      if (!isText(item.text) || !Array.isArray(item.signal_ids) || item.signal_ids.some(id => !signalIds.has(id))) throw new Error('Invalid trend');
      if (!Array.isArray(item.evidence) || !sameIds(item.evidence.map(source => source?.paper_id), item.paper_ids) ||
          item.evidence.some(source => !isText(source.fact) || !['official_abstract', 'official_abstract_notes', 'official_pdf', 'official_pdf_notes'].includes(source.basis) ||
            (source.basis.startsWith('official_pdf') && !reviewed(papers.find(paper => paper.id === source.paper_id))))) throw new Error('Invalid trend evidence');
    });
    notes.consensus.forEach(item => { if (!isText(item.text)) throw new Error('Invalid consensus'); });
    notes.recommendations.forEach(item => {
      if (['priority', 'problem', 'approach', 'metrics', 'reason', 'limitations'].some(key => !isText(item[key]))) throw new Error('Invalid recommendation');
    });
    return { stats, notes };
  };
  const landscapeEvidence = (ids, evidence = []) => {
    const details = element('details', 'survey-landscape-evidence');
    details.append(element('summary', '', '展开对应官方论文与阅读依据'));
    const list = element('ul');
    ids.forEach(id => {
      const paper = allPapers().find(item => item.id === id), row = element('li');
      const source = evidence.find(item => item.paper_id === id);
      if (source) row.append(element('p', '', source.fact));
      row.append(paperLink(id), element('small', '', reviewed(paper) && (!source || source.basis.startsWith('official_pdf')) ? '已核对官方原稿；详见论文卡片的取证页码。' :
        (abstractReviewed(paper) || reviewed(paper) ? '本条事实依据官方摘要；逐篇笔记见论文卡片。' : '官方快照摘要；未计入逐篇中文解读或全文已读。')));
      list.append(row);
    });
    details.append(list); return details;
  };
  const renderLandscape = ({ stats, notes }) => {
    const meta = stats.metadata, count = meta.candidate_count;
    byId('landscape-status').textContent = '统计范围：' + count + ' 条官方候选 · ' + formatDate(meta.fetched_at, true) + '（北京时间） · 写作与索引版本已匹配';
    byId('landscape-status').classList.add('is-ready');
    document.getElementById('landscape-heading').textContent = count + ' 条候选的总结与研究建议';
    byId('landscape-caption').textContent = count + ' 条官方候选 · 方向标签统计';
    byId('landscape-scope').textContent = '“论文数”按官方 ID 去重，统计现有方向标签（自动初筛及少量人工校正）。它是候选标签数量，不能作为逐篇确认的相关论文数；点击数量可浏览对应候选。';
    const rows = stats.directions.map(direction => {
      const row = element('tr'), heading = element('th', '', direction.label); heading.scope = 'row';
      const number = element('td'), button = element('button', 'survey-landscape-count', direction.count.toLocaleString('zh-CN'));
      button.type = 'button'; button.dataset.category = direction.id;
      button.setAttribute('aria-label', '浏览' + direction.label + '方向的' + direction.count + '条候选');
      button.addEventListener('click', () => {
        resetFilters(); state.category = direction.id; byId('category').value = direction.id; renderPapers();
        byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' });
      });
      number.append(button, element('small', '', direction.share_percent.toFixed(1) + '% · 候选'));
      const representatives = element('td');
      notes.representatives[direction.id].forEach(item => {
        const paper = allPapers().find(paper => paper.id === item.id), box = element('div', 'survey-landscape-representative');
        box.append(paperLink(item.id, item.label), element('small', '', reviewed(paper) ? '官方原稿全文' :
          (abstractReviewed(paper) ? '官网摘要解读' : '官方摘要 · 待逐篇解读')));
        representatives.append(box);
      });
      const density = element('td'); density.append(element('span', 'survey-density is-' + (direction.statistical_saturation.level === 'relatively-low' ? 'low' : direction.statistical_saturation.level), direction.statistical_saturation.label),
        element('small', '', '按候选数量分级'));
      row.append(heading, number, representatives, density); return row;
    });
    byId('landscape-directions').replaceChildren(...rows);
    byId('landscape-counting').textContent = '多标签合计 ' + meta.tag_assignments.toLocaleString('zh-CN') + ' 次，覆盖 ' +
      (count - meta.unclassified_count) + ' 条候选；另有 ' + meta.unclassified_count + ' 条未命中这九个方向。各行占比的分母均为 ' + count + '，各行数量和占比不可相加。';
    byId('landscape-density').textContent = '“战线饱和度”仅用本快照候选密度作启发式代理：高 ≥ 200 条，中 100–199 条，相对低 < 100 条。它不衡量研究质量、创新枯竭、录用难度或跨年变化；宽标签和误收会放大数量。';
    byId('landscape-rules').textContent = 'PTQ 标签含校准、旋转及重建等宽线索；低精度训练标签也含 FP4/FP8、梯度及优化器，可能命中仅讨论相关背景的工作。下列词项单独在全部官方标题、摘要和关键词中检索，每个词项按 ID 去重；“提及”不等于采用、实现或验证。词项之间允许重叠。';
    byId('landscape-signals').replaceChildren(...stats.term_signals.map(signal => {
      const box = element('div', 'survey-landscape-signal'); box.append(element('span', '', signal.label), element('strong', '', signal.count + ' 条 · ' + signal.share_percent.toFixed(1) + '%')); return box;
    }));
    const signals = new Map(stats.term_signals.map(signal => [signal.id, signal]));
    byId('landscape-trends').replaceChildren(...notes.trends.map((item, index) => {
      const card = element('article', 'survey-landscape-trend');
      card.append(element('span', 'survey-small-label', 'TREND ' + String(index + 1).padStart(2, '0')), element('h4', '', item.title));
      if (item.signal_ids.length) card.append(element('p', 'survey-landscape-signal-note', '摘要词项线索：' + item.signal_ids.map(id => {
        const signal = signals.get(id); return signal.label + ' ' + signal.count + '/' + count;
      }).join('；')));
      card.append(element('p', '', item.text), landscapeEvidence(item.paper_ids, item.evidence)); return card;
    }));
    byId('landscape-consensus').replaceChildren(...notes.consensus.map(item => {
      const row = element('li'); row.append(element('strong', '', item.title + '。'), ' ' + item.text, landscapeEvidence(item.paper_ids)); return row;
    }));
    byId('landscape-recommendations').replaceChildren(...notes.recommendations.map(item => {
      const card = element('article', 'survey-landscape-recommendation');
      card.append(element('span', 'survey-landscape-priority', item.priority), element('h4', '', item.title), element('p', '', item.problem));
      const experiment = element('details', 'survey-landscape-experiment'); experiment.append(element('summary', '', '查看建议的实验设计、指标与风险'));
      const design = element('dl');
      [['怎么验证', item.approach], ['报告哪些指标', item.metrics], ['为什么值得研究', item.reason], ['边界与风险', item.limitations]].forEach(([label, text]) => {
        design.append(element('dt', '', label), element('dd', '', text));
      });
      experiment.append(design); card.append(experiment, landscapeEvidence(item.paper_ids)); return card;
    }));
    byId('landscape-content').hidden = false;
  };
  const loadLandscape = async () => {
    try {
      if (!state.data || !root.dataset.landscapeUrl || !root.dataset.landscapeNotesUrl) throw new Error('Missing snapshot');
      const [stats, notes] = await Promise.all([root.dataset.landscapeUrl, root.dataset.landscapeNotesUrl].map(async url => {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Analysis unavailable'); return response.json();
      }));
      renderLandscape(validateLandscape(stats, notes));
    } catch (_) {
      byId('landscape-content').hidden = true;
      byId('landscape-status').textContent = '总体分析暂不可用或与当前索引版本不匹配。为避免沿用旧快照结论，本章暂不显示统计与建议；论文索引仍可独立使用。';
    }
  };
  const renderObservations = () => {
    const count = allPapers().filter(paper => rank(paper) > 0).length;
    byId('reading-count').textContent = count + ' 篇已解读 · 代表样本';
    const nodes = (state.data?.observations || []).filter(observation =>
      observation.paper_ids.every(id => allPapers().some(paper => paper.id === id && rank(paper) > 0))).map((observation, index) => {
      const card = element('article', 'survey-observation');
      card.append(element('span', 'survey-observation-number', 'OBSERVATION ' + String(index + 1).padStart(2, '0')),
        element('h3', '', observation.title), element('p', '', observation.text));
      const sources = element('div', 'survey-observation-sources');
      observation.paper_ids.forEach(id => { const link = paperLink(id); if (link) sources.append(link); });
      card.append(element('span', 'survey-small-label', '对应官网论文解读'), sources);
      return card;
    });
    byId('observations').replaceChildren(...(nodes.length ? nodes : [element('p', 'survey-overview-note', '当前尚无可核对的跨论文观察。')]));
  };
  const renderPaper = paper => {
    const article = element('article', 'survey-paper'); article.id = paperAnchor(paper);
    const status = readingState(paper), top = element('div', 'survey-paper-top');
    top.append(element('span', 'survey-paper-number', integer(paper.number) ? '#' + String(paper.number).padStart(4, '0') : 'OpenReview'),
      element('span', 'survey-review-badge' + (status === 'reviewed' ? ' is-reviewed' : (status === 'abstract' ? ' is-abstract' : '')),
        status === 'reviewed' ? '官方全文已读' : (status === 'abstract' ? '官网摘要解读' : '待阅读候选')),
      element('span', 'survey-source-label', 'OpenReview 官方投稿'));
    const title = element('h3'); title.append(safeLink(paper.forum_url, paper.title) || element('span', '', paper.title));
    article.append(top, title, element('p', 'survey-provenance', '官方公开活跃投稿 · ' +
      (state.data.metadata.status === 'complete' ? '状态已在该快照核对' : '历史快照，当前状态待重新核对')));
    const tags = element('div', 'survey-paper-tags');
    paper.categories.forEach(category => { if (categoryLabels.has(category)) tags.append(element('span', 'survey-tag', categoryLabels.get(category))); });
    if (tags.childElementCount) article.append(tags);
    const facts = element('dl', 'survey-paper-facts');
    [['量化对象 / 场景', paper.quantization_target], ['量化精度', paper.bit_width]].forEach(([label, value]) => {
      if (typeof value === 'string' && value.trim()) {
        const cell = element('div'); cell.append(element('dt', '', label), element('dd', '', value)); facts.append(cell);
      }
    });
    if (facts.childElementCount && status !== 'candidate') article.append(facts);
    const addNotes = (label, value) => {
      const values = Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) :
        (typeof value === 'string' && value.trim() ? [value] : []);
      if (!values.length) return;
      article.append(element('span', 'survey-paper-note-title', label));
      if (values.length === 1) article.append(element('p', '', values[0]));
      else { const list = element('ul', 'survey-note-list'); values.forEach(item => list.append(element('li', '', item))); article.append(list); }
    };
    if (status !== 'candidate') {
      addNotes(status === 'abstract' ? '中文摘要解读' : '中文全文笔记', paper.summary);
      addNotes('方法与作者报告的结果', paper.contribution);
      addNotes('官方原稿实验结果', paper.results); addNotes('局限与待验证问题', paper.limitations);
      addNotes('阅读依据', status === 'abstract' ? '仅依据此条投稿的官方摘要；未核对投稿 PDF 的正文、表格和附录。' : paper.reading_basis);
      if (status === 'reviewed' && Array.isArray(paper.evidence)) {
        const evidence = element('details', 'survey-evidence');
        evidence.append(element('summary', '', '查看官方原稿取证位置'));
        const list = element('ul', 'survey-note-list');
        paper.evidence.forEach(item => {
          if (typeof item.location !== 'string' || typeof item.claim !== 'string') return;
          const entry = element('li');
          const page = item.location.match(/PDF p\.([0-9]+)/);
          const link = page && paper.pdf_url ? safeLink(paper.pdf_url + '#page=' + page[1], item.location) : null;
          entry.append(link || element('strong', '', item.location), '：' + item.claim);
          list.append(entry);
        });
        if (list.childElementCount) { evidence.append(list); article.append(evidence); }
      }
    } else article.append(element('p', 'survey-paper-note', '标题、摘要或关键词命中模型量化线索；主题与全文尚待逐篇核验。'));
    if (paper.abstract) {
      const details = element('details'); details.append(element('summary', '', '查看官网原始摘要'), element('p', '', paper.abstract)); article.append(details);
    }
    if (paper.matched_terms.length) article.append(element('p', 'survey-match-terms', '检索命中：' + paper.matched_terms.join(' · ')));
    const footer = element('div', 'survey-paper-footer'), links = element('div', 'survey-paper-links');
    [[paper.forum_url, 'OpenReview ↗'], [paper.pdf_url, '官方论文 PDF ↗']].forEach(([url, label]) => { const link = safeLink(url, label); if (link) links.append(link); });
    footer.append(links);
    const updated = formatDate(paper.updated_at);
    if (updated) footer.append(element('span', 'survey-paper-updated', '投稿更新 ' + updated));
    article.append(footer); return article;
  };
  const sortedPapers = papers => papers.sort((a, b) => {
    if (state.sort === 'reviewed' && rank(a) !== rank(b)) return rank(b) - rank(a);
    if (state.sort === 'title') return a.title.localeCompare(b.title);
    if (state.sort === 'updated') return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
    return (integer(a.number) ? a.number : Number.MAX_SAFE_INTEGER) - (integer(b.number) ? b.number : Number.MAX_SAFE_INTEGER);
  });
  const renderPapers = () => {
    byId('paper-list').setAttribute('aria-busy', 'false');
    root.querySelectorAll('.survey-taxonomy-card').forEach(card => {
      const selected = card.dataset.category === state.category; card.classList.toggle('is-active', selected); card.setAttribute('aria-pressed', String(selected));
    });
    const all = allPapers(), query = state.query.trim().toLocaleLowerCase();
    const papers = sortedPapers(all.filter(paper => {
      if (state.category !== 'all' && !paper.categories.includes(state.category)) return false;
      if (state.review !== 'all' && readingState(paper) !== state.review) return false;
      return !query || [paper.title, paper.abstract, paper.summary, paper.contribution, paper.limitations,
        paper.quantization_target, paper.bit_width, ...paper.keywords, ...paper.matched_terms].flat()
        .filter(value => typeof value === 'string').join(' ').toLocaleLowerCase().includes(query);
    }));
    byId('result-count').textContent = all.length ? papers.length + ' / ' + all.length + ' 篇候选' : (state.data?.metadata.status === 'complete' ? '0 篇候选' : '官方数量未知');
    if (!papers.length) {
      if (all.length) showEmpty('没有符合当前筛选条件的论文', '尝试其他关键词、阅读状态或研究方向，或点击“重置筛选”。');
      else if (state.data?.metadata.status === 'complete') showEmpty('本次官方公开快照中未检出相关候选', '完整列表已获取，初筛未命中相关论文；关键词规则仍可能漏检。', true);
      else showEmpty('官方投稿数据暂未载入', '未取得可核验的完整列表，本次投稿数量仍为未知。', true);
      return;
    }
    const pages = Math.ceil(papers.length / state.size); state.page = Math.max(1, Math.min(state.page, pages));
    byId('paper-list').replaceChildren(...papers.slice((state.page - 1) * state.size, state.page * state.size).map(renderPaper));
    byId('pagination').hidden = pages < 2; byId('page-number').textContent = '第 ' + state.page + ' / ' + pages + ' 页';
    byId('prev').disabled = state.page === 1; byId('next').disabled = state.page === pages;
  };
  const validateData = data => {
    if (!data?.metadata || !['complete', 'unavailable'].includes(data.metadata.status) || !Array.isArray(data.categories) || !Array.isArray(data.papers)) throw new Error('Invalid survey data');
    const categoryIds = new Set(), ids = new Set();
    data.categories.forEach(category => {
      if (!category || typeof category.id !== 'string' || typeof category.label !== 'string' ||
          typeof category.description !== 'string' || categoryIds.has(category.id)) throw new Error('Invalid taxonomy');
      categoryIds.add(category.id);
    });
    data.papers.forEach(paper => {
      if (!paper || typeof paper.id !== 'string' || !paper.id || ids.has(paper.id) || typeof paper.title !== 'string' ||
          typeof paper.abstract !== 'string' || !Array.isArray(paper.categories) || !paper.categories.every(id => categoryIds.has(id)) ||
          !['candidate', 'abstract', 'reviewed'].includes(paper.review_status) || paper.source_kind !== 'openreview' ||
          paper.active_submission_verified !== true || !safeLink(paper.forum_url, '') || (paper.pdf_url && !safeLink(paper.pdf_url, ''))) throw new Error('Invalid official paper');
      ids.add(paper.id);
      ['keywords', 'matched_terms'].forEach(field => {
        if (!Array.isArray(paper[field]) || !paper[field].every(term => typeof term === 'string')) throw new Error('Invalid terms');
      });
    });
    if (data.metadata.status === 'complete' && (!integer(data.metadata.total_active_submissions) ||
        data.metadata.total_active_submissions < data.papers.length || data.metadata.candidate_count !== data.papers.length ||
        data.metadata.reviewed_count !== data.papers.filter(reviewed).length ||
        data.metadata.abstract_reviewed_count !== data.papers.filter(abstractReviewed).length ||
        !data.metadata.fetched_at || Number.isNaN(Date.parse(data.metadata.fetched_at)))) throw new Error('Incomplete snapshot');
    if (data.observations !== undefined && (!Array.isArray(data.observations) || data.observations.some(item =>
      typeof item.title !== 'string' || typeof item.text !== 'string' || !Array.isArray(item.paper_ids) ||
      !item.paper_ids.every(id => ids.has(id))))) throw new Error('Invalid observation sources');
    return data;
  };
  byId('filters').addEventListener('submit', event => event.preventDefault());
  byId('query').addEventListener('input', event => { state.query = event.target.value; state.page = 1; if (state.loaded) renderPapers(); });
  ['category', 'review', 'sort'].forEach(field => byId(field).addEventListener('change', event => {
    state[field] = event.target.value; state.page = 1; if (state.loaded) renderPapers();
  }));
  byId('reset').addEventListener('click', () => { resetFilters(); if (state.loaded) renderPapers(); byId('query').focus(); });
  ['prev', 'next'].forEach(direction => byId(direction).addEventListener('click', () => {
    state.page += direction === 'next' ? 1 : -1; renderPapers(); byId('papers-heading').scrollIntoView({ block: 'start', behavior: 'auto' });
  }));
  fetch(root.dataset.surveyUrl, { credentials: 'same-origin' }).then(response => {
    if (!response.ok) throw new Error('Data unavailable'); return response.text();
  }).then(async text => {
    const data = validateData(JSON.parse(text));
    if (window.crypto?.subtle) {
      try {
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        state.indexHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      } catch (_) { state.indexHash = null; }
    }
    return data;
  }).then(data => { state.data = data; }).catch(() => { state.data = null; }).finally(() => {
    state.loaded = true; renderStatus(); renderTaxonomy(); renderObservations(); renderPapers(); loadLandscape();
  });
})();
