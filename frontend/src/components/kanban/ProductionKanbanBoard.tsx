"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Factory,
  Play,
  RotateCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Plus,
  Scale,
  Flame,
  ArrowRight,
  Layers,
  ArrowUpRight,
  Boxes,
  Eye,
  Building2,
  Clock,
  X,
  ShieldAlert,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { apiClient } from "../../lib/axios";
import { ProductionOrder, ProductionTeam } from "../../types/production";
import { Party } from "../../types/inventory";
import WorkOrderDetailModal from "../production/WorkOrderDetailModal";
import WorkOrderModal from "../production/WorkOrderModal";
import AllocateYarnModal from "../production/AllocateYarnModal";
import { usePermissions } from "../../hooks/usePermissions";

export interface ProductionStage {
  id: string;
  name: string;
  description: string;
  dotColor: string;
  borderColor: string;
  badgeBg: string;
  validNextStages: string[];
}

const PROD_STAGES: ProductionStage[] = [
  {
    id: "allocated",
    name: "Allocated Material",
    description: "Orders planned and assigned with yarn lots",
    dotColor: "bg-purple-500",
    borderColor: "border-t-purple-500",
    badgeBg: "bg-purple-100 text-purple-800",
    validNextStages: ["ready_to_start", "in_production"],
  },
  {
    id: "ready_to_start",
    name: "Ready to Start",
    description: "Yarn delivered to machine stage, ready to start",
    dotColor: "bg-amber-500",
    borderColor: "border-t-amber-500",
    badgeBg: "bg-amber-100 text-amber-800",
    validNextStages: ["in_production"],
  },
  {
    id: "in_production",
    name: "In Production",
    description: "Active running machines, WIP tracked",
    dotColor: "bg-blue-500",
    borderColor: "border-t-blue-500",
    badgeBg: "bg-blue-100 text-blue-800",
    validNextStages: ["awaiting_returns", "reconciliation_output"],
  },
  {
    id: "awaiting_returns",
    name: "Awaiting / Returns",
    description: "Pending yarn replenishment or returning unused yarn to store",
    dotColor: "bg-orange-500",
    borderColor: "border-t-orange-500",
    badgeBg: "bg-orange-100 text-orange-800",
    validNextStages: ["in_production", "reconciliation_output"],
  },
  {
    id: "reconciliation_output",
    name: "Reconciliation & Output",
    description: "Logging consumption, waste, and finished output",
    dotColor: "bg-emerald-500",
    borderColor: "border-t-emerald-500",
    badgeBg: "bg-emerald-100 text-emerald-800",
    validNextStages: ["completed"],
  },
  {
    id: "completed",
    name: "Completed",
    description: "Closed orders with final yield and reconciliation",
    dotColor: "bg-slate-400",
    borderColor: "border-t-slate-400",
    badgeBg: "bg-slate-100 text-slate-700",
    validNextStages: [],
  },
];

interface ProductionKanbanBoardProps {
  onShowToast: (type: "success" | "error", message: string) => void;
  teams: ProductionTeam[];
}

