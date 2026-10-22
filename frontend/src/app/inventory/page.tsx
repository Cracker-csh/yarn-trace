"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Boxes,
  Plus,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  RotateCw,
  AlertOctagon,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Printer,
  History,
  CheckCircle2,
  AlertCircle,
  X,
  GitBranch,
  Kanban,
  List,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
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
import { apiClient } from "../../lib/axios";
import {
  LotRecord,
  TransactionRecord,
  StockSummary,
  Party,
  PORequirementOption,
  InventoryFilters,
} from "../../types/inventory";
import { usePermissions } from "../../hooks/usePermissions";

import dynamic from "next/dynamic";

// Subcomponents & Modals (Lazy Loaded on Demand)
import InventoryKpiCards from "../../components/inventory/InventoryKpiCards";
import InventoryFilterBar from "../../components/inventory/InventoryFilterBar";
import StockKanbanBoard from "../../components/kanban/StockKanbanBoard";
const OpeningStockModal = dynamic(() => import("../../components/inventory/OpeningStockModal"), { ssr: false });
const ReceiveStockModal = dynamic(() => import("../../components/inventory/ReceiveStockModal"), { ssr: false });
const IssueStockModal = dynamic(() => import("../../components/inventory/IssueStockModal"), { ssr: false });
const ReturnStockModal = dynamic(() => import("../../components/inventory/ReturnStockModal"), { ssr: false });
const RetireStockModal = dynamic(() => import("../../components/inventory/RetireStockModal"), { ssr: false });
const SellStockModal = dynamic(() => import("../../components/inventory/SellStockModal"), { ssr: false });
const CorrectionModal = dynamic(() => import("../../components/inventory/CorrectionModal"), { ssr: false });
const YarnSlipModal = dynamic(() => import("../../components/inventory/YarnSlipModal"), { ssr: false });

