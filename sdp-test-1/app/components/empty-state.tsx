import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
};

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
      {icon ? <span className="text-zinc-300 dark:text-zinc-700">{icon}</span> : null}
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs leading-5 text-zinc-500">{description}</p>
      ) : null}
    </div>
  );
}
