import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const WORKSPACE_ROOT = path.join(process.cwd(), ".data", "repos");
export const MERGES_ROOT = path.join(process.cwd(), ".data", "merges");

export async function ensureWorkspace(): Promise<void> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
}

export async function ensureMergesDir(): Promise<void> {
  await fs.mkdir(MERGES_ROOT, { recursive: true });
}

export function mergesFilePath(id: string): string {
  return path.join(MERGES_ROOT, `${id}.json`);
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeRepoId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+/, "")
    .replace(/[-._]+$/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function createStagingPath(): string {
  return path.join(WORKSPACE_ROOT, `.staging-${randomUUID()}`);
}

export function repoPath(id: string): string {
  return path.join(WORKSPACE_ROOT, id);
}

export async function finalizeStagedRepo(stagingPath: string, id: string): Promise<void> {
  await fs.rename(stagingPath, repoPath(id));
}

export async function removeQuietly(target: string): Promise<void> {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; nothing useful to do if it fails.
  }
}

export async function listRepos(): Promise<string[]> {
  await ensureWorkspace();
  const entries = await fs.readdir(WORKSPACE_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}
