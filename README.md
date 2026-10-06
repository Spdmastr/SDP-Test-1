# RepoMetrics

A Next.js web app for analyzing git repositories: ingest a repository (zip upload or remote clone), merge duplicate authors, and explore commit metrics in a dashboard.

The application lives in the [`sdp-test-1/`](./sdp-test-1) directory.

## Prerequisites

- **Node.js 20+** and **npm** — check with `node -v` and `npm -v`
- **git** available on your `PATH` — required for repository ingestion and metric computation (`git --version`)

## Install dependencies

```bash
cd sdp-test-1
npm install
```

## Run in development

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser. The app hot-reloads on file changes.

## Run in production

```bash
npm run build
npm run start
```

The production server also serves on [http://localhost:3000](http://localhost:3000) by default.

## Lint

```bash
npm run lint
```

## Data storage

Ingested repositories, author merge groups, and generated data are stored under `sdp-test-1/.data/`, which is created automatically on first use. No database or environment variables are required. To reset all app state, stop the server and delete the `.data/` directory.
