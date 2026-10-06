"use client";

import { useEffect, useMemo, useState } from "react";

import type { MetricsReport, ObjectMetricsRow, RepoSummary } from "@/lib/metrics";
import { useAnalysisFilters } from "./analysis-filters";
import { ActivityIcon, BookIcon, CommitIcon, FileIcon, LayersIcon } from "./icons";
import { MetricCard } from "./metric-card";
import { Panel } from "./panel";

const ROW_CAP = 50;
const AUTHOR_CAP = 100;

type MultiEntry = RepoSummary | { repoId: string; error: string };

type MultiReport = {
  selection: { from: number | null; to: number | null };
  repos: MultiEntry[];
  combined: {
    commitCount: number;
    added: number;
    removed: number;
    growth: number;
    churn: number;
    churnRate: number;
  };
};

type DashboardResult =
  | { key: string; kind: "single"; report: MetricsReport }
  | { key: string; kind: "multi"; data: MultiReport };

type MetricsQuery =
  | { state: "none" }
  | { state: "empty" }
  | { state: "ready"; key: string; url: string; kind: "single" | "multi" };

type FocusSelection = { repoId: string; path: string };

function formatInt(value: number): string {
  return value.toLocaleString("en-US");
}

function formatSigned(value: number): string {
  return value > 0 ? `+${formatInt(value)}` : formatInt(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function parseLocalDateTime(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor(parsed / 1000);
}

function displayObject(path: string, kind: "file" | "directory"): string {
  if (path === "") {
    return "/ (repository root)";
  }
  return kind === "directory" ? `${path}/` : path;
}

function growthClass(value: number): string {
  if (value > 0) {
    return "text-emerald-600 dark:text-emerald-400";
  }
  if (value < 0) {
    return "text-rose-600 dark:text-rose-400";
  }
  return "text-zinc-500 dark:text-zinc-400";
}

function ObjectMetricsTable({
  rows,
  kind,
  activePath,
  onSelect,
  emptyMessage,
}: {
  rows: ObjectMetricsRow[];
  kind: "file" | "directory";
  activePath: string | null;
  onSelect: (path: string) => void;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>;
  }
  const visible = rows.slice(0, ROW_CAP);
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs tracking-wider text-zinc-500 uppercase dark:border-zinc-800 dark:text-zinc-400">
              <th className="py-2 pr-4 font-medium">Path</th>
              <th className="py-2 pr-4 text-right font-medium">Added</th>
              <th className="py-2 pr-4 text-right font-medium">Removed</th>
              <th className="py-2 pr-4 text-right font-medium">Growth</th>
              <th className="py-2 pr-4 text-right font-medium">Churn</th>
              <th className="py-2 pr-4 text-right font-medium">Mods</th>
              <th className="py-2 pr-4 text-right font-medium">Mod. freq.</th>
              <th className="py-2 text-right font-medium">Churn rate</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const active = row.path === activePath;
              return (
                <tr
                  key={row.path}
                  className={`border-b border-zinc-100 last:border-0 dark:border-zinc-800/60 ${
                    active ? "bg-emerald-500/5" : ""
                  }`}
                >
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      onClick={() => onSelect(row.path)}
                      title={displayObject(row.path, kind)}
                      className={`block max-w-[24rem] truncate text-left font-mono text-xs transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 ${
                        active
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-700 dark:text-zinc-200"
                      }`}
                    >
                      {displayObject(row.path, kind)}
                    </button>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatInt(row.added)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatInt(row.removed)}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${growthClass(row.growth)}`}>
                    {formatSigned(row.growth)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatInt(row.churn)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatInt(row.modifications)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatPercent(row.modificationFrequency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{row.churnRate.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > ROW_CAP ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Showing top {ROW_CAP} of {formatInt(rows.length)}{" "}
          {kind === "file" ? "files" : "directories"} ranked by churn.
        </p>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}

export function MetricsDashboard() {
  const filters = useAnalysisFilters();
  const [focus, setFocus] = useState<FocusSelection | null>(null);
  const [result, setResult] = useState<DashboardResult | null>(null);
  const [status, setStatus] = useState<{ key: string; message: string } | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);

  const query = useMemo<MetricsQuery>(() => {
    const selectedRepos = filters.selectedRepos;
    if (selectedRepos.length === 0) {
      return { state: "none" };
    }
    const params = new URLSearchParams();
    if (filters.commitMode === "range") {
      const from = parseLocalDateTime(filters.fromInput);
      const to = parseLocalDateTime(filters.toInput);
      if (from !== null) {
        params.set("from", String(from));
      }
      if (to !== null) {
        params.set("to", String(to));
      }
    }
    if (selectedRepos.length === 1) {
      const repoId = selectedRepos[0];
      if (filters.commitMode === "commits") {
        if (filters.hashes.length === 0) {
          return { state: "empty" };
        }
        params.set("commits", filters.hashes.join(","));
      }
      for (const author of filters.selectedAuthors) {
        params.append("author", author);
      }
      if (filters.pathFilter !== "") {
        params.set("path", filters.pathFilter);
      }
      const activeFocus = focus && focus.repoId === repoId ? focus.path : null;
      if (activeFocus !== null) {
        params.set("object", activeFocus);
      }
      const queryString = params.toString();
      return {
        state: "ready",
        key: `${repoId}\x00${queryString}`,
        url: `/api/repos/${encodeURIComponent(repoId)}/metrics${
          queryString === "" ? "" : `?${queryString}`
        }`,
        kind: "single",
      };
    }
    for (const repoId of selectedRepos) {
      params.append("repo", repoId);
    }
    const queryString = params.toString();
    return {
      state: "ready",
      key: `multi\x00${queryString}`,
      url: `/api/metrics?${queryString}`,
      kind: "multi",
    };
  }, [filters, focus]);

  useEffect(() => {
    if (query.state !== "ready") {
      return;
    }
    const { key, url, kind } = query;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url);
        const payload = await response.json();
        if (cancelled) {
          return;
        }
        if (!response.ok) {
          setStatus({
            key,
            message:
              typeof payload?.error === "string"
                ? payload.error
                : `Request failed with status ${response.status}.`,
          });
        } else {
          setResult(
            kind === "single"
              ? { key, kind: "single", report: payload as MetricsReport }
              : { key, kind: "multi", data: payload as MultiReport },
          );
          setStatus(null);
        }
      } catch {
        if (!cancelled) {
          setStatus({ key, message: "Could not reach the metrics service." });
        }
      } finally {
        if (!cancelled) {
          setSettledKey(key);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const loading = query.state === "ready" && settledKey !== query.key;
  const currentResult = query.state === "ready" && result?.key === query.key ? result : null;
  const statusMessage = query.state === "ready" && status?.key === query.key ? status.message : null;
  const activeFocusPath =
    focus && filters.singleRepo !== null && focus.repoId === filters.singleRepo
      ? focus.path
      : null;

  function toggleFocus(path: string) {
    const repoId = filters.singleRepo;
    if (repoId === null) {
      return;
    }
    setFocus((current) =>
      current && current.repoId === repoId && current.path === path
        ? null
        : { repoId, path },
    );
  }

  function renderSingle(report: MetricsReport) {
    const repository = report.repository;
    const scopeParts = [
      `${formatInt(report.commitCount)} commit${report.commitCount === 1 ? "" : "s"} in scope`,
      `ref ${report.ref}`,
    ];
    if (report.selection.authors && report.selection.authors.length > 0) {
      scopeParts.push(
        report.selection.authors.length === 1
          ? `author ${report.selection.authors[0]}`
          : `${report.selection.authors.length} authors`,
      );
    }
    if (report.selection.path) {
      scopeParts.push(`path ${report.selection.path}`);
    }

    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-700 dark:text-zinc-200">{report.repoId}</span>
            {" · "}
            {scopeParts.join(" · ")}
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              label="Added lines"
              value={formatInt(repository.added)}
              hint="Lines introduced in scope"
              icon={<FileIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Removed lines"
              value={formatInt(repository.removed)}
              hint="Lines deleted in scope"
              icon={<FileIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Growth"
              value={formatSigned(repository.growth)}
              hint="Added minus removed"
              icon={<CommitIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Churn"
              value={formatInt(repository.churn)}
              hint="Added plus removed"
              icon={<ActivityIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Modifications"
              value={formatInt(repository.modifications)}
              hint={`Modification frequency ${formatPercent(repository.modificationFrequency)}`}
              icon={<CommitIcon className="h-5 w-5" />}
            />
            <MetricCard
              label="Churn rate"
              value={repository.churnRate.toFixed(2)}
              hint="Lines changed per commit"
              icon={<LayersIcon className="h-5 w-5" />}
            />
          </div>
        </div>

        {report.object ? (
          <Panel
            title="Author ownership"
            description={`Who owns the lines in ${displayObject(
              report.object.path,
              report.object.kind,
            )}, ranked by churn.`}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat label="Added" value={formatInt(report.object.metrics.added)} />
                  <MiniStat label="Removed" value={formatInt(report.object.metrics.removed)} />
                  <MiniStat label="Churn" value={formatInt(report.object.metrics.churn)} />
                  <MiniStat
                    label="Modifications"
                    value={formatInt(report.object.metrics.modifications)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                >
                  Clear object selection
                </button>
              </div>
              {report.object.authors.length === 0 ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No author activity for this object in scope.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-xs tracking-wider text-zinc-500 uppercase dark:border-zinc-800 dark:text-zinc-400">
                        <th className="py-2 pr-4 font-medium">Author</th>
                        <th className="py-2 pr-4 font-medium">Email</th>
                        <th className="py-2 pr-4 text-right font-medium">Modifications</th>
                        <th className="py-2 pr-4 text-right font-medium">Churn</th>
                        <th className="py-2 text-right font-medium">Ownership</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.object.authors.map((author) => (
                        <tr
                          key={`${author.name}\x00${author.email}`}
                          className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                        >
                          <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-100">
                            {author.name}
                          </td>
                          <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">
                            {author.email}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatInt(author.modifications)}
                          </td>
                          <td className="py-2 pr-4 text-right tabular-nums">
                            {formatInt(author.churn)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatPercent(author.ownership)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Panel>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="File metrics"
            description="Per-file lines added, removed, growth, churn, and modification activity."
          >
            <ObjectMetricsTable
              rows={report.files}
              kind="file"
              activePath={activeFocusPath}
              onSelect={toggleFocus}
              emptyMessage="No file changes in this scope."
            />
          </Panel>
          <Panel
            title="Directory metrics"
            description="File deltas rolled up over each ancestor directory."
          >
            <ObjectMetricsTable
              rows={report.directories}
              kind="directory"
              activePath={activeFocusPath}
              onSelect={toggleFocus}
              emptyMessage="No directory changes in this scope."
            />
          </Panel>
        </div>

        <Panel
          title="Author metrics"
          description="Commit activity and line ownership per author, ranked by churn."
        >
          {report.authors.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No authors in this scope.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs tracking-wider text-zinc-500 uppercase dark:border-zinc-800 dark:text-zinc-400">
                    <th className="py-2 pr-4 font-medium">Author</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 text-right font-medium">Commits</th>
                    <th className="py-2 pr-4 text-right font-medium">Modifications</th>
                    <th className="py-2 pr-4 text-right font-medium">Added</th>
                    <th className="py-2 pr-4 text-right font-medium">Removed</th>
                    <th className="py-2 pr-4 text-right font-medium">Churn</th>
                    <th className="py-2 text-right font-medium">Ownership</th>
                  </tr>
                </thead>
                <tbody>
                  {report.authors.slice(0, AUTHOR_CAP).map((author) => (
                    <tr
                      key={`${author.name}\x00${author.email}`}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                    >
                      <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-100">
                        {author.name}
                      </td>
                      <td className="py-2 pr-4 text-zinc-500 dark:text-zinc-400">
                        {author.email}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(author.commits)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(author.modifications)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(author.added)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(author.removed)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(author.churn)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatPercent(author.ownership)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.authors.length > AUTHOR_CAP ? (
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                  Showing top {AUTHOR_CAP} of {formatInt(report.authors.length)} authors ranked by
                  churn.
                </p>
              ) : null}
            </div>
          )}
        </Panel>

        <p className="text-xs leading-5 text-zinc-400 dark:text-zinc-500">
          Metrics follow the project specification: merge commits are excluded from the analyzed
          history, rename detection runs at a 50% similarity threshold (renames alone leave metrics
          unchanged; edits are attributed to the new path), and binary files are not measured.
        </p>
      </div>
    );
  }

  function renderMulti(data: MultiReport) {
    const okCount = data.repos.filter((entry) => !("error" in entry)).length;
    return (
      <div className="flex flex-col gap-6">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Combined across {formatInt(okCount)} {okCount === 1 ? "repository" : "repositories"}
          {" · "}
          {formatInt(data.combined.commitCount)} commits in scope
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Repositories"
            value={formatInt(okCount)}
            hint="Selected in scope"
            icon={<BookIcon className="h-5 w-5" />}
          />
          <MetricCard
            label="Commits"
            value={formatInt(data.combined.commitCount)}
            hint="Non-merge commits"
            icon={<CommitIcon className="h-5 w-5" />}
          />
          <MetricCard
            label="Added lines"
            value={formatInt(data.combined.added)}
            hint="Lines introduced in scope"
            icon={<FileIcon className="h-5 w-5" />}
          />
          <MetricCard
            label="Removed lines"
            value={formatInt(data.combined.removed)}
            hint="Lines deleted in scope"
            icon={<FileIcon className="h-5 w-5" />}
          />
          <MetricCard
            label="Growth"
            value={formatSigned(data.combined.growth)}
            hint="Added minus removed"
            icon={<CommitIcon className="h-5 w-5" />}
          />
          <MetricCard
            label="Churn"
            value={formatInt(data.combined.churn)}
            hint={`${data.combined.churnRate.toFixed(2)} lines changed per commit`}
            icon={<ActivityIcon className="h-5 w-5" />}
          />
        </div>

        <Panel
          title="Repository comparison"
          description="Repository-level metrics per selected repository, plus the combined totals."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs tracking-wider text-zinc-500 uppercase dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-medium">Repository</th>
                  <th className="py-2 pr-4 text-right font-medium">Commits</th>
                  <th className="py-2 pr-4 text-right font-medium">Authors</th>
                  <th className="py-2 pr-4 text-right font-medium">Files</th>
                  <th className="py-2 pr-4 text-right font-medium">Dirs</th>
                  <th className="py-2 pr-4 text-right font-medium">Added</th>
                  <th className="py-2 pr-4 text-right font-medium">Removed</th>
                  <th className="py-2 pr-4 text-right font-medium">Growth</th>
                  <th className="py-2 pr-4 text-right font-medium">Churn</th>
                  <th className="py-2 pr-4 text-right font-medium">Mods</th>
                  <th className="py-2 pr-4 text-right font-medium">Mod. freq.</th>
                  <th className="py-2 text-right font-medium">Churn rate</th>
                </tr>
              </thead>
              <tbody>
                {data.repos.map((entry) =>
                  "error" in entry ? (
                    <tr
                      key={entry.repoId}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                    >
                      <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-100">
                        {entry.repoId}
                      </td>
                      <td
                        colSpan={11}
                        className="py-2 text-rose-600 dark:text-rose-400"
                      >
                        {entry.error}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={entry.repoId}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"
                    >
                      <td className="py-2 pr-4 font-medium text-zinc-800 dark:text-zinc-100">
                        {entry.repoId}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.commitCount)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.authorCount)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.fileCount)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.directoryCount)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.repository.added)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.repository.removed)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right tabular-nums ${growthClass(
                          entry.repository.growth,
                        )}`}
                      >
                        {formatSigned(entry.repository.growth)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.repository.churn)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatInt(entry.repository.modifications)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatPercent(entry.repository.modificationFrequency)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {entry.repository.churnRate.toFixed(2)}
                      </td>
                    </tr>
                  ),
                )}
                <tr className="border-t-2 border-zinc-200 bg-zinc-50 font-medium dark:border-zinc-700 dark:bg-zinc-950/60">
                  <td className="py-2 pr-4 text-zinc-900 dark:text-zinc-100">All selected</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatInt(data.combined.commitCount)}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-400 dark:text-zinc-500">—</td>
                  <td className="py-2 pr-4 text-right text-zinc-400 dark:text-zinc-500">—</td>
                  <td className="py-2 pr-4 text-right text-zinc-400 dark:text-zinc-500">—</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatInt(data.combined.added)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatInt(data.combined.removed)}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right tabular-nums ${growthClass(
                      data.combined.growth,
                    )}`}
                  >
                    {formatSigned(data.combined.growth)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {formatInt(data.combined.churn)}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-400 dark:text-zinc-500">—</td>
                  <td className="py-2 pr-4 text-right text-zinc-400 dark:text-zinc-500">—</td>
                  <td className="py-2 text-right tabular-nums">
                    {data.combined.churnRate.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            Author counts are not summed across repositories. Select a single repository in the
            Analysis scope above for file, directory, author, and ownership breakdowns.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {query.state === "none" ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            No repositories selected
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            Choose one repository for full file, directory, and author breakdowns, or several to
            compare them in the Analysis scope above.
          </p>
        </div>
      ) : null}

      {query.state === "empty" ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center dark:border-zinc-700">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            No commits selected
          </p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
            Pick at least one commit under &ldquo;Selected commits&rdquo; in the Analysis scope
            above.
          </p>
        </div>
      ) : null}

      {statusMessage ? (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 dark:border-rose-900/60 dark:bg-rose-950/40">
          <p className="text-sm text-rose-700 dark:text-rose-300">{statusMessage}</p>
          <button
            type="button"
            onClick={() => setStatus(null)}
            className="shrink-0 text-xs font-medium text-rose-600 underline-offset-2 hover:underline dark:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {query.state === "ready" && loading && !currentResult ? (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-500 dark:border-zinc-700 dark:border-t-emerald-500" />
          Computing metrics…
        </div>
      ) : null}

      {currentResult?.kind === "single" ? renderSingle(currentResult.report) : null}
      {currentResult?.kind === "multi" ? renderMulti(currentResult.data) : null}
    </div>
  );
}
