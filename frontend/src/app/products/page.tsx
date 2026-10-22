"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "../../hooks/useDebounce";
import {
  Layers,
  Plus,
  Search,
  Filter,
  Download,
  Eye,
  Edit2,
  AlertOctagon,
  TrendingUp,
  PackageCheck,
  Truck,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
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
  OutputBatchComputed,
  ProductsSummaryMetrics,
  ProductFilterParams,
} from "../../types/product";

import dynamic from "next/dynamic";
import { usePermissions } from "../../hooks/usePermissions";

// Products Modals (Lazy Loaded)
const RegisterBatchModal = dynamic(() => import("../../components/products/RegisterBatchModal"), { ssr: false });
const EditBatchModal = dynamic(() => import("../../components/products/EditBatchModal"), { ssr: false });
const CancelBatchModal = dynamic(() => import("../../components/products/CancelBatchModal"), { ssr: false });

export default function ProductsPage() {
  const { canCreateProductBatch, isViewer } = usePermissions();

  // Toast notifications
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Filter States
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [productTypeFilter, setProductTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal States
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<OutputBatchComputed | null>(
    null
  );
  const [cancellingBatch, setCancellingBatch] =
    useState<OutputBatchComputed | null>(null);

  // Fetch Finished Output Batches & Summary
  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<{
    outputBatches: OutputBatchComputed[];
    summary: ProductsSummaryMetrics;
  }>({
    queryKey: [
      "products",
      debouncedSearch,
      productTypeFilter,
      statusFilter,
      startDate,
      endDate,
    ],
    queryFn: async () => {
      const params: ProductFilterParams = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (productTypeFilter !== "ALL") params.productType = productTypeFilter;
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await apiClient.get("/products", { params });
      return res.data.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const outputBatches = data?.outputBatches || [];
  const summary = data?.summary || {
    totalBatches: 0,
    totalOutputKg: 0,
    readyBatchesCount: 0,
    deliveredBatchesCount: 0,
    cancelledBatchesCount: 0,
    totalConsumedYarnKg: 0,
    averageYieldPct: 0,
  };

  // CSV Export
  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append("search", search.trim());
      if (productTypeFilter !== "ALL")
        params.append("productType", productTypeFilter);
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const res = await apiClient.get(`/products/export?${params.toString()}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Finished-Products-Export-${new Date().toISOString().split("T")[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("success", "Finished products exported successfully");
    } catch {
      showToast("error", "Failed to export finished products");
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "READY":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            READY
          </span>
        );
      case "PRODUCED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="h-3 w-3" />
            PRODUCED
          </span>
        );
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <Truck className="h-3 w-3" />
            DELIVERED
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="h-3 w-3" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  // Product Type Helper
  const formatProductType = (type: string) => {
    switch (type) {
      case "FABRIC_ROLL":
        return "Fabric Roll";
      case "FINISHED_YARN":
        return "Processed Yarn";
      case "MANUFACTURED_BATCH":
        return "Manufactured Batch";
      case "GARMENT":
        return "Finished Garment";
      default:
        return type.replace(/_/g, " ");
    }
  };

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-up">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium ${
              toast.type === "success"
                ? "bg-emerald-900/90 text-emerald-100 border-emerald-700/50 backdrop-blur-md"
                : "bg-rose-900/90 text-rose-100 border-rose-700/50 backdrop-blur-md"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Finished Output Products"
        subtitle="Catalog of finished fabric rolls, processed yarns, and manufactured batches ready for delivery."
        action={
          canCreateProductBatch ? (
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5 shadow-sm"
              onClick={() => setIsRegisterOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Register Output Batch</span>
            </Button>
          ) : undefined
        }
      />

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Finished Output */}
        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Finished Output
                </p>
                <h3 className="text-xl font-bold text-slate-900 mt-1 font-mono">
                  {summary.totalOutputKg.toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span className="text-xs font-normal text-slate-500">KG</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Across {summary.totalBatches} registered batches
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 border border-brand-200 shadow-sm">
                <Layers className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ready for Delivery */}
        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Ready for Delivery
                </p>
                <h3 className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                  {summary.readyBatchesCount}{" "}
                  <span className="text-xs font-normal text-slate-500">Batches</span>
                </h3>
                <p className="text-[11px] text-emerald-600 font-medium mt-0.5">
                  Passed QA inspection
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">
                <PackageCheck className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Delivered Products */}
        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Dispatched / Delivered
                </p>
                <h3 className="text-xl font-bold text-purple-700 mt-1 font-mono">
                  {summary.deliveredBatchesCount}{" "}
                  <span className="text-xs font-normal text-slate-500">Batches</span>
                </h3>
                <p className="text-[11px] text-purple-600 mt-0.5">
                  Delivered to buyer parties
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-200 shadow-sm">
                <Truck className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Production Yield */}
        <Card className="bg-gradient-to-br from-white to-slate-50 border-slate-200 shadow-sm hover:shadow transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Average Output Yield
                </p>
                <h3 className="text-xl font-bold text-amber-700 mt-1 font-mono">
                  {summary.averageYieldPct.toFixed(1)}%
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  From {summary.totalConsumedYarnKg.toFixed(0)} KG yarn consumed
                </p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shadow-sm">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Inventory Card */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">
                Finished Goods Inventory
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Output products manufactured from converted yarn batches
              </CardDescription>
            </div>

            {/* Actions: Export & Quick Refresh */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs text-slate-700 border-slate-200 shadow-sm"
                onClick={handleExportCsv}
                disabled={outputBatches.length === 0}
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export CSV</span>
              </Button>
            </div>
          </div>

          {/* Search and Server-side Filter Bar */}
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* Search Input */}
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search batch #, product, work order, party..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            {/* Product Type Filter */}
            <div>
              <select
                value={productTypeFilter}
                onChange={(e) => setProductTypeFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="ALL">All Product Types</option>
                <option value="FABRIC_ROLL">Fabric Rolls</option>
                <option value="FINISHED_YARN">Processed Yarns</option>
                <option value="MANUFACTURED_BATCH">Manufactured Batches</option>
                <option value="GARMENT">Finished Garments</option>
                <option value="OTHER">Other Products</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="ALL">All Statuses</option>
                <option value="READY">READY</option>
                <option value="PRODUCED">PRODUCED</option>
                <option value="DELIVERED">DELIVERED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            {/* Clear Filters Button */}
            {(search || productTypeFilter !== "ALL" || statusFilter !== "ALL" || startDate || endDate) && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setProductTypeFilter("ALL");
                    setStatusFilter("ALL");
                    setStartDate("");
                    setEndDate("");
                  }}
                  className="w-full text-xs text-slate-500 hover:text-slate-800"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-500 space-y-3">
              <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-2 border-brand-600 border-t-transparent" />
              <p>Loading finished product inventory & genealogy...</p>
            </div>
          ) : outputBatches.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No finished products registered yet"
                description="Finished products output from completed production orders will be listed here."
                icon={Layers}
                actionLabel={canCreateProductBatch ? "+ Register First Batch" : undefined}
                onAction={canCreateProductBatch ? () => setIsRegisterOpen(true) : undefined}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="px-4 py-3">Output Batch</th>
                    <th className="px-4 py-3">Product Name & Code</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Work Order</th>
                    <th className="px-4 py-3">Party / Buyer</th>
                    <th className="px-4 py-3">Production Date</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Consumed Yarn</th>
                    <th className="px-4 py-3 text-center">Yield</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outputBatches.map((batch) => {
                    const isCancelled = batch.status === "CANCELLED";

                    return (
                      <tr
                        key={batch.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isCancelled ? "bg-rose-50/20 opacity-75" : ""
                        }`}
                      >
                        {/* Output Batch Number */}
                        <td className="px-4 py-3 font-mono font-bold text-brand-700 whitespace-nowrap">
                          <Link
                            href={`/products/${batch.id}`}
                            className="hover:underline flex items-center gap-1.5"
                          >
                            <span>{batch.batchNumber}</span>
                            <ExternalLink className="h-3 w-3 text-slate-400 opacity-60" />
                          </Link>
                        </td>

                        {/* Product Name & Code */}
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${batch.id}`}
                            className="font-semibold text-slate-900 hover:text-brand-600 line-clamp-1"
                          >
                            {batch.productName}
                          </Link>
                          <span className="font-mono text-[11px] text-slate-400 block">
                            {batch.productCode}
                          </span>
                        </td>

                        {/* Product Type */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                            {formatProductType(batch.productType)}
                          </span>
                        </td>

                        {/* Work Order */}
                        <td className="px-4 py-3 whitespace-nowrap font-mono font-medium text-slate-700">
                          <Link
                            href="/production"
                            className="hover:underline text-brand-600"
                          >
                            {batch.productionOrder.orderNumber}
                          </Link>
                          <span className="text-[11px] text-slate-400 block">
                            {batch.productionTeam?.name || "Floor Team"}
                          </span>
                        </td>

                        {/* Party */}
                        <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                          {batch.party ? (
                            <Link
                              href="/parties"
                              className="font-medium hover:underline text-slate-800 hover:text-brand-600 block truncate max-w-[140px]"
                            >
                              {batch.party.name}
                            </Link>
                          ) : (
                            <span className="text-slate-400 italic">Internal Stock</span>
                          )}
                        </td>

                        {/* Production Date */}
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                          {new Date(batch.outputDate).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </td>

                        {/* Output Quantity */}
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-slate-900">
                          {batch.outputQuantityKg.toFixed(2)}{" "}
                          <span className="text-[11px] text-slate-500 font-normal">
                            {batch.unit}
                          </span>
                        </td>

                        {/* Consumed Yarn */}
                        <td className="px-4 py-3 whitespace-nowrap text-right font-mono text-slate-700">
                          {batch.consumedYarnKg.toFixed(2)}{" "}
                          <span className="text-[11px] text-slate-400 font-normal">
                            KG
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            {batch.yarnLots.length} lot(s)
                          </span>
                        </td>

                        {/* Yield % */}
                        <td className="px-4 py-3 whitespace-nowrap text-center font-mono">
                          {batch.yieldPercentage > 0 ? (
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                  batch.yieldPercentage > 102 || batch.yieldPercentage < 75
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {batch.yieldPercentage.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getStatusBadge(batch.status)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* View Detail Link */}
                            <Link href={`/products/${batch.id}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-500 hover:text-brand-600 hover:bg-brand-50"
                                title="View Batch & Genealogy Details"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                            </Link>

                            {/* Trace Product Backward Link */}
                            <Link
                              href={`/traceability?product=${encodeURIComponent(
                                batch.productCode || batch.batchNumber
                              )}&tab=backward`}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                                title="Trace Product Genealogy (Backward Trace)"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                              </Button>
                            </Link>

                            {/* Edit Batch */}
                            {!isCancelled && !isViewer && canCreateProductBatch && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                                title="Edit Batch Information"
                                onClick={() => setEditingBatch(batch)}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            {/* Cancel Batch */}
                            {!isCancelled && !isViewer && canCreateProductBatch && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                title="Cancel / Quarantine Batch"
                                onClick={() => setCancellingBatch(batch)}
                              >
                                <AlertOctagon className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <RegisterBatchModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onShowToast={showToast}
      />

      <EditBatchModal
        isOpen={!!editingBatch}
        onClose={() => setEditingBatch(null)}
        batch={editingBatch}
        onShowToast={showToast}
      />

      <CancelBatchModal
        isOpen={!!cancellingBatch}
        onClose={() => setCancellingBatch(null)}
        batch={cancellingBatch}
        onShowToast={showToast}
      />
    </AppLayout>
  );
}
