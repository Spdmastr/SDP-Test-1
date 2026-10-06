"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel } from "./panel";

type RepoAuthor = {
  name: string;
  email: string;
  commits: number;
};

type AuthorMergeMember = {
  name: string;
  email: string;
};

type AuthorMergeGroup = {
  id: string;
  name: string;
  members: AuthorMergeMember[];
};

type AuthorsOverview = {
  repoId: string;
  mailmap: boolean;
  authors: RepoAuthor[];
  merges: AuthorMergeGroup[];
};

type Status =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function AuthorMergePanel() {
  const [repos, setRepos] = useState<string[] | null>(null);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const [overview, setOverview] = useState<AuthorsOverview | null>(null);
  const [settledRepoId, setSettledRepoId] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/repos");
        const payload: { repos?: unknown } | null = await response.json().catch(() => null);
        if (cancelled) return;
        const list = Array.isArray(payload?.repos)
          ? payload.repos.filter((entry): entry is string => typeof entry === "string")
          : [];
        setRepos(list);
        if (list.length > 0) {
          setSelectedRepoId(list[0]);
        }
      } catch {
        if (cancelled) return;
        setRepos([]);
        setStatus({ kind: "error", message: "Could not load the workspace repositories." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedRepoId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/repos/${encodeURIComponent(selectedRepoId)}/authors`);
        const payload: (AuthorsOverview & { error?: string }) | null = await response
          .json()
          .catch(() => null);
        if (cancelled) return;
        if (!response.ok || !payload || !Array.isArray(payload.authors)) {
          throw new Error(
            payload?.error ?? `The request failed with status ${response.status}.`,
          );
        }
        setOverview(payload);
      } catch (error) {
        if (cancelled) return;
        setOverview(null);
        setStatus({
          kind: "error",
          message:
            error instanceof TypeError
              ? "Could not reach the server."
              : error instanceof Error
                ? error.message
                : "Something went wrong.",
        });
      } finally {
        if (!cancelled) {
          setSettledRepoId(selectedRepoId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRepoId]);

  const currentOverview = overview && overview.repoId === selectedRepoId ? overview : null;
  const loadingAuthors = selectedRepoId !== "" && settledRepoId !== selectedRepoId;

  const groupByMember = useMemo(() => {
    const map = new Map<string, AuthorMergeGroup>();
    for (const group of currentOverview?.merges ?? []) {
      for (const member of group.members) {
        map.set(authorKey(member), group);
      }
    }
    return map;
  }, [currentOverview]);

  const commitsByAuthor = useMemo(
    () =>
      new Map(
        (currentOverview?.authors ?? []).map((author) => [authorKey(author), author.commits]),
      ),
    [currentOverview],
  );

  const ungrouped = useMemo(
    () =>
      (currentOverview?.authors ?? []).filter(
        (author) => !groupByMember.has(authorKey(author)),
      ),
    [currentOverview, groupByMember],
  );

  function toggleAuthor(key: string) {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key],
    );
  }

  function handleRepoChange(nextRepoId: string) {
    setSelectedRepoId(nextRepoId);
    setSelectedKeys([]);
    setMergeName("");
    setStatus({ kind: "idle" });
  }

  async function persistMerges(
    next: { name: string; members: AuthorMergeMember[] }[],
    successMessage: string,
  ): Promise<boolean> {
    if (!selectedRepoId) return false;
    setSaving(true);
    setStatus({ kind: "idle" });
    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(selectedRepoId)}/authors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merges: next }),
      });
      const payload: (AuthorsOverview & { error?: string }) | null = await response
        .json()
        .catch(() => null);
      if (!response.ok || !payload || !Array.isArray(payload.authors)) {
        throw new Error(payload?.error ?? `The request failed with status ${response.status}.`);
      }
      setOverview(payload);
      setStatus({ kind: "success", message: successMessage });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof TypeError
            ? "Could not reach the server."
            : error instanceof Error
              ? error.message
              : "Something went wrong.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleMerge() {
    if (!currentOverview || saving) return;
    const name = mergeName.trim();
    if (selectedKeys.length < 2) {
      setStatus({ kind: "error", message: "Select at least two authors to merge." });
      return;
    }
    if (!name) {
      setStatus({ kind: "error", message: "Give the merged author a name." });
      return;
    }
    const members = currentOverview.authors
      .filter((author) => selectedKeys.includes(authorKey(author)))
      .map((author) => ({ name: author.name, email: author.email }));
    const ok = await persistMerges(
      [
        ...currentOverview.merges.map((group) => ({ name: group.name, members: group.members })),
        { name, members },
      ],
      `Merged ${members.length} identities as "${name}".`,
    );
    if (ok) {
      setSelectedKeys([]);
      setMergeName("");
    }
  }

  function handleRemoveGroup(group: AuthorMergeGroup) {
    if (!currentOverview || saving) return;
    void persistMerges(
      currentOverview.merges
        .filter((candidate) => candidate.id !== group.id)
        .map((candidate) => ({ name: candidate.name, members: candidate.members })),
      `Removed the merge group "${group.name}".`,
    );
  }

  function groupCommitTotal(group: AuthorMergeGroup): number {
    return group.members.reduce(
      (sum, member) => sum + (commitsByAuthor.get(authorKey(member)) ?? 0),
      0,
    );
  }

  return (
    <Panel
      title="Author merging"
      description="Identities already merge through the repository's .mailmap; combine the remaining aliases by hand."
    >
      <div className="flex flex-col gap-4">
        {repos === null ? (
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600 dark:border-zinc-700 dark:border-t-emerald-500" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading the workspace…</p>
          </div>
        ) : null}

        {repos !== null && repos.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No repositories in the workspace yet — add one with the form above to manage its
            authors.
          </p>
        ) : null}

        {repos !== null && repos.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="author-merge-repo"
                className="text-xs font-medium text-zinc-500 dark:text-zinc-400"
              >
                Repository
              </label>
              <select
                id="author-merge-repo"
                value={selectedRepoId}
                onChange={(event) => handleRepoChange(event.target.value)}
                disabled={saving}
                className="h-9 min-w-56 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {repos.map((repoId) => (
                  <option key={repoId} value={repoId}>
                    {repoId}
                  </option>
                ))}
              </select>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {currentOverview ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium ${
                      currentOverview.mailmap
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        currentOverview.mailmap ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-600"
                      }`}
                    />
                    {currentOverview.mailmap ? ".mailmap applied" : "No .mailmap"}
                  </span>
                ) : null}
                {currentOverview ? (
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {currentOverview.authors.length} author
                    {currentOverview.authors.length === 1 ? "" : "s"} ·{" "}
                    {currentOverview.merges.length} merge group
                    {currentOverview.merges.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
            </div>

            {loadingAuthors ? (
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600 dark:border-zinc-700 dark:border-t-emerald-500" />
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Reading the repository&apos;s authors…
                </p>
              </div>
            ) : null}

            {!loadingAuthors && currentOverview ? (
              <>
                {currentOverview.authors.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    No commits found in this repository yet.
                  </p>
                ) : null}

                {currentOverview.merges.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {currentOverview.merges.map((group) => (
                      <li
                        key={group.id}
                        className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {group.name}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {groupCommitTotal(group).toLocaleString()} commit
                            {groupCommitTotal(group) === 1 ? "" : "s"} · {group.members.length}{" "}
                            identities merged
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveGroup(group)}
                            disabled={saving}
                            className="ml-auto text-xs font-medium text-rose-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-rose-400"
                          >
                            Unmerge
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.members.map((member) => (
                            <span
                              key={authorKey(member)}
                              className="rounded-md bg-white px-2 py-0.5 text-[0.7rem] text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
                            >
                              {member.name} &lt;{member.email}&gt;
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {currentOverview.authors.length > 0 && ungrouped.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    Every author is merged into a group above.
                  </p>
                ) : null}

                {ungrouped.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                      Unmerged authors
                    </p>
                    {ungrouped.map((author) => {
                      const key = authorKey(author);
                      const checked = selectedKeys.includes(key);
                      return (
                        <label
                          key={key}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                            checked
                              ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20"
                              : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAuthor(key)}
                            disabled={saving}
                            className="h-4 w-4 accent-emerald-600"
                          />
                          <span className="font-medium text-zinc-800 dark:text-zinc-100">
                            {author.name}
                          </span>
                          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {author.email}
                          </span>
                          <span className="ml-auto shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                            {author.commits.toLocaleString()} commit
                            {author.commits === 1 ? "" : "s"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}

                {ungrouped.length > 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={mergeName}
                      onChange={(event) => setMergeName(event.target.value)}
                      disabled={saving}
                      placeholder="Merged author name"
                      aria-label="Merged author name"
                      className="h-10 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-600"
                    />
                    <button
                      type="button"
                      onClick={() => void handleMerge()}
                      disabled={saving || selectedKeys.length < 2 || !mergeName.trim()}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? (
                        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : null}
                      {selectedKeys.length >= 2
                        ? `Merge ${selectedKeys.length} authors`
                        : "Merge selected authors"}
                    </button>
                    {selectedKeys.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelectedKeys([])}
                        disabled={saving}
                        className="h-10 shrink-0 rounded-lg px-3 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <div aria-live="polite">
          {status.kind === "success" ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                {status.message}
              </p>
              <button
                type="button"
                onClick={() => setStatus({ kind: "idle" })}
                className="mt-2 text-xs font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {status.kind === "error" ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/30">
              <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
                Author merging failed
              </p>
              <p className="mt-1 text-xs leading-5 text-rose-800 dark:text-rose-300/90">
                {status.message}
              </p>
              <button
                type="button"
                onClick={() => setStatus({ kind: "idle" })}
                className="mt-2 text-xs font-medium text-rose-700 underline-offset-2 hover:underline dark:text-rose-300"
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function authorKey(author: { name: string; email: string }): string {
  return `${author.name}\u0000${author.email}`;
}
