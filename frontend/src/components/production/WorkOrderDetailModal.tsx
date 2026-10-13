import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Factory,
  X,
  ArrowUpRight,
  Flame,
  ArrowDownLeft,
  Layers,
  CheckCircle2,
  Loader2,
  Plus,
  GitBranch,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { apiClient } from "../../lib/axios";
import {
  ProductionOrderDetail,
  ProductionTeam,
  ConsumptionRecord,
} from "../../types/production";
import AllocateYarnModal from "./AllocateYarnModal";
import RecordConsumptionModal from "./RecordConsumptionModal";
import RecordReturnModal from "./RecordReturnModal";
import RecordOutputModal from "./RecordOutputModal";
import ConsumptionCorrectionModal from "./ConsumptionCorrectionModal";

interface WorkOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
  teams: ProductionTeam[];
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function WorkOrderDetailModal({
  isOpen,
  onClose,
  orderId,
  teams,
  onShowToast,
}: WorkOrderDetailModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);
  const [activeTab, setActiveTab] = useState<
    "allocations" | "consumption" | "returns" | "outputs" | "traceability"
  >("allocations");

  // Child Modals State
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  const [isConsumptionOpen, setIsConsumptionOpen] = useState(false);
  const [selectedAllocIdForConsumption, setSelectedAllocIdForConsumption] = useState<string | null>(null);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [selectedAllocIdForReturn, setSelectedAllocIdForReturn] = useState<string | null>(null);
  const [isOutputOpen, setIsOutputOpen] = useState(false);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [recordToCorrect, setRecordToCorrect] = useState<ConsumptionRecord | null>(null);

  // Fetch Order Details
  const { data: order, isLoading } = useQuery<ProductionOrderDetail>({
    queryKey: ["production", "orders", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const res = await apiClient.get(`/production/orders/${orderId}`);
      return res.data.data;
    },
    enabled: Boolean(isOpen && orderId),
  });

  // Fetch Traceability Tree
  const { data: traceData } = useQuery<any>({
    queryKey: ["production", "traceability", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const res = await apiClient.get(`/production/orders/${orderId}/traceability`);
      return res.data.data;
    },
    enabled: Boolean(isOpen && orderId && activeTab === "traceability"),
  });

  // Complete Order Mutation
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Order ID is required");
      const res = await apiClient.post(`/production/orders/${orderId}/complete`);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast("success", `Work Order ${order?.orderNumber} marked as COMPLETED`);
      if (data?.unconsumedWarning) {
        onShowToast("error", data.unconsumedWarning);
      }
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to complete work order");
    },
  });

  // Cancel Order Mutation
  const cancelMutation = useMutation({
    mutationFn: async (reason?: string) => {
      if (!orderId) throw new Error("Order ID is required");
      const res = await apiClient.post(`/production/orders/${orderId}/cancel`, { reason });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast("success", `Work Order ${order?.orderNumber} cancelled`);
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to cancel work order");
    },
  });

  if (!isOpen || !orderId) return null;

  const isCompleted = order?.status === "COMPLETED";
  const isCancelled = order?.status === "CANCELLED";

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "success";
      case "IN_PROGRESS":
        return "brand";
      case "PLANNED":
        return "secondary";
      case "ON_HOLD":
        return "warning";
      case "CANCELLED":
        return "destructive";
      default:
        return "outline";
    }
  };

  if (!isOpen || !mounted) return null;

  return (
    <>
      {createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/90">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
                <Factory className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900 font-mono">
                    {order?.orderNumber || "Loading..."}
                  </h2>
                  {order && (
                    <Badge variant={getStatusBadgeVariant(order.status)} className="text-[10px] uppercase">
                      {order.status}
                    </Badge>
                  )}
                  {order?.priority && (
                    <Badge variant="outline" className="text-[10px] font-semibold">
                      {order.priority} Priority
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {order?.productionTeam
                    ? `${order.productionTeam.name} (${order.productionTeam.department})`
                    : "No team assigned"}{" "}
                  {order?.party ? `| Commercial Party: ${order.party.name}` : ""}{" "}
                  {order?.poNumber ? `| PO: ${order.poNumber}` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick Metrics Bar */}
          {order && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-3 sm:p-4 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Target Qty</span>
                <p className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                  {order.targetQuantity.toFixed(2)} <span className="text-[10px] text-slate-500">KG</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-sky-600">Allocated</span>
                <p className="text-sm font-bold font-mono text-sky-900 mt-0.5">
                  {order.totalAllocatedKg.toFixed(2)} <span className="text-[10px] text-slate-500">KG</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-amber-600">Consumed</span>
                <p className="text-sm font-bold font-mono text-amber-900 mt-0.5">
                  {order.totalConsumedKg.toFixed(2)} <span className="text-[10px] text-slate-500">KG</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-600">Waste / Loss</span>
                <p className="text-sm font-bold font-mono text-slate-700 mt-0.5">
                  {order.totalWasteKg.toFixed(2)} <span className="text-[10px] text-slate-500">KG</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-brand-600">Remaining Stock</span>
                <p className="text-sm font-bold font-mono text-brand-900 mt-0.5">
                  {order.remainingTeamBalanceKg.toFixed(2)} <span className="text-[10px] text-slate-500">KG</span>
                </p>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-emerald-600">Output & Yield</span>
                <p className="text-sm font-bold font-mono text-emerald-900 mt-0.5">
                  {order.totalOutputKg.toFixed(2)} KG{" "}
                  <span className="text-[10px] font-bold text-emerald-700">({order.yieldPercentage}%)</span>
                </p>
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          {!isCompleted && !isCancelled && order && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 bg-white border-b border-slate-200 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAllocateOpen(true)}
                  className="gap-1 text-sky-700 border-sky-200 hover:bg-sky-50 h-8"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  <span>+ Allocate Issued Yarn</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={order.itemizedAllocations.length === 0}
                  onClick={() => {
                    setSelectedAllocIdForConsumption(null);
                    setIsConsumptionOpen(true);
                  }}
                  className="gap-1 text-amber-700 border-amber-200 hover:bg-amber-50 h-8"
                >
                  <Flame className="h-3.5 w-3.5" />
                  <span>+ Record Consumption</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={order.itemizedAllocations.length === 0}
                  onClick={() => {
                    setSelectedAllocIdForReturn(null);
                    setIsReturnOpen(true);
                  }}
                  className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 h-8"
                >
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                  <span>Return Unused Yarn</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOutputOpen(true)}
                  className="gap-1 text-indigo-700 border-indigo-200 hover:bg-indigo-50 h-8"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>+ Record Output</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => completeMutation.mutate()}
                  disabled={completeMutation.isPending}
                  className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {completeMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Complete Order</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const reason = window.prompt("Reason for cancelling work order:");
                    if (reason !== null) cancelMutation.mutate(reason);
                  }}
                  disabled={cancelMutation.isPending || order.consumptionRecords.length > 0}
                  className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  Cancel Order
                </Button>
              </div>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 border-b border-slate-200 bg-slate-50/50 text-xs font-semibold overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setActiveTab("allocations")}
              className={`py-3 border-b-2 transition-colors shrink-0 ${
                activeTab === "allocations"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Yarn Allocations ({order?.itemizedAllocations.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("consumption")}
              className={`py-3 border-b-2 transition-colors shrink-0 ${
                activeTab === "consumption"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Consumption Records ({order?.consumptionRecords.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("returns")}
              className={`py-3 border-b-2 transition-colors shrink-0 ${
                activeTab === "returns"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Returns to Stock ({order?.returns.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("outputs")}
              className={`py-3 border-b-2 transition-colors shrink-0 ${
                activeTab === "outputs"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Finished Outputs ({order?.outputs.length || 0})
            </button>
            <button
              onClick={() => setActiveTab("traceability")}
              className={`py-3 border-b-2 transition-colors shrink-0 ${
                activeTab === "traceability"
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Traceability & Audit
            </button>
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {isLoading ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
                Loading work order details...
              </div>
            ) : !order ? (
              <div className="py-12 text-center text-slate-500">Work order not found.</div>
            ) : (
              <>
                {/* 1. YARN ALLOCATIONS TAB */}
                {activeTab === "allocations" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Allocated Yarn Inputs (Issued Stock → Floor Team)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Yarn lots assigned from Main Stock issue transactions to this work order
                        </p>
                      </div>
                      {!isCompleted && !isCancelled && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsAllocateOpen(true)}
                          className="h-8 gap-1.5 text-xs text-sky-700 border-sky-200 hover:bg-sky-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Allocate More Yarn</span>
                        </Button>
                      )}
                    </div>

                    {order.itemizedAllocations.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
                        <ArrowUpRight className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                        <h4 className="text-xs font-bold text-slate-800">No Yarn Lots Allocated</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                          Allocate issued yarn from Main Stock to make yarn available for team consumption.
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setIsAllocateOpen(true)}
                          className="gap-1.5"
                        >
                          <Plus className="h-4 w-4" />
                          <span>Allocate Issued Yarn</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                        <table className="w-full min-w-[800px] text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                              <th className="py-3 px-4">Lot Number</th>
                              <th className="py-3 px-4">Yarn Count</th>
                              <th className="py-3 px-4">Source Issue Tx</th>
                              <th className="py-3 px-4">Floor Team</th>
                              <th className="py-3 px-4 text-right">Allocated (KG)</th>
                              <th className="py-3 px-4 text-right">Consumed (KG)</th>
                              <th className="py-3 px-4 text-right">Returned (KG)</th>
                              <th className="py-3 px-4 text-right font-bold text-brand-700">
                                Team Balance (KG)
                              </th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {order.itemizedAllocations.map((alloc) => (
                              <tr key={alloc.id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  {alloc.lotNumber}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-700">
                                  {alloc.yarnCount}
                                </td>
                                <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                                  {alloc.sourceTxNumber}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-700">
                                  {alloc.teamName}
                                </td>
                                <td className="py-3 px-4 text-right font-semibold text-slate-900">
                                  {alloc.allocatedKg.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right text-amber-600">
                                  {(alloc.consumedKg + alloc.wasteKg).toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right text-emerald-600">
                                  {alloc.returnedKg.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-slate-900 bg-amber-50/40">
                                  {alloc.balanceKg.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right font-sans">
                                  {!isCompleted && !isCancelled && alloc.balanceKg > 0.0001 && (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedAllocIdForConsumption(alloc.id);
                                          setIsConsumptionOpen(true);
                                        }}
                                        className="h-6 px-2 text-[11px] text-amber-700 border-amber-200 hover:bg-amber-50"
                                      >
                                        Consume
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedAllocIdForReturn(alloc.id);
                                          setIsReturnOpen(true);
                                        }}
                                        className="h-6 px-2 text-[11px] text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                      >
                                        Return
                                      </Button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. CONSUMPTION RECORDS TAB */}
                {activeTab === "consumption" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Actual Floor Consumption & Waste Logs
                        </h3>
                        <p className="text-xs text-slate-500">
                          Recorded yarn utilized by floor teams with waste classification and correction tracking
                        </p>
                      </div>
                      {!isCompleted && !isCancelled && order.itemizedAllocations.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedAllocIdForConsumption(null);
                            setIsConsumptionOpen(true);
                          }}
                          className="h-8 gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Record Consumption</span>
                        </Button>
                      )}
                    </div>

                    {order.consumptionRecords.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        No consumption records logged yet.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                        <table className="w-full min-w-[800px] text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Lot Number</th>
                              <th className="py-3 px-4">Count</th>
                              <th className="py-3 px-4 text-right">Consumed (KG)</th>
                              <th className="py-3 px-4 text-right">Waste (KG)</th>
                              <th className="py-3 px-4">Waste Category</th>
                              <th className="py-3 px-4">Recorded By</th>
                              <th className="py-3 px-4 text-center">Status</th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {order.consumptionRecords.map((cons) => (
                              <tr
                                key={cons.id}
                                className={`hover:bg-slate-50/80 ${
                                  cons.isCorrected ? "opacity-60 bg-slate-50/50" : ""
                                }`}
                              >
                                <td className="py-3 px-4 font-sans text-slate-600">
                                  {new Date(cons.consumptionDate).toLocaleDateString()}
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  {cons.lot?.lotNumber || cons.yarnCount || "—"}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-700">
                                  {cons.yarnCount || "—"}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-amber-700">
                                  {cons.consumedKg.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right text-slate-600">
                                  {cons.wasteKg > 0 ? cons.wasteKg.toFixed(2) : "0.00"}
                                </td>
                                <td className="py-3 px-4 font-sans">
                                  {cons.wasteCategory ? (
                                    <Badge variant="outline" className="text-[10px]">
                                      {cons.wasteCategory}
                                    </Badge>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-600">
                                  {cons.recordedBy
                                    ? `${cons.recordedBy.firstName} ${cons.recordedBy.lastName}`
                                    : "System"}
                                </td>
                                <td className="py-3 px-4 text-center font-sans">
                                  {cons.isCorrected ? (
                                    <Badge variant="destructive" className="text-[10px]">
                                      Corrected
                                    </Badge>
                                  ) : (
                                    <Badge variant="success" className="text-[10px]">
                                      Verified
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right font-sans">
                                  {!cons.isCorrected && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setRecordToCorrect(cons);
                                        setIsCorrectionOpen(true);
                                      }}
                                      className="h-6 px-2 text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50"
                                    >
                                      Correct
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. RETURNS TAB */}
                {activeTab === "returns" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Unused Yarn Returned to Main Stock
                        </h3>
                        <p className="text-xs text-slate-500">
                          Surplus yarn returned to main warehouse with synchronized Inventory RETURN transactions
                        </p>
                      </div>
                    </div>

                    {order.returns.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        No unused yarn returns recorded for this work order.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                        <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                              <th className="py-3 px-4">Date</th>
                              <th className="py-3 px-4">Lot Number</th>
                              <th className="py-3 px-4">Count</th>
                              <th className="py-3 px-4 text-right">Returned (KG)</th>
                              <th className="py-3 px-4 text-right">Bags</th>
                              <th className="py-3 px-4">Reason / Notes</th>
                              <th className="py-3 px-4">Inventory Tx #</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {order.returns.map((ret) => (
                              <tr key={ret.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-sans text-slate-600">
                                  {new Date(ret.returnDate).toLocaleDateString()}
                                </td>
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  {ret.lot?.lotNumber || "—"}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-700">
                                  {ret.yarnCount || "—"}
                                </td>
                                <td className="py-3 px-4 text-right font-bold text-emerald-700">
                                  {ret.returnedKg.toFixed(2)}
                                </td>
                                <td className="py-3 px-4 text-right">{ret.returnedBags}</td>
                                <td className="py-3 px-4 font-sans text-slate-600">
                                  {ret.reason || ret.remarks || "Surplus return"}
                                </td>
                                <td className="py-3 px-4 text-slate-800 font-bold">
                                  {ret.inventoryTransaction?.transactionNumber || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. OUTPUTS & YIELD TAB */}
                {activeTab === "outputs" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                          Finished Production Outputs & Batch Yield
                        </h3>
                        <p className="text-xs text-slate-500">
                          Total output: {order.totalOutputKg.toFixed(2)} KG | Conversion yield:{" "}
                          <span className="font-bold text-emerald-700">{order.yieldPercentage}%</span>
                        </p>
                      </div>
                      {!isCompleted && !isCancelled && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsOutputOpen(true)}
                          className="h-8 gap-1.5 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Record Output</span>
                        </Button>
                      )}
                    </div>

                    {order.outputs.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                        No finished production outputs logged yet.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                        <table className="w-full min-w-[650px] text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                              <th className="py-3 px-4">Completion Date</th>
                              <th className="py-3 px-4">Product Name</th>
                              <th className="py-3 px-4">SKU / Code</th>
                              <th className="py-3 px-4 text-right">Output (KG)</th>
                              <th className="py-3 px-4">Remarks</th>
                              <th className="py-3 px-4">Logged By</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {order.outputs.map((out) => (
                              <tr key={out.id} className="hover:bg-slate-50">
                                <td className="py-3 px-4 font-sans text-slate-600">
                                  {new Date(out.outputDate).toLocaleDateString()}
                                </td>
                                <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                                  {out.productName}
                                </td>
                                <td className="py-3 px-4 text-slate-600">{out.productCode || "—"}</td>
                                <td className="py-3 px-4 text-right font-bold text-indigo-700">
                                  {out.outputQuantityKg.toFixed(2)} {out.unit}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-500">
                                  {out.remarks || "—"}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-600">
                                  {out.recordedBy
                                    ? `${out.recordedBy.firstName} ${out.recordedBy.lastName}`
                                    : "System"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. TRACEABILITY & AUDIT TAB */}
                {activeTab === "traceability" && (
                  <div className="space-y-6">
                    {/* Traceability Tree */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 text-brand-600" />
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Full Genealogy & Traceability Chain
                          </h4>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onClose();
                            router.push(`/traceability?product=${encodeURIComponent(order.orderNumber)}`);
                          }}
                          className="h-7 text-xs gap-1 bg-white hover:bg-brand-50 hover:text-brand-700 border-slate-300"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Open Full Trace Engine</span>
                        </Button>
                      </div>

                      <div className="text-xs space-y-3 pl-4 border-l-2 border-brand-300">
                        <div>
                          <span className="font-bold text-slate-800">1. Source Yarn Lots:</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {traceData?.sourceLots?.map((lot: any) => (
                              <span
                                key={lot.lotId}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono text-[11px]"
                              >
                                <strong>{lot.lotNumber}</strong> ({lot.yarnCount}) — {lot.supplier}
                              </span>
                            )) || <span className="text-slate-400">No source lots</span>}
                          </div>
                        </div>

                        <div>
                          <span className="font-bold text-slate-800">2. Production Work Order:</span>
                          <p className="text-slate-600 font-mono mt-0.5">
                            {order.orderNumber} ({order.status}) | Team:{" "}
                            {order.productionTeam?.name || "Unassigned"}
                          </p>
                        </div>

                        <div>
                          <span className="font-bold text-slate-800">3. Actual Yarn Consumed:</span>
                          <p className="text-slate-600 font-mono mt-0.5">
                            {order.totalConsumedKg.toFixed(2)} KG consumed + {order.totalWasteKg.toFixed(2)} KG waste
                          </p>
                        </div>

                        <div>
                          <span className="font-bold text-slate-800">4. Finished Output & Customer Link:</span>
                          <p className="text-slate-600 font-mono mt-0.5">
                            {order.totalOutputKg.toFixed(2)} KG finished goods → Customer:{" "}
                            {order.party?.name || "Internal / Stock"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Audit Timeline */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-slate-600" />
                        <span>Audit Log History</span>
                      </h4>

                      <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                        {order.auditLogs.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            No audit events logged yet.
                          </div>
                        ) : (
                          order.auditLogs.map((log) => (
                            <div key={log.id} className="p-3 text-xs flex items-center justify-between">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-mono">
                                    {log.action}
                                  </Badge>
                                  <span className="text-slate-600 text-[11px]">
                                    by {log.user ? `${log.user.firstName} ${log.user.lastName}` : "System"}
                                  </span>
                                </div>
                              </div>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>,
      document.body
    )}

      {/* Child Modals */}
      {order && (
        <>
          <AllocateYarnModal
            isOpen={isAllocateOpen}
            onClose={() => setIsAllocateOpen(false)}
            order={order}
            teams={teams}
            onShowToast={onShowToast}
          />
          <RecordConsumptionModal
            isOpen={isConsumptionOpen}
            onClose={() => setIsConsumptionOpen(false)}
            order={order}
            selectedAllocationId={selectedAllocIdForConsumption}
            onShowToast={onShowToast}
          />
          <RecordReturnModal
            isOpen={isReturnOpen}
            onClose={() => setIsReturnOpen(false)}
            order={order}
            selectedAllocationId={selectedAllocIdForReturn}
            onShowToast={onShowToast}
          />
          <RecordOutputModal
            isOpen={isOutputOpen}
            onClose={() => setIsOutputOpen(false)}
            order={order}
            onShowToast={onShowToast}
          />
          <ConsumptionCorrectionModal
            isOpen={isCorrectionOpen}
            onClose={() => setIsCorrectionOpen(false)}
            record={recordToCorrect}
            onShowToast={onShowToast}
          />
        </>
      )}
    </>
  );
}
