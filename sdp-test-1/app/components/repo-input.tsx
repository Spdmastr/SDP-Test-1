"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

import { ArchiveIcon, GlobeIcon } from "./icons";

const MAX_UPLOAD_MB = 250;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

type Mode = "url" | "zip";

type IngestedRepository = {
  id: string;
  source: "url" | "zip";
  stats: { commits: number; branch: string } | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "success"; repository: IngestedRepository }
  | { kind: "error"; message: string };

export function RepoInput() {
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const working = status.kind === "working";

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setStatus({ kind: "idle" });
  }

  async function submit(formData: FormData, workingMessage: string) {
    setStatus({ kind: "working", message: workingMessage });
    try {
      const response = await fetch("/api/repos", { method: "POST", body: formData });
      const payload: { repository?: IngestedRepository; error?: string } | null = await response
        .json()
        .catch(() => null);
      if (!response.ok || !payload?.repository) {
        throw new Error(payload?.error ?? `The request failed with status ${response.status}.`);
      }
      setStatus({ kind: "success", repository: payload.repository });
      setUrl("");
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
    }
  }

  function handleUrlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working) return;
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Enter a repository URL." });
      return;
    }
    const formData = new FormData();
    formData.set("url", trimmed);
    void submit(formData, "Cloning the full commit history into your workspace…");
  }

  function acceptFile(candidate: File | null | undefined) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".zip")) {
      setStatus({ kind: "error", message: "Only .zip archives are accepted." });
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setStatus({
        kind: "error",
        message: `The archive exceeds the ${MAX_UPLOAD_MB} MB upload limit.`,
      });
      return;
    }
    setFile(candidate);
    setStatus({ kind: "idle" });
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (working) return;
    acceptFile(event.dataTransfer.files?.[0]);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragActive(false);
  }

  function handleUploadClick() {
    if (working || !file) return;
    const formData = new FormData();
    formData.set("file", file);
    void submit(formData, "Uploading and extracting the archive…");
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setStatus({ kind: "idle" });
  }

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-3">
      <div className="grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
        <button
          type="button"
          aria-pressed={mode === "url"}
          onClick={() => switchMode("url")}
          className={tabClasses(mode === "url")}
        >
          Remote URL
        </button>
        <button
          type="button"
          aria-pressed={mode === "zip"}
          onClick={() => switchMode("zip")}
          className={tabClasses(mode === "zip")}
        >
          Upload .zip
        </button>
      </div>

      {mode === "url" ? (
        <form onSubmit={handleUrlSubmit} className="w-full">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <GlobeIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input
                type="text"
                name="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={working}
                placeholder="https://github.com/owner/repository"
                autoComplete="off"
                spellCheck={false}
                aria-label="Repository URL"
                className="h-12 w-full rounded-xl border border-zinc-200 bg-white pr-4 pl-10 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-600"
              />
            </div>
            <button
              type="submit"
              disabled={working}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? <Spinner /> : null}
              {working ? "Cloning…" : "Clone"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a zip archive here or click to browse"
            onClick={() => {
              if (!working) fileInputRef.current?.click();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (!working) fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              if (!working) setDragActive(true);
            }}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 text-center outline-none transition-colors focus-visible:border-emerald-500 ${
              dragActive
                ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20"
                : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            }`}
          >
            <ArchiveIcon className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Drop a <span className="font-medium">.zip</span> here or click to browse
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Up to {MAX_UPLOAD_MB} MB — include the repository&apos;s .git data
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            onChange={handleFileInputChange}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <ArchiveIcon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-200">
                {file.name}
              </span>
              <span className="shrink-0 text-zinc-400 dark:text-zinc-500">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={clearFile}
                disabled={working}
                className="ml-auto shrink-0 font-medium text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                Remove
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={working || !file}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? <Spinner /> : null}
            {working ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {mode === "url"
          ? "Clones the full commit history (no shallow clone) into the local workspace."
          : "Include the repository's .git file or directory so the full history is preserved."}
      </p>

      <div aria-live="polite" className="w-full">
        {status.kind === "working" ? (
          <div className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left dark:border-zinc-800 dark:bg-zinc-900">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-emerald-600 dark:border-zinc-700 dark:border-t-emerald-500" />
            <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-300">{status.message}</p>
          </div>
        ) : null}

        {status.kind === "success" ? (
          <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              Repository added to the workspace
            </p>
            <p className="mt-2 text-xs leading-5 text-emerald-800 dark:text-emerald-300/90">
              <span className="font-medium">{status.repository.id}</span> ·{" "}
              {status.repository.source === "url" ? "deep clone" : "zip upload"} · stored at{" "}
              <code className="rounded bg-emerald-100 px-1 py-0.5 font-mono text-[0.7rem] dark:bg-emerald-900/50">
                .data/repos/{status.repository.id}
              </code>
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-800 dark:text-emerald-300/90">
              {status.repository.stats
                ? `${status.repository.stats.commits.toLocaleString()} commits · ${status.repository.stats.branch}`
                : "Commit history could not be read from the .git data."}
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
          <div className="w-full rounded-xl border border-rose-200 bg-rose-50 p-4 text-left dark:border-rose-900/60 dark:bg-rose-950/30">
            <p className="text-sm font-medium text-rose-900 dark:text-rose-200">
              Could not add the repository
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
  );
}

function tabClasses(active: boolean): string {
  return `flex h-7 items-center justify-center rounded-md px-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
    active
      ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
  }`;
}

function Spinner() {
  return (
    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" />
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
