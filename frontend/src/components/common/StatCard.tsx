import React from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  accentColor?: "brand" | "blue" | "emerald" | "amber" | "slate";
  isEmpty?: boolean;
  emptyText?: string;
}

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accentColor = "brand",
  isEmpty = false,
  emptyText,
}: StatCardProps) {
  const accentStyles = {
    brand: "border-l-brand-600 text-brand-600 bg-brand-50/50",
    blue: "border-l-sky-600 text-sky-600 bg-sky-50/50",
    emerald: "border-l-emerald-600 text-emerald-600 bg-emerald-50/50",
    amber: "border-l-amber-600 text-amber-600 bg-amber-50/50",
    slate: "border-l-slate-600 text-slate-600 bg-slate-50/50",
  };

  const iconStyles = {
    brand: "bg-brand-50 text-brand-600 border-brand-100",
    blue: "bg-sky-50 text-sky-600 border-sky-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  };

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-card border-l-4 card-interactive min-w-0",
        accentStyles[accentColor]
      )}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 truncate">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2 min-w-0">
            <h3 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 tabular-nums break-words">
              {value}
            </h3>
          </div>
        </div>
        <div
          className={cn(
            "flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg border",
            iconStyles[accentColor]
          )}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs pt-3 border-t border-slate-100 min-w-0">
        {subtitle && (
          <span className="text-slate-500 truncate">{subtitle}</span>
        )}
        {isEmpty && emptyText && (
          <span className="text-slate-400 italic text-[11px] truncate">
            {emptyText}
          </span>
        )}
        {trend && (
          <span
            className={cn(
              "font-medium text-[11px] shrink-0",
              trend.isPositive ? "text-emerald-600" : "text-amber-600"
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
