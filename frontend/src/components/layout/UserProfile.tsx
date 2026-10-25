"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User as UserIcon, Shield, ChevronDown } from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { logout } from "../../store/slices/authSlice";

export default function UserProfile() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    setIsOpen(false);
    dispatch(logout());
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  if (!user) {
    return null;
  }

  const displayName = `${user.firstName} ${user.lastName}`;
  const roleName = user.role?.name || "User";
  const initials = `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "YT";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-semibold text-xs border border-brand-200">
          {initials}
        </div>
        <div className="hidden md:flex flex-col">
          <span className="text-xs font-semibold text-slate-800 leading-tight">
            {displayName}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">
            {roleName}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden md:block" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-2 shadow-modal border border-slate-200 z-50 animate-in fade-in slide-in-from-top-1">
            <div className="px-3 py-2 border-b border-slate-100 mb-1">
              <p className="text-xs font-semibold text-slate-900">{displayName}</p>
              <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                <Shield className="h-3 w-3 text-brand-600" />
                {roleName}
              </div>
            </div>

            <button
              onClick={() => {
                setIsOpen(false);
                router.push("/dashboard");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-md transition-colors"
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span>Profile & Workspace</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors mt-1 border-t border-slate-100 pt-2"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
