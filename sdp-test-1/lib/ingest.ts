import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import AdmZip from "adm-zip";

import {
  createStagingPath,
  ensureWorkspace,
  finalizeStagedRepo,
  pathExists,
  removeQuietly,
  repoPath,
  sanitizeRepoId,
} from "./workspace";

const execFileAsync = promisify(execFile);

const CLONE_TIMEOUT_MS = 5 * 60 * 1000;
const GIT_STAT_TIMEOUT_MS = 30 * 1000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
export const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "true",
};

export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

export type RepoStats = {
  commits: number;
  branch: string;
} | null;

export type IngestResult = {
  id: string;
  source: "url" | "zip";
  stats: RepoStats;
};

export class IngestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

export async function ingestFromUrl(rawUrl: string): Promise<IngestResult> {
  const url = validateRemoteUrl(rawUrl);
  const id = repoIdFromUrl(url);
  await ensureWorkspace();
  if (await pathExists(repoPath(id))) {
    throw new IngestError(`"${id}" is already in the workspace.`, 409);
  }

  const staging = createStagingPath();
  try {
    try {
      // Full clone (no --depth): the entire history is fetched so commits can
      // be filtered by time range or picked individually later on.
      await execFileAsync("git", ["clone", "--quiet", url, staging], {
        env: GIT_ENV,
        timeout: CLONE_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
      });
    } catch (error) {
      throw translateGitError(error);
    }
    await finalizeStagedRepo(staging, id);
  } catch (error) {
    await removeQuietly(staging);
    throw error;
  }

  return { id, source: "url", stats: await readRepoStats(repoPath(id)) };
}

export async function ingestFromZip(fileName: string, data: Buffer): Promise<IngestResult> {
  assertLooksLikeZip(data);

  const baseName = fileName.replace(/\.zip$/i, "");
  const id = sanitizeRepoId(baseName) || `uploaded-${Date.now().toString(36)}`;
  await ensureWorkspace();
  if (await pathExists(repoPath(id))) {
    throw new IngestError(`"${id}" is already in the workspace.`, 409);
  }

  const staging = createStagingPath();
  try {
    await extractZipSafely(data, staging);
    const repoRoot = await findRepoRoot(staging);
    if (repoRoot === staging) {
      await finalizeStagedRepo(staging, id);
    } else {
      // The archive wrapped the repository in a single top-level folder.
      await finalizeStagedRepo(repoRoot, id);
      await removeQuietly(staging);
    }
  } catch (error) {
    await removeQuietly(staging);
    throw error;
  }

  return { id, source: "zip", stats: await readRepoStats(repoPath(id)) };
}

export async function readRepoStats(repositoryPath: string): Promise<RepoStats> {
  try {
    const [{ stdout: countStdout }, { stdout: branchStdout }] = await Promise.all([
      execFileAsync("git", ["-C", repositoryPath, "rev-list", "--count", "--all"], gitStatOptions()),
      execFileAsync("git", ["-C", repositoryPath, "branch", "--show-current"], gitStatOptions()),
    ]);
    const commits = Number.parseInt(countStdout.trim(), 10);
    if (!Number.isFinite(commits)) {
      return null;
    }
    return { commits, branch: branchStdout.trim() || "detached HEAD" };
  } catch {
    return null;
  }
}

function gitStatOptions() {
  return { env: GIT_ENV, timeout: GIT_STAT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER };
}

function validateRemoteUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new IngestError("Enter a repository URL.");
  }
  const isSupported =
    /^https?:\/\/\S+$/i.test(value) ||
    /^ssh:\/\/\S+$/i.test(value) ||
    /^git@[^\s:]+:\S+$/.test(value);
  if (!isSupported) {
    throw new IngestError("Only http(s), ssh://, or git@host:path URLs are supported.");
  }
  return value;
}

function repoIdFromUrl(url: string): string {
  const pathname = /^git@/.test(url) ? url.slice(url.indexOf(":") + 1) : new URL(url).pathname;
  const segments = pathname
    .split("/")
    .map((segment) => sanitizeRepoId(segment))
    .filter(Boolean);
  const id = segments.slice(-2).join("-");
  if (!id) {
    throw new IngestError("Could not derive a repository name from that URL.");
  }
  return id;
}

function assertLooksLikeZip(data: Buffer): void {
  const hasZipSignature = data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b;
  if (!hasZipSignature) {
    throw new IngestError("The uploaded file is not a zip archive.");
  }
}

async function extractZipSafely(data: Buffer, destination: string): Promise<void> {
  try {
    const zip = new AdmZip(data);
    const root = path.resolve(destination);
    for (const entry of zip.getEntries()) {
      const target = path.resolve(root, entry.entryName);
      if (target !== root && !target.startsWith(root + path.sep)) {
        throw new IngestError("The zip archive contains unsafe paths and was rejected.");
      }
      if (entry.isDirectory) {
        await fs.mkdir(target, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, entry.getData());
    }
  } catch (error) {
    if (error instanceof IngestError) {
      throw error;
    }
    throw new IngestError("The zip archive could not be read. It may be corrupt.");
  }
}

async function findRepoRoot(staging: string): Promise<string> {
  // Both a .git directory (regular repository) and a .git file (worktree or
  // submodule checkout) satisfy the requirement.
  if (await pathExists(path.join(staging, ".git"))) {
    return staging;
  }
  const entries = await fs.readdir(staging, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "__MACOSX") {
      continue;
    }
    const candidate = path.join(staging, entry.name);
    if (await pathExists(path.join(candidate, ".git"))) {
      return candidate;
    }
  }
  throw new IngestError(
    "The archive does not contain a .git file or directory. Zip the repository folder including its .git data.",
  );
}

function translateGitError(error: unknown): IngestError {
  if (error instanceof IngestError) {
    return error;
  }
  const gitError = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: string;
    stderr?: string;
  };
  if (gitError?.code === "ENOENT") {
    return new IngestError("git is not available on the server.", 500);
  }
  if (gitError?.killed || gitError?.signal === "SIGTERM") {
    return new IngestError("The clone timed out after 5 minutes.", 504);
  }
  const detail = String(gitError?.stderr ?? "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-2)
    .join(" ")
    .slice(0, 300);
  return new IngestError(detail ? `Clone failed: ${detail}` : "The repository could not be cloned.", 502);
}
