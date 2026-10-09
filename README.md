# Galen Yu · Personal website

A Jekyll personal website for research interests, writing, and an ICLR 2027 model quantization submission survey.

## Local preview

Ruby and Bundler are required. From the repository root:

```bash
bundle install
bundle exec jekyll serve
```

Open http://localhost:4000. For a production build, run `bundle exec jekyll build`.

## Content

- `index.html`: homepage; `ABOUTME.md`: personal introduction.
- `_posts/`: dated writing; `/writing/`: article index.
- `iclr-2027-quantization.html`: Chinese submission survey with search, research direction filters, and source status.
- `assets/data/iclr-2027-quantization.json`: auditable official-source snapshot.
- `assets/data/iclr-2027-landscape.json`: reproducible direction and term counts for all 994 candidates, with official ID lists and snapshot hashes.
- `assets/data/iclr-2027-landscape-notes.json`: snapshot-bound representatives, six trends, three shared lessons, and five research suggestions with evidence and experiment designs.
- `assets/data/iclr-2027-official-exclusions.json`: exclusions reviewed against official abstracts, tied to the original export SHA256.
- `scripts/sync_iclr2027.py`: public OpenReview synchronization, integrity checks, and validated export import.
- `scripts/build_iclr2027_landscape.py`: builds candidate-level statistics without changing papers or reading progress.
- `/tools/openreview-export/`: copyable official-browser export helper; runs on the normal OpenReview page and keeps account/session information out of exports.
- `docs/iclr-2027-survey.md`: data scope, update instructions, and review workflow (also published on the site).

The survey uses only official OpenReview records. The October 9, 2026 browser export contains 42,368 unique public active submissions: 1,133 keyword candidates, 139 scope exclusions, and 994 retained candidates. Six representative papers have Chinese readings of their actual official submission PDFs, with table/page evidence; twelve more have official-abstract readings. Abstract readings and verified original-PDF readings are counted separately. Failed refreshes retain the last official snapshot and show current counts as unknown.

The 90 MB raw export and downloaded PDF ZIPs stay local, outside Git and the generated site. Earlier preprint/mirror research files remain in the repository as an archive and are excluded from the site.

The overall analysis counts nonexclusive direction tags and explicit mentions in official titles, abstracts, and keywords. Its “frontier saturation” labels describe candidate density only (high ≥200, medium 100–199, relatively low <100), not novelty saturation or acceptance odds. Trends and recommendations synthesize named official sources. The analysis is hidden when its bound source/index hashes or membership counts no longer match the current complete snapshot; the paper explorer remains usable.

```bash
python3 scripts/sync_iclr2027.py
python3 scripts/sync_iclr2027.py --input-json iclr-2027-official-active-submissions.json --scope-exclusions assets/data/iclr-2027-official-exclusions.json
python3 -m unittest discover -s scripts -p 'test_sync_iclr2027.py' -v
python3 scripts/build_iclr2027_landscape.py
python3 -m unittest discover -s scripts -p 'test_build_iclr2027_landscape.py' -v
node scripts/test_openreview_export.cjs
```

## Design and attribution

The homepage follows common researcher-site patterns: a concise introduction, research interests, featured work, writing, and contact links. The survey organization was inspired by [Awesome Model Quantization](https://kai-liu.cn/Awesome-Model-Quantization/); its 2026 paper list and statistics are not reused.

Built from the original [Contrast theme](https://github.com/niklasbuschmann/contrast). Bundled font and icon licenses remain in their asset directories. Project license: [Unlicense](UNLICENSE.txt).
