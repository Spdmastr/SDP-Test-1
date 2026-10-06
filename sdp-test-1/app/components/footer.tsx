export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-zinc-500 sm:flex-row dark:text-zinc-400">
        <p>© {new Date().getFullYear()} RepoMetrics</p>
        <p>Built with Next.js</p>
      </div>
    </footer>
  );
}
