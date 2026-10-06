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

## Private repositories

The app has no login or token input of its own, and public repositories clone anonymously. To ingest a **private** repository, the machine running the app must already have git-level access — clones run non-interactively, so git never prompts for credentials:

- **HTTPS**: store credentials in the server's git credential helper, e.g.

  ```bash
  git config --global credential.helper store
  # clone any private repo once from the terminal and enter your
  # username + PAT when prompted; the PAT is cached for future
  # clones made by the app
  git clone https://github.com/owner/private-repo.git /tmp/probe && rm -rf /tmp/probe
  ```

- **SSH**: add the server's key to your account and ingest via an SSH URL such as `git@github.com:owner/repo.git`.

Alternatively, upload the repository as a zip that includes its `.git` directory — no credentials are involved.

## Data storage

Ingested repositories, author merge groups, and generated data are stored under `sdp-test-1/.data/`, which is created automatically on first use. No database or environment variables are required. To reset all app state, stop the server and delete the `.data/` directory.
