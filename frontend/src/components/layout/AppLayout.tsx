"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { setMobileMenuOpen } from "../../store/slices/uiSlice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobileMenuOpen = useAppSelector((state) => state.ui.isMobileMenuOpen);
  const dispatch = useAppDispatch();
  const pathname = usePathname();

  // Close mobile drawer on route change
  useEffect(() => {
    dispatch(setMobileMenuOpen(false));
  }, [pathname, dispatch]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="flex h-screen w-full min-w-0 overflow-hidden bg-slate-50">
      {/* Desktop & Collapsible Sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer Sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity backdrop-enter"
            onClick={() => dispatch(setMobileMenuOpen(false))}
            aria-label="Close navigation overlay"
          />
          <div className="relative flex w-72 max-w-[85vw] flex-1 flex-col bg-white shadow-2xl animate-in slide-in-from-left duration-200">
            <Sidebar isMobile onMobileClose={() => dispatch(setMobileMenuOpen(false))} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl page-enter min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
