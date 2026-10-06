import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadMerges, type AuthorMergeGroup } from "./authors";
import { GIT_ENV, IngestError } from "./ingest";
import { repoPath } from "./workspace";

const execFileAsync = promisify(execFile);

const LOG_TIMEOUT_MS = 300_000;
const LOG_MAX_BUFFER = 256 * 1024 * 1024;
const MAX_CACHED_DATASETS = 3;

// One log pass carries commit metadata plus the per-commit line deltas that
// every metric category is derived from. Field separator \x1f, record marker
// \x01; -z makes both commit boundaries and (rename) paths NUL-terminated.
// -M enables rename detection at the default 50% similarity threshold, so a
// pure rename registers as 0 added / 0 removed on its new path and a
// rename+edit registers only the edited lines.
const LOG_FORMAT = "--format=%x01%H%x1f%aN%x1f%aE%x1f%at%x1f%s";

export type CommitFileDelta = {
  path: string;
  added: number;
  removed: number;
};

export type CommitRecord = {
  hash: string;
  author: string;
  email: string;
  timestamp: number;
  subject: string;
  files: CommitFileDelta[];
};

export type CommitDataset = {
  ref: string;
  commitCount: number;
  commits: CommitRecord[];
};

export type AuthorIdentity = {
  key: string;
  name: string;
  email: string;
};

export type ObjectMetrics = {
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
};

export type ObjectMetricsRow = ObjectMetrics & { path: string };

export type AuthorMetricsRow = {
  name: string;
  email: string;
  commits: number;
  modifications: number;
  added: number;
  removed: number;
  churn: number;
  ownership: number;
};

export type ObjectAuthorRow = {
  name: string;
  email: string;
  modifications: number;
  churn: number;
  ownership: number;
};

export type MetricsObjectFocus = {
  path: string;
  kind: "file" | "directory";
  metrics: ObjectMetrics;
  authors: ObjectAuthorRow[];
};

export type MetricsReport = {
  repoId: string;
  ref: string;
  selection: {
    from: number | null;
    to: number | null;
    commits: string[] | null;
    authors: string[] | null;
    path: string | null;
  };
  commitCount: number;
  authorCount: number;
  fileCount: number;
  directoryCount: number;
  repository: ObjectMetrics;
  files: ObjectMetricsRow[];
  directories: ObjectMetricsRow[];
  authors: AuthorMetricsRow[];
  object: MetricsObjectFocus | null;
};

export type MetricsOptions = {
  ref?: string;
  from?: number;
  to?: number;
  hashes?: string[];
  authors?: string[];
  path?: string;
  object?: string;
};

export type RepoSummary = {
  repoId: string;
  commitCount: number;
  authorCount: number;
  fileCount: number;
  directoryCount: number;
  repository: ObjectMetrics;
};

const datasetCache = new Map<string, Promise<CommitDataset>>();

export function loadCommitDataset(repoId: string, ref: string): Promise<CommitDataset> {
  const key = `${repoId}\x00${ref}`;
  const cached = datasetCache.get(key);
  if (cached) {
    datasetCache.delete(key);
    datasetCache.set(key, cached);
    return cached;
  }
  const promise = readCommitDataset(repoId, ref).catch((error: unknown) => {
    datasetCache.delete(key);
    throw error;
  });
  datasetCache.set(key, promise);
  if (datasetCache.size > MAX_CACHED_DATASETS) {
    const oldest = datasetCache.keys().next().value;
    if (oldest !== undefined) {
      datasetCache.delete(oldest);
    }
  }
  return promise;
}

async function readCommitDataset(repoId: string, ref: string): Promise<CommitDataset> {
  assertValidRef(ref);
  const repositoryPath = repoPath(repoId);
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "git",
      [
        "-C",
        repositoryPath,
        "log",
        ref,
        "--no-merges",
        "-M",
        "--numstat",
        "-z",
        LOG_FORMAT,
      ],
      {
        env: GIT_ENV,
        timeout: LOG_TIMEOUT_MS,
        maxBuffer: LOG_MAX_BUFFER,
        encoding: "utf8",
      },
    ));
  } catch (error) {
    // An unborn HEAD makes `git log HEAD` fail with an "ambiguous argument"
    // error; treat it as an empty history rather than a bad reference.
    if (ref === "HEAD" && !(await hasHead(repositoryPath))) {
      return { ref, commitCount: 0, commits: [] };
    }
    throw translateLogError(error, ref);
  }
  return parseLogOutput(stdout, ref);
}

