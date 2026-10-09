#!/usr/bin/env python3
"""Check real snapshot accounting, mention semantics, and fail-closed inputs."""
import copy
import hashlib
import json
from pathlib import Path
import re
import unittest

from build_iclr2027_landscape import (CATEGORIES, DEFAULT_INPUT, SOURCE, TERM_RULES,
                                    VENUE, build_landscape, statistical_saturation)


def fixture():
    return {
        'metadata': {'venue': VENUE, 'source_url': SOURCE,
                     'active_venue_id': VENUE + '/Submission', 'status': 'complete',
                     'fetched_at': '2026-10-09T05:19:57.757Z', 'source_sha256': 'a' * 64,
                     'candidate_count': 3, 'total_active_submissions': 5},
        'categories': copy.deepcopy(CATEGORIES),
        'papers': [
            {'id': 'one', 'title': 'PTQ in W4A16', 'abstract': 'PTQ, PTQ, PTQ.',
             'keywords': ['FP4', 'KV cache'], 'categories': ['ptq', 'hardware'],
             'source_kind': 'openreview', 'active_submission_verified': True},
            {'id': 'two', 'title': 'QAT', 'abstract': 'No post-training quantization is needed.',
             'keywords': [], 'categories': ['qat'],
             'source_kind': 'openreview', 'active_submission_verified': True},
            {'id': 'three', 'title': 'An unrelated title', 'abstract': '',
             'keywords': [], 'categories': [],
             'source_kind': 'openreview', 'active_submission_verified': True},
        ],
    }


class SnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.input_bytes = DEFAULT_INPUT.read_bytes()
        cls.input = json.loads(cls.input_bytes)
        cls.result = build_landscape(cls.input, hashlib.sha256(cls.input_bytes).hexdigest())

    def test_real_snapshot_accounting(self):
        self.assertEqual(self.result['metadata']['candidate_count'], 994)
        self.assertEqual(len({paper['id'] for paper in self.input['papers']}), 994)
        counts = {direction['id']: direction['count'] for direction in self.result['directions']}
        self.assertEqual(counts, {'ptq': 569, 'hardware': 465, 'training': 239,
                                 'theory': 154, 'kv-cache': 143, 'diffusion': 110,
                                 'reasoning': 106, 'multimodal': 96, 'qat': 86})
        for direction in self.result['directions']:
            expected = [paper['id'] for paper in self.input['papers']
                        if direction['id'] in paper['categories']]
            self.assertEqual(direction['paper_ids'], expected)
            self.assertEqual(len(set(direction['paper_ids'])), direction['count'])

    def test_nonexclusive_labels_and_unclassified(self):
        metadata = self.result['metadata']
        self.assertEqual(metadata['tag_assignments'], 1968)
        self.assertEqual(metadata['classified_count'], 922)
        self.assertEqual(metadata['unclassified_count'], 72)
        self.assertEqual(metadata['multi_label_count'], 643)
        self.assertEqual(sum(item['paper_count'] for item in self.result['label_count_distribution']), 994)
        self.assertEqual(sum(item['label_count'] * item['paper_count']
                             for item in self.result['label_count_distribution']), 1968)
        self.assertEqual(len(self.result['unclassified_paper_ids']), 72)

    def test_snapshot_hash_and_existing_reading_counts(self):
        metadata = self.result['metadata']
        self.assertEqual(metadata['source_sha256'], self.input['metadata']['source_sha256'])
        self.assertEqual(metadata['fetched_at'], self.input['metadata']['fetched_at'])
        self.assertEqual(metadata['index_sha256'], hashlib.sha256(self.input_bytes).hexdigest())
        self.assertEqual(metadata['reviewed_count'], 6)
        self.assertEqual(metadata['abstract_reviewed_count'], 12)

    def test_terms_and_overlap_are_reproducible(self):
        for term in self.result['term_signals']:
            pattern = re.compile(term['pattern'], re.I)
            expected = [paper['id'] for paper in self.input['papers']
                        if pattern.search(' '.join([paper['title'], paper['abstract'], *paper['keywords']]))]
            self.assertEqual(term['paper_ids'], expected)
            self.assertEqual(term['count'], len(expected))
        overlaps = {tuple(item['direction_ids']): item['count'] for item in self.result['category_overlap']}
        self.assertEqual(overlaps[('ptq', 'hardware')], 274)
        self.assertEqual(overlaps[('kv-cache', 'hardware')], 76)
        self.assertEqual(overlaps[('ptq', 'reasoning')], 64)

    def test_does_not_mutate_main_index(self):
        original = copy.deepcopy(self.input)
        build_landscape(self.input, 'f' * 64)
        self.assertEqual(self.input, original)
        self.assertEqual(DEFAULT_INPUT.read_bytes(), self.input_bytes)


