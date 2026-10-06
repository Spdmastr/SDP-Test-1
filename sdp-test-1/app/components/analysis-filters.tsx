"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CommitScopeMode = "all" | "range" | "commits";

export type CommitListItem = {
  hash: string;
  shortHash: string;
  author: string;
  timestamp: number;
  subject: string;
};

type FiltersContextValue = {
  repos: string[] | null;
  selectedRepos: string[];
  singleRepo: string | null;
  toggleRepo: (id: string) => void;
  selectAllRepos: () => void;
  clearRepos: () => void;

  authorOptions: string[];
  authorsLoading: boolean;
  selectedAuthors: string[];
  toggleAuthor: (name: string) => void;
  selectAllAuthors: () => void;
  clearAuthors: () => void;

  pathDraft: string;
  setPathDraft: (value: string) => void;
  pathFilter: string;
  applyPath: () => void;
  clearPath: () => void;

  commitMode: CommitScopeMode;
  setCommitMode: (mode: CommitScopeMode) => void;
  fromInput: string;
  setFromInput: (value: string) => void;
  toInput: string;
  setToInput: (value: string) => void;

  hashes: string[];
  toggleHash: (hash: string) => void;
  selectAllShown: () => void;
  clearHashes: () => void;

  commitList: CommitListItem[];
  pickerLoading: boolean;

  resetAll: () => void;
};

const FiltersContext = createContext<FiltersContextValue | null>(null);

export function useAnalysisFilters(): FiltersContextValue {
  const value = useContext(FiltersContext);
  if (!value) {
    throw new Error("useAnalysisFilters must be used inside FiltersProvider");
  }
  return value;
}

