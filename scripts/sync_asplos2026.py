#!/usr/bin/env python3
"""Rebuild the ASPLOS 2026 paper index from the official technical program.

Only Python's standard library is needed. Categories group official sessions;
they are not claims about the technical content of every paper in a session.
"""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import tempfile
import urllib.request

from sync_isca2026 import ProgramHTMLParser

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.asplos-conference.org/asplos2026/program/index.html'
RAW_SOURCE = ROOT / 'assets/data/asplos-2026-source.html'
OUTPUT = ROOT / 'assets/data/asplos-2026-program.json'
CATEGORIES = [
    {'id': 'llm-serving', 'label': 'LLM 推理与服务', 'description': '服务吞吐、延迟、推测解码、KV cache 与 MoE 推理场次。'},
    {'id': 'ml-training', 'label': '模型训练与监测', 'description': 'LLM Training Systems 与 ML Training & Monitoring 场次。'},
    {'id': 'ml-compilation', 'label': '张量编译与代码生成', 'description': 'ML Compilers & Tensor Programs 及 Compilers & Code Generation 场次。'},
    {'id': 'gpu', 'label': 'GPU 系统与编程', 'description': 'GPU Systems & Scheduling 与 GPU Programming 场次。'},
    {'id': 'memory', 'label': 'CXL、分离式内存与存储', 'description': 'CXL、分离式内存、内存层级及存储缓存场次。'},
    {'id': 'pim', 'label': '存内计算', 'description': 'Processing-in-Memory 场次；其他场次也包含 PIM 相关论文。'},
    {'id': 'security', 'label': '安全、可信执行与密码计算', 'description': 'DRAM Reliability & Security、Trusted Execution Environments 与 Fully Homomorphic Encryption 场次。'},
    {'id': 'quantum', 'label': '量子与新兴计算', 'description': '量子编译、纠错及 Quantum & Emerging Computing 场次。'},
    {'id': 'edge-generative', 'label': '生成模型、视觉与端侧 AI', 'description': '3D Gaussian Splatting、Generative Model Serving 与 On-Device & Edge AI 场次。'},
    {'id': 'accelerators', 'label': '神经网络与可重构加速器', 'description': 'Neural Network Acceleration 与 Reconfigurable Architectures 场次。'},
    {'id': 'verification-hdl', 'label': '形式验证、测试与硬件语言', 'description': 'Formal Verification、Hardware Design Languages 及 Testing & Fuzzing 场次。'},
    {'id': 'graph-sparse', 'label': '图与稀疏计算', 'description': 'Graph & Sparse Computing 场次。'},
    {'id': 'microarchitecture', 'label': '处理器微架构', 'description': 'Processor Microarchitecture 场次。'},
    {'id': 'cloud', 'label': '云、网络与无服务器系统', 'description': 'Serverless & Cloud Networking 与 Network & Cloud Infrastructure 场次。'},
    {'id': 'profiling', 'label': '系统分析与优化', 'description': 'Systems Profiling & Optimization 场次。'},
    {'id': 'reliability', 'label': '可靠性与容错', 'description': 'Reliability & Fault Tolerance 场次。'},
]
SESSION_CATEGORIES = {
    '1a':'llm-serving', '1b':'llm-serving', '1c':'quantum', '1d':'memory',
    '2a':'ml-training', '2b':'llm-serving', '2c':'gpu', '2d':'security',
    '3a':'llm-serving', '3b':'llm-serving', '3c':'edge-generative', '3d':'security',
    '4a':'ml-training', '4b':'ml-compilation', '4c':'quantum', '4d':'pim',
    '5a':'edge-generative', '5b':'edge-generative', '5c':'verification-hdl', '5d':'memory',
    '6a':'accelerators', '6b':'verification-hdl', '6c':'graph-sparse', '6d':'memory',
    '7a':'security', '7b':'ml-compilation', '7c':'verification-hdl', '7d':'microarchitecture',
    '8a':'gpu', '8b':'cloud', '8c':'memory', '8d':'accelerators',
    '9a':'profiling', '9b':'quantum', '9c':'reliability', '9d':'cloud',
}