function assertValidRef(ref: string): void {
  if (!ref || ref.startsWith("-") || ref.length > 200 || /[\s\u0000]/.test(ref)) {
    throw new IngestError("Invalid commit reference.", 400);
  }
}

async function hasHead(repositoryPath: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", repositoryPath, "rev-parse", "--verify", "--quiet", "HEAD"], {
      env: GIT_ENV,
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

function translateLogError(error: unknown, ref: string): IngestError {
  const stderr = extractStderr(error);
  if (
    stderr.includes("unknown revision") ||
    stderr.includes("not a valid object name") ||
    stderr.includes("ambiguous argument") ||
    stderr.includes("bad revision")
  ) {
    return new IngestError(`"${ref}" is not a valid commit reference in this repository.`, 400);
  }
  const code = (error as { code?: unknown }).code;
  if (code === "ENOENT") {
    return new IngestError("git is not available on this server.", 500);
  }
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return new IngestError("The repository history is too large to analyze in one pass.", 413);
  }
  if ((error as { killed?: boolean }).killed) {
    return new IngestError("Reading the repository history timed out.", 504);
  }
  console.error(`git log failed for ${ref}:`, stderr || error);
  return new IngestError("Failed to read the repository history.", 500);
}

function extractStderr(error: unknown): string {
  const stderr = (error as { stderr?: unknown }).stderr;
  return typeof stderr === "string" ? stderr : "";
}

function parseLogOutput(output: string, ref: string): CommitDataset {
  const tokens = output.split("\x00");
  const commits: CommitRecord[] = [];
  let current: CommitRecord | null = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === "") {
      continue;
    }
    if (token.charCodeAt(0) === 0x01) {
      const parts = token.slice(1).split("\x1f");
      const [hash, author, email, timestamp, ...subjectParts] = parts;
      if (!hash || timestamp === undefined) {
        continue;
      }
      current = {
        hash,
        author: author ?? "",
        email: email ?? "",
        timestamp: Number.parseInt(timestamp, 10) || 0,
        subject: subjectParts.join("\x1f"),
        files: [],
      };
      commits.push(current);
      continue;
    }

    // The first numstat entry after a commit header is prefixed with "\n".
    let body = token;
    while (body.startsWith("\n") || body.startsWith("\r")) {
      body = body.slice(1);
    }
    if (body === "" || current === null) {
      continue;
    }

    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(body);
    if (!match) {
      continue;
    }
    const addedToken = match[1];
    const removedToken = match[2];
    let path = match[3];

    if (path === "") {
      // Rename or copy: the two following NUL-terminated tokens are the old
      // and the new path; the delta belongs to the new path.
      const renamed = tokens[i + 2];
      i += 2;
      if (renamed === undefined) {
        break;
      }
      path = renamed;
    }

    // "-" counts mark binary files, which are not measured.
    if (addedToken === "-" || removedToken === "-") {
      continue;
    }
    current.files.push({ path, added: Number(addedToken), removed: Number(removedToken) });
  }

  return { ref, commitCount: commits.length, commits };
}

export function buildAuthorResolver(
  merges: AuthorMergeGroup[],
): (name: string, email: string) => AuthorIdentity {
  const lookup = new Map<string, AuthorIdentity>();
  for (const group of merges) {
    const display: AuthorIdentity = {
      key: `group:${group.id}`,
      name: group.name,
      email: group.members.map((member) => member.email).join(", "),
    };
    for (const member of group.members) {
      lookup.set(`${member.name}\x00${member.email}`, display);
    }
  }
  return (name, email) =>
    lookup.get(`${name}\x00${email}`) ?? { key: `raw:${name}\x00${email}`, name, email };
}

