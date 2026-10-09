import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sync_iclr2027 as sync

ACTIVE = sync.VENUE + '/Submission'


def note(identifier='paper1', title='Post-Training Quantization of Language Models', abstract='We quantize model weights using calibration.', **fields):
    return {'id': identifier, 'forum': identifier, 'number': 1, 'tmdate': 1791500000000, 'content': {
        'venueid': {'value': ACTIVE}, 'title': {'value': title}, 'abstract': {'value': abstract},
        'pdf': {'value': '/pdf?id=' + identifier}, **fields}}


def reviewed_paper(source_note=None, **overrides):
    paper = sync.candidate(source_note or note())
    paper.update(review_status='reviewed', review_basis='official_pdf', official_pdf_verified=True,
                 pdf_sha256='a' * 64, reviewed_pdf_url=paper['pdf_url'],
                 reviewed_source_updated_at=paper['updated_at'], summary='Verified summary.',
                 contribution='Verified contribution.', limitations='Measured limits.')
    paper.update(overrides)
    return paper


def scope_manifest(notes, exclusions, source_sha256='b' * 64):
    count = sum(sync.candidate(item) is not None for item in notes)
    return {'metadata': {'source_sha256': source_sha256, 'source_url': sync.SOURCE,
                         'raw_candidate_count': count, 'excluded_count': len(exclusions),
                         'retained_candidate_count': count - len(exclusions)},
            'exclusions': exclusions}


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

    def test_public_note_does_not_make_private_research_fields_public(self):
        for field in ('title', 'abstract', 'keywords', 'pdf', 'venueid'):
            with self.subTest(field=field):
                public = dict(note(), readers=['everyone'])
                public['content'][field] = {'value': 'private', 'readers': ['author-group']}
                with self.assertRaisesRegex(RuntimeError, 'nonpublic research field'):
                    sync.validate_notes([public], 1, ACTIVE, require_public=True)
        public = dict(note(), readers=['everyone'])
        public['content']['abstract']['readers'] = ['everyone']
        self.assertEqual(sync.validate_notes([public], 1, ACTIVE, require_public=True), [public])

    def test_matching_includes_low_bit_model_and_excludes_unrelated_quantum(self):
        self.assertIsNotNone(sync.candidate(note(title='4-bit Inference for Transformers', abstract='Efficient weights.')))
        self.assertIsNone(sync.candidate(note(title='Quantum Neural Networks', abstract='Quantum neural models for classification.')))
        self.assertIsNone(sync.candidate(note(title='Scalar Quantization of Gaussian Sources', abstract='Optimal information-theoretic quantization of source signals.')))

    def test_binary_classification_is_not_binary_weight_quantization(self):
        self.assertIsNone(sync.candidate(note(title='Binary Classification with Neural Networks', abstract='Our model predicts binary labels.')))
        self.assertIsNotNone(sync.candidate(note(title='Binary Neural Networks', abstract='We compress neural network weights.')))
        self.assertIsNotNone(sync.candidate(note(title='NVFP4 Model Training', abstract='Low-bit model weights improve training.')))

    def test_numeric_formats_do_not_omit_three_or_six_bit_models(self):
        for title in ('W3A16 for Language Models', '6-bit Vision Transformer', 'INT3 Neural Models', 'b1.58 Neural Models'):
            with self.subTest(title=title):
                self.assertIsNotNone(sync.candidate(note(title=title, abstract='Compressed weights for neural inference.')))

    def test_multilabel_categories(self):
        paper = sync.candidate(note(abstract='Post-training quantization of diffusion model weights improves GPU latency.'))
        self.assertEqual(set(paper['categories']), {'ptq', 'diffusion', 'hardware'})

    def test_summary_preserved_but_revised_abstract_requires_review(self):
        paper = reviewed_paper()
        previous = {'papers': [paper]}
        refreshed = sync.build([note()], ACTIVE, previous, '2026-10-09T00:00:00Z')
        self.assertEqual(refreshed['metadata']['reviewed_count'], 1)
        revised = sync.build([note(abstract='New quantization of model weights.')], ACTIVE, previous, '2026-10-10T00:00:00Z')
        self.assertEqual(revised['papers'][0]['summary'], 'Verified summary.')
        self.assertEqual(revised['papers'][0]['review_status'], 'candidate')
        self.assertFalse(revised['papers'][0]['official_pdf_verified'])
        self.assertEqual(revised['metadata']['reviewed_count'], 0)

    def test_pdf_revision_timestamp_invalidates_review_without_losing_notes(self):
        original = note()
        original['tmdate'] = 1791500000000
        paper = reviewed_paper(original, summary='Verified original PDF.')
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
        previous = {'papers': [reviewed_paper(summary='   ')]}
        result = sync.build([note()], ACTIVE, previous, '2026-10-09T00:00:00Z')
        self.assertEqual(result['metadata']['reviewed_count'], 0)
        self.assertEqual(result['papers'][0]['review_status'], 'candidate')

    def test_foreign_pdf_url_is_not_preserved(self):
        self.assertIsNone(sync.candidate(note(pdf={'value': 'https://example.org/paper.pdf'}))['pdf_url'])
        self.assertIsNone(sync.candidate(note(pdf={'value': 'https://openreview.net.evil.invalid/paper.pdf'}))['pdf_url'])
        self.assertEqual(sync.candidate(note(pdf={'value': '/pdf?id=paper1'}))['pdf_url'], 'https://openreview.net/pdf?id=paper1')

    def test_fulltext_review_requires_matching_official_pdf_evidence(self):
        verified = reviewed_paper()
        self.assertTrue(sync.fulltext_reviewed(verified))
        invalid_fields = {
            'review_basis': ('arxiv_pdf', None),
            'official_pdf_verified': (False, 'true', None),
            'pdf_sha256': ('a' * 63, 'A' * 64, 'z' * 64, None),
            'reviewed_pdf_url': ('https://openreview.net/pdf?id=other', None),
            'reviewed_source_updated_at': ('2026-10-10T00:00:00Z', None),
            'summary': ('', '   ', None),
        }
        for field, values in invalid_fields.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    previous_paper = dict(verified, **{field: value})
                    self.assertFalse(sync.fulltext_reviewed(previous_paper))
                    refreshed = sync.build([note()], ACTIVE, {'papers': [previous_paper]}, '2026-10-10T00:00:00Z')
                    self.assertEqual(refreshed['metadata']['reviewed_count'], 0)
                    self.assertEqual(refreshed['papers'][0]['review_status'], 'candidate')

    def test_legacy_or_preprint_review_cannot_be_promoted_to_official_fulltext(self):
        legacy = dict(sync.candidate(note()), review_status='reviewed', summary='Legacy preprint notes.')
        preprint = reviewed_paper(review_basis='arxiv_pdf', reviewed_pdf_url='https://arxiv.org/pdf/2609.00001')
        for paper in (legacy, preprint):
            with self.subTest(basis=paper.get('review_basis')):
                result = sync.build([note()], ACTIVE, {'papers': [paper]}, '2026-10-10T00:00:00Z')
                self.assertEqual(result['papers'][0]['review_status'], 'candidate')
                self.assertEqual(result['papers'][0]['summary'], paper['summary'])
                self.assertEqual(result['metadata']['reviewed_count'], 0)
                self.assertEqual(result['metadata']['abstract_reviewed_count'], 0)

    def test_abstract_review_is_counted_separately_from_fulltext(self):
        abstract_note, pdf_note = note('abstract'), note('pdf')
        abstract = dict(sync.candidate(abstract_note), review_status='abstract',
                        review_basis='official_abstract', summary='Abstract interpretation.')
        previous = {'papers': [abstract, reviewed_paper(pdf_note)]}
        result = sync.build([abstract_note, pdf_note], ACTIVE, previous, '2026-10-10T00:00:00Z')
        self.assertEqual(result['metadata']['abstract_reviewed_count'], 1)
        self.assertEqual(result['metadata']['reviewed_count'], 1)
        self.assertEqual(result['metadata']['candidate_count'], 2)
        failed = sync.unavailable(result, '2026-10-11T00:00:00Z', 'HTTP 403')
        self.assertEqual(failed['metadata']['abstract_reviewed_count'], 1)
        self.assertEqual(failed['metadata']['reviewed_count'], 1)

    def test_hash_pdf_path_and_matching_review_evidence_survive_refresh(self):
        relative_pdf = '/pdf/' + 'c' * 40 + '.pdf'
        original = note(pdf={'value': relative_pdf})
        evidence = [{'location': 'Official PDF, Table 1', 'claim': 'Verified measured result.'}]
        paper = reviewed_paper(original, evidence=evidence)
        result = sync.build([original], ACTIVE, {'papers': [paper]}, '2026-10-10T00:00:00Z')
        refreshed = result['papers'][0]
        self.assertEqual(refreshed['pdf_url'], 'https://openreview.net' + relative_pdf)
        self.assertEqual(refreshed['reviewed_pdf_url'], refreshed['pdf_url'])
        self.assertEqual(refreshed['pdf_sha256'], paper['pdf_sha256'])
        self.assertEqual(refreshed['reviewed_source_updated_at'], paper['updated_at'])
        self.assertEqual(refreshed['evidence'], evidence)
        self.assertTrue(sync.fulltext_reviewed(refreshed))
        self.assertEqual(result['metadata']['reviewed_count'], 1)

    def test_source_revision_invalidates_abstract_and_fulltext_without_losing_notes(self):
        original = note()
        abstract = dict(sync.candidate(original), review_status='abstract',
                        review_basis='official_abstract', summary='Original abstract notes.')
        revised_notes = [note(abstract='Revised quantization of model weights.'),
                         note(title='Revised Post-Training Quantization of Language Models'),
                         dict(note(), tmdate=1791500001000),
                         note(pdf={'value': '/pdf/' + 'd' * 40 + '.pdf'})]
        for prior in (abstract, reviewed_paper(original)):
            for revised in revised_notes:
                with self.subTest(status=prior['review_status'], revision=revised):
                    result = sync.build([revised], ACTIVE, {'papers': [prior]}, '2026-10-10T00:00:00Z')
                    self.assertEqual(result['papers'][0]['review_status'], 'candidate')
                    self.assertEqual(result['papers'][0]['summary'], prior['summary'])
                    self.assertEqual(result['metadata']['reviewed_count'], 0)
                    self.assertEqual(result['metadata']['abstract_reviewed_count'], 0)

    def test_scope_exclusions_apply_only_to_audited_candidates_of_same_snapshot(self):
        notes = [note('keep'), note('exclude'),
                 note('unrelated', title='Ordinary Attention', abstract='Neural attention improves inference.')]
        exclusion = {'id': 'exclude', 'title': notes[1]['content']['title']['value'],
                     'reason': 'Only data tokenization, outside model quantization scope.'}
        scope = scope_manifest(notes, [exclusion])
        excluded = sync.validate_scope(scope, notes, 'b' * 64)
        self.assertEqual(excluded, {'exclude'})
        result = sync.build(notes, ACTIVE, {}, '2026-10-10T00:00:00Z', exclusions=excluded)
        self.assertEqual([paper['id'] for paper in result['papers']], ['keep'])
        self.assertEqual(result['metadata']['total_active_submissions'], 3)
        self.assertEqual(result['metadata']['automated_candidate_count'], 2)
        self.assertEqual(result['metadata']['scope_excluded_count'], 1)
        self.assertEqual(result['metadata']['candidate_count'], 1)
        for changed_field, changed_value in (('source_sha256', 'c' * 64),
                                             ('source_url', 'https://example.org/snapshot')):
            with self.subTest(field=changed_field):
                invalid = json.loads(json.dumps(scope))
                invalid['metadata'][changed_field] = changed_value
                with self.assertRaisesRegex(RuntimeError, 'source snapshot'):
                    sync.validate_scope(invalid, notes, 'b' * 64)

    def test_scope_rejects_duplicate_non_candidate_and_invalid_exclusions(self):
        notes = [note('candidate'), note('not-candidate', title='Ordinary Attention',
                                       abstract='Neural attention improves inference.')]
        valid = {'id': 'candidate', 'reason': 'Out of model quantization scope.'}
        invalid_lists = [[valid, valid], [{'id': 'not-candidate', 'reason': 'Not a candidate.'}],
                         [{'id': 'missing', 'reason': 'Missing source record.'}],
                         [{'id': 'candidate', 'reason': '   '}], [None]]
        for exclusions in invalid_lists:
            with self.subTest(exclusions=exclusions):
                with self.assertRaisesRegex(RuntimeError, 'Invalid, duplicate or unrelated'):
                    sync.validate_scope(scope_manifest(notes, exclusions), notes, 'b' * 64)
        scope = scope_manifest(notes, [])
        scope['exclusions'] = {'candidate': 'Reason'}
        with self.assertRaisesRegex(RuntimeError, 'auditable list'):
            sync.validate_scope(scope, notes, 'b' * 64)

    def test_scope_rejects_counts_that_do_not_match_source(self):
        notes = [note('candidate')]
        for field in ('raw_candidate_count', 'excluded_count', 'retained_candidate_count'):
            with self.subTest(field=field):
                scope = scope_manifest(notes, [])
                scope['metadata'][field] += 1
                with self.assertRaisesRegex(RuntimeError, 'counts do not match'):
                    sync.validate_scope(scope, notes, 'b' * 64)

    def test_import_preserves_source_snapshot_time_hash_and_provenance(self):
        fetched_at, checked_at = '2026-10-09T05:19:57.757Z', '2026-10-11T00:00:00Z'
        export = {'active_venue_id': ACTIVE, 'count': 2,
                  'notes': [dict(note('keep'), readers=['everyone']), dict(note('exclude'), readers=['everyone'])],
                  'fetched_at': fetched_at,
                  'provenance': {'origin': 'https://openreview.net', 'public_fields_only': True, 'page_count': 1}}
        with tempfile.TemporaryDirectory() as directory:
            source, output, scope_file = [Path(directory) / name for name in ('source.json', 'output.json', 'scope.json')]
            source.write_text(json.dumps(export), encoding='utf-8')
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            scope_file.write_text(json.dumps(scope_manifest(export['notes'], [{'id': 'exclude', 'reason': 'Outside scope.'}], digest)), encoding='utf-8')
            with patch('sys.argv', ['sync_iclr2027.py', '--input-json', str(source), '--output', str(output),
                                    '--scope-exclusions', str(scope_file)]), patch.object(sync, 'now', return_value=checked_at):
                self.assertEqual(sync.main(), 0)
            result = json.loads(output.read_text())
        self.assertEqual(result['metadata']['fetched_at'], fetched_at)
        self.assertEqual(result['metadata']['checked_at'], checked_at)
        self.assertEqual(result['metadata']['source_sha256'], digest)
        self.assertEqual(result['metadata']['source_provenance'], export['provenance'])
        self.assertEqual(result['metadata']['automated_candidate_count'], 2)
        self.assertEqual(result['metadata']['candidate_count'], 1)
        self.assertEqual([paper['id'] for paper in result['papers']], ['keep'])

    def test_atomic_json_output(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'data.json'
            sync.atomic_write(target, {'message': '量化'})
            self.assertEqual(json.loads(target.read_text()), {'message': '量化'})
            self.assertEqual([p.name for p in target.parent.iterdir()], ['data.json'])


if __name__ == '__main__':
    unittest.main()
