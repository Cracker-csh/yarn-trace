"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Bell, HelpCircle, Menu, Building2 } from "lucide-react";
import { useAppDispatch } from "../../store/hooks";
import { toggleMobileMenu } from "../../store/slices/uiSlice";
import Breadcrumbs from "./Breadcrumbs";
import UserProfile from "./UserProfile";

export default function TopNav() {
  const dispatch = useAppDispatch();

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 md:px-6 backdrop-blur-sm">
      {/* Left: Mobile Toggle & Breadcrumbs & Facility */}
      <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0 flex-1">
        <button
          onClick={() => dispatch(toggleMobileMenu())}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden shrink-0"
          aria-label="Open sidebar menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile / Small Screen Navbar Logo */}
        <Link
          href="/dashboard"
          className="flex lg:hidden items-center gap-2 shrink-0 mr-1 group"
        >
          <Image
            src="/logo-icon.png"
            alt="YarnTrace Logo"
            width={28}
            height={28}
            className="h-7 w-7 object-contain transition-transform group-hover:scale-105"
            priority
          />
          <span className="font-display text-sm font-bold tracking-tight text-slate-900 hidden xs:inline">
            Yarn<span className="text-brand-600">Trace</span>
          </span>
        </Link>

        <div className="hidden sm:flex items-center gap-2 border-r border-slate-200 pr-3 md:pr-4 shrink-0">
          <div className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            <Building2 className="h-3.5 w-3.5 text-brand-600" />
            <span>Spinning Mill #4</span>
          </div>
        </div>

        <Breadcrumbs />
      </div>

      {/* Right: Search, Notifications, User */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Quick Search */}
        <div className="relative hidden md:block w-64 lg:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search lot, batch, yarn count... (⌘K)"
            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/15 transition-all"
          />
        </div>

        {/* Notifications */}
        <button
          className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white"></span>
        </button>

        {/* Help Docs */}
        <button
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors hidden sm:flex"
          title="Documentation"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <div className="h-5 w-[1px] bg-slate-200 mx-1" />

        {/* User Profile */}
        <UserProfile />
      </div>
    </header>
  );
}
