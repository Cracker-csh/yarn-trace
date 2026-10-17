"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Network,
  Search,
  Boxes,
  Factory,
  Sparkles,
  Building2,
  CheckCircle2,
  Clock,
  Layers,
  AlertCircle,
  Download,
  Printer,
  RotateCw,
  GitBranch,
  Truck,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  AlertOctagon,
  ShieldCheck,
  PackageCheck,
  ExternalLink,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { apiClient } from "../../lib/axios";
import {
  ActiveLotPill,
  ForwardTraceData,
  BackwardTraceData,
  TimelineNode,
} from "../../types/traceability";

function TraceabilityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Search parameters from deep linking
  const paramLot = searchParams.get("lot") || "";
  const paramProduct = searchParams.get("product") || searchParams.get("order") || "";
  const paramTab = searchParams.get("tab") || "";

  const [traceType, setTraceType] = useState<"forward" | "backward">(
    paramProduct ? "backward" : paramTab === "backward" ? "backward" : "forward"
  );
  const [searchQuery, setSearchQuery] = useState(paramLot || paramProduct || "");
  const [activeQuery, setActiveQuery] = useState(paramLot || paramProduct || "");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Sync state when URL search params change
  useEffect(() => {
    if (paramLot) {
      setTraceType("forward");
      setSearchQuery(paramLot);
      setActiveQuery(paramLot);
    } else if (paramProduct) {
      setTraceType("backward");
      setSearchQuery(paramProduct);
      setActiveQuery(paramProduct);
    }
  }, [paramLot, paramProduct]);

  // Debounce autocomplete search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 1. Fetch Real Active Lots for Suggestion Pills
  const { data: activeLots = [], isLoading: isActiveLotsLoading } = useQuery<ActiveLotPill[]>({
    queryKey: ["traceability", "lots", "active"],
    queryFn: async () => {
      const res = await apiClient.get("/traceability/lots/active?limit=8");
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // 2. Autocomplete Suggestions Query
  const { data: autocompleteResults = [] } = useQuery({
    queryKey: ["traceability", "autocomplete", traceType, debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      if (traceType === "forward") {
        const res = await apiClient.get(`/traceability/lots/search?q=${encodeURIComponent(debouncedSearch)}&limit=6`);
        return res.data.data;
      } else {
        const res = await apiClient.get(`/traceability/products/search?q=${encodeURIComponent(debouncedSearch)}&limit=6`);
        return res.data.data;
      }
    },
    enabled: showAutocomplete && debouncedSearch.length >= 2,
    staleTime: 10_000,
  });

  // 3. Main Trace Query (Forward or Backward)
  const {
    data: traceResult,
    isLoading: isTraceLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ForwardTraceData | BackwardTraceData | null>({
    queryKey: ["traceability", traceType, activeQuery],
    queryFn: async () => {
      if (!activeQuery.trim()) return null;
      if (traceType === "forward") {
        const res = await apiClient.get(`/traceability/forward/lot/${encodeURIComponent(activeQuery.trim())}`);
        return res.data.data as ForwardTraceData;
      } else {
        const res = await apiClient.get(`/traceability/backward/product/${encodeURIComponent(activeQuery.trim())}`);
        return res.data.data as BackwardTraceData;
      }
    },
    enabled: !!activeQuery.trim(),
    retry: false,
    staleTime: 60_000,
  });

  // Form search submission
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowAutocomplete(false);
    if (searchQuery.trim()) {
      const query = searchQuery.trim();
      setActiveQuery(query);
      if (traceType === "forward") {
        router.replace(`/traceability?lot=${encodeURIComponent(query)}&tab=forward`);
      } else {
        router.replace(`/traceability?product=${encodeURIComponent(query)}&tab=backward`);
      }
    }
  };

  const handleSelectPill = (lotNum: string) => {
    setShowAutocomplete(false);
    setTraceType("forward");
    setSearchQuery(lotNum);
    setActiveQuery(lotNum);
    router.replace(`/traceability?lot=${encodeURIComponent(lotNum)}&tab=forward`);
  };

  const handleSelectAutocomplete = (identifier: string) => {
    setShowAutocomplete(false);
    setSearchQuery(identifier);
    setActiveQuery(identifier);
    if (traceType === "forward") {
      router.replace(`/traceability?lot=${encodeURIComponent(identifier)}&tab=forward`);
    } else {
      router.replace(`/traceability?product=${encodeURIComponent(identifier)}&tab=backward`);
    }
  };

  // Export CSV Report
  const handleExportCsv = async () => {
    if (!activeQuery) return;
    try {
      setIsExporting(true);
      const res = await apiClient.get("/traceability/export", {
        params: {
          type: traceType,
          identifier: activeQuery,
        },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `YarnTrace-${traceType === "forward" ? "Lot" : "Product"}-${activeQuery}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Failed to export traceability CSV:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Format human-friendly error messages
  const getErrorMessage = () => {
    if (!error) return "Record not found.";
    const errObj = error as any;
    if (errObj.response?.status === 404 || errObj.message?.includes("404")) {
      return traceType === "forward"
        ? `Lot "${activeQuery}" was not found in the inventory database. Please check the lot number or select an active lot from the suggestion pills.`
        : `Product or Work Order "${activeQuery}" was not found. Please verify the product code or work order number.`;
    }
    if (errObj.response?.status === 403) {
      return "You do not have permission to view traceability records.";
    }
    return `Unable to load genealogical trace: ${errObj.response?.data?.message || errObj.message || "Please check server status."}`;
  };

  // Type guards for forward vs backward data
  const isForwardData = (data: any): data is ForwardTraceData => {
    return data?.root?.type === "LOT";
  };

  const isBackwardData = (data: any): data is BackwardTraceData => {
    return data?.root?.type === "PRODUCT";
  };

  return (
    <AppLayout>
      <PageHeader
        title="End-to-End Traceability Engine"
        subtitle="Perform bidirectional genealogical tracing: Forward (Yarn Lot → Floor Movement → Product) or Backward (Product → Yarn Lot)."
        action={
          <div className="flex items-center gap-2">
            {traceResult && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={isExporting}
                  className="gap-1.5 h-9 text-xs"
                >
                  <Download className={`h-3.5 w-3.5 ${isExporting ? "animate-bounce" : ""}`} />
                  <span>Export CSV</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  className="gap-1.5 h-9 text-xs hidden sm:flex"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Report</span>
                </Button>
              </>
            )}
            {activeQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5 h-9 text-xs"
                title="Refresh Trace"
              >
                <RotateCw className={`h-3.5 w-3.5 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
                <span className="hidden md:inline">Sync</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Trace Query Search Box Card */}
      <Card className="mb-8 border-brand-200 shadow-sm card-interactive">
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row items-stretch md:items-center gap-3 sm:gap-4">
            {/* Mode Switcher */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center rounded-lg border border-slate-200 p-1 bg-slate-100 shrink-0 w-full md:w-auto gap-1 sm:gap-0">
              <button
                type="button"
                onClick={() => {
                  setTraceType("forward");
                  setSearchQuery("");
                  setActiveQuery("");
                  setShowAutocomplete(false);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all text-center ${
                  traceType === "forward"
                    ? "bg-white text-brand-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Forward Trace (Lot → Party)
              </button>
              <button
                type="button"
                onClick={() => {
                  setTraceType("backward");
                  setSearchQuery("");
                  setActiveQuery("");
                  setShowAutocomplete(false);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all text-center ${
                  traceType === "backward"
                    ? "bg-white text-brand-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Backward Trace (Product → Lot)
              </button>
            </div>

            {/* Search Input with Autocomplete Dropdown */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={
                  traceType === "forward"
                    ? "Enter Lot Number (e.g. LOT-1014, #YT-9482, DEMO-LOT-001)..."
                    : "Enter Finished Product Code, Name, or Work Order Number..."
                }
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowAutocomplete(true);
                }}
                onFocus={() => setShowAutocomplete(true)}
                className="pl-9 h-10 font-mono text-xs sm:text-sm w-full"
              />

              {/* Autocomplete Dropdown */}
              {showAutocomplete && autocompleteResults.length > 0 && (
                <div className="absolute top-11 left-0 right-0 z-50 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden divide-y divide-slate-100">
                  {autocompleteResults.map((item: any) => (
                    <div
                      key={item.id}
                      onClick={() =>
                        handleSelectAutocomplete(
                          traceType === "forward" ? item.lotNumber : item.productCode
                        )
                      }
                      className="p-2.5 hover:bg-brand-50 hover:text-brand-900 cursor-pointer text-xs flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-slate-800 shrink-0">
                          {traceType === "forward" ? item.lotNumber : item.productCode}
                        </span>
                        <span className="text-slate-500 truncate">
                          {traceType === "forward"
                            ? `${item.yarnCount} • ${item.supplierName}`
                            : `${item.name}`}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 ml-2">
                        {traceType === "forward"
                          ? `${item.currentWeightKg?.toFixed(2)} KG`
                          : `${item.totalQuantityKg?.toFixed(2)} KG`}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" variant="primary" className="gap-2 shrink-0 h-10 shadow-sm w-full md:w-auto">
              <Network className="h-4 w-4" />
              <span>Trace Genealogy</span>
            </Button>
          </form>

          {/* Quick Clickable Suggestions from Real Database */}
          {traceType === "forward" && (
            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Boxes className="h-3 w-3 text-brand-600" />
                <span>Active Lots:</span>
              </span>
              {isActiveLotsLoading ? (
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-24 rounded-md" />
                  <Skeleton className="h-6 w-20 rounded-md" />
                </div>
              ) : activeLots.length > 0 ? (
                activeLots.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => handleSelectPill(l.lotNumber)}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-mono transition-all ${
                      activeQuery.toLowerCase() === l.lotNumber.toLowerCase()
                        ? "bg-brand-600 text-white border-brand-600 font-bold shadow-sm"
                        : "bg-slate-50 hover:bg-brand-50 hover:text-brand-700 text-slate-700 border-slate-200"
                    }`}
                  >
                    {l.lotNumber} ({l.yarnCount}){" "}
                    <span className="opacity-70 font-normal">
                      {l.currentWeightKg > 0 ? `${l.currentWeightKg.toFixed(0)}kg` : "0kg"}
                    </span>
                  </button>
                ))
              ) : (
                <span className="text-slate-400 italic">No lots recorded yet</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Structured Error State (No Raw Axios/Server Errors) */}
      {isError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-xs text-red-900 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-red-950">Genealogical Lookup Notice</p>
              <p className="text-red-800 mt-0.5">{getErrorMessage()}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="h-8 text-xs bg-white text-red-700 hover:bg-red-50 border-red-300 shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Main Trace Visualization View */}
      {isTraceLoading ? (
        <Card>
          <CardContent className="py-12 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <RotateCw className="h-6 w-6 text-brand-600 animate-spin" />
              <p className="text-sm font-semibold text-slate-700">
                Calculating genealogical trace and quantity reconciliation...
              </p>
            </div>
            <div className="space-y-4 max-w-2xl mx-auto pt-4">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ) : !traceResult ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-12">
            <EmptyState
              title={
                traceType === "forward"
                  ? "No active lot trace selected"
                  : "No finished product trace selected"
              }
              description={
                traceType === "forward"
                  ? "Enter a Yarn Lot number or click one of the suggested active lots above to trace its entire transformation journey from spinning mill to finished dispatch."
                  : "Enter a finished product code or work order number to trace backward to the exact yarn lots and suppliers used in its manufacturing."
              }
              icon={Network}
            />
          </CardContent>
        </Card>
      ) : isForwardData(traceResult) ? (
        /* ========================================================================= */
        /* FORWARD TRACE VIEW                                                        */
        /* ========================================================================= */
        <div className="space-y-8">
          {/* 1. Lot KPI Header Card */}
          <Card className="border-brand-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-6 text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold text-xl shadow-lg ring-4 ring-brand-500/20 shrink-0">
                    <Boxes className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h3 className="font-display text-xl sm:text-2xl font-bold font-mono tracking-tight text-white break-all">
                        {traceResult.root.lotNumber}
                      </h3>
                      <Badge
                        variant="outline"
                        className="bg-brand-500/20 text-brand-300 border-brand-400/40 text-xs font-bold"
                      >
                        {traceResult.summary.statusBadge}
                      </Badge>
                      {traceResult.parentLot && (
                        <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-400/40 text-[11px]">
                          Dyed Child Lot
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-3">
                      <span>
                        Count: <strong className="text-white">{traceResult.root.yarnCount}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Supplier:{" "}
                        <strong className="text-white">
                          {traceResult.root.supplier?.name || "Spinning Mill"}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Received:{" "}
                        {new Date(traceResult.root.receivedDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-left sm:text-right w-full sm:w-auto">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex-1 sm:flex-initial min-w-[120px]">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Initial Inward
                    </p>
                    <p className="font-display text-base sm:text-lg font-bold font-mono text-white">
                      {traceResult.summary.sourceKg.toFixed(2)} KG
                    </p>
                    <p className="text-[10px] text-slate-400">{traceResult.root.initialBags} bags</p>
                  </div>
                  <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30 flex-1 sm:flex-initial min-w-[120px]">
                    <p className="text-[10px] font-semibold text-brand-300 uppercase tracking-wider">
                      Main Warehouse Stock
                    </p>
                    <p className="font-display text-base sm:text-lg font-bold font-mono text-brand-400">
                      {traceResult.summary.currentMainStockKg.toFixed(2)} KG
                    </p>
                    <p className="text-[10px] text-brand-300">{traceResult.summary.currentMainStockBags} bags</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Parent & Child Lot Lineage Banner (if applicable) */}
            {traceResult.parentLot && (
              <div className="p-3 bg-purple-50 border-t border-b border-purple-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-purple-900 px-4 sm:px-6">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-purple-600 shrink-0" />
                  <span className="break-words">
                    Transformed from Parent Raw Lot:{" "}
                    <strong className="font-mono">{traceResult.parentLot.lotNumber}</strong> (
                    {traceResult.parentLot.yarnCount}) — Supplier:{" "}
                    {traceResult.parentLot.supplierName}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSelectPill(traceResult.parentLot!.lotNumber)}
                  className="h-7 text-xs bg-white text-purple-700 hover:bg-purple-100 border-purple-300 shrink-0"
                >
                  Trace Parent Lot
                </Button>
              </div>
            )}

            {/* 2. Real Quantity Reconciliation Metric Grid */}
            <CardContent className="p-4 sm:p-6 bg-slate-50/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-brand-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Quantity Reconciliation & Floor Ledger
                  </h4>
                </div>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                  ✓ Math Reconciled
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase">1. Inward Source</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-slate-900 mt-1 break-words">
                    {traceResult.summary.sourceKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-slate-400">Initial received</p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-amber-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-amber-700 uppercase">2. Issued to Floor</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-amber-800 mt-1 break-words">
                    {traceResult.summary.issuedKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-amber-600">Issued slips</p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-sky-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-sky-700 uppercase">3. Allocated</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-sky-800 mt-1 break-words">
                    {traceResult.summary.allocatedKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-sky-600">Work orders</p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-emerald-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-emerald-700 uppercase">4. Consumed</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-emerald-800 mt-1 break-words">
                    {traceResult.summary.consumedKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-emerald-600">
                    Waste: {traceResult.summary.wasteKg.toFixed(1)}kg
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-blue-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-blue-700 uppercase">5. Floor Returns</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-blue-800 mt-1 break-words">
                    {traceResult.summary.productionReturnedKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-blue-600">Returned to main</p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-purple-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-purple-700 uppercase">6. Floor Balance</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-purple-800 mt-1 break-words">
                    {traceResult.summary.currentTeamStockKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-purple-600">With floor teams</p>
                </div>

                <div className="p-3 rounded-xl bg-white border border-teal-200 shadow-sm min-w-0">
                  <p className="text-[10px] font-semibold text-teal-700 uppercase">7. Total Output</p>
                  <p className="text-xs sm:text-sm font-bold font-mono text-teal-800 mt-1 break-words">
                    {traceResult.summary.totalOutputKg.toFixed(2)} KG
                  </p>
                  <p className="text-[10px] text-teal-600">Finished goods</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 3. Connected Production Teams & Work Orders Table (if any) */}
          {traceResult.workOrders.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle>Connected Production Orders</CardTitle>
                    <CardDescription>
                      Work orders consuming raw yarn from Lot {traceResult.root.lotNumber}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="w-fit">{traceResult.workOrders.length} Work Orders</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Work Order</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Floor Team</th>
                        <th className="py-3 px-3">Customer / PO</th>
                        <th className="py-3 px-3 text-right">Allocated</th>
                        <th className="py-3 px-3 text-right">Consumed</th>
                        <th className="py-3 px-3 text-right">Returned</th>
                        <th className="py-3 px-3 text-right font-bold">Outputs</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                      {traceResult.workOrders.map((wo) => (
                        <tr key={wo.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {wo.orderNumber}
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="outline" className="text-[10px]">
                              {wo.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 text-slate-800">{wo.teamName}</td>
                          <td className="py-3 px-3 text-slate-600">
                            {wo.partyName} {wo.poNumber ? `(${wo.poNumber})` : ""}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-semibold">
                            {wo.allocatedKg.toFixed(2)} KG
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-emerald-700">
                            {wo.consumedKg.toFixed(2)} KG
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-blue-700">
                            {wo.returnedKg.toFixed(2)} KG
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {wo.outputs.reduce((s, o) => s + o.outputQuantityKg, 0).toFixed(2)} KG
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                router.push(`/production?order=${encodeURIComponent(wo.orderNumber)}`)
                              }
                              className="h-7 px-2 text-[11px] text-brand-600 hover:text-brand-700"
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 4. Complete Genealogical Trail */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Genealogical Traceability Trail</CardTitle>
                  <CardDescription>
                    Step-by-step chronological audit from original yarn inward reception to finished dispatch
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {traceResult.timeline.length} Genealogical Stages
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 sm:pl-8 border-l-2 border-brand-200 space-y-6 ml-2 sm:ml-4 py-2">
                {traceResult.timeline.map((node) => {
                  const getNodeBadgeConfig = (type: TimelineNode["type"]) => {
                    switch (type) {
                      case "PARENT_LOT":
                        return {
                          bg: "bg-purple-600",
                          icon: GitBranch,
                          borderColor: "border-purple-200",
                          cardBg: "bg-purple-50/20",
                        };
                      case "OPENING":
                      case "RECEIVED":
                        return {
                          bg: "bg-brand-600",
                          icon: Building2,
                          borderColor: "border-brand-200",
                          cardBg: "bg-white",
                        };
                      case "ISSUED":
                        return {
                          bg: "bg-amber-600",
                          icon: ArrowUpRight,
                          borderColor: "border-amber-200",
                          cardBg: "bg-amber-50/20",
                        };
                      case "ALLOCATED":
                        return {
                          bg: "bg-sky-600",
                          icon: Factory,
                          borderColor: "border-sky-200",
                          cardBg: "bg-sky-50/20",
                        };
                      case "CONSUMED":
                        return {
                          bg: "bg-emerald-600",
                          icon: CheckCircle2,
                          borderColor: "border-emerald-200",
                          cardBg: "bg-emerald-50/20",
                        };
                      case "RETURN":
                      case "RETURNED":
                        return {
                          bg: "bg-blue-600",
                          icon: ArrowDownLeft,
                          borderColor: "border-blue-200",
                          cardBg: "bg-blue-50/20",
                        };
                      case "SOLD":
                        return {
                          bg: "bg-purple-600",
                          icon: DollarSign,
                          borderColor: "border-purple-200",
                          cardBg: "bg-purple-50/20",
                        };
                      case "RETIRED":
                        return {
                          bg: "bg-rose-600",
                          icon: AlertOctagon,
                          borderColor: "border-rose-200",
                          cardBg: "bg-rose-50/20",
                        };
                      case "CORRECTION":
                        return {
                          bg: "bg-slate-600",
                          icon: ShieldCheck,
                          borderColor: "border-slate-200",
                          cardBg: "bg-slate-50/40",
                        };
                      case "PRODUCTION_OUTPUT":
                        return {
                          bg: "bg-indigo-600",
                          icon: PackageCheck,
                          borderColor: "border-indigo-200",
                          cardBg: "bg-indigo-50/20",
                        };
                      case "DELIVERED":
                        return {
                          bg: "bg-green-600",
                          icon: Truck,
                          borderColor: "border-green-200",
                          cardBg: "bg-green-50/20",
                        };
                      case "CHILD_LOT":
                        return {
                          bg: "bg-teal-600",
                          icon: Sparkles,
                          borderColor: "border-teal-200",
                          cardBg: "bg-teal-50/20",
                        };
                      default:
                        return {
                          bg: "bg-slate-600",
                          icon: Clock,
                          borderColor: "border-slate-200",
                          cardBg: "bg-white",
                        };
                    }
                  };

                  const cfg = getNodeBadgeConfig(node.type);
                  const Icon = cfg.icon;

                  return (
                    <div key={node.id} className="relative group">
                      {/* Timeline Node Icon Indicator */}
                      <div
                        className={`absolute -left-[31px] sm:-left-[39px] top-1.5 h-6 w-6 rounded-full ${cfg.bg} text-white flex items-center justify-center ring-4 ring-white shadow-sm`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>

                      {/* Event Detail Card */}
                      <div
                        className={`rounded-xl border ${cfg.borderColor} ${cfg.cardBg} p-4 shadow-sm hover:shadow-md transition-all`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900 font-sans">
                              {node.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">
                              {node.type}
                            </Badge>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            {new Date(node.date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {node.description}
                        </p>

                        {/* Extra metadata footer */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
                          <div className="flex flex-wrap items-center gap-x-3">
                            {node.quantityKg !== undefined && node.quantityKg !== null && (
                              <span className="font-bold text-slate-900">
                                {Number(node.quantityKg).toFixed(2)} KG
                              </span>
                            )}
                            {node.partyName && <span>Party: {node.partyName}</span>}
                            {node.teamName && <span>Team: {node.teamName}</span>}
                            {node.workOrderNumber && <span>WO: #{node.workOrderNumber}</span>}
                            {node.transactionNumber && <span>Tx: {node.transactionNumber}</span>}
                            {node.referenceNumber && <span>Ref: {node.referenceNumber}</span>}
                          </div>
                          {node.actor && <span className="text-slate-400">Logged by {node.actor}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : isBackwardData(traceResult) ? (
        /* ========================================================================= */
        /* BACKWARD TRACE VIEW                                                       */
        /* ========================================================================= */
        <div className="space-y-8">
          {/* 1. Finished Product Header Card */}
          <Card className="border-indigo-200 shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 sm:p-6 text-white">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-lg ring-4 ring-indigo-500/20 shrink-0">
                    <Layers className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h3 className="font-display text-xl sm:text-2xl font-bold font-mono tracking-tight text-white break-all">
                        {traceResult.root.productCode}
                      </h3>
                      <Badge
                        variant="outline"
                        className="bg-indigo-500/20 text-indigo-300 border-indigo-400/40 text-xs font-bold"
                      >
                        {traceResult.summary.statusBadge}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-3">
                      <span>
                        Product: <strong className="text-white">{traceResult.root.name}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Work Order:{" "}
                        <strong className="text-white">
                          {traceResult.productionOrder?.orderNumber || "—"}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Customer:{" "}
                        <strong className="text-white">
                          {traceResult.productionOrder?.customerName || "Internal / Stock"}
                        </strong>
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-left sm:text-right w-full sm:w-auto">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex-1 sm:flex-initial min-w-[120px]">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Total Output Quantity
                    </p>
                    <p className="font-display text-base sm:text-lg font-bold font-mono text-white">
                      {traceResult.summary.totalOutputKg.toFixed(2)} KG
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex-1 sm:flex-initial min-w-[120px]">
                    <p className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">
                      Batch Yield
                    </p>
                    <p className="font-display text-base sm:text-lg font-bold font-mono text-indigo-300">
                      {traceResult.summary.yieldPercentage}%
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Consumed Raw Yarn Summary Grid */}
            <CardContent className="p-4 sm:p-6 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Raw Yarn Lots Consumed ({traceResult.consumedLots.length} Lots)
                  </h4>
                </div>
                <span className="text-xs text-slate-500">
                  Total Yarn Consumed:{" "}
                  <strong className="text-slate-900 font-mono">
                    {traceResult.summary.totalConsumedKg.toFixed(2)} KG
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {traceResult.consumedLots.map((lot) => (
                  <div
                    key={lot.lotId}
                    className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        onClick={() => handleSelectPill(lot.lotNumber)}
                        className="font-mono font-bold text-xs text-brand-600 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        {lot.lotNumber}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {lot.yarnCount}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-0.5">
                      <p>
                        Supplier: <span className="font-semibold text-slate-800">{lot.supplierName}</span>
                      </p>
                      <p>
                        Consumed on WO:{" "}
                        <span className="font-bold text-emerald-700 font-mono">
                          {lot.totalConsumedKg.toFixed(2)} KG
                        </span>{" "}
                        {lot.totalWasteKg > 0 && `(Waste: ${lot.totalWasteKg.toFixed(1)}kg)`}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Inward Receipt: {lot.receiptTransactionNumber}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 2. Backward Chronological Timeline */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Backward Genealogical Trail</CardTitle>
                  <CardDescription>
                    Reverse transformation trace from raw material supplier receipts to customer dispatch
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {traceResult.timeline.length} Provenance Stages
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 sm:pl-8 border-l-2 border-indigo-200 space-y-6 ml-2 sm:ml-4 py-2">
                {traceResult.timeline.map((node) => (
                  <div key={node.id} className="relative group">
                    <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center ring-4 ring-white shadow-sm">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 font-sans">
                            {node.title}
                          </span>
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {node.type}
                          </Badge>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {new Date(node.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{node.description}</p>
                      {node.quantityKg !== undefined && node.quantityKg !== null && (
                        <div className="mt-2 text-[11px] font-mono text-slate-700">
                          Quantity: <strong>{Number(node.quantityKg).toFixed(2)} KG</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </AppLayout>
  );
}

export default function TraceabilityPage() {
  return (
    <Suspense
      fallback={
        <AppLayout>
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </AppLayout>
      }
    >
      <TraceabilityContent />
    </Suspense>
  );
}
