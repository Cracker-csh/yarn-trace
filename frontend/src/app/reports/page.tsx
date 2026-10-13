"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCw,
  Factory,
  ShieldCheck,
  TrendingUp,
  CalendarRange,
  Filter,
  CheckCircle2,
  AlertCircle,
  Download,
  Scale,
  History,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { apiClient } from "../../lib/axios";

interface Party {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Team {
  id: string;
  code: string;
  name: string;
  department: string;
}

function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: monday.toISOString().split("T")[0],
    endDate: sunday.toISOString().split("T")[0],
  };
}

export default function ReportsPage() {
  // Filter States
  const currentWeek = getCurrentWeekRange();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [reportType, setReportType] = useState<"MASTER" | "WEEKLY">("MASTER");
  const [partyId, setPartyId] = useState<string>("");
  const [transactionType, setTransactionType] = useState<string>("");
  const [yarnCount, setYarnCount] = useState<string>("");
  const [productionTeamId, setProductionTeamId] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(true);

  // Loading & Toast States
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Queries
  const { data: kpiData, isLoading: isKpiLoading, refetch, isFetching } = useQuery({
    queryKey: ["reports", "kpi-summary"],
    queryFn: async () => {
      const res = await apiClient.get("/reports/kpi-summary");
      return res.data.data;
    },
    staleTime: 30_000,
  });

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties", "options"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data?.items || res.data.data || [];
    },
    staleTime: 60_000,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["production", "teams", "options"],
    queryFn: async () => {
      const res = await apiClient.get("/production/teams");
      return res.data.data?.items || res.data.data || [];
    },
    staleTime: 60_000,
  });

  // Generic Excel Download Handler
  const downloadExcel = async (
    endpoint: string,
    defaultFilename: string,
    params: Record<string, string> = {},
    cardKey?: string,
  ) => {
    setIsExporting(true);
    setExportingType(cardKey || endpoint);
    try {
      const res = await apiClient.get(endpoint, {
        params,
        responseType: "blob",
      });

      let filename = defaultFilename;
      const disposition = res.headers["content-disposition"] || res.headers["Content-Disposition"];
      if (disposition && typeof disposition === "string" && disposition.includes("filename=")) {
        const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = new Blob([res.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", `Report generated successfully: ${filename}`);
    } catch (err: unknown) {
      console.error("Export failure:", err);
      const errResponse = err as { response?: { data?: { message?: string } } };
      showToast(
        "error",
        errResponse?.response?.data?.message || "Failed to generate Excel report. Please verify connection and retry.",
      );
    } finally {
      setIsExporting(false);
      setExportingType(null);
    }
  };

  // Specific Export Actions
  const handleExportMaster = () => {
    const today = new Date().toISOString().split("T")[0];
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (partyId) params.partyId = partyId;
    if (transactionType) params.transactionType = transactionType;
    if (yarnCount.trim()) params.yarnCount = yarnCount.trim();
    if (productionTeamId) params.productionTeamId = productionTeamId;

    downloadExcel(
      "/reports/export/excel",
      `YarnTrace_Master_Report_${today}.xlsx`,
      params,
      "master",
    );
  };

  const handleExportWeekly = (customStart?: string, customEnd?: string) => {
    const s = customStart || startDate || currentWeek.startDate;
    const e = customEnd || endDate || currentWeek.endDate;
    const params: Record<string, string> = {
      startDate: s,
      endDate: e,
    };
    if (partyId) params.partyId = partyId;
    if (transactionType) params.transactionType = transactionType;
    if (productionTeamId) params.productionTeamId = productionTeamId;

    downloadExcel(
      "/reports/export/weekly-excel",
      `YarnTrace_Weekly_Report_${s}_to_${e}.xlsx`,
      params,
      "weekly",
    );
  };

  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setPartyId("");
    setTransactionType("");
    setYarnCount("");
    setProductionTeamId("");
    setReportType("MASTER");
  };

  const handleSetCurrentWeek = () => {
    setStartDate(currentWeek.startDate);
    setEndDate(currentWeek.endDate);
    setReportType("WEEKLY");
  };

  return (
    <AppLayout>
      <PageHeader
        title="Reports & Analytics Intelligence"
        subtitle="Authoritative multi-sheet Excel reporting, material ledger reconciliation, and comprehensive end-to-end audit traceability."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-9 bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              title="Refresh Analytics"
            >
              <RotateCw className={`h-3.5 w-3.5 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportWeekly()}
              disabled={isExporting}
              className="gap-1.5 h-9 bg-white border-sky-300 text-sky-700 hover:bg-sky-50 font-medium shadow-xs"
            >
              <CalendarRange className="h-3.5 w-3.5 text-sky-600" />
              <span>Generate Weekly Excel</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportMaster}
              disabled={isExporting}
              className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Generate Master Excel</span>
            </Button>
          </div>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-between gap-3 min-h-[105px] min-w-0">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-l-xl" />
          <div className="pl-1.5 min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
              Authoritative Stock
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums break-words">
              {isKpiLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                `${Number(kpiData?.totalStockKg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`
              )}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-1 truncate">
              {kpiData?.totalStockBags ?? 0} active physical bags
            </p>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
            <Boxes className="h-5 w-5" />
          </div>
        </div>

        <div className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-between gap-3 min-h-[105px] min-w-0">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 rounded-l-xl" />
          <div className="pl-1.5 min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
              Total Inward Received
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums break-words">
              {isKpiLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                `${Number(kpiData?.receivedKg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`
              )}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-1 truncate">Supplier gate passes</p>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
        </div>

        <div className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-between gap-3 min-h-[105px] min-w-0">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500 rounded-l-xl" />
          <div className="pl-1.5 min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
              Total Issued to Floor
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums break-words">
              {isKpiLoading ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                `${Number(kpiData?.issuedKg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG`
              )}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-1 truncate">Production allocations</p>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        </div>

        <div className="relative overflow-hidden bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-between gap-3 min-h-[105px] min-w-0">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-xl" />
          <div className="pl-1.5 min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
              Active Master Lots
            </p>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 mt-1 tabular-nums break-words">
              {isKpiLoading ? <Skeleton className="h-7 w-12" /> : kpiData?.totalLotsCount || 0}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-1 truncate">Tracked yarn batches</p>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
            <Factory className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Report Filtering Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs mb-6 overflow-hidden">
        <div className="py-3 px-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <Filter className="h-4 w-4 text-brand-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Report Parameters & Filters
            </h4>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Excel-First Engine
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold transition-colors"
          >
            {showFilters ? (
              <>
                <span>Collapse</span>
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                <span>Expand</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
              {/* Report Mode */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Report Mode
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as "MASTER" | "WEEKLY")}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="MASTER">Master Report (12 Sheets)</option>
                  <option value="WEEKLY">Weekly Operations Report</option>
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Date From
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Date To
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              {/* Supplier / Party */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Party / Supplier
                </label>
                <select
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">All Parties</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Transaction Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Transaction Type
                </label>
                <select
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">All Transactions</option>
                  <option value="OPENING">OPENING</option>
                  <option value="RECEIVED">RECEIVED</option>
                  <option value="ISSUED">ISSUED</option>
                  <option value="RETURN">RETURN</option>
                  <option value="RETURNED">RETURNED</option>
                  <option value="RETIRED">RETIRED</option>
                  <option value="SOLD">SOLD</option>
                  <option value="CORRECTION">CORRECTION</option>
                  <option value="ADJUSTMENT">ADJUSTMENT</option>
                  <option value="TRANSFER">TRANSFER</option>
                </select>
              </div>

              {/* Yarn Count Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Yarn Count
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1/10 KW"
                  value={yarnCount}
                  onChange={(e) => setYarnCount(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              {/* Production Team Filter */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Production Team
                </label>
                <select
                  value={productionTeamId}
                  onChange={(e) => setProductionTeamId(e.target.value)}
                  className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">All Teams</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.department})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSetCurrentWeek}
                  className="h-8 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                >
                  <CalendarRange className="h-3 w-3 mr-1.5 text-slate-500" />
                  Select Current Week
                </Button>
                {(startDate || endDate || partyId || transactionType || yarnCount || productionTeamId) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetFilters}
                    className="h-8 text-xs text-slate-500 hover:text-slate-800"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isExporting}
                  onClick={() => {
                    if (reportType === "WEEKLY") {
                      handleExportWeekly();
                    } else {
                      handleExportMaster();
                    }
                  }}
                  className="h-8 text-xs gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>
                    Generate {reportType === "WEEKLY" ? "Weekly Excel" : "Master Excel"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Available Report Types - 4 Enterprise ERP Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Full Master Excel Report */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <Layers className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                12 Worksheets
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
              Full Master Excel Report
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Complete multi-sheet workbook containing inventory, purchases, production, output, deliveries, purchase orders and audit activity.
            </p>

            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 my-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>Executive formula reconciliation</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                <span>Stock Ledger & current lot balances</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-emerald-600 shrink-0" />
                <span>Purchases, POs, work orders & dispatches</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportMaster}
            disabled={isExporting}
            className="w-full h-9 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>
              {isExporting && exportingType === "master" ? "Generating..." : "Download Master Excel"}
            </span>
          </button>
        </div>

        {/* Card 2: Weekly Operations Report */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-sky-300 transition-all flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-sky-50 text-sky-600 border border-sky-100">
                <CalendarRange className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                Weekly Date-Range
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
              Weekly Operations Report
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Generate a date-range Excel report containing all stock, production, purchase and dispatch activity.
            </p>

            <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3 my-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                <Sparkles className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                <span>Mon → Sun operational highlights</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-sky-600 shrink-0" />
                <span>Weekly consumption & floor waste records</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-sky-600 shrink-0" />
                <span>Finished output batches & deliveries</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleExportWeekly()}
            disabled={isExporting}
            className="w-full h-9 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            <span>
              {isExporting && exportingType === "weekly" ? "Generating..." : "Generate Weekly Excel"}
            </span>
          </button>
        </div>

        {/* Card 3: Material Reconciliation */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                <Scale className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Formula Audit
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
              Material Reconciliation
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Reconcile opening stock, inward receipts, outward movements, returns and current physical stock.
            </p>

            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 my-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>Formula: In - Out = Physical Stock</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-amber-600 shrink-0" />
                <span>Live MATCHED / MISMATCH verification</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-amber-600 shrink-0" />
                <span>Featured on Sheet 1 of Master Workbook</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportMaster}
            disabled={isExporting}
            className="w-full h-9 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Download Reconciliation Excel</span>
          </button>
        </div>

        {/* Card 4: Audit & Compliance */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between group">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Audit Trail
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
              Audit & Compliance
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mt-1">
              Include the complete chronological audit trail inside the Excel workbook.
            </p>

            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 my-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-800">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                <span>Chronological mutation event log</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-indigo-600 shrink-0" />
                <span>User attribution, timestamps & IP addresses</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <Check className="h-3 w-3 text-indigo-600 shrink-0" />
                <span>Structured Old / New values in Sheet 11</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportMaster}
            disabled={isExporting}
            className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            <History className="h-3.5 w-3.5" />
            <span>Download Audit Report</span>
          </button>
        </div>
      </div>

      {/* Floating Notification Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-rose-50 text-rose-800 border-rose-200"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </AppLayout>
  );
}
