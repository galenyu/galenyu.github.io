#!/usr/bin/env python3
"""Reproduce candidate-level landscape statistics from the official survey index.

This script neither reads editorial conclusions nor alters the candidate index.
Direction tags are nonexclusive and may include existing manual corrections.
Term counts describe mentions in official titles, abstracts, and keywords only.
"""
import argparse
from collections import Counter
import datetime as dt
import hashlib
import itertools
import json
from pathlib import Path
import re

from sync_iclr2027 import (CATEGORIES, RULES, SOURCE, VENUE,
                          abstract_reviewed, fulltext_reviewed)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / 'assets/data/iclr-2027-quantization.json'
DEFAULT_OUTPUT = ROOT / 'assets/data/iclr-2027-landscape.json'
SCHEMA_VERSION = 1
TEXT_FIELDS = ['title', 'abstract', 'keywords']
TERM_RULES = [
    ('explicit-ptq', '明确提及 PTQ / 训练后量化',
     r'\b(?:post[ -]training quanti[sz]ation|PTQ)\b'),
    ('explicit-qat', '明确提及 QAT / 量化感知训练',
     r'\b(?:quanti[sz]ation[ -]aware training|QAT)\b'),
    ('low-bit', '提及 1–4 bit、W1–W4、FP4 或 INT1–INT4',
     r'\b(?:1\.58[ -]?bit|[1-4][ -]?bits?|W[1-4](?:A(?:16|32|[1-8]))?(?:KV(?:16|32|[1-8]))?|NVFP4|MXFP4|FP4|INT[1-4])\b'),
    ('format-fp4', '提及 FP4 / MXFP4 / NVFP4',
     r'\b(?:NVFP4|MXFP4|FP4)\b'),
    ('format-fp8', '提及 FP8 / MXFP8',
     r'\b(?:MXFP8|FP8)\b'),
    ('kv-cache', '明确提及 KV / Key-Value / Attention Cache',
     r'\b(?:KV[ -]?cache|key[ -]value[ -]cache|attention[ -]cache)\b'),
    ('moe', '提及 MoE / Mixture-of-Experts',
     r'\b(?:MoE|mixture[ -]of[ -]experts?)\b'),
    ('calibration', '提及校准词项',
     r'\bcalibrat(?:ion|ions|e|es|ed|ing)\b'),
    ('rotation', '提及旋转、正交变换或 Hadamard',
     r'\b(?:rotat(?:ion|ions|e|es|ed|ing)|orthogonal[ -]transform(?:ation)?s?|Hadamard)\b'),
    ('mixed-precision', '提及混合 / 自适应精度或比特分配',
     r'\b(?:mixed[ -]precision|mixed[ -]bit|adaptive[ -]precision|bit[ -]allocation)\b'),
    ('latency-throughput', '提及延迟、吞吐或 tokens per second',
     r'\b(?:latency|throughput|tokens?[ -]per[ -]second)\b'),
    ('kernels', '提及 kernel / GEMM / CUDA / Tensor Core',
     r'\b(?:kernels?|GEMM|CUDA|Tensor[ -]Cores?)\b'),
    ('chain-of-thought', '提及 CoT、思考轨迹或推理模型',
     r'\b(?:chain[ -]of[ -]thought|CoT|thinking[ -]traces?|reasoning[ -]traces?|reasoning[ -]models?|end[ -]of[ -]thinking)\b'),
    ('visual-language', '提及多模态 / 视觉语言模型',
     r'\b(?:vision[ -]language|visual[ -]language|VLMs?|multimodal|multi[ -]modal)\b'),
    ('joint-weight-activation', '提及权重与激活或 WnAm 格式',
     r'\b(?:weights?[ -]and[ -]activations?|weight[ -]activation|W[1-8]A(?:16|32|[1-8]))\b'),
]


def positive_integer(value, field, allow_zero=True):
    if (not isinstance(value, int) or isinstance(value, bool)
            or value < (0 if allow_zero else 1)):
        raise ValueError(f'{field} must be a valid nonnegative integer')