def parse_program(source_bytes, fetched_at):
    parser = ProgramHTMLParser()
    parser.feed(source_bytes.decode('utf-8'))
    parser.close()
    root = parser.root
    day, time = None, None
    sessions, papers = [], []
    for node in root.walk():
        if node.tag == 'h2' and node.attrs.get('id') in {'day1', 'day2', 'day3'}:
            day = {'day1':'2026-03-24', 'day2':'2026-03-25', 'day3':'2026-03-26'}[node.attrs['id']]
        if node.has_class('schedule-time'):
            headings = [child for child in node.walk() if child.tag == 'h3']
            if len(headings) != 1:
                raise ValueError('Unexpected schedule time structure')
            time = headings[0].text()
        if not node.has_class('schedule-session'):
            continue
        title = node.find_one('panel-title').text()
        match = re.fullmatch(r'Session (\d+[A-D]): (.+)', title)
        if not match:
            if node.find_all('paper'):
                raise ValueError(f'Unrecognized paper session: {title}')
            continue  # keynote panels
        session_id = match[1].lower()
        if session_id not in SESSION_CATEGORIES or not day or not time:
            raise ValueError(f'Unclassified session or missing date/time: {title}')
        category = SESSION_CATEGORIES[session_id]
        content = node.find_one('panel-paper')
        anchor = content.attrs.get('id')
        heading_links = [n.attrs.get('href', '') for n in node.find_one('panel-title').walk() if n.tag == 'a']
        if not anchor or heading_links != ['index.html#' + anchor]:
            raise ValueError('Official session link and anchor disagree')
        url = SOURCE + '#' + anchor
        entries = node.find_all('paper')
        session = {'id': session_id, 'title': title, 'theme': match[2], 'date': day,
                   'time': time, 'location': node.find_one('session-location').text().removeprefix('Location: '),
                   'chair': node.find_one('session-chair').text().removeprefix('Session Chair: '),
                   'category': category, 'track': 'main', 'paper_count': len(entries), 'source_url': url}
        if not entries:
            raise ValueError(f'Empty session: {title}')
        sessions.append(session)
        for entry in entries:
            title_node = entry.find_one('paper-title')
            paper_title, authors = title_node.text(), entry.find_one('paper-authors').text()
            if not paper_title or not authors:
                raise ValueError('Missing title or authors')
            if any(n.tag == 'a' and n.attrs.get('href') for n in title_node.walk()):
                raise ValueError('New paper links require review before importing')
            papers.append({'id': 'asplos26-' + hashlib.sha256(paper_title.encode()).hexdigest()[:12],
                           'title': paper_title, 'authors': authors, 'session_id': session_id,
                           'session': title, 'category': category, 'track': 'main', 'date': day,
                           'time': time, 'source_url': url, 'paper_url': None, 'abstract': None})
    if not papers or len(papers) != len(root.find_all('paper')):
        raise ValueError('Some official paper blocks were not indexed')
    if len({p['id'] for p in papers}) != len(papers) or len({p['title'].casefold() for p in papers}) != len(papers):
        raise ValueError('Duplicate paper titles or hash collision')
    if len({s['id'] for s in sessions}) != len(sessions):
        raise ValueError('Duplicate sessions')
    if set(SESSION_CATEGORIES) != {s['id'] for s in sessions}:
        raise ValueError('Official session set changed; review categories')
    stated = re.search(r'(\d+) unique papers', source_bytes.decode('utf-8'))
    if not stated:
        raise ValueError('Missing official overview count')
    stated = int(stated[1])
    counts = Counter(p['category'] for p in papers)
    return {'metadata': {
        'conference':'ASPLOS 2026', 'edition':31, 'city':'Pittsburgh, USA',
        'dates':'2026-03-22–26（论文场次 03-24–26）',
        'source_name':'ASPLOS 2026 official detailed technical program', 'source_url':SOURCE,
        'source_file':'assets/data/asplos-2026-source.html', 'source_sha256':hashlib.sha256(source_bytes).hexdigest(),
        'fetched_at':fetched_at, 'total_papers':len(papers), 'main_papers':len(papers), 'industry_papers':0,
        'session_count':len(sessions), 'main_session_count':len(sessions), 'industry_session_count':0,
        'source_paper_block_count':len(root.find_all('paper')), 'excluded_empty_slot_count':0,
        'official_overview_paper_count':stated,
        'count_discrepancy':f'官网概览标注 {stated} unique papers；同页详细议程实际包含 {len(papers)} 个标题唯一、作者非空的论文条目。本索引按详细条目计数。',
        'scope_explanation':f'覆盖官方详细议程 {len(papers)} 篇论文、{len(sessions)} 个场次；官网概览写 {stated} 篇，与逐条计数相差 {len(papers)-stated} 篇。',
        'category_method':'Exclusive grouping of official sessions; not per-paper topic classification.',
        'scope':'All detailed technical-program paper blocks; excludes keynotes, WACI, workshops, tutorials, posters as duplicate presentations, and social events.',
        'available_fields':['title','authors_with_affiliations','session','track','date','session_time','location','chair'],
        'limitations':['方向计数来自官方场次互斥归组，不等于该主题全部论文的数量。',
                      '官网议程只列标题、作者与场次；没有摘要、DOI 或论文原文链接，未知字段保留为空。',
                      '官网概览与详细议程数量不一致，本索引保留全部可核对条目。',
                      '标题、作者与单位只规范化空白；正文阅读的来源版本与依据逐篇注明。']},
        'categories':[{**c, 'paper_count':counts[c['id']]} for c in CATEGORIES],
        'sessions':sessions, 'papers':papers, 'excluded_slots':[]}


def atomic_write(path, data):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(data)
        temporary = Path(f.name)
    temporary.replace(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--input-html', type=Path)
    ap.add_argument('--fetched-at')
    args = ap.parse_args()
    if args.input_html:
        raw = args.input_html.read_bytes()
        fetched_at = args.fetched_at
        if not fetched_at and OUTPUT.exists():
            old = json.loads(OUTPUT.read_text())['metadata']
            if old['source_sha256'] == hashlib.sha256(raw).hexdigest():
                fetched_at = old['fetched_at']
        if not fetched_at:
            ap.error('A new offline snapshot needs its real --fetched-at UTC time')
    else:
        with urllib.request.urlopen(SOURCE, timeout=60) as response:
            raw = response.read()
        fetched_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    stamp = dt.datetime.fromisoformat(fetched_at.replace('Z','+00:00'))
    if stamp.tzinfo is None:
        ap.error('--fetched-at must include a timezone')
    data = parse_program(raw, fetched_at)
    atomic_write(OUTPUT, (json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode())
    if not args.input_html:
        atomic_write(RAW_SOURCE, raw)
    print(f"Indexed {len(data['papers'])} papers in {len(data['sessions'])} official sessions")
    print(data['metadata']['count_discrepancy'])


if __name__ == '__main__':
    main()
