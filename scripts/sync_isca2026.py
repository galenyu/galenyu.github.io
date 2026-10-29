#!/usr/bin/env python3
"""Index every paper block in the official ISCA 2026 technical program.

Uses only Python's standard library. Session-derived browsing categories are
explicit; paper abstracts and PDF links are never guessed from their titles.
"""
import argparse
from collections import Counter
import datetime as dt
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.iscaconf.org/isca2026/program/'
OUTPUT = ROOT / 'assets/data/isca-2026-program.json'
RAW_SOURCE = ROOT / 'assets/data/isca-2026-source.html'
CATEGORIES = [
    {'id': 'best-paper', 'label': '最佳论文候选', 'description': '官方最佳论文候选全会场次；包含多个研究方向。'},
    {'id': 'llm', 'label': 'LLM 推理与系统', 'description': '官方 LLM 1–5 场次。'},
    {'id': 'memory-pim', 'label': '存储器与 PIM / PNM', 'description': '存储系统、DRAM / SRAM 存内计算及近存计算场次。'},
    {'id': 'ml-accelerators', 'label': '机器学习加速器', 'description': 'ML Accelerators 与 Deep Learning / Memory Acceleration 场次。'},
    {'id': 'security', 'label': '安全与密码计算', 'description': 'Security、Crypto、Rowhammer 与 FHE 场次。'},
    {'id': 'microarchitecture', 'label': '微架构与缓存', 'description': 'Microarchitecture、Prefetching and Caches 场次。'},
    {'id': 'quantum', 'label': '量子计算', 'description': '官方 Quantum 1–3 场次。'},
    {'id': 'domain-accelerators', 'label': '专用加速器与应用', 'description': 'Domain Specific Accelerators、Rendering 与 HPC 场次。'},
    {'id': 'sustainability', 'label': '可持续性与能效', 'description': 'Sustainability 与 Sustainability and Energy Efficiency 场次。'},
    {'id': 'storage', 'label': '存储与检索', 'description': '官方 Storage 场次。'},
    {'id': 'gpu-compilation', 'label': 'GPU 与编译', 'description': '官方 GPUs and Compilation 场次。'},
    {'id': 'emerging', 'label': 'Chiplet 与新兴技术', 'description': '官方 Emerging Technologies: Chiplet, Wafer-Scale, etc. 场次。'},
    {'id': 'datacenter', 'label': '性能建模与数据中心', 'description': '官方 Performance Modeling / Datacenter 场次。'},
    {'id': 'verification', 'label': '验证与鲁棒性', 'description': '官方 Verification and Robustness 场次。'},
    {'id': 'other', 'label': '其他架构研究', 'description': '官方 Potpourri 场次。'},
    {'id': 'industry', 'label': '工业界实践', 'description': '官方 Industry Track 1–2 场次，单独标记为 industry track。'},
]
SESSION_CATEGORIES = {
    '1a': 'best-paper',
    '2a': 'llm', '2b': 'memory-pim', '2c': 'sustainability', '2d': 'storage',
    '3a': 'ml-accelerators', '3b': 'memory-pim', '3c': 'security', '3d': 'microarchitecture',
    '4a': 'llm', '4b': 'industry', '4c': 'domain-accelerators', '4d': 'quantum',
    '5a': 'llm', '5b': 'industry', '5c': 'security', '5d': 'other',
    '6a': 'llm', '6b': 'ml-accelerators', '6c': 'gpu-compilation', '6d': 'security',
    '7a': 'emerging', '7b': 'datacenter', '7c': 'domain-accelerators', '7d': 'security',
    '8a': 'domain-accelerators', '8b': 'microarchitecture', '8c': 'quantum', '8d': 'domain-accelerators',
    '9a': 'verification', '9b': 'microarchitecture', '9c': 'quantum', '9d': 'sustainability',
    '10a': 'llm', '10b': 'ml-accelerators', '10c': 'memory-pim', '10d': 'domain-accelerators',
}
DAY_DATES = {
    'Monday, June 29': '2026-06-29',
    'Tuesday, June 30': '2026-06-30',
    'Wednesday, July 1': '2026-07-01',
}
VOID_TAGS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
             'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Node:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []
        self.parent = parent

    def has_class(self, name):
        return name in (self.attrs.get('class') or '').split()

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def find_all(self, class_name):
        return [node for node in self.walk() if node.has_class(class_name)]

    def find_one(self, class_name, required=True):
        found = self.find_all(class_name)
        if required and len(found) != 1:
            raise ValueError(f'Expected one {class_name} inside {self.tag}, got {len(found)}')
        return found[0] if found else None

    def text(self):
        def parts(node):
            for child in node.children:
                if isinstance(child, Node):
                    yield from parts(child)
                else:
                    yield child
        return re.sub(r'\s+', ' ', ' '.join(parts(self))).strip()


class ProgramHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('document')
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in VOID_TAGS:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Node(tag, attrs, self.current))

    def handle_endtag(self, tag):
        cursor = self.current
        while cursor.parent:
            if cursor.tag == tag:
                self.current = cursor.parent
                return
            cursor = cursor.parent

    def handle_data(self, data):
        self.current.children.append(data)


def parse_program(source_bytes, fetched_at):
    parser = ProgramHTMLParser()
    parser.feed(source_bytes.decode('utf-8'))
    parser.close()
    root = parser.root
    sessions, papers, excluded_slots = [], [], []
    day = None
    for block in root.walk():
        if block.tag == 'h2' and block.text() in DAY_DATES:
            day = DAY_DATES[block.text()]
        if not block.has_class('schedule-block-papers'):
            continue
        title = block.find_one('panel-title').text()
        match = re.fullmatch(r'Session (\d+[A-D]): (.+)', title)
        if not match or not day:
            raise ValueError(f'Unexpected technical-paper session: {title}')
        session_id, theme = match.group(1).lower(), match.group(2)
        if session_id not in SESSION_CATEGORIES:
            raise ValueError(f'Add an explicit browsing category for new session {session_id}')
        category = SESSION_CATEGORIES[session_id]
        track = 'industry' if theme.startswith('Industry Track') else 'main'
        if (track == 'industry') != (category == 'industry'):
            raise ValueError(f'Industry classification disagrees with official heading: {title}')
        contents = block.find_one('panel-contents')
        if contents.attrs.get('id') != session_id:
            raise ValueError(f'Session anchor does not match heading: {title}')
        source_url = SOURCE + '#' + session_id
        session_papers = []
        for entry in block.find_all('paper'):
            entry_title = entry.find_one('paper-title').text()
            entry_authors = entry.find_one('paper-authors').text()
            if not entry_title and not entry_authors:
                excluded_slots.append({
                    'session_id': session_id,
                    'time': entry.find_one('paper-time').text(),
                    'source_url': source_url,
                    'reason': 'Official HTML has a scheduled slot with empty title and authors; not an identifiable paper.',
                })
                continue
            if not entry_title or not entry_authors:
                raise ValueError(f'Paper missing title/authors in {session_id}')
            session_papers.append(entry)
        if not session_papers:
            raise ValueError(f'Empty paper session: {title}')
        session = {
            'id': session_id,
            'title': title,
            'theme': theme,
            'date': day,
            'location': block.find_one('session-location').text().removeprefix('Location: '),
            'chair': block.find_one('session-chair').text().removeprefix('Session Chair: '),
            'category': category,
            'track': track,
            'paper_count': len(session_papers),
            'source_url': source_url,
        }
        sessions.append(session)
        for paper in session_papers:
            title_node = paper.find_one('paper-title')
            paper_title = title_node.text()
            authors = paper.find_one('paper-authors').text()
            if not paper_title or not authors:
                raise ValueError(f'Paper missing title/authors in {session_id}')
            # Exact original title is the join key for separately sourced notes.
            stable_id = hashlib.sha256(paper_title.encode('utf-8')).hexdigest()[:12]
            links = [node.attrs['href'] for node in title_node.walk()
                     if node.tag == 'a' and node.attrs.get('href')]
            if links:
                raise ValueError('Official program added paper links; review URL handling before importing')
            papers.append({
                'id': 'isca26-' + stable_id,
                'title': paper_title,
                'authors': authors,
                'session_id': session_id,
                'session': session['title'],
                'category': category,
                'track': track,
                'date': day,
                'time': paper.find_one('paper-time').text(),
                'source_url': source_url,
                'paper_url': None,
                'abstract': None,
            })
    if not papers or len(papers) + len(excluded_slots) != len(root.find_all('paper')):
        raise ValueError('Not every official paper block was indexed')
    if len({paper['id'] for paper in papers}) != len(papers):
        raise ValueError('Duplicate paper titles or hash collision in official program')
    if len({session['id'] for session in sessions}) != len(sessions):
        raise ValueError('Duplicate official session IDs')
    counts = Counter(paper['category'] for paper in papers)
    categories = [{**category, 'paper_count': counts[category['id']]} for category in CATEGORIES]
    return {
        'metadata': {
            'conference': 'ISCA 2026',
            'source_name': 'ISCA 2026 official technical program',
            'source_url': SOURCE,
            'source_file': 'assets/data/isca-2026-source.html',
            'source_sha256': hashlib.sha256(source_bytes).hexdigest(),
            'fetched_at': fetched_at,
            'total_papers': len(papers),
            'main_papers': sum(paper['track'] == 'main' for paper in papers),
            'industry_papers': sum(paper['track'] == 'industry' for paper in papers),
            'session_count': len(sessions),
            'source_paper_block_count': len(root.find_all('paper')),
            'excluded_empty_slot_count': len(excluded_slots),
            'main_session_count': sum(session['track'] == 'main' for session in sessions),
            'industry_session_count': sum(session['track'] == 'industry' for session in sessions),
            'category_method': 'Exclusive grouping of official sessions; not per-paper topic classification.',
            'scope': 'All technical-program paper blocks, including Industry Track; excluding keynotes, workshops, tutorials and social events.',
            'available_fields': ['title', 'authors_with_affiliations', 'session', 'track', 'date', 'time', 'location', 'chair'],
            'limitations': [
                '官网议程未提供论文摘要、PDF 或 DOI；相应字段保持为空。',
                '方向数量按官方场次归组；同一研究主题可能散落在多个场次，不能据此计算全会议主题占比。',
                '议程索引不表示已阅读全文；逐篇中文解读的阅读依据单独记录。',
                '标题、作者及单位仅规范化空白，保留官网原文与可能的拼写问题。',
            ],
        },
        'categories': categories,
        'sessions': sessions,
        'papers': papers,
        'excluded_slots': excluded_slots,
    }


