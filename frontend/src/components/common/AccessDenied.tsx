"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, LayoutDashboard, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { usePermissions } from "../../hooks/usePermissions";

interface AccessDeniedProps {
  moduleName?: string;
  requiredPermission?: string;
  description?: string;
}

export default function AccessDenied({
  moduleName = "Restricted Module",
  requiredPermission = "manage_parties",
  description = "Your current role does not have authorization to view or access this section.",
}: AccessDeniedProps) {
  const { user, roleCode } = usePermissions();

  const roleName = user?.role?.name || roleCode || "Viewer";
  const userEmail = user?.email || "viewer@yarntrace.com";

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-8 ring-red-50/50 border border-red-200">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200 mb-2">
            <Lock className="h-3 w-3" />
            403 Forbidden
          </span>
          <h2 className="text-xl font-bold font-heading text-slate-900 mt-1">
            Access Restricted
          </h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
            {description}
          </p>
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-left space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 font-medium">Requested Area:</span>
            <span className="font-semibold text-slate-800">{moduleName}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 font-medium">Logged-in User:</span>
            <span className="font-mono text-slate-700 truncate max-w-[180px]">{userEmail}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 font-medium">Assigned Role:</span>
            <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {roleName}
            </span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-slate-400 font-medium">Required Scope:</span>
            <span className="font-mono text-[10px] text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
              {requiredPermission}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <Link href="/dashboard" className="w-full">
            <Button variant="primary" className="w-full gap-2 text-xs font-semibold h-10 shadow-sm">
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>Go to Dashboard</span>
            </Button>
          </Link>
          <Link href="/workflow" className="w-full">
            <Button variant="outline" className="w-full gap-2 text-xs font-semibold h-10">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Stock Workflow</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
