# Koala Clash Docs

This branch is dedicated to the documentation site for `koala-clash`.

## Local Development

```bash
cd docs
npm install
npm run dev
```

## Build

```bash
cd docs
npm run build
```

## Structure

- The documentation project lives in the `docs/` folder.
- `docs/src/content/docs/` contains the documentation pages.
- `docs/src/styles/custom.css` holds the Koala Clash visual theme.
- `.github/workflows/starlight.yml` deploys the site to GitHub Pages from the `docs` branch.
