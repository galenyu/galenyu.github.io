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
- `assets/data/iclr-2027-quantization.json`: auditable survey snapshot and manually verified reading notes.
- `scripts/sync_iclr2027.py`: public OpenReview synchronization, integrity checks, and validated export import.
- `docs/iclr-2027-survey.md`: data scope, update instructions, and review workflow (also published on the site).

The survey distinguishes active submissions, keyword candidates, and papers whose full text has been reviewed. Failed access is displayed as unknown data, never a zero-paper result. The initial snapshot records OpenReview's HTTP 403 verification requirement; actual paper summaries still require a successful public export and full-text review.

```bash
python3 scripts/sync_iclr2027.py
python3 -m unittest discover -s scripts -p 'test_sync_iclr2027.py' -v
```

## Design and attribution

The homepage follows common researcher-site patterns: a concise introduction, research interests, featured work, writing, and contact links. The survey organization was inspired by [Awesome Model Quantization](https://kai-liu.cn/Awesome-Model-Quantization/); its 2026 paper list and statistics are not reused.

Built from the original [Contrast theme](https://github.com/niklasbuschmann/contrast). Bundled font and icon licenses remain in their asset directories. Project license: [Unlicense](UNLICENSE.txt).