export default function ProductionKanbanBoard({
  onShowToast,
  teams,
}: ProductionKanbanBoardProps) {
  const queryClient = useQueryClient();
  const { isReadOnly, canCreateWorkOrder } = usePermissions();

  // Search & Filters State
  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState("ALL");

  // Drag and Drop State
  const [draggedOrder, setDraggedOrder] = useState<ProductionOrder | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Modals State
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [selectedOrderDetailId, setSelectedOrderDetailId] = useState<string | null>(null);
  const [quickAllocateOrder, setQuickAllocateOrder] = useState<ProductionOrder | null>(null);

  // Confirmation Dialogs
  const [startOrderDialog, setStartOrderDialog] = useState<ProductionOrder | null>(null);
  const [completeOrderDialog, setCompleteOrderDialog] = useState<ProductionOrder | null>(null);

  // ---------------------------------------------------------------------------
  // 1. DATA QUERIES
  // ---------------------------------------------------------------------------
  const {
    data: ordersResponse,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["production", "orders", "kanban"],
    queryFn: async () => {
      const res = await apiClient.get("/production/orders?limit=100");
      return res.data.data;
    },
    staleTime: 30_000,
  });

  const orders: ProductionOrder[] = ordersResponse?.items || [];

  // Fetch Parties for Work Order Modal
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data || [];
    },
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // 2. MUTATIONS
  // ---------------------------------------------------------------------------
  const startOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch(`/production/orders/${id}`, { status: "IN_PROGRESS" });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production"] });
      onShowToast("success", "Production order started! Status is now IN_PROGRESS.");
      setStartOrderDialog(null);
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to start production order");
    },
  });

  const completeOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.post(`/production/orders/${id}/complete`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production"] });
      onShowToast("success", "Work order completed and closed with full yield reconciliation!");
      setCompleteOrderDialog(null);
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to complete work order");
    },
  });

  // ---------------------------------------------------------------------------
  // 3. MAP ORDERS TO PROD STAGES
  // ---------------------------------------------------------------------------
  const ordersByStage = useMemo(() => {
    const map: Record<string, ProductionOrder[]> = {
      allocated: [],
      ready_to_start: [],
      in_production: [],
      awaiting_returns: [],
      reconciliation_output: [],
      completed: [],
    };

    orders.forEach((order) => {
      const allocatedKg = Number(order.totalAllocatedKg || 0);
      const consumedKg = Number(order.totalConsumedKg || 0);
      const returnedKg = Number(order.totalReturnedKg || 0);
      const outputKg = Number(order.totalOutputKg || 0);

      // Filtering by search & team
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesNum = order.orderNumber.toLowerCase().includes(q);
        const matchesProd = order.productName?.toLowerCase().includes(q) || false;
        const matchesTeam = order.productionTeam?.name?.toLowerCase().includes(q) || false;
        if (!matchesNum && !matchesProd && !matchesTeam) return;
      }

      if (filterTeam !== "ALL" && order.productionTeam?.id !== filterTeam) {
        return;
      }

      if (order.status === "COMPLETED") {
        map.completed.push(order);
      } else if (order.status === "IN_PROGRESS") {
        if (returnedKg > 0) {
          map.awaiting_returns.push(order);
        } else if (outputKg > 0 || consumedKg > 0) {
          map.reconciliation_output.push(order);
        } else {
          map.in_production.push(order);
        }
      } else if (order.status === "PLANNED" || order.status === "DRAFT") {
        if (allocatedKg > 0) {
          map.ready_to_start.push(order);
        } else {
          map.allocated.push(order);
        }
      } else {
        map.allocated.push(order);
      }
    });

    return map;
  }, [orders, search, filterTeam]);

  // Stage Metrics
  const stageMetrics = useMemo(() => {
    const metrics: Record<string, { count: number; totalKg: number }> = {};
    PROD_STAGES.forEach((stage) => {
      const stageOrders = ordersByStage[stage.id] || [];
      const totalKg = stageOrders.reduce(
        (sum, o) => sum + Number(o.totalAllocatedKg || o.targetQuantity || 0),
        0
      );
      metrics[stage.id] = { count: stageOrders.length, totalKg };
    });
    return metrics;
  }, [ordersByStage]);

  // ---------------------------------------------------------------------------
  // 4. DRAG & DROP HANDLERS
  // ---------------------------------------------------------------------------
  const handleDragStart = (e: React.DragEvent, order: ProductionOrder) => {
    if (isReadOnly) {
      e.preventDefault();
      return;
    }
    setDraggedOrder(order);
    e.dataTransfer.setData("text/plain", order.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stageId) {
      setDragOverStage(stageId);
    }
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    setDragOverStage(null);

    if (isReadOnly) {
      onShowToast("error", "Viewers have read-only access. Production stage transitions are disabled.");
      return;
    }

    if (!draggedOrder) return;

    // Transition checks
    if (targetStageId === "in_production") {
      if (draggedOrder.status === "PLANNED" || draggedOrder.status === "DRAFT") {
        setStartOrderDialog(draggedOrder);
      }
    } else if (targetStageId === "reconciliation_output" || targetStageId === "awaiting_returns") {
      setSelectedOrderDetailId(draggedOrder.id);
    } else if (targetStageId === "completed") {
      setCompleteOrderDialog(draggedOrder);
    }

    setDraggedOrder(null);
  };

  return (
    <div className="space-y-4">
      {/* Top Search, Filter & Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search & Team Filter */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Work Orders, Products, or Teams..."
              className="pl-9 h-9 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-400 ml-1" />
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">All Production Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.department})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-2.5 text-xs text-slate-600 gap-1.5"
            title="Sync production orders"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* Create Work Order Action (Permission Guarded) */}
        {isReadOnly && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 shrink-0">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            <span>Read-Only Mode (Viewer)</span>
          </div>
        )}

        {canCreateWorkOrder && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOrderOpen(true)}
            className="h-9 gap-1.5 text-xs font-semibold shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Work Order</span>
          </Button>
        )}
      </div>

      {/* Horizontal Kanban Board */}
      <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-300">
        <div className="flex items-start gap-4 min-w-[1300px]">
          {PROD_STAGES.map((stage) => {
            const stageOrders = ordersByStage[stage.id] || [];
            const metrics = stageMetrics[stage.id] || { count: 0, totalKg: 0 };
            const isTargeted = dragOverStage === stage.id;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={`w-[260px] shrink-0 rounded-2xl border bg-slate-100/70 p-3 flex flex-col max-h-[calc(100vh-250px)] transition-all duration-200 ${
                  stage.borderColor
                } border-t-4 ${
                  isTargeted
                    ? "ring-2 ring-primary bg-primary/5 border-dashed border-primary"
                    : "border-slate-200"
                }`}
              >
                {/* Stage Header */}
                <div className="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-200/80 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full ${stage.dotColor} shrink-0`} />
                    <h3 className="font-heading text-xs font-bold text-slate-800 tracking-tight truncate">
                      {stage.name}
                    </h3>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stage.badgeBg}`}>
                    {metrics.count}
                  </span>
                </div>

                {/* Subheader: Volume in Stage */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 px-1">
                  <span>Batch Volume</span>
                  <span className="font-mono font-bold text-slate-800">
                    {metrics.totalKg.toLocaleString("en-IN", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    KG
                  </span>
                </div>

                {/* Stacked Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-none min-h-[160px]">
                  {stageOrders.length === 0 ? (
                    <div className="h-32 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-3 text-slate-400">
                      <Factory className="h-5 w-5 mb-1.5 text-slate-300" />
                      <p className="text-[11px] font-medium">No work orders</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Drag orders here</p>
                    </div>
                  ) : (
                    stageOrders.map((order) => {
                      const allocatedKg = Number(order.totalAllocatedKg || 0);
                      const consumedKg = Number(order.totalConsumedKg || 0);
                      const balanceKg = Number(order.remainingTeamBalanceKg || 0);

                      return (
                        <div
                          key={order.id}
                          draggable={!isReadOnly}
                          onDragStart={(e) => {
                            if (!isReadOnly) handleDragStart(e, order);
                          }}
                          onClick={() => setSelectedOrderDetailId(order.id)}
                          className={`group relative rounded-xl border bg-white p-3.5 shadow-sm transition-all duration-200 hover:shadow-md select-none ${
                            isReadOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                          } ${
                            draggedOrder?.id === order.id
                              ? "opacity-50 ring-2 ring-primary scale-95 border-primary shadow-xl"
                              : "border-slate-200/80 hover:border-slate-300"
                          }`}
                        >
                          {/* Order Header */}
                          <div className="flex items-center justify-between gap-1.5 mb-2">
                            <span className="font-mono text-xs font-bold text-slate-800 tracking-tight truncate">
                              {order.orderNumber}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold uppercase tracking-wider py-0 px-2 shrink-0 border-slate-200 text-slate-600 bg-slate-50"
                            >
                              {order.status}
                            </Badge>
                          </div>

                          {/* Product Name */}
                          <div className="mb-2.5">
                            <h4 className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors line-clamp-1">
                              {order.productName || "Standard Yarn Batch"}
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate flex items-center gap-1">
                              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{order.productionTeam?.name || "Unassigned Team"}</span>
                            </p>
                          </div>

                          {/* Metrics Grid */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 text-xs mb-3">
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">
                                Allocated
                              </span>
                              <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                                {allocatedKg > 0 ? `${allocatedKg.toLocaleString()} KG` : "0 KG"}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">
                                Floor Balance
                              </span>
                              <span
                                className={`font-mono font-bold mt-0.5 block ${
                                  balanceKg > 0 ? "text-emerald-700 font-semibold" : "text-slate-500"
                                }`}
                              >
                                {balanceKg.toLocaleString()} KG
                              </span>
                            </div>
                          </div>

                          {/* Quick Action Button */}
                          <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                            {order.status === "PLANNED" && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setStartOrderDialog(order);
                                }}
                                className="w-full h-7 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-1 shadow-sm"
                              >
                                <Play className="h-3 w-3 fill-white" />
                                <span>Start Order</span>
                              </Button>
                            )}

                            {order.status === "IN_PROGRESS" && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderDetailId(order.id);
                                }}
                                className="w-full h-7 text-xs font-semibold bg-primary hover:bg-primary/90 text-white rounded-lg flex items-center justify-center gap-1 shadow-sm"
                              >
                                <Factory className="h-3 w-3" />
                                <span>Floor Ops</span>
                              </Button>
                            )}

                            {order.status === "COMPLETED" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderDetailId(order.id);
                                }}
                                className="w-full h-7 text-xs text-slate-700 hover:bg-slate-100 rounded-lg flex items-center justify-center gap-1"
                              >
                                <Eye className="h-3 w-3" />
                                <span>Summary & Yield</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Start Order Dialog */}
      {startOrderDialog && (
        <Dialog open={!!startOrderDialog} onOpenChange={() => setStartOrderDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <Play className="h-5 w-5 text-emerald-600" />
                <span>Start Production Order?</span>
              </DialogTitle>
              <DialogDescription>
                Order <strong className="text-slate-900">{startOrderDialog.orderNumber}</strong> will
                transition to <span className="font-semibold text-emerald-700">IN_PROGRESS</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 my-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Product:</span>
                <span className="font-bold text-slate-800">{startOrderDialog.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Allocated Yarn:</span>
                <span className="font-mono font-bold text-slate-800">
                  {startOrderDialog.totalAllocatedKg?.toLocaleString() || 0} KG
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Production Team:</span>
                <span className="font-semibold text-slate-800">
                  {startOrderDialog.productionTeam?.name || "Floor Team"}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStartOrderDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => startOrderMutation.mutate(startOrderDialog.id)}
                disabled={startOrderMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {startOrderMutation.isPending ? "Starting..." : "Confirm & Start Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Complete Order Dialog */}
      {completeOrderDialog && (
        <Dialog open={!!completeOrderDialog} onOpenChange={() => setCompleteOrderDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                <span>Complete Production Order?</span>
              </DialogTitle>
              <DialogDescription>
                Close production order <strong className="text-slate-900">{completeOrderDialog.orderNumber}</strong> and
                finalize yield calculation.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCompleteOrderDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => completeOrderMutation.mutate(completeOrderDialog.id)}
                disabled={completeOrderMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {completeOrderMutation.isPending ? "Closing..." : "Confirm & Close Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Full Work Order Detail Modal (Floor Ops: Consumption, Returns, Output, Completion) */}
      <WorkOrderDetailModal
        isOpen={!!selectedOrderDetailId}
        onClose={() => setSelectedOrderDetailId(null)}
        orderId={selectedOrderDetailId}
        teams={teams}
        onShowToast={onShowToast}
      />

      {/* New Work Order Modal */}
      <WorkOrderModal
        isOpen={isCreateOrderOpen}
        onClose={() => setIsCreateOrderOpen(false)}
        teams={teams}
        parties={parties}
        onShowToast={onShowToast}
      />

      {/* Quick Allocate Modal */}
      {quickAllocateOrder && (
        <AllocateYarnModal
          isOpen={!!quickAllocateOrder}
          onClose={() => setQuickAllocateOrder(null)}
          order={quickAllocateOrder}
          teams={teams}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