class SemanticsTests(unittest.TestCase):
    def test_candidates_count_once_and_negation_still_is_a_mention(self):
        result = build_landscape(fixture(), 'b' * 64)
        signals = {item['id']: item for item in result['term_signals']}
        self.assertEqual(signals['explicit-ptq']['count'], 2)
        self.assertEqual(signals['explicit-ptq']['paper_ids'], ['one', 'two'])
        self.assertEqual(signals['format-fp4']['count'], 1)
        self.assertEqual(signals['kv-cache']['count'], 1)
        self.assertEqual(result['metadata']['tag_assignments'], 3)
        self.assertEqual(result['metadata']['multi_label_count'], 1)
        self.assertEqual(result['metadata']['unclassified_count'], 1)

    def test_word_boundaries_prevent_substring_inflation(self):
        rules = {identifier: re.compile(pattern, re.I) for identifier, _, pattern in TERM_RULES}
        examples = {
            'explicit-ptq': ('PTQ post-training quantisation', 'APTQA post-trainingquantization'),
            'explicit-qat': ('QAT quantization-aware training', 'AQATB quantization-aware-trainingish'),
            'low-bit': ('1.58-bit W2A4KV2 INT3 NVFP4', '14-bit W40A16 INT32 FP16'),
            'format-fp4': ('NVFP4 MXFP4 FP4', 'NVFP40 MXFP40 FP40'),
            'format-fp8': ('MXFP8 FP8', 'FP80 MXFP80'),
            'kv-cache': ('KV-cache key-value cache', 'AKV-cacheX'),
            'moe': ('MoE mixture-of-experts', 'moebius Mixture-of-expertise'),
            'calibration': ('calibration calibrated calibrating', 'recalibration calibrator'),
            'rotation': ('rotation Hadamard orthogonal transformation', 'rotational Hadamardian'),
            'kernels': ('GEMM CUDA Tensor Cores kernels', 'gemmish cudatext kernelized'),
            'chain-of-thought': ('CoT reasoning traces', 'cotangent reasoning tracer'),
        }
        for identifier, (positive, negative) in examples.items():
            with self.subTest(identifier=identifier):
                self.assertIsNotNone(rules[identifier].search(positive))
                self.assertIsNone(rules[identifier].search(negative))

    def test_saturation_thresholds_are_heuristic_count_tiers(self):
        self.assertEqual(statistical_saturation(200)['level'], 'high')
        self.assertEqual(statistical_saturation(199)['level'], 'medium')
        self.assertEqual(statistical_saturation(100)['level'], 'medium')
        self.assertEqual(statistical_saturation(99)['level'], 'relatively-low')
        self.assertEqual(statistical_saturation(0)['level'], 'relatively-low')

    def test_manual_membership_changes_are_preserved_and_audited(self):
        data = fixture()
        data['papers'][0]['categories'] = ['theory']
        result = build_landscape(data, 'b' * 64)
        directions = {item['id']: item for item in result['directions']}
        self.assertEqual(directions['theory']['paper_ids'], ['one'])
        self.assertEqual(directions['ptq']['count'], 0)
        audit = result['classification_audit']['membership_differences']
        self.assertTrue(any(item['id'] == 'one' and item['added'] == ['theory'] for item in audit))

    def test_empty_valid_snapshot_has_no_division_by_zero(self):
        data = fixture()
        data['metadata']['candidate_count'] = 0
        data['papers'] = []
        result = build_landscape(data, 'b' * 64)
        self.assertEqual(result['metadata']['candidate_count'], 0)
        self.assertTrue(all(item['share_percent'] == 0 for item in result['directions']))


class InvalidInputTests(unittest.TestCase):
    def test_bad_metadata_is_rejected(self):
        mutations = [
            ('status', 'unavailable'), ('source_url', 'https://example.com'),
            ('source_sha256', None), ('source_sha256', 'bad'),
            ('fetched_at', None), ('fetched_at', 'not-a-date'),
            ('fetched_at', '2026-10-09T05:19:57'),
            ('candidate_count', True), ('candidate_count', 4),
            ('candidate_count', -1), ('total_active_submissions', 1),
            ('total_active_submissions', False), ('active_venue_id', VENUE + '/Withdrawn_Submission'),
        ]
        for field, value in mutations:
            with self.subTest(field=field, value=value):
                data = fixture()
                data['metadata'][field] = value
                with self.assertRaises(ValueError):
                    build_landscape(data, 'b' * 64)

    def test_invalid_records_and_taxonomy_are_rejected(self):
        mutations = [
            lambda d: d['papers'].append(copy.deepcopy(d['papers'][0])),
            lambda d: d['papers'][1].update(id='one'),
            lambda d: d['papers'][0].update(source_kind='arxiv'),
            lambda d: d['papers'][0].update(active_submission_verified=1),
            lambda d: d['papers'][0].update(categories=['ptq', 'ptq']),
            lambda d: d['papers'][0].update(categories=['unknown']),
            lambda d: d['papers'][0].update(categories=[True]),
            lambda d: d['papers'][0].update(keywords=[{}]),
            lambda d: d['papers'][0].update(abstract=None),
            lambda d: d['papers'][0].update(title=''),
            lambda d: d['categories'].pop(),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                data = fixture()
                mutation(data)
                with self.assertRaises(ValueError):
                    build_landscape(data, 'b' * 64)

    def test_missing_exact_index_hash_is_rejected(self):
        with self.assertRaises(ValueError):
            build_landscape(fixture(), '')


if __name__ == '__main__':
    unittest.main()
