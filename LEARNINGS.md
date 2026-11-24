# Release learnings

## Hosted image compatibility and published source — 24 November 2026

The locked Playwright browser installer rejects Ubuntu 26.04 during npm ci. Pin the publishing job to supported GitHub-hosted Ubuntu 24.04; retain dependency installation, tests, lint, exact-package Marketplace validation and GitHub publication. Before a repeat release, compare the validated Marketplace version with GitHub default source. Published 1.0.1 Nest-role icons matched local committed source 9ad106943b59f97f7ec18dcce39df620b1575a1e, which had not reached default master. Preserve that source before the next version; never re-release older default code over newer public icons.
