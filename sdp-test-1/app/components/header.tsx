import Link from "next/link";

import { LogoMark } from "./icons";

const navigation = [
  { label: "Overview", href: "#overview" },
  { label: "Scope", href: "#scope" },
  { label: "Metrics", href: "#metrics" },
  { label: "Activity", href: "#activity" },
  { label: "Authors", href: "#authors" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-6" />
          <span className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            RepoMetrics
          </span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 sm:flex">
          {navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