def write_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary.write(data)
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--input-html', type=Path, help='Rebuild from a saved official program HTML snapshot')
    args.add_argument('--fetched-at', help='Actual source acquisition time, ISO 8601 UTC (required for a new offline snapshot)')
    args.add_argument('--output', type=Path, default=OUTPUT)
    options = args.parse_args()
    if options.input_html:
        source_bytes = options.input_html.read_bytes()
        fetched_at = options.fetched_at
        if not fetched_at and options.output.exists():
            previous = json.loads(options.output.read_text())['metadata']
            if previous['source_sha256'] == hashlib.sha256(source_bytes).hexdigest():
                fetched_at = previous['fetched_at']
        if not fetched_at:
            args.error('--fetched-at is required when importing a new HTML snapshot')
    else:
        request = urllib.request.Request(SOURCE, headers={'User-Agent': 'Galen-ISCA2026-Survey/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            source_bytes = response.read()
        fetched_at = now()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', fetched_at):
        args.error('--fetched-at must be UTC in YYYY-MM-DDTHH:MM:SSZ form')
    dt.datetime.fromisoformat(fetched_at.replace('Z', '+00:00'))
    document = parse_program(source_bytes, fetched_at)
    serialized = (json.dumps(document, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    # Parsing/validation finishes before either successful snapshot is replaced.
    if not options.input_html:
        write_atomic(RAW_SOURCE, source_bytes)
    write_atomic(options.output, serialized)
    metadata = document['metadata']
    print(f"{metadata['total_papers']} papers: {metadata['main_papers']} main + "
          f"{metadata['industry_papers']} industry; {metadata['session_count']} sessions")


if __name__ == '__main__':
    main()
