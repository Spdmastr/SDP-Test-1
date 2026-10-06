"use client";

import { useState, type ReactNode } from "react";

import { useAnalysisFilters, type CommitScopeMode } from "./analysis-filters";
import { BookIcon, ChevronDownIcon, FolderIcon, UsersIcon } from "./icons";
import { Panel } from "./panel";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600";

function FilterField({
  label,
  caption,
  children,
}: {
  label: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
        {label}
      </p>
      {children}
      <p className="text-xs leading-5 text-zinc-400 dark:text-zinc-500">{caption}</p>
    </div>
  );
}

function MultiSelect({
  icon,
  options,
  selected,
  disabled = false,
  loading = false,
  emptySummary,
  listLabel,
  onToggle,
  onSelectAll,
  onClear,
}: {
  icon: ReactNode;
  options: string[];
  selected: string[];
  disabled?: boolean;
  loading?: boolean;
  emptySummary: string;
  listLabel: string;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const summary = loading
    ? "Loading…"
    : selected.length === 0
      ? emptySummary
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;
  const expanded = open && !disabled && !loading;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled || loading}
        aria-expanded={expanded}
        className="flex h-11 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
      >
        <span className="shrink-0 text-zinc-400 dark:text-zinc-500">{icon}</span>
        <span className="flex-1 truncate">{summary}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
            <span className="text-xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
              {listLabel}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onSelectAll}
                className="rounded px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded px-2 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Clear
              </button>
            </span>
          </div>
          <ul className="max-h-44 overflow-y-auto p-1.5">
            {options.length === 0 ? (
              <li className="px-2 py-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                None available.
              </li>
            ) : (
              options.map((option) => (
                <li key={option}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      checked={selected.includes(option)}
                      onChange={() => onToggle(option)}
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <span className="truncate">{option}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function daysAgoInput(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const COMMIT_MODES: { mode: CommitScopeMode; label: string }[] = [
  { mode: "all", label: "All history" },
  { mode: "range", label: "Time range" },
  { mode: "commits", label: "Selected commits" },
];

export function FilterBar() {
  const filters = useAnalysisFilters();
  const multi = filters.selectedRepos.length > 1;
  const single = filters.singleRepo !== null;

  return (
    <Panel
      title="Analysis scope"
      description="Narrow the analysis by repository, author, path, or commit selection."
      bodyClassName="p-0"
    >
      <div className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
        <FilterField label="Repositories" caption="Select one or more repositories.">
          <MultiSelect
            icon={<BookIcon className="h-4 w-4" />}
            listLabel="Repositories"
            options={filters.repos ?? []}
            selected={filters.selectedRepos}
            loading={filters.repos === null}
            emptySummary="No repositories selected"
            onToggle={filters.toggleRepo}
            onSelectAll={filters.selectAllRepos}
            onClear={filters.clearRepos}
          />
        </FilterField>

        <FilterField
          label="Authors"
          caption={
            multi
              ? "Author filters apply to a single repository."
              : "Select one or more authors, or leave empty for all."
          }
        >
          <MultiSelect
            icon={<UsersIcon className="h-4 w-4" />}
            listLabel="Authors"
            options={filters.authorOptions}
            selected={filters.selectedAuthors}
            disabled={!single}
            loading={filters.authorsLoading}
            emptySummary="All authors"
            onToggle={filters.toggleAuthor}
            onSelectAll={filters.selectAllAuthors}
            onClear={filters.clearAuthors}
          />
        </FilterField>

        <FilterField
          label="File or directory"
          caption={
            multi
              ? "Path filters apply to a single repository."
              : "Limit all metrics to this file or folder."
          }
        >
          {filters.pathFilter !== "" ? (
            <div className="flex items-center gap-2">
              <span className="flex h-11 flex-1 items-center gap-2 truncate rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 text-sm text-zinc-900 dark:text-zinc-100">
                <FolderIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="truncate">{filters.pathFilter}</span>
              </span>
              <button
                type="button"
                onClick={filters.clearPath}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <FolderIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                <input
                  type="text"
                  value={filters.pathDraft}
                  onChange={(event) => filters.setPathDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      filters.applyPath();
                    }
                  }}
                  disabled={!single}
                  placeholder={single ? "e.g. src/components" : "Select one repository"}
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="File or directory"
                  className={`${INPUT_CLASS} pr-3 pl-9`}
                />
              </div>
              <button
                type="button"
                onClick={filters.applyPath}
                disabled={!single || filters.pathDraft.trim() === ""}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Apply
              </button>
            </div>
          )}
        </FilterField>

        <FilterField
          label="Commits"
          caption="Whole history, a time range, or hand-picked commits."
        >
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
              {COMMIT_MODES.map(({ mode, label }) => {
                const active = filters.commitMode === mode;
                const disabled = mode === "commits" && !single;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => filters.setCommitMode(mode)}
                    disabled={disabled}
                    aria-pressed={active}
                    className={`flex h-7 items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {filters.commitMode === "range" ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "Last 30 days", days: 30 },
                    { label: "Last 90 days", days: 90 },
                    { label: "Last year", days: 365 },
                  ].map(({ label, days }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        filters.setFromInput(daysAgoInput(days));
                        filters.setToInput("");
                      }}
                      className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="datetime-local"
                    value={filters.fromInput}
                    onChange={(event) => filters.setFromInput(event.target.value)}
                    aria-label="From"
                    className={INPUT_CLASS}
                  />
                  <input
                    type="datetime-local"
                    value={filters.toInput}
                    onChange={(event) => filters.setToInput(event.target.value)}
                    aria-label="To"
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            ) : null}

            {filters.commitMode === "commits" ? (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
                  <span className="text-xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                    {filters.hashes.length} selected
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={filters.selectAllShown}
                      className="rounded px-2 py-0.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={filters.clearHashes}
                      className="rounded px-2 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Clear
                    </button>
                  </span>
                </div>
                <ul className="max-h-44 overflow-y-auto p-1.5">
                  {filters.pickerLoading ? (
                    <li className="px-2 py-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                      Loading commits…
                    </li>
                  ) : filters.commitList.length === 0 ? (
                    <li className="px-2 py-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                      No commits available.
                    </li>
                  ) : (
                    filters.commitList.map((commit) => (
                      <li key={commit.hash}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                          <input
                            type="checkbox"
                            checked={filters.hashes.includes(commit.hash)}
                            onChange={() => filters.toggleHash(commit.hash)}
                            className="h-4 w-4 shrink-0 accent-emerald-600"
                          />
                          <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
                            <span className="shrink-0 font-mono text-xs text-emerald-600 dark:text-emerald-400">
                              {commit.shortHash}
                            </span>
                            <span className="truncate text-zinc-700 dark:text-zinc-200">
                              {commit.subject}
                            </span>
                            <span className="hidden shrink-0 text-xs text-zinc-400 sm:inline dark:text-zinc-500">
                              {commit.author}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </FilterField>
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-200 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Filters apply live to the Metrics section below. Author and path scopes narrow all
          metric categories.
        </p>
        <button
          type="button"
          onClick={filters.resetAll}
          className="inline-flex h-8 shrink-0 items-center justify-center self-start rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-950 sm:self-auto dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          Reset all
        </button>
      </div>
    </Panel>
  );
}
