import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value?: string;
  hint?: string;
  icon?: ReactNode;
};

export function MetricCard({ label, value = "—", hint, icon }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
        {icon ? <span className="text-zinc-300 dark:text-zinc-600">{icon}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 tabular-nums dark:text-zinc-50">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{hint}</p> : null}
    </div>
  );
}
