#!/usr/bin/env python3
"""Build an auditable model-quantization candidate index from public OpenReview notes."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request

VENUE = 'ICLR.cc/2027/Conference'
API = 'https://api2.openreview.net'
SOURCE = 'https://openreview.net/group?id=ICLR.cc/2027/Conference#tab-active-submissions'
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / 'assets/data/iclr-2027-quantization.json'
CATEGORIES = [
    {'id': 'ptq', 'label': '训练后量化', 'description': '校准、舍入、旋转与重建等训练后量化方法。'},
    {'id': 'qat', 'label': '量化感知训练', 'description': '将量化误差引入训练或微调过程。'},
    {'id': 'training', 'label': '低精度训练', 'description': '低比特数值格式与训练稳定性。'},
    {'id': 'kv-cache', 'label': 'KV Cache', 'description': '注意力缓存与长上下文推理中的量化。'},
    {'id': 'hardware', 'label': '硬件与系统', 'description': '内核、部署和真实运行效率。'},
    {'id': 'reasoning', 'label': '推理能力', 'description': '量化与推理、数学和代码能力的关系。'},
    {'id': 'diffusion', 'label': '扩散模型', 'description': '图像、视频与其他扩散模型的量化。'},
    {'id': 'multimodal', 'label': '多模态', 'description': '视觉语言及其他多模态模型的量化。'},
    {'id': 'theory', 'label': '理论与分析', 'description': '量化误差、界、鲁棒性和机理分析。'},
]
QUANT = re.compile(r'\b(?:quantiz\w*|quantis\w*|[1-8][ -]?bit|1\.58[ -]?bit|b1\.58|w[1-8]a(?:16|32|[1-8])(?:kv(?:16|32|[1-8]))?|low[ -]precision|mixed[ -]precision|low[ -]bit|mxfp[468]|nvfp[468]|binary|binariz\w*|ternary|ptq|qat|fp[468]|int[1-8]|bit[ -]width)\b', re.I)
MODEL = re.compile(r'\b(?:models?|networks?|weights?|activations?|transformers?|llms?|neural|diffusion|training|inference|attention)\b', re.I)
RULES = {
    'ptq': r'post[ -]training|\bptq\b|calibrat|rounding|rotation|reconstruction',
    'qat': r'quantization[ -]aware|quantisation[ -]aware|\bqat\b',
    'training': r'low[ -]precision training|quantized training|quantised training|training with|\bfp[468]\b|gradient|optimizer',
    'kv-cache': r'kv[ -]?cache|key[ -]value|attention cache',
    'hardware': r'hardware|kernel|accelerator|deployment|latency|throughput|gpu|edge device',
    'reasoning': r'reasoning|chain[ -]of[ -]thought|mathematical|math benchmarks|code generation',
    'diffusion': r'diffusion|denoising|flow matching',
    'multimodal': r'multimodal|multi[ -]modal|vision[ -]language|vlm|visual language',
    'theory': r'theoretical|theorem|error bound|convergence|robustness|generalization|generalisation',
}
MANUAL_FIELDS = ('review_status', 'review_basis', 'official_pdf_verified', 'pdf_sha256',
                 'reviewed_pdf_url', 'reviewed_source_updated_at', 'reviewed_at', 'summary', 'contribution',
                 'limitations', 'categories', 'quantization_target', 'bit_width', 'evidence',
                 'results', 'reading_basis', 'interpretation')


def fulltext_reviewed(paper):
    return (paper.get('review_status') == 'reviewed' and paper.get('review_basis') == 'official_pdf'
            and paper.get('official_pdf_verified') is True
            and isinstance(paper.get('summary'), str) and bool(paper['summary'].strip())
            and isinstance(paper.get('pdf_sha256'), str)
            and re.fullmatch(r'[0-9a-f]{64}', paper['pdf_sha256']) is not None
            and paper.get('reviewed_pdf_url') == paper.get('pdf_url')
            and paper.get('reviewed_source_updated_at') == paper.get('updated_at'))


def abstract_reviewed(paper):
    return (paper.get('review_status') == 'abstract' and paper.get('review_basis') == 'official_abstract'
            and isinstance(paper.get('summary'), str) and bool(paper['summary'].strip()))


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def value(content, field, default=None):
    item = content.get(field, default)
    return item.get('value', default) if isinstance(item, dict) else item


def request_json(path, params):
    url = API + path + '?' + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={'User-Agent': 'Galen-ICLR-Quantization-Survey/1.0', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read(4000).decode('utf-8', errors='replace')
        try:
            error_data = json.loads(detail)
            detail = error_data.get('message', detail)
            if error_data.get('name') == 'ChallengeRequiredError':
                detail = 'Challenge verification required'
        except (ValueError, AttributeError):
            pass
        raise RuntimeError(f'OpenReview HTTP {error.code}: {detail}') from error
    if not isinstance(data, dict):
        raise RuntimeError('OpenReview returned a non-object JSON response')
    return data


def resolve_active_venue(fetch=request_json):
    groups = fetch('/groups', {'id': VENUE}).get('groups', [])
    group = next((group for group in groups if group.get('id') == VENUE), None)
    if not group:
        raise RuntimeError('ICLR 2027 Conference group was not returned')
    active = value(group.get('content', {}), 'submission_venue_id')
    if not isinstance(active, str) or not active.startswith(VENUE + '/'):
        raise RuntimeError('Conference group has no valid active-submission venue ID')
    return active


def validate_notes(notes, expected_count, active, require_public=False):
    if not isinstance(expected_count, int) or isinstance(expected_count, bool) or expected_count < 0:
        raise RuntimeError('Response has no valid public submission count')
    if not isinstance(notes, list) or len(notes) != expected_count:
        raise RuntimeError('Submission count differs from downloaded note count')
    seen = set()
    for note in notes:
        if not isinstance(note, dict) or not isinstance(note.get('id'), str) or not note['id'] or note['id'] in seen:
            raise RuntimeError('Missing or duplicate submission ID')
        seen.add(note['id'])
        readers = note.get('readers')
        if require_public and (not isinstance(readers, list) or 'everyone' not in readers):
            raise RuntimeError('Imported export contains a note not explicitly public')
        if not isinstance(note.get('content'), dict):
            raise RuntimeError('Submission has invalid content fields')
        if require_public:
            for field in ('title', 'abstract', 'keywords', 'pdf', 'venueid'):
                item = note['content'].get(field)
                if isinstance(item, dict) and 'readers' in item:
                    field_readers = item['readers']
                    if not isinstance(field_readers, list) or 'everyone' not in field_readers:
                        raise RuntimeError('Imported export contains a nonpublic research field')
        if value(note['content'], 'venueid') != active:
            raise RuntimeError('Export contains a note outside the active-submission venue')
        if not isinstance(value(note.get('content', {}), 'title'), str):
            raise RuntimeError('Submission has no valid title')
        source_id = note.get('forum') or note['id']
        if not isinstance(source_id, str):
            raise RuntimeError('Submission has invalid forum ID')
    return notes


def fetch_notes(active, fetch=request_json, page_size=1000):
    notes, count, offset = [], None, 0
    while True:
        response = fetch('/notes', {'content.venueid': active, 'limit': page_size, 'offset': offset, 'sort': 'number:asc'})
        current_count = response.get('count')
        if not isinstance(current_count, int) or isinstance(current_count, bool) or current_count < 0:
            raise RuntimeError('OpenReview omitted a valid submission count')
        if count is None:
            count = current_count
        elif current_count != count:
            raise RuntimeError('Submission count changed during pagination; rerun sync')
        page = response.get('notes')
        if not isinstance(page, list) or (not page and offset < count):
            raise RuntimeError('OpenReview returned an incomplete submission page')
        notes.extend(page)
        offset += len(page)
        if offset >= count:
            break
    return validate_notes(notes, count, active)


def candidate(note):
    content = note['content']
    title, abstract = value(content, 'title', ''), value(content, 'abstract', '')
    if not isinstance(abstract, str):
        abstract = ''
    keywords = value(content, 'keywords', [])
    if isinstance(keywords, str):
        keywords = [keywords]
    if not isinstance(keywords, list):
        keywords = []
    keywords = [item for item in keywords if isinstance(item, str)]
    combined = ' '.join([title, abstract, *keywords])
    matched = sorted({match.group().lower() for match in QUANT.finditer(combined)})
    if not matched or not MODEL.search(combined):
        return None
    # Binary labels/classification are not low-bit model quantization.
    if set(matched) <= {'binary', 'ternary'} and not re.search(r'\b(?:binary|ternary)\s+(?:neural\s+)?(?:networks?|weights?|activations?|models?)\b', combined, re.I):
        return None
    categories = [key for key, pattern in RULES.items() if re.search(pattern, combined, re.I)]
    note_id = note['id']
    encoded = urllib.parse.quote(note.get('forum') or note_id, safe='')
    pdf = value(content, 'pdf')
    pdf_url = None
    if isinstance(pdf, str):
        parsed = urllib.parse.urlsplit(pdf)
        if parsed.scheme == 'https' and parsed.hostname == 'openreview.net' and not parsed.username and not parsed.password:
            pdf_url = pdf
        elif pdf.startswith('/pdf?') or re.fullmatch(r'/pdf/[0-9a-f]+\.pdf', pdf):
            pdf_url = 'https://openreview.net' + pdf
    updated = note.get('tmdate') or note.get('mdate') or note.get('tcdate') or note.get('cdate')
    updated_at = None
    if isinstance(updated, (int, float)) and not isinstance(updated, bool):
        updated_at = dt.datetime.fromtimestamp(updated / 1000, dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return {'id': note_id, 'number': note.get('number'), 'title': title, 'abstract': abstract,
            'source_kind': 'openreview', 'active_submission_verified': True,
            'keywords': keywords, 'forum_url': 'https://openreview.net/forum?id=' + encoded,
            'pdf_url': pdf_url, 'updated_at': updated_at, 'categories': categories,
            'matched_terms': matched, 'review_status': 'candidate', 'summary': None,
            'contribution': None, 'limitations': None}


def build(notes, active, previous, checked_at, source_method='OpenReview API v2 匿名公开数据',
          fetched_at=None, exclusions=None, provenance=None, source_sha256=None):
    old = {paper['id']: paper for paper in previous.get('papers', []) if isinstance(paper, dict) and 'id' in paper}
    papers, excluded_ids = [], set(exclusions or [])
    automated_count = 0
    for note in notes:
        paper = candidate(note)
        if paper is None:
            continue
        automated_count += 1
        if paper['id'] in excluded_ids:
            continue
        prior = old.get(paper['id'])
        if prior:
            for field in MANUAL_FIELDS:
                if field in prior:
                    paper[field] = prior[field]
            # A changed title, abstract, or source revision invalidates prior full-text review.
            if any(prior.get(field) != paper[field] for field in ('title', 'abstract', 'updated_at', 'pdf_url')):
                paper['review_status'] = 'candidate'
                paper['official_pdf_verified'] = False
        if paper['review_status'] not in ('candidate', 'abstract', 'reviewed'):
            paper['review_status'] = 'candidate'
        if paper['review_status'] == 'reviewed' and not fulltext_reviewed(paper):
            paper['review_status'] = 'candidate'
        if paper['review_status'] == 'abstract' and not abstract_reviewed(paper):
            paper['review_status'] = 'candidate'
        papers.append(paper)
    return {'metadata': {'venue': VENUE, 'active_venue_id': active, 'source_url': SOURCE,
            'api_url': API, 'checked_at': checked_at, 'fetched_at': fetched_at or checked_at, 'status': 'complete',
            'total_active_submissions': len(notes), 'candidate_count': len(papers),
            'automated_candidate_count': automated_count, 'scope_excluded_count': len(excluded_ids),
            'reviewed_count': sum(fulltext_reviewed(p) for p in papers),
            'abstract_reviewed_count': sum(abstract_reviewed(p) for p in papers),
            'source_provenance': provenance, 'source_sha256': source_sha256,
            'official_pdf_receipt': previous.get('metadata', {}).get('official_pdf_receipt'),
            'fulltext_reviewed_at': previous.get('metadata', {}).get('fulltext_reviewed_at'),
            'method': source_method + '；标题、摘要和关键词检索；' + ('按官网摘要排除纯表示、tokenizer、codec 等范围外记录；' if excluded_ids else '') + '分类为初筛标签。',
            'message': '已完整获取本次可公开访问的 active submissions；候选需逐篇核验。',
            'scope': 'quantization'}, 'categories': CATEGORIES, 'papers': papers,
            'observations': [item for item in previous.get('observations', [])
                             if isinstance(item, dict) and isinstance(item.get('paper_ids'), list)
                             and all(identifier in {p['id'] for p in papers} for identifier in item['paper_ids'])]}


def unavailable(previous, checked_at, message, active=None):
    prior = previous.get('metadata', {})
    papers = previous.get('papers', [])
    return {'metadata': {'venue': VENUE, 'active_venue_id': active or prior.get('active_venue_id'),
            'source_url': SOURCE, 'api_url': API, 'checked_at': checked_at,
            'fetched_at': prior.get('fetched_at'), 'status': 'unavailable',
            'total_active_submissions': None, 'candidate_count': None,
            'reviewed_count': sum(fulltext_reviewed(p) for p in papers),
            'abstract_reviewed_count': sum(abstract_reviewed(p) for p in papers),
            'previous_total_active_submissions': prior.get('total_active_submissions') if prior.get('total_active_submissions') is not None else prior.get('previous_total_active_submissions'),
            'previous_candidate_count': len(papers) if prior.get('fetched_at') else None,
            'method': 'OpenReview API v2 匿名公开访问；当前未取得完整投稿列表。',
            'message': message, 'scope': 'quantization'},
            'categories': previous.get('categories') or CATEGORIES, 'papers': papers,
            'observations': previous.get('observations', [])}


def validate_scope(scope, notes, source_sha256):
    metadata = scope.get('metadata', {})
    if metadata.get('source_sha256') != source_sha256 or metadata.get('source_url') != SOURCE:
        raise RuntimeError('Scope exclusions do not match this official source snapshot')
    initial_ids = {n['id'] for n in notes if candidate(n) is not None}
    excluded = scope.get('exclusions')
    if not isinstance(excluded, list):
        raise RuntimeError('Scope exclusions must be an auditable list')
    seen = set()
    for item in excluded:
        if not isinstance(item, dict) or item.get('id') not in initial_ids or item['id'] in seen or not isinstance(item.get('reason'), str) or not item['reason'].strip():
            raise RuntimeError('Invalid, duplicate or unrelated scope exclusion')
        seen.add(item['id'])
    if metadata.get('raw_candidate_count') != len(initial_ids) or metadata.get('excluded_count') != len(seen) or metadata.get('retained_candidate_count') != len(initial_ids) - len(seen):
        raise RuntimeError('Scope exclusion counts do not match the source')
    return seen


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as handle:
        name = handle.name
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    try:
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--input-json', type=Path, help='Import a full public export with notes, count and active_venue_id; every note is validated')
    parser.add_argument('--scope-exclusions', type=Path, help='Optional exclusion manifest tied to the exact official export SHA256')
    args = parser.parse_args()
    previous = json.loads(args.output.read_text(encoding='utf-8')) if args.output.exists() else {}
    checked_at, active = now(), None
    fetched_at, provenance, source_sha256, exclusions = None, None, None, None
    try:
        if args.input_json:
            exported = json.loads(args.input_json.read_text(encoding='utf-8'))
            active = exported.get('active_venue_id')
            if active != VENUE + '/Submission':
                raise RuntimeError('Export must identify the ICLR 2027 active-submission venue')
            notes = validate_notes(exported.get('notes'), exported.get('count'), active, require_public=True)
            fetched_at = exported.get('fetched_at')
            if not isinstance(fetched_at, str) or dt.datetime.fromisoformat(fetched_at.replace('Z', '+00:00')).utcoffset() is None:
                raise RuntimeError('Official export requires a timezone-aware source timestamp')
            provenance = exported.get('provenance')
            source_sha256 = hashlib.sha256(args.input_json.read_bytes()).hexdigest()
            if args.scope_exclusions:
                exclusions = validate_scope(json.loads(args.scope_exclusions.read_text(encoding='utf-8')), notes, source_sha256)
            method = '经验证的完整公开投稿 JSON 导出'
        else:
            active = resolve_active_venue()
            notes = fetch_notes(active)
            method = 'OpenReview API v2 匿名公开数据'
            if args.scope_exclusions:
                raise RuntimeError('Snapshot-specific scope exclusions require --input-json')
        result = build(notes, active, previous, checked_at, method, fetched_at, exclusions, provenance, source_sha256)
    except (RuntimeError, urllib.error.URLError, TimeoutError, ValueError, OSError) as error:
        result = unavailable(previous, checked_at, str(error), active)
        atomic_write(args.output, result)
        print('UNAVAILABLE:', error)
        return 1
    atomic_write(args.output, result)
    print(f"OK: {len(notes)} public active submissions; {len(result['papers'])} quantization candidates")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