export default function InventoryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isReadOnly, canReceiveStock, canAddOpeningStock } = usePermissions();
  const [isAddStockMenuOpen, setIsAddStockMenuOpen] = useState(false);

  // View Mode: Visual Kanban Pipeline vs Detailed Table
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  // Active Tab View
  const [activeTab, setActiveTab] = useState<"lots" | "transactions" | "counts" | "parties">(
    "lots"
  );

  // Filters state
  const [filters, setFilters] = useState<InventoryFilters>({
    search: "",
    count: "",
    partyId: "",
    lotNumber: "",
    type: undefined,
    purpose: "",
    poNumber: "",
    startDate: "",
    endDate: "",
    page: 1,
    limit: 50,
  });

  // Active filters count for filter button badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.count) count++;
    if (filters.partyId) count++;
    if (filters.lotNumber) count++;
    if (filters.purpose) count++;
    if (filters.poNumber) count++;
    if (filters.startDate || filters.endDate) count++;
    return count;
  }, [filters]);

  const [showFilterBar, setShowFilterBar] = useState(false);

  // Modals state
  const [isOpeningOpen, setIsOpeningOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isRetireOpen, setIsRetireOpen] = useState(false);
  const [isSellOpen, setIsSellOpen] = useState(false);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [isSlipOpen, setIsSlipOpen] = useState(false);

  // Selected records for targeted modal actions
  const [selectedLot, setSelectedLot] = useState<LotRecord | null>(null);
  const [selectedTx, setSelectedTx] = useState<TransactionRecord | null>(null);

  // Toast / Feedback State
  const [toastMessage, setToastMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // ---------------------------------------------------------------------------
  // QUERIES (OPTIMIZED WITH TAB-BASED LAZY FETCHING & 60s CACHING)
  // ---------------------------------------------------------------------------
  // 1. Stock Summary (KPIs)
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery<StockSummary>({
    queryKey: ["inventory", "summary"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/summary");
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // 2. Lots Stock Ledger (Only fetched when on Lots or Counts tabs)
  const { data: lotsData, isLoading: isLotsLoading } = useQuery<LotRecord[]>({
    queryKey: ["inventory", "lots", filters],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/lots", { params: filters });
      return res.data.data;
    },
    enabled: activeTab === "lots" || activeTab === "counts",
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // 3. Transactions Ledger (Only fetched when user clicks into Transactions tab)
  const { data: txData } = useQuery<{
    items: TransactionRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["inventory", "transactions", filters],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/transactions", { params: filters });
      return res.data.data;
    },
    enabled: activeTab === "transactions",
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // 4. Parties Master (Suppliers/Customers with 2-min cache)
  const { data: partiesData } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data;
    },
    staleTime: 120_000,
  });

  // 5. Active PO Requirements (Only fetched on-demand when Issue or Slip modal is opened)
  const { data: poReqData } = useQuery<PORequirementOption[]>({
    queryKey: ["inventory", "po-requirements"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/po-requirements");
      return res.data.data;
    },
    enabled: isIssueOpen || isSlipOpen,
    staleTime: 60_000,
  });

  const parties = useMemo(() => partiesData || [], [partiesData]);
  const lots = useMemo(() => lotsData || [], [lotsData]);
  const transactions = useMemo(() => txData?.items || [], [txData]);
  const poRequirements = useMemo(() => poReqData || [], [poReqData]);

  // Derived Count-wise grouping
  const countWiseStock = useMemo(() => {
    const map = new Map<
      string,
      { count: string; totalKg: number; totalBags: number; lotCount: number }
    >();
    for (const lot of lots) {
      const c = lot.count || "1/10 KW";
      const existing = map.get(c) || { count: c, totalKg: 0, totalBags: 0, lotCount: 0 };
      existing.totalKg += lot.currentWeightKg;
      existing.totalBags += lot.currentBags;
      existing.lotCount += 1;
      map.set(c, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [lots]);

  // Derived Party-wise grouping
  const partyWiseStock = useMemo(() => {
    const map = new Map<
      string,
      { partyName: string; totalKg: number; totalBags: number; lotCount: number }
    >();
    for (const lot of lots) {
      const pName = lot.party?.name || "Unassigned / Internal";
      const existing = map.get(pName) || {
        partyName: pName,
        totalKg: 0,
        totalBags: 0,
        lotCount: 0,
      };
      existing.totalKg += lot.currentWeightKg;
      existing.totalBags += lot.currentBags;
      existing.lotCount += 1;
      map.set(pName, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [lots]);

  // ---------------------------------------------------------------------------
  // MUTATIONS
  // ---------------------------------------------------------------------------
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const addOpeningMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/opening", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Opening stock recorded successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to add opening stock");
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/received", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Inward yarn shipment received into Main Stock!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to receive inward stock");
    },
  });

  const issueMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/issued", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Yarn issued to production floor successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to issue yarn");
    },
  });

  const returnMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/return", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Yarn returned to stock successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to return yarn");
    },
  });

  const retireMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/retired", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Stock retired / written off successfully.");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to retire stock");
    },
  });

  const sellMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/sold", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Commercial sale recorded successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to record sale");
    },
  });

  const correctionMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiClient.post("/inventory/correction", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Transaction reversed and corrected with complete audit log!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to correct transaction");
    },
  });

  // Export Handler
  const handleExport = async (format: "xlsx" | "csv" = "xlsx") => {
    try {
      showToast("success", `Generating ${format.toUpperCase()} export file...`);
      const response = await apiClient.get("/inventory/export", {
        params: { ...filters, format },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `yarntrace_inventory_${new Date().toISOString().split("T")[0]}.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      showToast("error", "Export failed. Please check permissions and try again.");
    }
  };

  // Helper Badge Color for Transaction Types
  const getTypeBadge = (type: string) => {
    switch (type) {
      case "OPENING":
        return <Badge className="bg-primary/15 text-primary border-primary/30">OPENING</Badge>;
      case "RECEIVED":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
            RECEIVED
          </Badge>
        );
      case "ISSUED":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
            ISSUED
          </Badge>
        );
      case "RETURN":
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
            RETURN
          </Badge>
        );
      case "RETIRED":
        return (
          <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30">
            RETIRED
          </Badge>
        );
      case "SOLD":
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30">
            SOLD
          </Badge>
        );
      case "CORRECTION":
        return (
          <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
            CORRECTION
          </Badge>
        );
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const hasNoData = !isLotsLoading && lots.length === 0 && transactions.length === 0;

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-4 z-[100] p-4 rounded-xl shadow-lg border flex items-center gap-3 transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-700 dark:text-emerald-100"
              : "bg-red-50 border-red-300 text-red-900 dark:bg-red-950 dark:border-red-700 dark:text-red-100"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
          )}
          <span className="text-xs font-medium">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-auto p-1 rounded-full hover:bg-black/5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Yarn Stock & Lot Inventory"
        subtitle="Manage warehouse stock balances in KG, yarn counts, and physical location allocations."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "kanban"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Kanban className="h-3.5 w-3.5 text-primary" />
                <span>Kanban Pipeline</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "table"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <List className="h-3.5 w-3.5 text-slate-500" />
                <span>Detailed Table</span>
              </button>
            </div>

            {/* Refresh Button placed right near Kanban Pipeline */}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ["inventory"] }),
                  queryClient.invalidateQueries({ queryKey: ["production"] }),
                  queryClient.invalidateQueries({ queryKey: ["parties"] }),
                ]);
                showToast("success", "Inventory and pipeline synchronized with live ledger.");
              }}
              className="gap-1.5 h-8 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border-slate-200 shadow-sm"
              title="Sync live pipeline and inventory"
            >
              <RotateCw className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {/* Toggle Filters */}
            <Button
              variant={showFilterBar ? "primary" : "outline"}
              size="sm"
              onClick={() => setShowFilterBar(!showFilterBar)}
              className={`gap-1.5 h-8 text-xs font-semibold transition-all ${
                showFilterBar ? "bg-slate-900 text-white hover:bg-slate-800" : ""
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              <span>{showFilterBar ? "Hide Filters" : "Filter Lots"}</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-brand-500 text-white text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {/* Single Primary Action Button */}
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
                    onClick={() => setIsAddStockMenuOpen(!isAddStockMenuOpen)}
                    className="gap-1.5 h-8 px-3 text-xs font-semibold shadow-sm bg-brand-600 hover:bg-brand-700 text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Stock</span>
                    <ChevronDown className="h-3 w-3 opacity-80" />
                  </Button>

                  {isAddStockMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsAddStockMenuOpen(false)}
                      />
                      <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white p-1.5 shadow-xl border border-slate-200 z-50 animate-in fade-in slide-in-from-top-1 text-xs">
                        {canReceiveStock && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddStockMenuOpen(false);
                              setIsReceiveOpen(true);
                            }}
                            className="w-full flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-emerald-50 text-left transition-colors group"
                          >
                            <ArrowDownLeft className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                            <div>
                              <div className="font-semibold text-slate-800">Receive Inward Stock</div>
                              <div className="text-[10px] text-slate-500">From supplier or dyeing mill</div>
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
                              setIsAddStockMenuOpen(false);
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

      {/* Expandable Filter Bar (Unified for both Kanban & Table views) */}
      {showFilterBar && (
        <div className="mb-4">
          <InventoryFilterBar
            filters={filters}
            parties={parties}
            onFilterChange={(newF) => setFilters((prev) => ({ ...prev, ...newF, page: 1 }))}
            onReset={() =>
              setFilters({
                search: "",
                count: "",
                partyId: "",
                lotNumber: "",
                type: undefined,
                purpose: "",
                poNumber: "",
                startDate: "",
                endDate: "",
                page: 1,
                limit: 50,
              })
            }
            activeTab={activeTab}
          />
        </div>
      )}

      {/* Main View: Kanban Pipeline vs Detailed Table */}
      {viewMode === "kanban" ? (
        <StockKanbanBoard
          onShowToast={(type, text) => showToast(type, text)}
          externalFilters={filters}
          isEmbeddedInInventory={true}
        />
      ) : (
        <>
          {/* Real KPI Summary Cards */}
          <InventoryKpiCards summary={summaryData} isLoading={isSummaryLoading} />

      {/* Main Stock Table / Views */}
      {hasNoData ? (
        <Card>
          <CardHeader>
            <CardTitle>Warehouse Stock Balances</CardTitle>
            <CardDescription>
              Live real-time quantity in KG tracked across storage locations and lots
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="No inventory records available yet"
              description="Start by adding Opening Stock or recording inward yarn shipments from suppliers."
              icon={Boxes}
              actionLabel="+ Add Initial Opening Stock"
              onAction={() => setIsOpeningOpen(true)}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm border-border">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-heading">Warehouse Stock Balances</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Live real-time quantity in KG derived directly from immutable transaction ledger
                </CardDescription>
              </div>

              {/* View Navigation Tabs */}
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border overflow-x-auto max-w-full">
                <button
                  onClick={() => setActiveTab("lots")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === "lots"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Lot-Wise Stock ({lots.length})
                </button>
                <button
                  onClick={() => setActiveTab("transactions")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === "transactions"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Transaction Ledger ({transactions.length})
                </button>
                <button
                  onClick={() => setActiveTab("counts")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === "counts"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Count-Wise ({countWiseStock.length})
                </button>
                <button
                  onClick={() => setActiveTab("parties")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === "parties"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Party-Wise ({partyWiseStock.length})
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* 1. LOT-WISE STOCK VIEW */}
            {activeTab === "lots" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Lot Number</th>
                      <th className="py-3 px-3">Yarn Count</th>
                      <th className="py-3 px-3">Supplier / Party</th>
                      <th className="py-3 px-3 text-right">Total In (KG)</th>
                      <th className="py-3 px-3 text-right">Issued (KG)</th>
                      <th className="py-3 px-3 text-right">Returned</th>
                      <th className="py-3 px-3 text-right">Retired</th>
                      <th className="py-3 px-3 text-right">Sold</th>
                      <th className="py-3 px-3 text-right text-primary font-bold">Balance (KG)</th>
                      <th className="py-3 px-3 text-right font-bold">Bags</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lots.map((lot) => (
                      <tr key={lot.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-foreground">
                          <span
                            onClick={() =>
                              router.push(`/traceability?lot=${encodeURIComponent(lot.lotNumber)}`)
                            }
                            className="cursor-pointer hover:text-brand-600 hover:underline"
                            title="Trace Lot Genealogy"
                          >
                            {lot.lotNumber}
                          </span>
                          {lot.parentLot && (
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              Parent: {lot.parentLot.lotNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold text-foreground">{lot.count}</td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {lot.party?.name || "—"}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                          {lot.totalInKg.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-amber-700 dark:text-amber-400">
                          {lot.totalIssuedKg.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-blue-700 dark:text-blue-400">
                          {lot.totalReturnedKg.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-rose-600">
                          {lot.totalRetiredKg.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-purple-600">
                          {lot.totalSoldKg.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-primary text-sm">
                          {lot.currentWeightKg.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                          {lot.currentBags}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge
                            variant="outline"
                            className={
                              lot.currentWeightKg > 0
                                ? "bg-emerald-500/10 text-emerald-700 border-emerald-300"
                                : "bg-neutral-500/10 text-neutral-600 border-neutral-300"
                            }
                          >
                            {lot.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(
                                  `/traceability?lot=${encodeURIComponent(lot.lotNumber)}`
                                )
                              }
                              className="h-7 px-2 text-[11px] text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                              title="Trace Lot Genealogy"
                            >
                              <GitBranch className="h-3 w-3 mr-0.5" />
                              Trace
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedLot(lot);
                                setIsIssueOpen(true);
                              }}
                              disabled={lot.currentWeightKg <= 0}
                              className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              title="Issue to Production"
                            >
                              <ArrowUpRight className="h-3 w-3 mr-0.5" />
                              Issue
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedLot(lot);
                                setIsSellOpen(true);
                              }}
                              disabled={lot.currentWeightKg <= 0}
                              className="h-7 px-2 text-[11px] text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                              title="Sell Externally"
                            >
                              <DollarSign className="h-3 w-3 mr-0.5" />
                              Sell
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedLot(lot);
                                setIsRetireOpen(true);
                              }}
                              disabled={lot.currentWeightKg <= 0}
                              className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              title="Retire / Write Off"
                            >
                              <AlertOctagon className="h-3 w-3 mr-0.5" />
                              Retire
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 2. TRANSACTION LEDGER VIEW */}
            {activeTab === "transactions" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-3">Tx Number</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">Yarn Count</th>
                      <th className="py-3 px-3">Party / Supplier</th>
                      <th className="py-3 px-3">Lot No</th>
                      <th className="py-3 px-3 text-right">Bags</th>
                      <th className="py-3 px-3 text-right font-bold">KG</th>
                      <th className="py-3 px-3">PO Number</th>
                      <th className="py-3 px-3">Purpose</th>
                      <th className="py-3 px-3">Logged By</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          {new Date(tx.transactionDate).toISOString().split("T")[0]}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-foreground">
                          {tx.transactionNumber}
                          {tx.referenceTransaction && (
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              Ref: {tx.referenceTransaction.transactionNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">{getTypeBadge(tx.type)}</td>
                        <td className="py-3 px-3 font-semibold text-foreground">{tx.count}</td>
                        <td className="py-3 px-3 text-muted-foreground">{tx.party?.name || "—"}</td>
                        <td className="py-3 px-3 font-mono text-foreground">{tx.lotNumber}</td>
                        <td className="py-3 px-3 text-right font-mono">{tx.bags}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-primary text-sm">
                          {tx.kilos.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 font-mono text-muted-foreground">
                          {tx.poNumber || "—"}
                        </td>
                        <td className="py-3 px-3">
                          {tx.purpose ? <Badge variant="outline">{tx.purpose}</Badge> : "—"}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground text-[11px]">
                          {tx.createdBy}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Printable Yarn Slip */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedTx(tx);
                                setIsSlipOpen(true);
                              }}
                              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              title="Print Yarn Slip"
                            >
                              <Printer className="h-3 w-3 mr-0.5" />
                              Slip
                            </Button>

                            {/* Return action for ISSUED */}
                            {tx.type === "ISSUED" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedTx(tx);
                                  setIsReturnOpen(true);
                                }}
                                className="h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                title="Return Yarn"
                              >
                                <RotateCcw className="h-3 w-3 mr-0.5" />
                                Return
                              </Button>
                            )}

                            {/* Reverse & Correct Transaction */}
                            {tx.type !== "CORRECTION" && tx.type !== "OPENING" && !(tx as any).isCorrected && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedTx(tx);
                                  setIsCorrectionOpen(true);
                                }}
                                className="h-7 px-2 text-[11px] text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Reverse / Correct Transaction"
                              >
                                <History className="h-3 w-3 mr-0.5" />
                                Correct
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 3. COUNT-WISE STOCK VIEW */}
            {activeTab === "counts" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px] text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Yarn Count (Manual Identity)</th>
                      <th className="py-3 px-3 text-center">Associated Lots</th>
                      <th className="py-3 px-3 text-right">Total Bags</th>
                      <th className="py-3 px-4 text-right text-primary font-bold">
                        Total In-Stock (KG)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {countWiseStock.map((row) => (
                      <tr key={row.count} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-bold text-foreground text-sm">{row.count}</td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="outline">{row.lotCount} Lots</Badge>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold">
                          {row.totalBags} Bags
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-primary text-base">
                          {row.totalKg.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          KG
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. PARTY-WISE STOCK VIEW */}
            {activeTab === "parties" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[550px] text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-semibold border-b border-border uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Party / Mill / Supplier</th>
                      <th className="py-3 px-3 text-center">Lots Supplied</th>
                      <th className="py-3 px-3 text-right">Total Bags</th>
                      <th className="py-3 px-4 text-right text-primary font-bold">
                        Total In-Stock (KG)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {partyWiseStock.map((row) => (
                      <tr key={row.partyName} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-bold text-foreground text-sm">
                          {row.partyName}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="outline">{row.lotCount} Lots</Badge>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold">
                          {row.totalBags} Bags
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-primary text-base">
                          {row.totalKg.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          KG
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )}

      {/* ---------------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ---------------------------------------------------------------------- */}
      {/* 1. Opening Stock Modal */}
      <OpeningStockModal
        isOpen={isOpeningOpen}
        onClose={() => setIsOpeningOpen(false)}
        onSubmit={async (v) => {
          await addOpeningMutation.mutateAsync(v);
        }}
        parties={parties}
        isLoading={addOpeningMutation.isPending}
      />

      {/* 2. Receive Stock Modal */}
      <ReceiveStockModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        onSubmit={async (v) => {
          await receiveMutation.mutateAsync(v);
        }}
        parties={parties}
        isLoading={receiveMutation.isPending}
      />

      {/* 3. Issue Stock Modal */}
      <IssueStockModal
        isOpen={isIssueOpen}
        onClose={() => {
          setIsIssueOpen(false);
          setSelectedLot(null);
        }}
        onSubmit={async (v) => {
          await issueMutation.mutateAsync(v);
        }}
        lots={lots}
        parties={parties}
        poRequirements={poRequirements}
        preselectedLot={selectedLot}
        isLoading={issueMutation.isPending}
      />

      {/* 4. Return Stock Modal */}
      <ReturnStockModal
        isOpen={isReturnOpen}
        onClose={() => {
          setIsReturnOpen(false);
          setSelectedTx(null);
        }}
        onSubmit={async (v) => {
          await returnMutation.mutateAsync(v);
        }}
        issuedTransactions={transactions}
        preselectedTransaction={selectedTx}
        isLoading={returnMutation.isPending}
      />

      {/* 5. Retire Stock Modal */}
      <RetireStockModal
        isOpen={isRetireOpen}
        onClose={() => {
          setIsRetireOpen(false);
          setSelectedLot(null);
        }}
        onSubmit={async (v) => {
          await retireMutation.mutateAsync(v);
        }}
        lots={lots}
        preselectedLot={selectedLot}
        isLoading={retireMutation.isPending}
      />

      {/* 6. Sell Stock Modal */}
      <SellStockModal
        isOpen={isSellOpen}
        onClose={() => {
          setIsSellOpen(false);
          setSelectedLot(null);
        }}
        onSubmit={async (v) => {
          await sellMutation.mutateAsync(v);
        }}
        lots={lots}
        parties={parties}
        preselectedLot={selectedLot}
        isLoading={sellMutation.isPending}
      />

      {/* 7. Correction Modal */}
      <CorrectionModal
        isOpen={isCorrectionOpen}
        onClose={() => {
          setIsCorrectionOpen(false);
          setSelectedTx(null);
        }}
        onSubmit={async (v) => {
          await correctionMutation.mutateAsync(v);
        }}
        transaction={selectedTx}
        isLoading={correctionMutation.isPending}
      />

      {/* 8. Yarn Slip Printable Modal */}
      <YarnSlipModal
        isOpen={isSlipOpen}
        onClose={() => {
          setIsSlipOpen(false);
          setSelectedTx(null);
        }}
        transaction={selectedTx}
      />
    </AppLayout>
  );
}