function normalizePath(value: string): string {
  let path = value.trim().replace(/^\.\//, "");
  path = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return path;
}

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<string[] | null>(null);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [authorOptionsState, setAuthorOptionsState] = useState<{
    repoId: string;
    names: string[];
  } | null>(null);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [pathDraft, setPathDraft] = useState("");
  const [pathFilter, setPathFilter] = useState("");
  const [commitMode, setCommitMode] = useState<CommitScopeMode>("all");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [hashes, setHashes] = useState<string[]>([]);
  const [commitListState, setCommitListState] = useState<{
    repoId: string;
    items: CommitListItem[];
  } | null>(null);

  const singleRepo = selectedRepos.length === 1 ? selectedRepos[0] : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/repos");
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        const list: string[] = Array.isArray(payload?.repos) ? payload.repos : [];
        setRepos(list);
        setSelectedRepos((current) => (current.length === 0 ? list.slice(0, 1) : current));
      } catch {
        if (!cancelled) {
          setRepos([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Author filters are offered as canonical (merge-resolved) display names so
  // that the filter matches the author attribution used by the metrics engine.
  useEffect(() => {
    if (!singleRepo) {
      return;
    }
    const repoId = singleRepo;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/repos/${encodeURIComponent(repoId)}/authors`);
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setAuthorOptionsState({ repoId, names: [] });
          return;
        }
        const rawAuthors: { name?: unknown; email?: unknown }[] = Array.isArray(payload?.authors)
          ? payload.authors
          : [];
        const groups: { name?: unknown; members?: { name?: unknown; email?: unknown }[] }[] =
          Array.isArray(payload?.merges) ? payload.merges : [];
        const claimed = new Set<string>();
        const names = new Set<string>();
        for (const group of groups) {
          if (typeof group.name === "string" && group.name !== "") {
            names.add(group.name);
          }
          for (const member of group.members ?? []) {
            if (typeof member.name === "string" && typeof member.email === "string") {
              claimed.add(`${member.name}\x00${member.email}`);
            }
          }
        }
        for (const author of rawAuthors) {
          if (
            typeof author.name === "string" &&
            typeof author.email === "string" &&
            !claimed.has(`${author.name}\x00${author.email}`)
          ) {
            names.add(author.name);
          }
        }
        setAuthorOptionsState({ repoId, names: [...names].sort((a, b) => a.localeCompare(b)) });
      } catch {
        if (!cancelled) {
          setAuthorOptionsState({ repoId, names: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [singleRepo]);

  useEffect(() => {
    if (commitMode !== "commits" || !singleRepo || commitListState?.repoId === singleRepo) {
      return;
    }
    const repoId = singleRepo;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/repos/${encodeURIComponent(repoId)}/commits?limit=100`);
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        setCommitListState({
          repoId,
          items: response.ok && Array.isArray(payload?.commits) ? payload.commits : [],
        });
      } catch {
        if (!cancelled) {
          setCommitListState({ repoId, items: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commitMode, singleRepo, commitListState]);

  // Author, path, and hand-picked commit scopes only exist for a single
  // repository, so they are dropped whenever the selection changes identity.
  function applyRepoSelection(next: string[]) {
    const previousSingle = selectedRepos.length === 1 ? selectedRepos[0] : null;
    const nextSingle = next.length === 1 ? next[0] : null;
    setSelectedRepos(next);
    if (nextSingle !== previousSingle) {
      setSelectedAuthors([]);
      setPathDraft("");
      setPathFilter("");
      setHashes([]);
    }
    if (next.length > 1 && commitMode === "commits") {
      setCommitMode("all");
    }
  }

  function toggleRepo(id: string) {
    applyRepoSelection(
      selectedRepos.includes(id)
        ? selectedRepos.filter((repo) => repo !== id)
        : [...selectedRepos, id],
    );
  }

  function selectAllRepos() {
    applyRepoSelection(repos ?? []);
  }

  function clearRepos() {
    applyRepoSelection([]);
  }

  function toggleAuthor(name: string) {
    setSelectedAuthors((current) =>
      current.includes(name) ? current.filter((author) => author !== name) : [...current, name],
    );
  }

  function selectAllAuthors() {
    setSelectedAuthors(authorOptions);
  }

  function clearAuthors() {
    setSelectedAuthors([]);
  }

  function applyPath() {
    const next = normalizePath(pathDraft);
    setPathDraft(next);
    setPathFilter(next);
  }

  function clearPath() {
    setPathDraft("");
    setPathFilter("");
  }

  function toggleHash(hash: string) {
    setHashes((current) =>
      current.includes(hash) ? current.filter((item) => item !== hash) : [...current, hash],
    );
  }

  function selectAllShown() {
    const list =
      commitListState && singleRepo && commitListState.repoId === singleRepo
        ? commitListState.items
        : [];
    setHashes(list.slice(0, 100).map((item) => item.hash));
  }

  function clearHashes() {
    setHashes([]);
  }

  function resetAll() {
    applyRepoSelection((repos ?? []).slice(0, 1));
    setSelectedAuthors([]);
    setPathDraft("");
    setPathFilter("");
    setHashes([]);
    setFromInput("");
    setToInput("");
    setCommitMode("all");
  }

  const authorOptions =
    authorOptionsState && singleRepo !== null && authorOptionsState.repoId === singleRepo
      ? authorOptionsState.names
      : [];
  const authorsLoading = singleRepo !== null && authorOptionsState?.repoId !== singleRepo;
  const commitList =
    commitListState && singleRepo !== null && commitListState.repoId === singleRepo
      ? commitListState.items
      : [];
  const pickerLoading =
    commitMode === "commits" && singleRepo !== null && commitListState?.repoId !== singleRepo;

  return (
    <FiltersContext.Provider
      value={{
        repos,
        selectedRepos,
        singleRepo,
        toggleRepo,
        selectAllRepos,
        clearRepos,
        authorOptions,
        authorsLoading,
        selectedAuthors,
        toggleAuthor,
        selectAllAuthors,
        clearAuthors,
        pathDraft,
        setPathDraft,
        pathFilter,
        applyPath,
        clearPath,
        commitMode,
        setCommitMode,
        fromInput,
        setFromInput,
        toInput,
        setToInput,
        hashes,
        toggleHash,
        selectAllShown,
        clearHashes,
        commitList,
        pickerLoading,
        resetAll,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
}
