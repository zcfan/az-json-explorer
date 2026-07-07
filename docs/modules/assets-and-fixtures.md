# Assets And Fixtures

## Purpose

This module supports manual verification and Chrome Web Store presentation. It should not affect runtime behavior except for extension icons and sample data.

## Key Files

- `fixtures/sample.json`
- `fixtures/large-sample-generator.mjs`
- `assets/icon-*.png`
- `store-assets/*`
- `store-assets/source/*`
- `scripts/generate-store-assets.mjs`

## Fixtures

`fixtures/sample.json` is the small manual smoke-test fixture. It should include nested stringified JSON so `Parse as JSON` can be verified quickly.

`fixtures/large-sample-generator.mjs` creates stress payloads for large-file and virtual-scroll checks:

```bash
node fixtures/large-sample-generator.mjs 50000
```

## Store Assets

`scripts/generate-store-assets.mjs` regenerates promotional images and screenshots from source HTML under `store-assets/source/`.

```bash
npm run store-assets
```

## Contracts

- Keep runtime icons under `assets/`.
- Keep store-listing assets under `store-assets/`.
- Do not make runtime code depend on `store-assets/`.
- Keep generated assets reproducible from the script and source HTML where possible.

## Verification

- Run `npm test` for fixture validity checks.
- Run `npm run store-assets` when changing store asset sources.
