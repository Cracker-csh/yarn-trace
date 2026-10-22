"use client";

import React, { useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopNav from "./TopNav";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { setMobileMenuOpen } from "../../store/slices/uiSlice";
import { usePermissions } from "../../hooks/usePermissions";
import AccessDenied from "../common/AccessDenied";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const isMobileMenuOpen = useAppSelector((state) => state.ui.isMobileMenuOpen);
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const { isAdmin, hasPermission } = usePermissions();

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

  // Strict Route Permission Evaluation
  const getRouteRestriction = (path: string) => {
    if (isAdmin) return null; // Admin has unrestricted system-wide access

    if (path.startsWith("/parties")) {
      if (!hasPermission("manage_parties") && !hasPermission("manage_suppliers")) {
        return {
          moduleName: "Commercial Partners & Suppliers",
          requiredPermission: "manage_parties",
          description: "Access to Commercial Suppliers and Master Directory is restricted to authorized Stock and Purchasing Heads.",
        };
      }
    }

    if (path.startsWith("/users")) {
      if (!hasPermission("manage_users")) {
        return {
          moduleName: "User Management & Directory",
          requiredPermission: "manage_users",
          description: "Access to User Accounts and Security settings is restricted to System Administrators.",
        };
      }
    }

    if (path.startsWith("/roles-permissions")) {
      if (!hasPermission("manage_roles")) {
        return {
          moduleName: "Role & Permission Governance",
          requiredPermission: "manage_roles",
          description: "Access to RBAC Matrices and Permission Policies is restricted to System Administrators.",
        };
      }
    }

    if (path.startsWith("/purchase-orders")) {
      if (!hasPermission("manage_purchase_orders")) {
        return {
          moduleName: "Purchase Orders & Procurement",
          requiredPermission: "manage_purchase_orders",
          description: "Access to Purchase Orders and Vendor Contracts is restricted to Purchasing Managers.",
        };
      }
    }

    if (path.startsWith("/production")) {
      if (!hasPermission("manage_production") && !hasPermission("production.view")) {
        return {
          moduleName: "Production Floor & Work Orders",
          requiredPermission: "manage_production",
          description: "Access to Production Work Orders, Floor Tracking, and Output recording is restricted to Production Teams.",
        };
      }
    }

    return null;
  };

  const restriction = getRouteRestriction(pathname);

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
          <div className="mx-auto max-w-7xl page-enter min-w-0">
            {restriction ? (
              <AccessDenied
                moduleName={restriction.moduleName}
                requiredPermission={restriction.requiredPermission}
                description={restriction.description}
              />
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
