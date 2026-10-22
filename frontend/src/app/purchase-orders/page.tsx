"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useDebounce } from "../../hooks/useDebounce";
import {
  ShoppingCart,
  Plus,
  Search,
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  Filter,
  Edit2,
  Ban,
  Boxes,
  Layers,
  ArrowUpRight,
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
import { Skeleton } from "../../components/ui/skeleton";
import { apiClient } from "../../lib/axios";
import { Party } from "../../types/inventory";
import {
  PurchaseOrder,
  POSummaryMetrics,
  CreatePOInput,
  UpdatePOInput,
} from "../../types/purchase-order";
import dynamic from "next/dynamic";
import { usePermissions } from "../../hooks/usePermissions";
const CreatePOModal = dynamic(() => import("../../components/purchase-orders/CreatePOModal"), { ssr: false });
const CancelPOModal = dynamic(() => import("../../components/purchase-orders/CancelPOModal"), { ssr: false });

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canManagePurchaseOrders, isViewer } = usePermissions();

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 250);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [fulfillmentFilter, setFulfillmentFilter] = useState("ALL");
  const [partyFilter, setPartyFilter] = useState("ALL");

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [cancellingPO, setCancellingPO] = useState<PurchaseOrder | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // 1. FETCH PARTIES (FOR FILTERS & CREATION)
  // ---------------------------------------------------------------------------
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // 2. FETCH PURCHASE ORDERS (SERVER FILTERED)
  // ---------------------------------------------------------------------------
  const {
    data: poResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<{
    purchaseOrders: PurchaseOrder[];
    summary: POSummaryMetrics;
  }>({
    queryKey: [
      "purchase-orders",
      debouncedSearch,
      statusFilter,
      fulfillmentFilter,
      partyFilter,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (fulfillmentFilter !== "ALL")
        params.fulfillmentStatus = fulfillmentFilter;
      if (partyFilter !== "ALL") params.partyId = partyFilter;

      const res = await apiClient.get("/purchase-orders", { params });
      return {
        purchaseOrders: res.data.data,
        summary: res.data.summary,
      };
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const purchaseOrders = poResponse?.purchaseOrders || [];
  const summary = poResponse?.summary || {
    totalPOs: 0,
    activePOs: 0,
    partiallyFulfilledPOs: 0,
    fulfilledPOs: 0,
    cancelledPOs: 0,
    totalRequiredKg: 0,
    totalIssuedKg: 0,
    totalRemainingKg: 0,
  };

  // ---------------------------------------------------------------------------
  // 3. MUTATIONS (CREATE, UPDATE, CANCEL)
  // ---------------------------------------------------------------------------
  const createMutation = useMutation({
    mutationFn: (values: CreatePOInput) =>
      apiClient.post("/purchase-orders", values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("success", res.data?.message || "Purchase Order created successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to create Purchase Order"
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdatePOInput }) =>
      apiClient.patch(`/purchase-orders/${id}`, values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("success", res.data?.message || "Purchase Order updated successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update Purchase Order"
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiClient.post(`/purchase-orders/${id}/cancel`, { reason }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      showToast("success", res.data?.message || "Purchase Order cancelled.");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to cancel Purchase Order"
      );
    },
  });

  const handleSavePO = async (values: CreatePOInput) => {
    if (editingPO) {
      await updateMutation.mutateAsync({ id: editingPO.id, values });
    } else {
      await createMutation.mutateAsync(values);
    }
  };

  const handleConfirmCancel = async (reason: string) => {
    if (!cancellingPO) return;
    await cancelMutation.mutateAsync({ id: cancellingPO.id, reason });
  };

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
        title="Purchase Orders & Requirements"
        subtitle="Track customer purchase orders, yarn requirement fulfillment, and delivery scheduling."
        action={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-9"
              title="Refresh Purchase Orders"
            >
              <RotateCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isFetching ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            {canManagePurchaseOrders && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingPO(null);
                  setIsCreateModalOpen(true);
                }}
                className="gap-1.5 h-9"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Purchase Order</span>
              </Button>
            )}
          </div>
        }
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, idx) => (
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
          <>
            <StatCard
              title="Total Purchase Orders"
              value={`${summary.totalPOs} PO${summary.totalPOs === 1 ? "" : "s"}`}
              subtitle={`${summary.totalRequiredKg.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })} KG Total Required`}
              icon={ShoppingCart}
              accentColor="brand"
              isEmpty={summary.totalPOs <= 0}
            />
            <StatCard
              title="Active / Pending"
              value={`${summary.activePOs} PO${summary.activePOs === 1 ? "" : "s"}`}
              subtitle="Awaiting or in floor fulfillment"
              icon={Clock}
              accentColor="amber"
              isEmpty={summary.activePOs <= 0}
            />
            <StatCard
              title="Partially Fulfilled"
              value={`${summary.partiallyFulfilledPOs} PO${
                summary.partiallyFulfilledPOs === 1 ? "" : "s"
              }`}
              subtitle={`${summary.totalIssuedKg.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })} KG Issued so far`}
              icon={ArrowUpRight}
              accentColor="blue"
              isEmpty={summary.partiallyFulfilledPOs <= 0}
            />
            <StatCard
              title="Fulfilled Orders"
              value={`${summary.fulfilledPOs} PO${
                summary.fulfilledPOs === 1 ? "" : "s"
              }`}
              subtitle={`${summary.totalRemainingKg.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })} KG Remaining`}
              icon={CheckCircle2}
              accentColor="emerald"
              isEmpty={summary.fulfilledPOs <= 0}
            />
          </>
        )}
      </div>

      {/* Main Register Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Purchase Order Register</CardTitle>
              <CardDescription>
                Customer orders, yarn requirements, and 103% ceiling fulfillment
              </CardDescription>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search PO, party, count..."
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-brand-600 focus:outline-none"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:bg-white focus:border-brand-600 focus:outline-none flex-1 sm:flex-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PARTIALLY_FULFILLED">Partially Fulfilled</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="DRAFT">Draft</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              {/* Fulfillment Status Filter */}
              <select
                value={fulfillmentFilter}
                onChange={(e) => setFulfillmentFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:bg-white focus:border-brand-600 focus:outline-none flex-1 sm:flex-none"
              >
                <option value="ALL">All Progress</option>
                <option value="PENDING">Pending (0% Issued)</option>
                <option value="PARTIAL">Partial Fulfillment</option>
                <option value="COMPLETED">Completed (100% Issued)</option>
              </select>

              {/* Party Filter */}
              <select
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:bg-white focus:border-brand-600 focus:outline-none flex-1 sm:flex-none max-w-full sm:max-w-[150px] truncate"
              >
                <option value="ALL">All Parties</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {(searchTerm ||
                statusFilter !== "ALL" ||
                fulfillmentFilter !== "ALL" ||
                partyFilter !== "ALL") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setStatusFilter("ALL");
                    setFulfillmentFilter("ALL");
                    setPartyFilter("ALL");
                  }}
                  className="h-8 text-xs text-slate-500 hover:text-slate-700"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : isError ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span>
                Failed to load purchase orders:{" "}
                {error instanceof Error ? error.message : "Server error"}
              </span>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="self-start sm:self-auto">
                Retry
              </Button>
            </div>
          ) : purchaseOrders.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1000px] text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3.5">PO Number</th>
                    <th className="py-3 px-3">Party / Buyer</th>
                    <th className="py-3 px-3">Order Date</th>
                    <th className="py-3 px-3">Shipment Due</th>
                    <th className="py-3 px-3 text-center">Requirements</th>
                    <th className="py-3 px-3 text-right">Total Req (KG)</th>
                    <th className="py-3 px-3 text-right">Issued (KG)</th>
                    <th className="py-3 px-3 text-right">Remaining (KG)</th>
                    <th className="py-3 px-3 min-w-[130px]">Fulfillment</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {purchaseOrders.map((po) => {
                    const isCancelled = po.status === "CANCELLED";
                    const isFulfilled = po.status === "FULFILLED";

                    return (
                      <tr
                        key={po.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isCancelled ? "opacity-60 bg-slate-50/40" : ""
                        }`}
                      >
                        {/* PO Number */}
                        <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                          <button
                            onClick={() =>
                              router.push(`/purchase-orders/${po.id}`)
                            }
                            className="hover:text-brand-600 text-left underline decoration-slate-300 hover:decoration-brand-600 underline-offset-2 flex items-center gap-1.5"
                            title="View PO Details"
                          >
                            <span>{po.poNumber}</span>
                          </button>
                        </td>

                        {/* Party */}
                        <td className="py-3 px-3 text-slate-800">
                          <div className="font-semibold">{po.party.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {po.party.code}
                          </div>
                        </td>

                        {/* Order Date */}
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {new Date(po.orderDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>

                        {/* Shipment Due */}
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {po.deliveryDue ? (
                            new Date(po.deliveryDue).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Requirements */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            <Layers className="h-3 w-3 text-slate-400" />
                            <span>
                              {po.requirementsCount} line
                              {po.requirementsCount === 1 ? "" : "s"}
                            </span>
                          </span>
                        </td>

                        {/* Required KG */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          {po.totalRequiredKg.toFixed(2)} KG
                        </td>

                        {/* Issued KG */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-blue-700">
                          {po.totalIssuedKg.toFixed(2)} KG
                        </td>

                        {/* Remaining KG */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-brand-700">
                          {po.totalRemainingKg.toFixed(2)} KG
                        </td>

                        {/* Fulfillment Progress */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-mono">
                              <span className="font-semibold text-slate-600">
                                {po.overallFulfillmentPct.toFixed(1)}%
                              </span>
                              <span className="text-slate-400">
                                103% ceiling
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isCancelled
                                    ? "bg-slate-300"
                                    : isFulfilled
                                    ? "bg-emerald-500"
                                    : po.totalIssuedKg > 0
                                    ? "bg-blue-500"
                                    : "bg-slate-200"
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    po.overallFulfillmentPct
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          <Badge
                            variant={
                              isCancelled
                                ? "outline"
                                : isFulfilled
                                ? "secondary"
                                : po.status === "PARTIALLY_FULFILLED"
                                ? "brand"
                                : "outline"
                            }
                            className="text-[10px] uppercase font-bold"
                          >
                            {po.status}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() =>
                                router.push(`/purchase-orders/${po.id}`)
                              }
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-brand-600 transition-colors"
                              title="View Details"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            {!isCancelled && !isViewer && canManagePurchaseOrders && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingPO(po);
                                    setIsCreateModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                                  title="Edit Order"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => setCancellingPO(po)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                  title="Cancel Order"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No purchase orders registered yet"
              description="Add purchase orders with yarn requirements to track end-to-end order execution and 103% issue limits."
              icon={ShoppingCart}
              actionLabel={canManagePurchaseOrders ? "+ Create Purchase Order" : undefined}
              onAction={
                canManagePurchaseOrders
                  ? () => {
                      setEditingPO(null);
                      setIsCreateModalOpen(true);
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Create / Edit PO Modal */}
      <CreatePOModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingPO(null);
        }}
        onSubmit={handleSavePO}
        parties={parties}
        isLoading={createMutation.isPending || updateMutation.isPending}
        initialData={editingPO}
      />

      {/* Cancel PO Confirmation Modal */}
      <CancelPOModal
        isOpen={!!cancellingPO}
        onClose={() => setCancellingPO(null)}
        onConfirm={handleConfirmCancel}
        po={cancellingPO}
        isLoading={cancelMutation.isPending}
      />
    </AppLayout>
  );
}