export async function computeMetrics(repoId: string, options: MetricsOptions = {}): Promise<MetricsReport> {
  const ref = options.ref ?? "HEAD";
  const dataset = await loadCommitDataset(repoId, ref);
  const merges = await loadMerges(repoId);
  const resolveAuthor = buildAuthorResolver(merges);

  const selected = selectCommits(dataset, options);
  const authorFilter =
    options.authors && options.authors.length > 0 ? new Set(options.authors) : null;
  const pathScope = options.path && options.path !== "" ? options.path : null;

  const focusPath = options.object;
  if (focusPath !== undefined && pathScope !== null && !withinScope(focusPath, pathScope)) {
    throw new IngestError(`"${focusPath}" is outside the path filter "${pathScope}".`, 400);
  }
  const focusKind =
    focusPath === undefined
      ? null
      : detectObjectKind(selected, focusPath, { resolveAuthor, authorFilter, pathScope });

  const files = new Map<string, { added: number; removed: number }>();
  const fileModifications = new Map<string, number>();
  const directories = new Map<string, { added: number; removed: number }>();
  const directoryModifications = new Map<string, number>();
  const authors = new Map<
    string,
    { name: string; email: string; commits: number; modifications: number; added: number; removed: number }
  >();
  const focusAuthors = new Map<
    string,
    { name: string; email: string; modifications: number; churn: number }
  >();

  const totals = { added: 0, removed: 0, modifications: 0 };
  let commitCount = 0;

  for (const commit of selected) {
    const identity = resolveAuthor(commit.author, commit.email);
    if (authorFilter && !authorFilter.has(identity.name)) {
      continue;
    }
    commitCount += 1;
    let author = authors.get(identity.key);
    if (!author) {
      author = {
        name: identity.name,
        email: identity.email,
        commits: 0,
        modifications: 0,
        added: 0,
        removed: 0,
      };
      authors.set(identity.key, author);
    }
    author.commits += 1;

    const commitFiles = new Map<string, { added: number; removed: number }>();
    const commitDirectories = new Map<string, { added: number; removed: number }>();
    let commitAdded = 0;
    let commitRemoved = 0;

    for (const file of commit.files) {
      if (pathScope !== null && !withinScope(file.path, pathScope)) {
        continue;
      }
      commitAdded += file.added;
      commitRemoved += file.removed;
      addDelta(commitFiles, file.path, file.added, file.removed);
      for (const directory of ancestorDirectories(file.path)) {
        if (pathScope !== null && !withinScope(directory, pathScope)) {
          continue;
        }
        addDelta(commitDirectories, directory, file.added, file.removed);
      }
    }

    for (const [path, delta] of commitFiles) {
      addDelta(files, path, delta.added, delta.removed);
      if (delta.added + delta.removed > 0) {
        fileModifications.set(path, (fileModifications.get(path) ?? 0) + 1);
      }
    }

    for (const [path, delta] of commitDirectories) {
      addDelta(directories, path, delta.added, delta.removed);
      if (delta.added + delta.removed > 0) {
        directoryModifications.set(path, (directoryModifications.get(path) ?? 0) + 1);
      }
    }

    author.added += commitAdded;
    author.removed += commitRemoved;
    if (commitAdded + commitRemoved > 0) {
      author.modifications += 1;
    }

    totals.added += commitAdded;
    totals.removed += commitRemoved;
    if (commitAdded + commitRemoved > 0) {
      totals.modifications += 1;
    }

    if (focusKind !== null && focusPath !== undefined) {
      const delta =
        focusKind === "file" ? commitFiles.get(focusPath) : commitDirectories.get(focusPath);
      if (delta) {
        let entry = focusAuthors.get(identity.key);
        if (!entry) {
          entry = { name: identity.name, email: identity.email, modifications: 0, churn: 0 };
          focusAuthors.set(identity.key, entry);
        }
        const churn = delta.added + delta.removed;
        entry.churn += churn;
        if (churn > 0) {
          entry.modifications += 1;
        }
      }
    }
  }

  const repository = buildMetrics(totals, totals.modifications, commitCount);
  const repositoryChurn = repository.churn;

  const fileRows: ObjectMetricsRow[] = [];
  for (const [path, delta] of files) {
    fileRows.push({ path, ...buildMetrics(delta, fileModifications.get(path) ?? 0, commitCount) });
  }
  fileRows.sort(compareObjectRows);

  const directoryRows: ObjectMetricsRow[] = [];
  for (const [path, delta] of directories) {
    directoryRows.push({
      path,
      ...buildMetrics(delta, directoryModifications.get(path) ?? 0, commitCount),
    });
  }
  directoryRows.sort(compareObjectRows);

  const authorRows: AuthorMetricsRow[] = [];
  for (const author of authors.values()) {
    const churn = author.added + author.removed;
    authorRows.push({
      ...author,
      churn,
      ownership: repositoryChurn > 0 ? churn / repositoryChurn : 0,
    });
  }
  authorRows.sort((a, b) => b.churn - a.churn || a.name.localeCompare(b.name));

  let object: MetricsObjectFocus | null = null;
  if (focusKind !== null && focusPath !== undefined) {
    const delta =
      focusKind === "file" ? files.get(focusPath) : directories.get(focusPath);
    const modifications =
      focusKind === "file"
        ? (fileModifications.get(focusPath) ?? 0)
        : (directoryModifications.get(focusPath) ?? 0);
    const objectMetrics = buildMetrics(delta ?? { added: 0, removed: 0 }, modifications, commitCount);
    object = {
      path: focusPath,
      kind: focusKind,
      metrics: objectMetrics,
      authors: [...focusAuthors.values()]
        .filter((entry) => entry.churn > 0)
        .map((entry) => ({
          ...entry,
          ownership: objectMetrics.churn > 0 ? entry.churn / objectMetrics.churn : 0,
        }))
        .sort((a, b) => b.churn - a.churn || a.name.localeCompare(b.name)),
    };
  }

  return {
    repoId,
    ref,
    selection: {
      from: options.from ?? null,
      to: options.to ?? null,
      commits: options.hashes ?? null,
      authors: authorFilter ? [...authorFilter].sort((a, b) => a.localeCompare(b)) : null,
      path: pathScope,
    },
    commitCount,
    authorCount: authorRows.length,
    fileCount: fileRows.length,
    directoryCount: directoryRows.length,
    repository,
    files: fileRows,
    directories: directoryRows,
    authors: authorRows,
    object,
  };
}

