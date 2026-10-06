import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { GIT_ENV, IngestError } from "./ingest";
import { ensureMergesDir, mergesFilePath, pathExists, repoPath } from "./workspace";

const execFileAsync = promisify(execFile);

const AUTHOR_LOG_TIMEOUT_MS = 60 * 1000;
const AUTHOR_LOG_MAX_BUFFER = 64 * 1024 * 1024;
const MAX_MERGE_GROUPS = 500;
const MAX_GROUP_MEMBERS = 200;

export type RepoAuthor = {
  name: string;
  email: string;
  commits: number;
};

export type AuthorMergeMember = {
  name: string;
  email: string;
};

export type AuthorMergeGroup = {
  id: string;
  name: string;
  members: AuthorMergeMember[];
};

export type AuthorsOverview = {
  repoId: string;
  mailmap: boolean;
  authors: RepoAuthor[];
  merges: AuthorMergeGroup[];
};

export async function getAuthorsOverview(repoId: string): Promise<AuthorsOverview> {
  const repositoryPath = repoPath(repoId);
  const [authors, merges, mailmap] = await Promise.all([
    listRepoAuthors(repositoryPath),
    loadMerges(repoId),
    pathExists(path.join(repositoryPath, ".mailmap")),
  ]);
  return { repoId, mailmap, authors, merges };
}

export async function listRepoAuthors(repositoryPath: string): Promise<RepoAuthor[]> {
  let stdout: string;
  try {
    // %aN/%aE are the mailmap-applied name and email, so identities merge the
    // same way git canonicalises them. Merge commits are excluded to match the
    // non-merge commit set that metrics are computed over.
    ({ stdout } = await execFileAsync(
      "git",
      [
        "-C",
        repositoryPath,
        "log",
        "--all",
        "--no-merges",
        "--use-mailmap",
        "--format=%aN%x00%aE",
      ],
      { env: GIT_ENV, timeout: AUTHOR_LOG_TIMEOUT_MS, maxBuffer: AUTHOR_LOG_MAX_BUFFER },
    ));
  } catch (error) {
    if (isEmptyRepository(error)) {
      return [];
    }
    throw new IngestError("The repository's commit history could not be read.", 500);
  }

  const authors = new Map<string, RepoAuthor>();
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf("\x00");
    if (separator === -1) continue;
    const name = line.slice(0, separator);
    const email = line.slice(separator + 1);
    const key = authorKey({ name, email });
    const existing = authors.get(key);
    if (existing) {
      existing.commits += 1;
    } else {
      authors.set(key, { name, email, commits: 1 });
    }
  }

  return [...authors.values()].sort(
    (a, b) => b.commits - a.commits || a.name.localeCompare(b.name),
  );
}

export function parseAuthorMerges(input: unknown, knownAuthors: RepoAuthor[]): AuthorMergeGroup[] {
  if (
    typeof input !== "object" ||
    input === null ||
    !Array.isArray((input as { merges?: unknown }).merges)
  ) {
    throw new IngestError('The body must be a JSON object with a "merges" array.', 400);
  }

  const rawMerges = (input as { merges: unknown[] }).merges;
  if (rawMerges.length > MAX_MERGE_GROUPS) {
    throw new IngestError(`At most ${MAX_MERGE_GROUPS} merge groups are supported.`, 400);
  }

  const knownAuthorKeys = new Set(knownAuthors.map((author) => authorKey(author)));
  const claimed = new Set<string>();
  const groups: AuthorMergeGroup[] = [];

  rawMerges.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new IngestError(`Merge group ${index + 1} is not an object.`, 400);
    }
    const group = entry as Record<string, unknown>;

    const name = typeof group.name === "string" ? group.name.trim() : "";
    if (!name || name.length > 120) {
      throw new IngestError(
        `Merge group ${index + 1} needs a merged author name (at most 120 characters).`,
        400,
      );
    }

    const rawMembers = group.members;
    if (
      !Array.isArray(rawMembers) ||
      rawMembers.length === 0 ||
      rawMembers.length > MAX_GROUP_MEMBERS
    ) {
      throw new IngestError(
        `Merge group "${name}" needs between 1 and ${MAX_GROUP_MEMBERS} members.`,
        400,
      );
    }

    const members: AuthorMergeMember[] = [];
    for (const rawMember of rawMembers) {
      if (typeof rawMember !== "object" || rawMember === null) {
        throw new IngestError(`Merge group "${name}" contains an invalid member.`, 400);
      }
      const member = rawMember as Record<string, unknown>;
      const memberName = typeof member.name === "string" ? member.name.trim() : "";
      const memberEmail = typeof member.email === "string" ? member.email.trim() : "";
      const key = authorKey({ name: memberName, email: memberEmail });
      if (!memberName || !memberEmail || !knownAuthorKeys.has(key)) {
        throw new IngestError(
          `"${memberName || "?"} <${memberEmail || "?"}>" is not an author of this repository.`,
          400,
        );
      }
      if (claimed.has(key)) {
        throw new IngestError(
          `"${memberName} <${memberEmail}>" is listed in more than one merge group.`,
          400,
        );
      }
      claimed.add(key);
      members.push({ name: memberName, email: memberEmail });
    }

    groups.push({ id: randomUUID(), name, members });
  });

  return groups;
}

export async function loadMerges(repoId: string): Promise<AuthorMergeGroup[]> {
  let raw: string;
  try {
    raw = await fs.readFile(mergesFilePath(repoId), "utf8");
  } catch {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { merges?: unknown };
    return sanitizeStoredMerges(parsed.merges);
  } catch {
    return [];
  }
}

export async function saveMerges(repoId: string, merges: AuthorMergeGroup[]): Promise<void> {
  await ensureMergesDir();
  const target = mergesFilePath(repoId);
  const temporary = `${target}.tmp-${randomUUID()}`;
  await fs.writeFile(temporary, `${JSON.stringify({ repoId, merges }, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

function authorKey(author: { name: string; email: string }): string {
  return `${author.name}\x00${author.email}`;
}

function isEmptyRepository(error: unknown): boolean {
  const stderr = String((error as { stderr?: unknown })?.stderr ?? "");
  return (
    stderr.includes("does not have any commits yet") || stderr.includes("bad default revision")
  );
}

function sanitizeStoredMerges(value: unknown): AuthorMergeGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const groups: AuthorMergeGroup[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const group = entry as Record<string, unknown>;
    const name = typeof group.name === "string" ? group.name.trim() : "";
    const members = sanitizeStoredMembers(group.members);
    if (!name || members.length === 0) continue;
    groups.push({
      id: typeof group.id === "string" && group.id ? group.id : randomUUID(),
      name,
      members,
    });
  }
  return groups;
}

function sanitizeStoredMembers(value: unknown): AuthorMergeMember[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const members: AuthorMergeMember[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const member = entry as Record<string, unknown>;
    const name = typeof member.name === "string" ? member.name.trim() : "";
    const email = typeof member.email === "string" ? member.email.trim() : "";
    if (!name || !email) continue;
    members.push({ name, email });
  }
  return members;
}
