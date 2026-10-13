import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 sm:pb-6 border-b border-slate-200 mb-6">
      <div className="min-w-0">
        <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 break-words">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
