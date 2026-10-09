import json
import tempfile
import unittest
from pathlib import Path
import sync_iclr2027 as sync

ACTIVE = sync.VENUE + '/Submission'


def note(identifier='paper1', title='Post-Training Quantization of Language Models', abstract='We quantize model weights using calibration.', **fields):
    return {'id': identifier, 'forum': identifier, 'number': 1, 'content': {
        'venueid': {'value': ACTIVE}, 'title': {'value': title}, 'abstract': {'value': abstract}, **fields}}


class SurveySyncTests(unittest.TestCase):
    def test_resolves_group_submission_venue_instead_of_conference_id(self):
        active = sync.resolve_active_venue(lambda path, params: {'groups': [{'id': sync.VENUE, 'content': {'submission_venue_id': {'value': ACTIVE}}}]})
        self.assertEqual(active, ACTIVE)

    def test_pagination_is_complete_and_uses_active_venue(self):
        calls = []
        def fetch(path, params):
            calls.append(params)
            return {'count': 3, 'notes': [note('a'), note('b')][params['offset']:] if params['offset'] == 0 else [note('c')]}
        self.assertEqual(len(sync.fetch_notes(ACTIVE, fetch, page_size=2)), 3)
        self.assertEqual([call['offset'] for call in calls], [0, 2])
        self.assertTrue(all(call['content.venueid'] == ACTIVE for call in calls))

    def test_zero_is_valid_only_with_explicit_count(self):
        self.assertEqual(sync.fetch_notes(ACTIVE, lambda *_: {'count': 0, 'notes': []}), [])
        with self.assertRaises(RuntimeError):
            sync.fetch_notes(ACTIVE, lambda *_: {'notes': []})

    def test_count_changing_between_pages_fails(self):
        def fetch(path, params):
            return {'count': 2 if params['offset'] == 0 else 3, 'notes': [note(str(params['offset']))]}
        with self.assertRaisesRegex(RuntimeError, 'changed'):
            sync.fetch_notes(ACTIVE, fetch, page_size=1)

    def test_duplicate_ids_and_wrong_venue_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'duplicate'):
            sync.validate_notes([note(), note()], 2, ACTIVE)
        rejected = note()
        rejected['content']['venueid']['value'] = sync.VENUE + '/Withdrawn_Submission'
        with self.assertRaisesRegex(RuntimeError, 'outside'):
            sync.validate_notes([rejected], 1, ACTIVE)

    def test_imported_notes_must_be_explicitly_public(self):
        with self.assertRaisesRegex(RuntimeError, 'not explicitly public'):
            sync.validate_notes([note()], 1, ACTIVE, require_public=True)
        for invalid_readers in (None, 'everyone', ['private-group']):
            with self.subTest(readers=invalid_readers):
                private = dict(note(), readers=invalid_readers)
                with self.assertRaisesRegex(RuntimeError, 'not explicitly public'):
                    sync.validate_notes([private], 1, ACTIVE, require_public=True)
        public = note()
        public['readers'] = ['everyone']
        self.assertEqual(sync.validate_notes([public], 1, ACTIVE, require_public=True), [public])

    def test_truncated_export_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, 'count differs'):
            sync.validate_notes([note()], 2, ACTIVE)

    def test_matching_includes_low_bit_model_and_excludes_unrelated_quantum(self):
        self.assertIsNotNone(sync.candidate(note(title='4-bit Inference for Transformers', abstract='Efficient weights.')))
        self.assertIsNone(sync.candidate(note(title='Quantum Neural Networks', abstract='Quantum neural models for classification.')))
        self.assertIsNone(sync.candidate(note(title='Scalar Quantization of Gaussian Sources', abstract='Optimal information-theoretic quantization of source signals.')))

    def test_binary_classification_is_not_binary_weight_quantization(self):
        self.assertIsNone(sync.candidate(note(title='Binary Classification with Neural Networks', abstract='Our model predicts binary labels.')))
        self.assertIsNotNone(sync.candidate(note(title='Binary Neural Networks', abstract='We compress neural network weights.')))
        self.assertIsNotNone(sync.candidate(note(title='NVFP4 Model Training', abstract='Low-bit model weights improve training.')))

    def test_multilabel_categories(self):
        paper = sync.candidate(note(abstract='Post-training quantization of diffusion model weights improves GPU latency.'))
        self.assertEqual(set(paper['categories']), {'ptq', 'diffusion', 'hardware'})

    def test_summary_preserved_but_revised_abstract_requires_review(self):
        paper = sync.candidate(note())
        paper.update(review_status='reviewed', summary='Verified summary.', contribution='Verified contribution.', limitations='Measured limits.')
        previous = {'papers': [paper]}
        refreshed = sync.build([note()], ACTIVE, previous, '2026-10-09T00:00:00Z')
        self.assertEqual(refreshed['metadata']['reviewed_count'], 1)
        revised = sync.build([note(abstract='New quantization of model weights.')], ACTIVE, previous, '2026-10-10T00:00:00Z')
        self.assertEqual(revised['papers'][0]['summary'], 'Verified summary.')
        self.assertEqual(revised['papers'][0]['review_status'], 'candidate')

    def test_pdf_revision_timestamp_invalidates_review_without_losing_notes(self):
        original = note()
        original['tmdate'] = 1791500000000
        paper = dict(sync.candidate(original), review_status='reviewed', summary='Verified original PDF.')
        updated = note()
        updated['tmdate'] = 1791500001000
        result = sync.build([updated], ACTIVE, {'papers': [paper]}, '2026-10-09T00:00:00Z')
        self.assertEqual(result['papers'][0]['review_status'], 'candidate')
        self.assertEqual(result['papers'][0]['summary'], 'Verified original PDF.')
        self.assertEqual(result['metadata']['reviewed_count'], 0)

    def test_failed_refresh_retains_last_good_papers_and_marks_counts_unknown(self):
        previous = sync.build([note()], ACTIVE, {}, '2026-10-08T00:00:00Z')
        previous['papers'][0]['summary'] = 'Reader notes'
        failed = sync.unavailable(previous, '2026-10-09T00:00:00Z', 'HTTP 403', ACTIVE)
        self.assertIsNone(failed['metadata']['total_active_submissions'])
        self.assertIsNone(failed['metadata']['candidate_count'])
        self.assertEqual(failed['metadata']['fetched_at'], '2026-10-08T00:00:00Z')
        self.assertEqual(failed['papers'], previous['papers'])
        self.assertEqual(failed['metadata']['previous_candidate_count'], 1)

    def test_failure_after_verified_zero_retains_previous_zero(self):
        previous = sync.build([], ACTIVE, {}, '2026-10-08T00:00:00Z')
        failed = sync.unavailable(previous, '2026-10-09T00:00:00Z', 'HTTP 403')
        self.assertEqual(failed['metadata']['previous_total_active_submissions'], 0)
        self.assertEqual(failed['metadata']['previous_candidate_count'], 0)
        self.assertIsNone(failed['metadata']['total_active_submissions'])

    def test_unreviewed_summary_does_not_count_as_reviewed(self):
        previous = {'papers': [dict(sync.candidate(note()), review_status='reviewed')]}
        result = sync.build([note()], ACTIVE, previous, '2026-10-09T00:00:00Z')
        self.assertEqual(result['metadata']['reviewed_count'], 0)

    def test_whitespace_summary_does_not_count_as_reviewed(self):
        previous = {'papers': [dict(sync.candidate(note()), review_status='reviewed', summary='   ')]}
        result = sync.build([note()], ACTIVE, previous, '2026-10-09T00:00:00Z')
        self.assertEqual(result['metadata']['reviewed_count'], 0)
        self.assertEqual(result['papers'][0]['review_status'], 'candidate')

    def test_foreign_pdf_url_is_not_preserved(self):
        self.assertIsNone(sync.candidate(note(pdf={'value': 'https://example.org/paper.pdf'}))['pdf_url'])
        self.assertIsNone(sync.candidate(note(pdf={'value': 'https://openreview.net.evil.invalid/paper.pdf'}))['pdf_url'])
        self.assertEqual(sync.candidate(note(pdf={'value': '/pdf?id=paper1'}))['pdf_url'], 'https://openreview.net/pdf?id=paper1')

    def test_atomic_json_output(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'data.json'
            sync.atomic_write(target, {'message': '量化'})
            self.assertEqual(json.loads(target.read_text()), {'message': '量化'})
            self.assertEqual([p.name for p in target.parent.iterdir()], ['data.json'])


if __name__ == '__main__':
    unittest.main()