export async function computeRepositorySummary(
  repoId: string,
  options: { from?: number; to?: number } = {},
): Promise<RepoSummary> {
  const report = await computeMetrics(repoId, options);
  return {
    repoId,
    commitCount: report.commitCount,
    authorCount: report.authorCount,
    fileCount: report.fileCount,
    directoryCount: report.directoryCount,
    repository: report.repository,
  };
}

function selectCommits(dataset: CommitDataset, options: MetricsOptions): CommitRecord[] {
  if (options.hashes && options.hashes.length > 0) {
    const wanted = new Set<CommitRecord>();
    for (const hash of options.hashes) {
      const needle = hash.toLowerCase();
      const matches = dataset.commits.filter((commit) => commit.hash.startsWith(needle));
      if (matches.length === 0) {
        throw new IngestError(
          `Commit "${hash}" is not part of the non-merge history reachable from ${dataset.ref}.`,
          400,
        );
      }
      for (const match of matches) {
        wanted.add(match);
      }
    }
    return dataset.commits.filter((commit) => wanted.has(commit));
  }

  const { from, to } = options;
  if (from === undefined && to === undefined) {
    return dataset.commits;
  }
  return dataset.commits.filter(
    (commit) =>
      (from === undefined || commit.timestamp >= from) &&
      (to === undefined || commit.timestamp < to),
  );
}

function withinScope(path: string, scope: string): boolean {
  return path === scope || path.startsWith(`${scope}/`);
}

function detectObjectKind(
  commits: CommitRecord[],
  objectPath: string,
  filters: {
    resolveAuthor: (name: string, email: string) => AuthorIdentity;
    authorFilter: Set<string> | null;
    pathScope: string | null;
  },
): "file" | "directory" {
  if (objectPath === "") {
    return "directory";
  }
  const prefix = `${objectPath}/`;
  let directoryMatch = false;
  for (const commit of commits) {
    if (
      filters.authorFilter &&
      !filters.authorFilter.has(filters.resolveAuthor(commit.author, commit.email).name)
    ) {
      continue;
    }
    for (const file of commit.files) {
      if (filters.pathScope !== null && !withinScope(file.path, filters.pathScope)) {
        continue;
      }
      if (file.path === objectPath) {
        return "file";
      }
      if (!directoryMatch && file.path.startsWith(prefix)) {
        directoryMatch = true;
      }
    }
  }
  if (directoryMatch) {
    return "directory";
  }
  throw new IngestError(`"${objectPath}" is not part of the selected commit set.`, 400);
}

function addDelta(
  map: Map<string, { added: number; removed: number }>,
  path: string,
  added: number,
  removed: number,
): void {
  const existing = map.get(path);
  if (existing) {
    existing.added += added;
    existing.removed += removed;
  } else {
    map.set(path, { added, removed });
  }
}

function ancestorDirectories(path: string): string[] {
  const directories: string[] = [];
  let index = path.indexOf("/");
  while (index !== -1) {
    directories.push(path.slice(0, index));
    index = path.indexOf("/", index + 1);
  }
  directories.push("");
  return directories;
}

function buildMetrics(
  delta: { added: number; removed: number },
  modifications: number,
  commitCount: number,
): ObjectMetrics {
  return {
    added: delta.added,
    removed: delta.removed,
    growth: delta.added - delta.removed,
    churn: delta.added + delta.removed,
    modifications,
    modificationFrequency: commitCount > 0 ? modifications / commitCount : 0,
    churnRate: commitCount > 0 ? (delta.added + delta.removed) / commitCount : 0,
  };
}

function compareObjectRows(a: ObjectMetricsRow, b: ObjectMetricsRow): number {
  return b.churn - a.churn || a.path.localeCompare(b.path);
}
