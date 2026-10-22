"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Plus,
  ArrowDownLeft,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import StockKanbanBoard from "../../components/kanban/StockKanbanBoard";
import { Button } from "../../components/ui/button";
import { usePermissions } from "../../hooks/usePermissions";
import { apiClient } from "../../lib/axios";
import { Party } from "../../types/inventory";
import dynamic from "next/dynamic";

const ReceiveStockModal = dynamic(() => import("../../components/inventory/ReceiveStockModal"), { ssr: false });
const OpeningStockModal = dynamic(() => import("../../components/inventory/OpeningStockModal"), { ssr: false });

export default function StockWorkflowPage() {
  const queryClient = useQueryClient();
  const { isReadOnly, canReceiveStock, canAddOpeningStock } = usePermissions();

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isOpeningOpen, setIsOpeningOpen] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data || [];
    },
    staleTime: 60_000,
  });

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["production"] }),
      queryClient.invalidateQueries({ queryKey: ["parties"] }),
    ]);
    showToast("success", "Workflow pipeline synchronized.");
  };

  return (
    <AppLayout>
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header with Single Action Button and Refresh */}
      <PageHeader
        title="Stock Workflow Pipeline"
        subtitle="Visual drag-and-drop Kanban workflow for yarn stock: Inward Receipt → Available → Floor Allocation → In Production → QC & Reconciliation → Closed."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-1.5 h-8 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border-slate-200 shadow-sm"
              title="Sync live pipeline"
            >
              <RotateCw className="h-3.5 w-3.5 text-slate-500" />
              <span>Refresh</span>
            </Button>

            {isReadOnly ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                <span>Read-Only Mode</span>
              </div>
            ) : (
              (canReceiveStock || canAddOpeningStock) && (
                <div className="relative">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                    className="gap-1.5 h-8 px-3 text-xs font-semibold shadow-sm bg-brand-600 hover:bg-brand-700 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Stock</span>
                    <ChevronDown className="h-3 w-3 opacity-80" />
                  </Button>

                  {isAddMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsAddMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white p-1.5 shadow-xl border border-slate-200 z-50 animate-in fade-in slide-in-from-top-1 text-xs">
                        {canReceiveStock && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddMenuOpen(false);
                              setIsReceiveOpen(true);
                            }}
                            className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-emerald-50 text-left transition-colors group"
                          >
                            <ArrowDownLeft className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                            <div>
                              <div className="font-semibold text-slate-800">Receive Inward Stock</div>
                              <div className="text-[10px] text-slate-500">From supplier or mill</div>
                            </div>
                          </button>
                        )}

                        {canReceiveStock && canAddOpeningStock && (
                          <div className="my-1 border-t border-slate-100" />
                        )}

                        {canAddOpeningStock && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddMenuOpen(false);
                              setIsOpeningOpen(true);
                            }}
                            className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-blue-50 text-left transition-colors group"
                          >
                            <Plus className="h-4 w-4 text-brand-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                            <div>
                              <div className="font-semibold text-slate-800">Opening Stock</div>
                              <div className="text-[10px] text-slate-500">Initial warehouse balance</div>
                            </div>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        }
      />

      {/* Main Kanban Pipeline Board (Columns start directly with zero clutter) */}
      <StockKanbanBoard onShowToast={showToast} isEmbeddedInInventory={true} />

      {/* Inward Receiving & Opening Stock Modals */}
      <ReceiveStockModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        parties={parties}
        onShowToast={showToast}
      />

      <OpeningStockModal
        isOpen={isOpeningOpen}
        onClose={() => setIsOpeningOpen(false)}
        parties={parties}
        onShowToast={showToast}
      />
    </AppLayout>
  );
}
