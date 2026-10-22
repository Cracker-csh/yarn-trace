"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  Factory,
  Flame,
  ShoppingCart,
  Layers,
  Plus,
  ArrowRightLeft,
  FileSpreadsheet,
  QrCode,
  Clock,
  ShieldCheck,
  RotateCw,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import StatCard from "../../components/common/StatCard";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { useAppSelector } from "../../store/hooks";
import { Skeleton } from "../../components/ui/skeleton";
import { apiClient } from "../../lib/axios";
import { DashboardOverview } from "../../types/dashboard";
import { Party, LotRecord, PORequirementOption } from "../../types/inventory";

import dynamic from "next/dynamic";
import { usePermissions } from "../../hooks/usePermissions";
const OpeningStockModal = dynamic(() => import("../../components/inventory/OpeningStockModal"), { ssr: false });
const ReceiveStockModal = dynamic(() => import("../../components/inventory/ReceiveStockModal"), { ssr: false });
const IssueStockModal = dynamic(() => import("../../components/inventory/IssueStockModal"), { ssr: false });

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);
  const {
    canReceiveStock,
    canAddOpeningStock,
    canAllocateToFloor,
    isReadOnly,
  } = usePermissions();

  const canViewInventory =
    user?.role?.code === "ADMIN" ||
    user?.permissions?.includes("view_inventory") ||
    user?.permissions?.includes("inventory.view");

  // Toast notification state
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Modals state
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // 1. FETCH DASHBOARD OVERVIEW (REAL BACKEND DATA)
  // ---------------------------------------------------------------------------
  const {
    data: overviewData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<DashboardOverview>({
    queryKey: ["dashboard", "overview"],
    queryFn: async () => {
      const res = await apiClient.get("/dashboard/overview");
      return res.data.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Fetch Parties for Modals (Only on-demand when any modal is opened)
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data;
    },
    enabled: isOpeningModalOpen || isReceiveModalOpen || isIssueModalOpen,
    staleTime: 60_000,
  });

  // Fetch Lots for Issue Modal (only when issue modal is open and user is authorized)
  const { data: lots = [] } = useQuery<LotRecord[]>({
    queryKey: ["inventory", "lots"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/lots");
      return res.data.data;
    },
    enabled: Boolean(isIssueModalOpen && canViewInventory),
    staleTime: 30_000,
  });

  // Fetch PO Requirements for Issue Modal (only when issue modal is open and user is authorized)
  const { data: poRequirements = [] } = useQuery<PORequirementOption[]>({
    queryKey: ["inventory", "po-requirements"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/po-requirements");
      return res.data.data;
    },
    enabled: Boolean(isIssueModalOpen && canViewInventory),
    staleTime: 30_000,
  });

  // ---------------------------------------------------------------------------
  // 2. MUTATIONS & CACHE INVALIDATION
  // ---------------------------------------------------------------------------
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  const addOpeningMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiClient.post("/inventory/opening", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Opening stock recorded successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to add opening stock"
      );
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiClient.post("/inventory/received", values),
    onSuccess: () => {
      invalidateAll();
      showToast(
        "success",
        "Inward yarn shipment received into Main Stock!"
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to receive inward stock"
      );
    },
  });

  const issueMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiClient.post("/inventory/issued", values),
    onSuccess: () => {
      invalidateAll();
      showToast(
        "success",
        "Yarn issued to production floor successfully!"
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to issue yarn"
      );
    },
  });

  // ---------------------------------------------------------------------------
  // 3. EXPORT INVENTORY MANIFEST
  // ---------------------------------------------------------------------------
  const handleExportManifest = async () => {
    try {
      showToast("success", "Generating manifest download...");
      const response = await apiClient.get("/inventory/export", {
        params: { format: "xlsx" },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `YarnTrace_Manifest_${new Date().toISOString().split("T")[0]}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast("error", "Failed to export inventory manifest");
    }
  };

  // ---------------------------------------------------------------------------
  // 4. MAP 7 REAL KPI DIMENSIONS
  // ---------------------------------------------------------------------------
  const totalStockKg = overviewData?.totalStockKg ?? 0;
  const totalStockBags = overviewData?.totalStockBags ?? 0;
  const receivedKg = overviewData?.receivedKg ?? 0;
  const receivedBags = overviewData?.receivedBags ?? 0;
  const receivedLotsCount = overviewData?.receivedLotsCount ?? 0;
  const issuedKg = overviewData?.issuedKg ?? 0;
  const issuedBags = overviewData?.issuedBags ?? 0;
  const pendingPOs = overviewData?.pendingPurchaseOrders ?? 0;
  const pendingRequirements = overviewData?.pendingRequirementsCount ?? 0;

  const kpiData = [
    {
      title: "Total Yarn Stock",
      value: `${totalStockKg.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })} KG`,
      subtitle: `${totalStockBags.toLocaleString()} bags (${overviewData?.activeLotsCount ?? 0} active lots)`,
      icon: Boxes,
      accentColor: "brand" as const,
      isEmpty: totalStockKg <= 0,
    },
    {
      title: "Received (Inward)",
      value: `${receivedKg.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })} KG`,
      subtitle: `${receivedBags.toLocaleString()} bags (${receivedLotsCount} inward ${
        receivedLotsCount === 1 ? "receipt" : "receipts"
      })`,
      icon: ArrowDownLeft,
      accentColor: "emerald" as const,
      isEmpty: receivedKg <= 0,
    },
    {
      title: "Issued to Floor",
      value: `${issuedKg.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })} KG`,
      subtitle: `${issuedBags.toLocaleString()} bags issued to production`,
      icon: ArrowUpRight,
      accentColor: "blue" as const,
      isEmpty: issuedKg <= 0,
    },
    {
      title: "With Production Teams",
      value: "0.0000 KG",
      subtitle: "Stage 1 scope: Not available yet",
      icon: Factory,
      accentColor: "amber" as const,
      isEmpty: true,
      emptyText: "Future phase",
    },
    {
      title: "Consumed in Production",
      value: "0.0000 KG",
      subtitle: "Stage 1 scope: Not available yet",
      icon: Flame,
      accentColor: "slate" as const,
      isEmpty: true,
      emptyText: "Future phase",
    },
    {
      title: "Pending Purchase Orders",
      value: `${pendingPOs} PO${pendingPOs === 1 ? "" : "s"}`,
      subtitle: `${pendingRequirements} requirement ${
        pendingRequirements === 1 ? "item" : "items"
      } pending`,
      icon: ShoppingCart,
      accentColor: "amber" as const,
      isEmpty: pendingPOs <= 0,
    },
    {
      title: "Final Output Products",
      value: "0.0000 KG",
      subtitle: "Stage 1 scope: Not available yet",
      icon: Layers,
      accentColor: "brand" as const,
      isEmpty: true,
      emptyText: "Future phase",
    },
  ];

  return (
    <AppLayout>
      {/* Toast Notification */}
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
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Inventory & Production Overview"
        subtitle="Real-time yarn lot balance, production floor allocations, and end-to-end traceability."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-9"
              title="Refresh Dashboard Data"
            >
              <RotateCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isFetching ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportManifest}
              className="gap-1.5 h-9"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
              <span>Export Manifest</span>
            </Button>
            {isReadOnly && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                <span>Read-Only Mode</span>
              </div>
            )}
            {canReceiveStock && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsReceiveModalOpen(true)}
                className="gap-1.5 h-9"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-brand-600" />
                <span>Receive Inward</span>
              </Button>
            )}
            {canAddOpeningStock && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsOpeningModalOpen(true)}
                className="gap-1.5 h-9"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Yarn Lot</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Error Alert */}
      {isError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>
              Failed to load real-time dashboard data:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="h-8 text-xs bg-white text-red-700 hover:bg-red-50 border-red-300 self-start sm:self-auto"
          >
            Retry
          </Button>
        </div>
      )}

      {/* 7 Core KPI Dimension Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-card space-y-3"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))
        ) : (
          kpiData.map((kpi, idx) => (
            <StatCard
              key={idx}
              title={kpi.title}
              value={kpi.value}
              subtitle={kpi.subtitle}
              icon={kpi.icon}
              accentColor={kpi.accentColor}
              isEmpty={kpi.isEmpty}
              emptyText={kpi.emptyText}
            />
          ))
        )}
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Lot Traceability & Production Batches Table */}
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
              <div>
                <CardTitle>Live Lot Traceability & Batches</CardTitle>
                <CardDescription>
                  Active spinning lots, warehouse balances, and latest movements
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Badge variant="brand" className="gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                  Live Sync
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/traceability")}
                  className="text-xs text-brand-600 hover:text-brand-700 gap-1 h-7 px-2"
                >
                  <span>Trace All</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : overviewData?.liveLots && overviewData.liveLots.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[650px] text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-3.5">Lot Number</th>
                        <th className="py-3 px-3">Yarn Count</th>
                        <th className="py-3 px-3">Party / Mill</th>
                        <th className="py-3 px-3 text-right">Available Balance</th>
                        <th className="py-3 px-3 text-center">Status</th>
                        <th className="py-3 px-3 text-right">Last Movement</th>
                        <th className="py-3 px-3 text-center">Trace</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                      {overviewData.liveLots.map((lot) => {
                        const isZero = lot.currentWeightKg <= 0.0001;
                        return (
                          <tr
                            key={lot.id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isZero ? "opacity-60 bg-slate-50/40" : ""
                            }`}
                          >
                            <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                              <span
                                onClick={() =>
                                  router.push(
                                    `/traceability?lot=${encodeURIComponent(
                                      lot.lotNumber
                                    )}`
                                  )
                                }
                                className="hover:text-brand-600 cursor-pointer underline decoration-slate-300 hover:decoration-brand-600 underline-offset-2"
                                title="Trace Lot Genealogy"
                              >
                                {lot.lotNumber}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-semibold text-slate-800">
                              {lot.count}
                            </td>
                            <td className="py-3 px-3 text-slate-600 truncate max-w-[140px]">
                              {lot.party ? (
                                <span>
                                  {lot.party.name}{" "}
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ({lot.party.code})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right tabular-nums">
                              <span
                                className={`font-mono font-bold ${
                                  isZero
                                    ? "text-slate-400"
                                    : "text-brand-700"
                                }`}
                              >
                                {lot.currentWeightKg.toFixed(2)} KG
                              </span>
                              <span className="text-[11px] text-slate-400 ml-1">
                                ({lot.currentBags} bags)
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <Badge
                                variant={
                                  lot.status === "APPROVED"
                                    ? "brand"
                                    : lot.status === "IN_PRODUCTION"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-[10px]"
                              >
                                {lot.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-3 text-right text-[11px] text-slate-500">
                              <span className="font-semibold text-slate-700">
                                {lot.lastMovementType}
                              </span>
                              <div className="text-[10px] text-slate-400">
                                {new Date(
                                  lot.lastMovementDate
                                ).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() =>
                                  router.push(
                                    `/traceability?lot=${encodeURIComponent(
                                      lot.lotNumber
                                    )}`
                                  )
                                }
                                className="p-1.5 rounded-md hover:bg-slate-100 text-brand-600 hover:text-brand-700 transition-colors"
                                title="Open Traceability Engine"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No active yarn lots in warehouse yet"
                  description="Once inward yarn lots are registered and received, real-time balances and movement tracking will appear here."
                  icon={Boxes}
                  actionLabel={canReceiveStock ? "+ Register Inward Lot" : undefined}
                  onAction={canReceiveStock ? () => setIsReceiveModalOpen(true) : undefined}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Quick Floor Actions & Audit Stream */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Production Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Quick Floor Actions</CardTitle>
              <CardDescription>
                High-frequency operational shortcuts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {isReadOnly ? (
                <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 text-center">
                  <ShieldCheck className="h-5 w-5 text-amber-600 mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-slate-800">Read-Only Oversight</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Stock reception, baseline additions, and floor allocations are restricted for viewer accounts.
                  </p>
                </div>
              ) : (
                <>
                  {canReceiveStock && (
                    <button
                      onClick={() => setIsReceiveModalOpen(true)}
                      className="flex w-full items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-emerald-50/60 hover:border-emerald-200 text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600 transition-colors shadow-sm">
                          <ArrowDownLeft className="h-4 w-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            Inward Lot Reception
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Record gate inward Challan
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-semibold">
                        Receive
                      </Badge>
                    </button>
                  )}

                  {canAllocateToFloor && (
                    <button
                      onClick={() => setIsIssueModalOpen(true)}
                      className="flex w-full items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-amber-50/60 hover:border-amber-200 text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 text-amber-600 group-hover:bg-amber-600 group-hover:text-white group-hover:border-amber-600 transition-colors shadow-sm">
                          <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            Issue to Production Team
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Stock Head handoff slip
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-semibold">
                        Issue
                      </Badge>
                    </button>
                  )}

                  {canAddOpeningStock && (
                    <button
                      onClick={() => setIsOpeningModalOpen(true)}
                      className="flex w-full items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-orange-50/60 hover:border-orange-200 text-left transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 text-orange-600 group-hover:bg-orange-600 group-hover:text-white group-hover:border-orange-600 transition-colors shadow-sm">
                          <Plus className="h-4 w-4 stroke-[2.5]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">
                            Add Opening Stock
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Record baseline inventory
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-semibold">
                        Opening
                      </Badge>
                    </button>
                  )}
                </>
              )}

              <button
                onClick={() => router.push("/inventory")}
                className="flex w-full items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300 text-left transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 group-hover:bg-slate-700 group-hover:text-white transition-colors shadow-sm">
                    <QrCode className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Inventory Ledger View
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Explore lot-wise ledgers
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-[10px] font-semibold">
                  Ledger
                </Badge>
              </button>
            </CardContent>
          </Card>

          {/* Recent Traceability Activity & Audit Stream */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Traceability Audit Stream</CardTitle>
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
              <CardDescription>
                Immutable record of inventory mutations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3 py-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : overviewData?.recentMovements &&
                overviewData.recentMovements.length > 0 ? (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {overviewData.recentMovements.map((tx) => {
                    const badgeStyles: Record<string, string> = {
                      OPENING: "bg-orange-50 text-orange-700 border-orange-200",
                      RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
                      ISSUED: "bg-amber-50 text-amber-700 border-amber-200",
                      RETURN: "bg-blue-50 text-blue-700 border-blue-200",
                      RETURNED: "bg-blue-50 text-blue-700 border-blue-200",
                      RETIRED: "bg-red-50 text-red-700 border-red-200",
                      SOLD: "bg-purple-50 text-purple-700 border-purple-200",
                      CORRECTION: "bg-slate-100 text-slate-700 border-slate-200",
                    };

                    return (
                      <div
                        key={tx.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${
                              badgeStyles[tx.type] || "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {tx.type}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(tx.transactionDate).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                              }
                            )}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-800">
                            {tx.lotNumber}
                          </span>
                          <span className="font-mono font-bold text-slate-900">
                            {tx.kilos.toFixed(2)} KG
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate max-w-[140px]">
                            {tx.yarnCount} {tx.partyName ? `• ${tx.partyName}` : ""}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            By {tx.createdByName}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center">
                  <ShieldCheck className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Audit Ledger Active
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    All inventory mutations, receipts, and issuances will be
                    automatically logged here in real-time.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Modals */}
      <OpeningStockModal
        isOpen={isOpeningModalOpen}
        onClose={() => setIsOpeningModalOpen(false)}
        onSubmit={async (values) => {
          await addOpeningMutation.mutateAsync(values);
        }}
        parties={parties}
        isLoading={addOpeningMutation.isPending}
      />

      <ReceiveStockModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        onSubmit={async (values) => {
          await receiveMutation.mutateAsync(values);
        }}
        parties={parties}
        isLoading={receiveMutation.isPending}
      />

      <IssueStockModal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        onSubmit={async (values) => {
          await issueMutation.mutateAsync(values);
        }}
        lots={lots}
        parties={parties}
        poRequirements={poRequirements}
        isLoading={issueMutation.isPending}
      />
    </AppLayout>
  );
}
