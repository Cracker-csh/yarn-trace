"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  ShoppingCart,
  Building2,
  Calendar,
  Clock,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Edit2,
  Ban,
  FileText,
  ExternalLink,
  ShieldCheck,
  RotateCw,
  Eye,
  Plus,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import AppLayout from "../../../components/layout/AppLayout";
import PageHeader from "../../../components/common/PageHeader";
import StatCard from "../../../components/common/StatCard";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";
import { apiClient } from "../../../lib/axios";
import { Party } from "../../../types/inventory";
import {
  PurchaseOrder,
  PORequirement,
  CreatePOInput,
  UpdatePOInput,
} from "../../../types/purchase-order";
import CreatePOModal from "../../../components/purchase-orders/CreatePOModal";
import CancelPOModal from "../../../components/purchase-orders/CancelPOModal";
import ViewIssuesModal from "../../../components/purchase-orders/ViewIssuesModal";

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const poId = params?.id as string;
  const queryClient = useQueryClient();

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [selectedReqForIssues, setSelectedReqForIssues] =
    useState<PORequirement | null>(null);

  // Archive & Filter state
  const [reqFilter, setReqFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState<string>("");

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
  // 1. FETCH PARTIES (FOR EDIT MODAL)
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
  // 2. FETCH PO DETAIL
  // ---------------------------------------------------------------------------
  const {
    data: po,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<PurchaseOrder>({
    queryKey: ["purchase-orders", poId],
    queryFn: async () => {
      const res = await apiClient.get(`/purchase-orders/${poId}`);
      return res.data.data;
    },
    enabled: !!poId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // ---------------------------------------------------------------------------
  // 3. MUTATIONS (UPDATE, CANCEL, ARCHIVE, RESTORE, DELETE)
  // ---------------------------------------------------------------------------
  const updateMutation = useMutation({
    mutationFn: (values: UpdatePOInput) =>
      apiClient.patch(`/purchase-orders/${poId}`, values),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
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
    mutationFn: (reason: string) =>
      apiClient.post(`/purchase-orders/${poId}/cancel`, { reason }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast("success", res.data?.message || "Purchase Order cancelled.");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to cancel Purchase Order"
      );
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ reqId, reason }: { reqId: string; reason?: string }) =>
      apiClient.patch(`/purchase-orders/requirements/${reqId}/archive`, { reason }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast("success", res.data?.message || "Requirement line archived successfully!");
      setConfirmArchiveId(null);
      setArchiveReason("");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to archive requirement line"
      );
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (reqId: string) =>
      apiClient.patch(`/purchase-orders/requirements/${reqId}/restore`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast("success", res.data?.message || "Requirement line restored successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to restore requirement line"
      );
    },
  });

  const deleteReqMutation = useMutation({
    mutationFn: (reqId: string) =>
      apiClient.delete(`/purchase-orders/requirements/${reqId}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      showToast("success", res.data?.message || "Requirement line deleted successfully.");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to delete requirement line"
      );
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 animate-pulse">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (isError || !po) {
    return (
      <AppLayout>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center max-w-lg mx-auto mt-12">
          <XCircle className="h-10 w-10 text-red-600 mx-auto mb-3" />
          <h2 className="text-base font-bold text-red-900">
            Purchase Order Not Found
          </h2>
          <p className="text-xs text-red-700 mt-1">
            {error instanceof Error
              ? error.message
              : "Unable to load purchase order details."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/purchase-orders")}
            className="mt-4 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Purchase Orders</span>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isCancelled = po.status === "CANCELLED";
  const isFulfilled = po.status === "FULFILLED";

  const activeReqsCount = po.requirements.filter((r) => !r.isArchived).length;
  const archivedReqsCount = po.requirements.filter((r) => r.isArchived).length;

  const displayedRequirements = po.requirements.filter((r) => {
    if (reqFilter === "ACTIVE") return !r.isArchived;
    if (reqFilter === "ARCHIVED") return r.isArchived;
    return true;
  });

  // Aggregate all transactions across all requirements
  const allTransactions = po.requirements.flatMap((r) =>
    (r.transactions || []).map((t) => ({
      ...t,
      yarnCount: r.yarnCount,
      purpose: r.purpose,
    }))
  );

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
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/purchase-orders")}
            className="h-9 w-9 p-0 rounded-xl"
            title="Back to Purchase Orders"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 font-mono break-words">
                {po.poNumber}
              </h1>
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
                className="text-xs uppercase font-bold"
              >
                {po.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer Purchase Order & Yarn Requirements Breakdown
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 h-9"
          >
            <RotateCw
              className={`h-3.5 w-3.5 text-slate-500 ${
                isFetching ? "animate-spin" : ""
              }`}
            />
            <span className="hidden sm:inline">Sync</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/inventory`)}
            className="gap-1.5 h-9"
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-brand-600" />
            <span>Issue from Inventory</span>
          </Button>

          {!isCancelled && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditModalOpen(true)}
                className="gap-1.5 h-9"
              >
                <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                <span>Edit PO</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="gap-1.5 h-9"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 4 KPI Dimension Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Required"
          value={`${po.totalRequiredKg.toFixed(2)} KG`}
          subtitle={`${po.requirementsCount} requirement line${
            po.requirementsCount === 1 ? "" : "s"
          }`}
          icon={ShoppingCart}
          accentColor="brand"
        />
        <StatCard
          title="Total Issued"
          value={`${po.totalIssuedKg.toFixed(2)} KG`}
          subtitle={`${po.overallFulfillmentPct.toFixed(1)}% fulfilled`}
          icon={ArrowUpRight}
          accentColor="blue"
        />
        <StatCard
          title="Remaining Balance"
          value={`${po.totalRemainingKg.toFixed(2)} KG`}
          subtitle={`Max 103% ceiling: ${(po.totalRequiredKg * 1.03).toFixed(
            2
          )} KG`}
          icon={Clock}
          accentColor="amber"
          isEmpty={po.totalRemainingKg <= 0}
        />
        <StatCard
          title="Overall Status"
          value={po.status}
          subtitle={
            isFulfilled
              ? "All requirements fulfilled"
              : isCancelled
              ? "Order cancelled"
              : `${po.totalRemainingKg.toFixed(2)} KG pending issue`
          }
          icon={CheckCircle2}
          accentColor={
            isFulfilled ? "emerald" : isCancelled ? "slate" : "brand"
          }
        />
      </div>

      {/* Split Grid: PO Header Details & Requirements Table */}
      <div className="space-y-6">
        {/* Order Header Summary Card */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" />
                <CardTitle>Customer & Commercial Details</CardTitle>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Created on:{" "}
                {new Date(po.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Party / Customer
                </span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {po.party.name}
                </p>
                <p className="text-[11px] text-slate-500 font-mono">
                  Code: {po.party.code}{" "}
                  {po.party.gstNumber ? `• GSTIN: ${po.party.gstNumber}` : ""}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Order Date
                </span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {new Date(po.orderDate).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <p className="text-[11px] text-slate-500">
                  Shipment Due:{" "}
                  {po.deliveryDue ? (
                    new Date(po.deliveryDue).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-slate-400">Not specified</span>
                  )}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Total Commercial Amount
                </span>
                <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {po.totalAmount
                    ? `₹${po.totalAmount.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}`
                    : "—"}
                </p>
                <p className="text-[11px] text-slate-400">INR Ex-mill</p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Order Remarks
                </span>
                <p className="text-slate-700 italic mt-0.5 bg-slate-50 p-2 rounded-lg border border-slate-100 whitespace-pre-wrap">
                  {po.remarks || "No additional remarks"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requirements Table (Stage 1 Core Matrix) */}
        <Card>
          <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle>Yarn Requirement Breakdown</CardTitle>
              <CardDescription>
                Track individual line items by PO + Yarn Count + Purpose with
                103% issue ceiling and archive lifecycle controls
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setReqFilter("ALL")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    reqFilter === "ALL"
                      ? "bg-white text-slate-900 shadow-sm font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  All ({po.requirements.length})
                </button>
                <button
                  type="button"
                  onClick={() => setReqFilter("ACTIVE")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    reqFilter === "ACTIVE"
                      ? "bg-white text-emerald-800 shadow-sm font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Active ({activeReqsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setReqFilter("ARCHIVED")}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    reqFilter === "ARCHIVED"
                      ? "bg-white text-amber-800 shadow-sm font-bold"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Archived ({archivedReqsCount})
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[1100px] text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">#</th>
                    <th className="py-3 px-3">Yarn Count</th>
                    <th className="py-3 px-2">Quality</th>
                    <th className="py-3 px-2">Size</th>
                    <th className="py-3 px-2">Use For</th>
                    <th className="py-3 px-2 text-center">Purpose</th>
                    <th className="py-3 px-2 text-center">Pcs</th>
                    <th className="py-3 px-2 text-center">Qty</th>
                    <th className="py-3 px-3 text-right">Required (KG)</th>
                    <th className="py-3 px-3 text-right">Issued (KG)</th>
                    <th className="py-3 px-3 text-right">Remaining (KG)</th>
                    <th className="py-3 px-3 text-right">103% Ceiling</th>
                    <th className="py-3 px-3 text-center">Fulfillment</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {displayedRequirements.length === 0 ? (
                    <tr>
                      <td colSpan={15} className="py-8 text-center text-slate-400">
                        No {reqFilter.toLowerCase()} requirements found for this Purchase Order.
                      </td>
                    </tr>
                  ) : (
                    displayedRequirements.map((req, idx) => {
                      const ceiling103 = Number((req.requiredKg * 1.03).toFixed(2));
                      const isLineCompleted = req.status === "COMPLETED";

                      return (
                        <tr
                          key={req.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            req.isArchived
                              ? "bg-amber-50/30 text-slate-600"
                              : ""
                          }`}
                        >
                          <td className="py-3 px-3 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>

                          {/* Yarn Count */}
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            {req.yarnCount}
                          </td>

                          {/* Quality */}
                          <td className="py-3 px-2 text-slate-700">
                            {req.quality || "—"}
                          </td>

                          {/* Size */}
                          <td className="py-3 px-2 text-slate-700 font-mono">
                            {req.size || "—"}
                          </td>

                          {/* Use For */}
                          <td className="py-3 px-2 text-slate-700">
                            {req.useFor || "—"}
                          </td>

                          {/* Purpose */}
                          <td className="py-3 px-2 text-center">
                            <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-brand-50 text-brand-700 border border-brand-200">
                              {req.purpose}
                            </span>
                          </td>

                          {/* Pcs */}
                          <td className="py-3 px-2 text-center font-mono text-slate-600">
                            {req.pcs ?? "—"}
                          </td>

                          {/* Qty */}
                          <td className="py-3 px-2 text-center font-mono text-slate-600">
                            {req.qty ?? "—"}
                          </td>

                          {/* Required KG */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {req.requiredKg.toFixed(2)} KG
                          </td>

                          {/* Issued KG */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-blue-700">
                            {req.issuedKg.toFixed(2)} KG
                          </td>

                          {/* Remaining KG */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-brand-700">
                            {req.remainingKg.toFixed(2)} KG
                          </td>

                          {/* 103% Ceiling */}
                          <td className="py-3 px-3 text-right font-mono text-[11px] text-emerald-700">
                            {ceiling103.toFixed(2)} KG
                          </td>

                          {/* Fulfillment */}
                          <td className="py-3 px-3">
                            <div className="w-20 mx-auto space-y-1">
                              <div className="text-[10px] font-mono font-bold text-center">
                                {req.fulfillmentPct.toFixed(1)}%
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    isLineCompleted
                                      ? "bg-emerald-500"
                                      : req.issuedKg > 0
                                      ? "bg-blue-500"
                                      : "bg-slate-200"
                                  }`}
                                  style={{
                                    width: `${Math.min(100, req.fulfillmentPct)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Status & Archived Badge */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <Badge
                                variant={
                                  req.status === "COMPLETED"
                                    ? "secondary"
                                    : req.status === "PARTIAL"
                                    ? "brand"
                                    : req.status === "PENDING"
                                    ? "outline"
                                    : "outline"
                                }
                                className="text-[10px] font-bold uppercase"
                              >
                                {req.status}
                              </Badge>
                              {req.isArchived && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Archive className="h-2.5 w-2.5" />
                                  <span>ARCHIVED</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions: View Issues, Archive/Restore, Delete */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedReqForIssues(req)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors"
                                title="View Issued Transactions"
                              >
                                <Eye className="h-3 w-3" />
                                <span>({req.transactions?.length || 0})</span>
                              </button>

                              {!isCancelled && (
                                <>
                                  {req.isArchived ? (
                                    <button
                                      type="button"
                                      onClick={() => restoreMutation.mutate(req.id)}
                                      disabled={restoreMutation.isPending}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-200"
                                      title="Restore requirement to active state"
                                    >
                                      <ArchiveRestore className="h-3 w-3" />
                                      <span>Restore</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmArchiveId(req.id);
                                        setArchiveReason("");
                                      }}
                                      disabled={archiveMutation.isPending}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200"
                                      title="Archive requirement line (exclude from new issues)"
                                    >
                                      <Archive className="h-3 w-3" />
                                      <span>Archive</span>
                                    </button>
                                  )}

                                  {/* Delete button (only if no issued quantity) */}
                                  {req.issuedKg <= 0.0001 && (!req.transactions || req.transactions.length === 0) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (confirm(`Delete requirement line for count "${req.yarnCount}" (${req.purpose})?`)) {
                                          deleteReqMutation.mutate(req.id);
                                        }
                                      }}
                                      disabled={deleteReqMutation.isPending}
                                      className="inline-flex items-center p-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                                      title="Delete unissued requirement"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900 text-xs">
                  <tr>
                    <td colSpan={8} className="py-3 px-3 text-right">
                      Total Order Requirement:
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-900">
                      {po.totalRequiredKg.toFixed(2)} KG
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-blue-800">
                      {po.totalIssuedKg.toFixed(2)} KG
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-brand-700">
                      {po.totalRemainingKg.toFixed(2)} KG
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-800 text-[11px]">
                      {(po.totalRequiredKg * 1.03).toFixed(2)} KG
                    </td>
                    <td colSpan={3} className="py-3 px-3 text-center text-[11px] text-slate-500">
                      {po.overallFulfillmentPct.toFixed(1)}% Fulfilled
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Linked Inventory Transactions Ledger */}
        <Card>
          <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <CardTitle>Linked Warehouse Issue Ledger</CardTitle>
              <CardDescription>
                Verified inventory transactions issued against this Purchase
                Order
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/transactions`)}
              className="gap-1.5 text-xs h-8 self-start sm:self-auto"
            >
              <span>Explore All Transactions</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            {allTransactions.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[700px] text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Tx Number</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Yarn Count</th>
                      <th className="py-2.5 px-3 text-center">Purpose</th>
                      <th className="py-2.5 px-3">Lot Number</th>
                      <th className="py-2.5 px-3 text-right">Bags</th>
                      <th className="py-2.5 px-3 text-right">Issued KG</th>
                      <th className="py-2.5 px-3">Issued By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {allTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {tx.transactionNumber}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {new Date(tx.transactionDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {tx.yarnCount}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-slate-100 text-slate-700">
                            {tx.purpose}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand-700">
                          {tx.lotNumber || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {tx.bags}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                          {tx.kilos.toFixed(2)} KG
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                          {tx.createdByName || "System Admin"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900 text-xs">
                    <tr>
                      <td colSpan={6} className="py-2 px-3 text-right">
                        Total Quantity Issued Across All Lines:
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-blue-800">
                        {allTransactions
                          .reduce((sum, t) => sum + t.kilos, 0)
                          .toFixed(2)}{" "}
                        KG
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center">
                <ShieldCheck className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  No warehouse issues linked to this Purchase Order yet
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                  When stock heads issue yarn against PO{" "}
                  <span className="font-mono font-bold">{po.poNumber}</span>,
                  audit records will be displayed here in real time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit PO Modal */}
      <CreatePOModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={async (values) => {
          await updateMutation.mutateAsync(values);
        }}
        parties={parties}
        isLoading={updateMutation.isPending}
        initialData={po}
      />

      {/* Cancel PO Modal */}
      <CancelPOModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirm={async (reason) => {
          await cancelMutation.mutateAsync(reason);
        }}
        po={po}
        isLoading={cancelMutation.isPending}
      />

      {/* View Issues Modal */}
      <ViewIssuesModal
        isOpen={!!selectedReqForIssues}
        onClose={() => setSelectedReqForIssues(null)}
        requirement={selectedReqForIssues}
        poNumber={po.poNumber}
      />

      {/* Archive Requirement Modal */}
      {confirmArchiveId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800">
                <Archive className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Archive Requirement Line
                </h3>
                <p className="text-xs text-slate-500">
                  This will exclude the requirement line from future inventory issue selectors. Historical transactions and reports will remain fully intact.
                </p>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Reason for archiving (optional):
              </label>
              <input
                type="text"
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. Specification revised, production completed..."
                className="w-full text-xs rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirmArchiveId(null);
                  setArchiveReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                disabled={archiveMutation.isPending}
                onClick={() => {
                  if (confirmArchiveId) {
                    archiveMutation.mutate({
                      reqId: confirmArchiveId,
                      reason: archiveReason.trim() || undefined,
                    });
                  }
                }}
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive Line</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
