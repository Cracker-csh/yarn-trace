"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Layers,
  ChevronLeft,
  ChevronRight,
  QrCode,
  X,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { toggleSidebar } from "../../store/slices/uiSlice";
import { NAVIGATION_ITEMS } from "../../constants/nav";
import { cn } from "../../lib/utils";

interface SidebarProps {
  isMobile?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ isMobile = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const isCollapsed = useAppSelector((state) => state.ui.isSidebarCollapsed);
  const user = useAppSelector((state) => state.auth.user);

  const effectiveCollapsed = isMobile ? false : isCollapsed;

  const mainItems = NAVIGATION_ITEMS.filter((i) => i.section === "MAIN");
  const commercialItems = NAVIGATION_ITEMS.filter((i) => i.section === "COMMERCIAL");
  const governanceItems = NAVIGATION_ITEMS.filter((i) => i.section === "GOVERNANCE");

  const hasPermission = (requiredPermission?: string) => {
    if (!requiredPermission) return true;
    if (!user) return false;
    if (user.role?.code === "ADMIN") return true;
    return user.permissions?.includes(requiredPermission);
  };

  const renderNavGroup = (title: string, items: typeof NAVIGATION_ITEMS) => {
    const visibleItems = items.filter((item) => hasPermission(item.requiredPermission));
    if (visibleItems.length === 0) return null;

    return (
      <div className="mb-5">
        {!effectiveCollapsed && (
          <h4 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {title}
          </h4>
        )}
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => {
                  if (isMobile && onMobileClose) {
                    onMobileClose();
                  }
                }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all group relative",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-semibold border-l-2 border-brand-600 shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
                title={effectiveCollapsed ? item.title : undefined}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"
                  )}
                />
                {!effectiveCollapsed && <span className="truncate">{item.title}</span>}
                {item.badge && !effectiveCollapsed && (
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-slate-200 bg-white transition-all duration-200 z-30 select-none h-full",
        isMobile ? "w-full" : effectiveCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
        <Link
          href="/dashboard"
          onClick={() => {
            if (isMobile && onMobileClose) {
              onMobileClose();
            }
          }}
          className="flex items-center gap-2.5 overflow-hidden group"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white border border-slate-150 shadow-sm transition-transform group-hover:scale-105">
            <Image
              src="/logo-icon.png"
              alt="YarnTrace Logo"
              width={36}
              height={36}
              className="h-8 w-8 object-contain"
              priority
            />
          </div>
          {!effectiveCollapsed && (
            <div className="flex flex-col">
              <span className="font-display text-base font-bold tracking-tight text-slate-900">
                Yarn<span className="text-brand-600">Trace</span>
              </span>
              <span className="text-[10px] font-medium text-slate-400 tracking-wide uppercase">
                Inventory & Trace
              </span>
            </div>
          )}
        </Link>
        {isMobile ? (
          <button
            onClick={onMobileClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 flex items-center justify-center transition-colors"
            title="Close menu"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 hidden lg:flex items-center justify-center"
            title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {effectiveCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto p-3 scrollbar-none">
        {renderNavGroup("Main Flow", mainItems)}
        {renderNavGroup("Commercial", commercialItems)}
        {renderNavGroup("Governance", governanceItems)}
      </div>

      {/* Footer System Status & Barcode Quick Access */}
      <div className="border-t border-slate-100 p-3 bg-slate-50/50">
        {!effectiveCollapsed ? (
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-medium text-slate-700">Plant 04 • Live</span>
            </div>
            <button
              className="flex items-center gap-1 text-slate-500 hover:text-brand-600 transition-colors"
              title="Barcode Scanner Ready"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>Scan</span>
            </button>
          </div>
        ) : (
          <div className="flex justify-center" title="Plant 04 • Live Sync">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
