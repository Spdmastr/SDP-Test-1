import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function Panel({
  title,
  description,
  className = "",
  bodyClassName = "p-5",
  children,
}: PanelProps) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      <header className="shrink-0 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
        ) : null}
      </header>
      <div className={`flex flex-1 flex-col ${bodyClassName}`}>{children}</div>
    </section>
  );
}
