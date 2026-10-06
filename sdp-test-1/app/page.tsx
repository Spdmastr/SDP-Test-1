import type { Metadata } from "next";

import { FiltersProvider } from "./components/analysis-filters";
import { AuthorMergePanel } from "./components/author-merge-panel";
import { EmptyState } from "./components/empty-state";
import { FilterBar } from "./components/filter-bar";
import { ActivityIcon, LayersIcon } from "./components/icons";
import { MetricsDashboard } from "./components/metrics-dashboard";
import { Panel } from "./components/panel";
import { RepoInput } from "./components/repo-input";

export const metadata: Metadata = {
  title: "Overview",
};

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section
        id="overview"
        className="scroll-mt-24 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 py-20 text-center sm:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Repository analysis workspace
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl dark:text-zinc-50">
            Measure the health of any repository
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Measure code size, commit activity, authors, and languages across multiple
            repositories — scoped by author, path, or commit range.
          </p>
          <RepoInput />
        </div>
      </section>

      <FiltersProvider>
        <section id="scope" className="scroll-mt-24 border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <FilterBar />
          </div>
        </section>

        <section id="metrics" className="scroll-mt-24 border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                Metrics
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                File, directory, repository, commit set, and author metrics for the current scope.
              </p>
            </div>
            <div className="mt-8">
              <MetricsDashboard />
            </div>
          </div>
        </section>
      </FiltersProvider>

      <section id="activity" className="scroll-mt-24 border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-16 lg:grid-cols-2">
          <Panel title="Commit activity" description="Weekly commit volume within the selected commit range.">
            <EmptyState
              icon={<ActivityIcon className="h-8 w-8" />}
              title="No activity data"
              description="Analyze a repository to chart its commit history here."
            />
          </Panel>
          <Panel title="Language breakdown" description="Share of code written in each language across the selected paths.">
            <EmptyState
              icon={<LayersIcon className="h-8 w-8" />}
              title="No language data"
              description="Analyze a repository to see how its code is distributed."
            />
          </Panel>
        </div>
      </section>

      <section id="authors" className="scroll-mt-24">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-16">
          <AuthorMergePanel />
        </div>
      </section>
    </main>
  );
}