def validate_index(data):
    if not isinstance(data, dict):
        raise ValueError('Index must be a JSON object')
    metadata = data.get('metadata')
    if not isinstance(metadata, dict) or metadata.get('status') != 'complete':
        raise ValueError('Only a complete official snapshot can support landscape statistics')
    if metadata.get('source_url') != SOURCE or metadata.get('venue') != VENUE:
        raise ValueError('Index must identify the official ICLR 2027 source')
    if metadata.get('active_venue_id') != VENUE + '/Submission':
        raise ValueError('Index has an unexpected active-submission venue')
    source_hash = metadata.get('source_sha256')
    if not isinstance(source_hash, str) or not re.fullmatch(r'[0-9a-f]{64}', source_hash):
        raise ValueError('Index must retain the official-export SHA-256')
    fetched = metadata.get('fetched_at')
    try:
        parsed = dt.datetime.fromisoformat(fetched.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('Snapshot time must include a timezone')
    except (ValueError, AttributeError, TypeError) as error:
        raise ValueError('Index has an invalid official snapshot time') from error
    positive_integer(metadata.get('candidate_count'), 'candidate_count')
    positive_integer(metadata.get('total_active_submissions'), 'total_active_submissions')
    papers = data.get('papers')
    if not isinstance(papers, list) or len(papers) != metadata['candidate_count']:
        raise ValueError('Candidate count does not match the index')
    if len(papers) > metadata['total_active_submissions']:
        raise ValueError('Candidate count exceeds the official active-submission total')
    categories = data.get('categories')
    if not isinstance(categories, list) or categories != CATEGORIES:
        raise ValueError('Direction taxonomy differs from the nine maintained categories')
    known_categories = set(RULES)
    seen = set()
    for paper in papers:
        if not isinstance(paper, dict):
            raise ValueError('Invalid candidate record')
        identifier = paper.get('id')
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ValueError('Missing or duplicate candidate ID')
        seen.add(identifier)
        if paper.get('source_kind') != 'openreview' or paper.get('active_submission_verified') is not True:
            raise ValueError('Candidate is not tied to the official active-submission snapshot')
        if not isinstance(paper.get('title'), str) or not paper['title'].strip():
            raise ValueError('Candidate is missing its official title')
        if not isinstance(paper.get('abstract'), str):
            raise ValueError('Candidate abstract is invalid')
        keywords = paper.get('keywords')
        if not isinstance(keywords, list) or not all(isinstance(word, str) for word in keywords):
            raise ValueError('Candidate keywords are invalid')
        labels = paper.get('categories')
        if (not isinstance(labels, list) or not all(isinstance(label, str) for label in labels)
                or len(set(labels)) != len(labels) or not set(labels) <= known_categories):
            raise ValueError('Candidate direction labels are invalid')
    return metadata, papers


def official_text(paper):
    return ' '.join([paper['title'], paper['abstract'], *paper['keywords']])


def percentage(count, denominator):
    return round(count * 100 / denominator, 2) if denominator else 0.0


def statistical_saturation(count):
    if count >= 200:
        return {'level': 'high', 'label': '高（候选密度）'}
    if count >= 100:
        return {'level': 'medium', 'label': '中（候选密度）'}
    return {'level': 'relatively-low', 'label': '相对低（候选密度）'}


def build_landscape(data, index_sha256):
    metadata, papers = validate_index(data)
    if not isinstance(index_sha256, str) or not re.fullmatch(r'[0-9a-f]{64}', index_sha256):
        raise ValueError('Exact input-index SHA-256 is required')
    denominator = len(papers)
    memberships = {category['id']: [paper['id'] for paper in papers
                                    if category['id'] in paper['categories']]
                   for category in CATEGORIES}
    directions = []
    for category in CATEGORIES:
        identifiers = memberships[category['id']]
        directions.append({**category, 'count': len(identifiers),
                           'share_percent': percentage(len(identifiers), denominator),
                           'paper_ids': identifiers,
                           'rule': RULES[category['id']],
                           'statistical_saturation': statistical_saturation(len(identifiers))})
    directions.sort(key=lambda direction: -direction['count'])
    labels_per_paper = Counter(len(paper['categories']) for paper in papers)
    changes = []
    for paper in papers:
        automatic = [key for key, pattern in RULES.items()
                     if re.search(pattern, official_text(paper), re.I)]
        if set(automatic) != set(paper['categories']):
            changes.append({'id': paper['id'], 'stored_categories': paper['categories'],
                            'automatic_categories': automatic,
                            'added': [key for key in paper['categories'] if key not in automatic],
                            'removed': [key for key in automatic if key not in paper['categories']]})
    signals = []
    for identifier, label, pattern in TERM_RULES:
        compiled = re.compile(pattern, re.I)
        identifiers = [paper['id'] for paper in papers if compiled.search(official_text(paper))]
        signals.append({'id': identifier, 'label': label, 'pattern': pattern,
                        'flags': ['IGNORECASE'], 'count': len(identifiers),
                        'share_percent': percentage(len(identifiers), denominator),
                        'paper_ids': identifiers,
                        'basis': 'official_title_abstract_keywords',
                        'interpretation': '每条候选至多计一次；词项提及，不表示本文采用该方法、实现该性能或认可该观点。'})
    overlaps = []
    for first, second in itertools.combinations(CATEGORIES, 2):
        identifiers = [paper['id'] for paper in papers
                       if first['id'] in paper['categories'] and second['id'] in paper['categories']]
        overlaps.append({'direction_ids': [first['id'], second['id']],
                         'count': len(identifiers),
                         'share_percent': percentage(len(identifiers), denominator),
                         'paper_ids': identifiers})
    unclassified = [paper['id'] for paper in papers if not paper['categories']]
    return {
        'metadata': {
            'schema_version': SCHEMA_VERSION,
            'source_url': metadata['source_url'], 'venue': metadata['venue'],
            'active_venue_id': metadata['active_venue_id'],
            'fetched_at': metadata['fetched_at'], 'source_sha256': metadata['source_sha256'],
            'index_sha256': index_sha256, 'candidate_count': denominator,
            'total_active_submissions': metadata['total_active_submissions'],
            'tag_assignments': sum(len(paper['categories']) for paper in papers),
            'classified_count': denominator - len(unclassified),
            'unclassified_count': len(unclassified),
            'multi_label_count': sum(count for size, count in labels_per_paper.items() if size > 1),
            'reviewed_count': sum(fulltext_reviewed(paper) for paper in papers),
            'abstract_reviewed_count': sum(abstract_reviewed(paper) for paper in papers),
            'text_fields': TEXT_FIELDS,
            'classification_method': '使用当前候选索引的非互斥方向标签；标签来自标题、摘要、关键词初筛及少量人工校正。',
            'method': '全部数量按唯一官方投稿 ID 统计；方向按已有标签计数，术语另按公开标题、摘要和关键词中的明确正则提及计数。',
            'statistical_saturation': {
                'metric': 'direction_candidate_count',
                'thresholds': {'high_min': 200, 'medium_min': 100},
                'scope': 'current_retained_candidate_snapshot',
                'note': '高≥200、中100–199、相对低<100为展示用启发式候选密度分档；不能判断创新饱和、投稿质量、竞争难度或录用概率。',
            },
            'limitations': [
                '994为本次快照保留的模型量化候选；仍可能误收、漏收，未逐篇确认相关性，也不等于994篇已读论文。',
                '方向标签不互斥，方法、场景和系统维度会重叠；各方向论文数不可相加得到994，不能作为互斥方向市场份额。',
                '初筛规则较宽：例如PTQ规则还匹配calibration、rotation、reconstruction；低精度训练规则还匹配FP4/FP8、gradient、optimizer。标签数量不等于已验证方法数量。',
                '词频仅表明官方标题、摘要或关键词出现过对应词项，可能来自背景、基线或否定句；不证明该稿采用该方法或构成学界共识。',
                '战线饱和度仅为当前候选密度的展示代理；分档阈值人为设定，方向标签宽度不同，不能推出研究价值、创新饱和或录用机会。',
                '本数据仅反映所绑定时间的公开活跃投稿；没有历史年份的同口径对照，不能证明任何方向正在增长或下降。',
            ],
        },
        'directions': directions,
        'term_signals': signals,
        'category_overlap': overlaps,
        'label_count_distribution': [{'label_count': size, 'paper_count': count}
                                     for size, count in sorted(labels_per_paper.items())],
        'unclassified_paper_ids': unclassified,
        'classification_audit': {
            'membership_difference_count': len(changes),
            'membership_differences': changes,
            'interpretation': '记录当前标签集合相对自动规则的差异；排序差异不计数，人工标签沿用主索引，不在本脚本重分类。',
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()
    input_bytes = arguments.input.read_bytes()
    if arguments.input.resolve() == arguments.output.resolve():
        parser.error('Statistics output must differ from the candidate index')
    try:
        data = json.loads(input_bytes)
        result = build_landscape(data, hashlib.sha256(input_bytes).hexdigest())
    except (ValueError, UnicodeDecodeError) as error:
        parser.error(str(error))
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Built statistics for {result['metadata']['candidate_count']} official candidates: {arguments.output}")


if __name__ == '__main__':
    main()
