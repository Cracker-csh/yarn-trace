"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Plus,
  ArrowDownLeft,
  Factory,
  Search,
  RotateCw,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  Flame,
  Layers,
  ArrowRight,
  X,
  ShieldAlert,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import StockKanbanCard, { KanbanItem } from "./StockKanbanCard";
import OpeningStockModal from "../inventory/OpeningStockModal";
import ReceiveStockModal from "../inventory/ReceiveStockModal";
import AllocateToProductionModal from "../inventory/AllocateToProductionModal";
import { apiClient } from "../../lib/axios";
import { LotRecord, Party, InventoryFilters } from "../../types/inventory";
import { ProductionOrder, ProductionTeam } from "../../types/production";
import { usePermissions } from "../../hooks/usePermissions";

export interface KanbanStage {
  id: string;
  name: string;
  description: string;
  dotColor: string;
  borderColor: string;
  badgeBg: string;
  validNextStages: string[];
}

const STAGES: KanbanStage[] = [
  {
    id: "opening_received",
    name: "Opening / Received",
    description: "Newly inwarded lots or opening balance records",
    dotColor: "bg-slate-500",
    borderColor: "border-t-slate-500",
    badgeBg: "bg-slate-100 text-slate-800",
    validNextStages: ["available_stock", "allocated_production"],
  },
  {
    id: "available_stock",
    name: "Available Stock",
    description: "Verified usable warehouse stock ready for issue/allocation",
    dotColor: "bg-emerald-500",
    borderColor: "border-t-emerald-500",
    badgeBg: "bg-emerald-100 text-emerald-800",
    validNextStages: ["allocated_production", "pending_allocation"],
  },
  {
    id: "pending_allocation",
    name: "Pending Allocation",
    description: "Issued lots or material reserved for department orders",
    dotColor: "bg-amber-500",
    borderColor: "border-t-amber-500",
    badgeBg: "bg-amber-100 text-amber-800",
    validNextStages: ["allocated_production", "in_production"],
  },
  {
    id: "allocated_production",
    name: "Allocated to Floor",
    description: "Work orders with assigned yarn and production teams",
    dotColor: "bg-purple-500",
    borderColor: "border-t-purple-500",
    badgeBg: "bg-purple-100 text-purple-800",
    validNextStages: ["in_production"],
  },
  {
    id: "in_production",
    name: "In Production (WIP)",
    description: "Active running batches on spinning/knitting machines",
    dotColor: "bg-blue-500",
    borderColor: "border-t-blue-500",
    badgeBg: "bg-blue-100 text-blue-800",
    validNextStages: ["reconciliation_qc"],
  },
  {
    id: "reconciliation_qc",
    name: "QC & Reconciliation",
    description: "Finished batches logging consumption, waste, and returns",
    dotColor: "bg-cyan-500",
    borderColor: "border-t-cyan-500",
    badgeBg: "bg-cyan-100 text-cyan-800",
    validNextStages: ["completed_closed"],
  },
  {
    id: "completed_closed",
    name: "Completed / Closed",
    description: "Reconciled work orders and exhausted yarn lots",
    dotColor: "bg-slate-400",
    borderColor: "border-t-slate-400",
    badgeBg: "bg-slate-100 text-slate-700",
    validNextStages: [],
  },
];

interface StockKanbanBoardProps {
  onShowToast: (type: "success" | "error", message: string) => void;
  externalFilters?: InventoryFilters;
  isEmbeddedInInventory?: boolean;
}

export default function StockKanbanBoard({
  onShowToast,
  externalFilters,
  isEmbeddedInInventory = false,
}: StockKanbanBoardProps) {
  const queryClient = useQueryClient();
  const {
    isReadOnly,
    canReceiveStock,
    canAllocateToFloor,
    canAddOpeningStock,
  } = usePermissions();

  // Search & Filters State
  const [search, setSearch] = useState("");
  const [filterWarehouse, setFilterWarehouse] = useState("ALL");
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  // Drag and Drop State
  const [draggedItem, setDraggedItem] = useState<KanbanItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Modals State
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [preselectedLotForAllocate, setPreselectedLotForAllocate] = useState<LotRecord | null>(null);

  // Start Order Confirmation Dialog State
  const [startOrderDialog, setStartOrderDialog] = useState<KanbanItem | null>(null);

  // Complete Order Confirmation Dialog State
  const [completeOrderDialog, setCompleteOrderDialog] = useState<KanbanItem | null>(null);

  // Detail Modal State
  const [selectedDetailItem, setSelectedDetailItem] = useState<KanbanItem | null>(null);

  // ---------------------------------------------------------------------------
  // 1. DATA QUERIES
  // ---------------------------------------------------------------------------
  // Lots Master Ledger
  const { data: lots = [], isLoading: isLotsLoading, refetch: refetchLots } = useQuery<LotRecord[]>({
    queryKey: ["inventory", "lots"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/lots");
      return res.data.data || [];
    },
    staleTime: 30_000,
  });

  // Production Orders
  const { data: ordersResponse, isLoading: isOrdersLoading, refetch: refetchOrders } = useQuery({
    queryKey: ["production", "orders"],
    queryFn: async () => {
      const res = await apiClient.get("/production/orders?limit=100");
      return res.data.data;
    },
    staleTime: 30_000,
  });
  const orders: ProductionOrder[] = Array.isArray(ordersResponse)
    ? ordersResponse
    : ordersResponse?.data || ordersResponse?.items || [];

  // Eligible Issues
  const { data: eligibleIssues = [], refetch: refetchIssues } = useQuery({
    queryKey: ["production", "eligible-issues"],
    queryFn: async () => {
      const res = await apiClient.get("/production/eligible-issues");
      return res.data.data || [];
    },
    staleTime: 30_000,
  });

  // Parties Master (for Modals)
  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data || [];
    },
    staleTime: 60_000,
  });

  // Production Teams Master
  const { data: teams = [] } = useQuery<ProductionTeam[]>({
    queryKey: ["production", "teams"],
    queryFn: async () => {
      const res = await apiClient.get("/production/teams");
      return res.data.data || [];
    },
    staleTime: 60_000,
  });

  // Assign Issued Stock to Work Order State
  const [assignOrderDialog, setAssignOrderDialog] = useState<KanbanItem | null>(null);
  const [selectedOrderIdForAssign, setSelectedOrderIdForAssign] = useState<string>("");
  const [selectedTeamIdForAssign, setSelectedTeamIdForAssign] = useState<string>("");
  const [assignKg, setAssignKg] = useState<string>("");
  const [assignBags, setAssignBags] = useState<string>("");
  const [assignNotes, setAssignNotes] = useState<string>("");

  const openAssignOrderModal = (item: KanbanItem) => {
    setAssignOrderDialog(item);
    setAssignKg(String(item.weightKg));
    setAssignBags(String(item.bagsCount || 0));
    setAssignNotes("");

    const activeOrders = orders.filter(
      (o) => o.status === "PLANNED" || o.status === "IN_PROGRESS" || o.status === "DRAFT"
    );
    if (activeOrders.length > 0) {
      setSelectedOrderIdForAssign(activeOrders[0].id);
      if (activeOrders[0].productionTeam?.id) {
        setSelectedTeamIdForAssign(activeOrders[0].productionTeam.id);
      } else if (teams.length > 0) {
        setSelectedTeamIdForAssign(teams[0].id);
      }
    } else {
      setSelectedOrderIdForAssign("");
      if (teams.length > 0) {
        setSelectedTeamIdForAssign(teams[0].id);
      }
    }
  };

  const refetchAll = () => {
    refetchLots();
    refetchOrders();
    refetchIssues();
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["production"] });
  };

  // ---------------------------------------------------------------------------
  // 2. MUTATIONS
  // ---------------------------------------------------------------------------
  const startOrderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch(`/production/orders/${id}`, { status: "IN_PROGRESS" });
      return res.data;
    },
    onSuccess: () => {
      refetchAll();
      onShowToast("success", "Production order started! Order transitioned to In Production (WIP).");
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
      refetchAll();
      onShowToast("success", "Work order completed and closed with full yield reconciliation!");
      setCompleteOrderDialog(null);
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to complete work order");
    },
  });

  const assignWorkOrderMutation = useMutation({
    mutationFn: async ({
      orderId,
      payload,
    }: {
      orderId: string;
      payload: {
        inventoryTransactionId: string;
        productionTeamId: string;
        allocatedKg: number;
        bags?: number;
        remarks?: string;
      };
    }) => {
      const res = await apiClient.post(`/production/orders/${orderId}/allocations`, payload);
      return res.data;
    },
    onSuccess: () => {
      refetchAll();
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onShowToast("success", "Yarn successfully assigned to Work Order!");
      setAssignOrderDialog(null);
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to assign yarn to work order.");
    },
  });

  // ---------------------------------------------------------------------------
  // 3. TRANSFORM ALL RECORDS INTO UNIFIED KANBAN ITEMS
  // ---------------------------------------------------------------------------
  const allKanbanItems = useMemo<KanbanItem[]>(() => {
    const items: KanbanItem[] = [];

    // Map Lots to Stages
    lots.forEach((lot) => {
      const currentKg = Number(lot.currentWeightKg || 0);
      const issuedKg = Number(lot.totalIssuedKg || 0);

      let stageId = "available_stock";
      if (lot.status === "EXHAUSTED" || (currentKg === 0 && issuedKg > 0)) {
        stageId = "completed_closed";
      } else if (lot.status === "RECEIVED" || (issuedKg === 0 && lot.status === "APPROVED")) {
        // Newly inwarded or opening balance
        stageId = currentKg > 0 ? "available_stock" : "opening_received";
      } else if (currentKg > 0) {
        stageId = "available_stock";
      }

      items.push({
        id: `lot-${lot.id}`,
        type: "LOT",
        referenceNumber: lot.lotNumber,
        title: lot.count || lot.yarnCount || "Yarn Stock",
        subtitle: lot.party?.name ? `Supplier: ${lot.party.name}` : undefined,
        lotNumber: lot.lotNumber,
        weightKg: currentKg,
        bagsCount: lot.currentBags,
        locationOrDepartment: "Main Warehouse",
        assignedTo: lot.party?.code || null,
        stageId,
        status: lot.status,
        rawPayload: lot,
      });
    });

    // Map Eligible Issued Transactions to Pending Allocation
    eligibleIssues.forEach((issue: any) => {
      const yarnCountLabel =
        issue.yarnCount ||
        issue.count ||
        issue.lot?.yarnCount ||
        issue.rawPayload?.yarnCount ||
        "Yarn Stock";

      items.push({
        id: `issue-${issue.id}`,
        type: "ISSUE",
        referenceNumber: issue.transactionNumber || `ISSUE-${issue.lotNumber}`,
        title: `${yarnCountLabel} (Pending Assign)`,
        subtitle: `Lot: ${issue.lotNumber || issue.lot?.lotNumber || "—"}`,
        lotNumber: issue.lotNumber || issue.lot?.lotNumber,
        weightKg: Number(issue.unallocatedKg ?? issue.kilos ?? issue.totalIssuedKg ?? 0),
        bagsCount: issue.issuedBags ?? issue.bags ?? 0,
        locationOrDepartment: issue.purpose || "Floor Stage",
        assignedTo: issue.partyName || issue.party?.name || null,
        stageId: "pending_allocation",
        status: "ISSUED",
        rawPayload: issue,
      });
    });

    // Map Production Orders to Allocated, In Production, QC & Completed
    orders.forEach((order) => {
      let stageId = "allocated_production";
      if (order.status === "PLANNED" || order.status === "DRAFT") {
        stageId = "allocated_production";
      } else if (order.status === "IN_PROGRESS") {
        // Check if consumption has been recorded -> QC & Reconciliation
        if (order.totalConsumedKg > 0 || order.totalWasteKg > 0 || order.totalReturnedKg > 0) {
          stageId = "reconciliation_qc";
        } else {
          stageId = "in_production";
        }
      } else if (order.status === "COMPLETED") {
        stageId = "completed_closed";
      }

      const allocatedKg = Number(order.totalAllocatedKg || 0);

      items.push({
        id: `order-${order.id}`,
        type: "ORDER",
        referenceNumber: order.orderNumber,
        title: order.productName || "Production Batch",
        subtitle: order.productionTeam?.name ? `Team: ${order.productionTeam.name}` : undefined,
        orderNumber: order.orderNumber,
        weightKg: allocatedKg > 0 ? allocatedKg : Number(order.targetQuantity || 0),
        bagsCount: undefined,
        locationOrDepartment: order.productionTeam?.department || "Knitting Unit",
        assignedTo: order.productionTeam?.name || "Floor Team",
        stageId,
        status: order.status,
        rawPayload: order,
      });
    });

    return items;
  }, [lots, orders, eligibleIssues]);

  // ---------------------------------------------------------------------------
  // 4. FILTER ITEMS (Live search & external filters)
  // ---------------------------------------------------------------------------
  const filteredItems = useMemo(() => {
    return allKanbanItems.filter((item) => {
      // 1. Live text query (internal search or external search)
      const q = (search.trim() || externalFilters?.search?.trim() || "").toLowerCase();
      if (q) {
        const matchesRef = item.referenceNumber.toLowerCase().includes(q);
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSub = item.subtitle?.toLowerCase().includes(q) ?? false;
        const matchesLoc = item.locationOrDepartment.toLowerCase().includes(q);
        if (!matchesRef && !matchesTitle && !matchesSub && !matchesLoc) return false;
      }

      // 2. Filter by Yarn Count
      if (externalFilters?.count?.trim()) {
        const countQuery = externalFilters.count.toLowerCase().trim();
        const matchesCount = item.title.toLowerCase().includes(countQuery);
        if (!matchesCount) return false;
      }

      // 3. Filter by Party / Supplier
      if (externalFilters?.partyId) {
        const rawPartyId = item.rawPayload?.partyId || item.rawPayload?.party?.id;
        if (rawPartyId && rawPartyId !== externalFilters.partyId) return false;
      }

      // 4. Filter by Lot Number
      if (externalFilters?.lotNumber?.trim()) {
        const lotQuery = externalFilters.lotNumber.toLowerCase().trim();
        const matchesLot = (item.lotNumber || item.referenceNumber).toLowerCase().includes(lotQuery);
        if (!matchesLot) return false;
      }

      // 5. Filter by Purpose
      if (externalFilters?.purpose) {
        const rawPurpose = item.rawPayload?.purpose;
        if (rawPurpose && rawPurpose !== externalFilters.purpose) return false;
      }

      // 6. Warehouse Filter
      if (filterWarehouse !== "ALL") {
        if (!item.locationOrDepartment.toLowerCase().includes(filterWarehouse.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [allKanbanItems, search, filterWarehouse, externalFilters]);

  // Group items by stage
  const itemsByStage = useMemo(() => {
    const map: Record<string, KanbanItem[]> = {};
    STAGES.forEach((stage) => {
      map[stage.id] = [];
    });

    filteredItems.forEach((item) => {
      if (map[item.stageId]) {
        map[item.stageId].push(item);
      }
    });

    return map;
  }, [filteredItems]);

  // Calculate totals per stage
  const stageMetrics = useMemo(() => {
    const metrics: Record<string, { count: number; totalKg: number }> = {};
    STAGES.forEach((stage) => {
      const stageItems = itemsByStage[stage.id] || [];
      const totalKg = stageItems.reduce((acc, curr) => acc + curr.weightKg, 0);
      metrics[stage.id] = { count: stageItems.length, totalKg };
    });
    return metrics;
  }, [itemsByStage]);

  // ---------------------------------------------------------------------------
  // 5. DRAG & DROP HANDLERS WITH VALIDATION & CONFIRMATION
  // ---------------------------------------------------------------------------
  const handleDragStart = (e: React.DragEvent, item: KanbanItem) => {
    if (isReadOnly) {
      e.preventDefault();
      return;
    }
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: item.id, stageId: item.stageId }));
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
      onShowToast("error", "Viewers have read-only access. Stage changes are restricted.");
      return;
    }

    if (!draggedItem) return;

    const sourceStageId = draggedItem.stageId;
    if (sourceStageId === targetStageId) {
      setDraggedItem(null);
      return;
    }

    // Check valid transitions
    const sourceStage = STAGES.find((s) => s.id === sourceStageId);
    const isValidTransition = sourceStage?.validNextStages.includes(targetStageId);

    if (!isValidTransition) {
      onShowToast(
        "error",
        `Invalid workflow transition: Cannot move directly from "${sourceStage?.name}" to "${
          STAGES.find((s) => s.id === targetStageId)?.name
        }". Must follow authorized lifecycle.`
      );
      setDraggedItem(null);
      return;
    }

    // Execute context-specific transition confirmation
    if (targetStageId === "allocated_production") {
      // Transition to Allocated to Production
      if (draggedItem.type === "LOT") {
        setPreselectedLotForAllocate(draggedItem.rawPayload as LotRecord);
        setIsAllocateModalOpen(true);
      } else if (draggedItem.type === "ISSUE") {
        openAssignOrderModal(draggedItem);
      } else {
        onShowToast("error", "Only available yarn lots or issued pending lots can be allocated to production.");
      }
    } else if (targetStageId === "in_production") {
      // Transition to In Production -> Start Order confirmation
      if (draggedItem.type === "ORDER") {
        setStartOrderDialog(draggedItem);
      } else {
        onShowToast("error", "Only allocated work orders can be transitioned to In Production.");
      }
    } else if (targetStageId === "completed_closed") {
      // Transition to Completed -> Complete Order confirmation
      if (draggedItem.type === "ORDER") {
        setCompleteOrderDialog(draggedItem);
      } else {
        onShowToast("error", "Only active work orders can be closed.");
      }
    } else {
      onShowToast("success", `Workflow updated: ${draggedItem.referenceNumber} moved to ${targetStageId}`);
    }

    setDraggedItem(null);
  };

  // Card Action Handler
  const handleActionClick = (item: KanbanItem, actionType: string) => {
    if (actionType === "allocate") {
      if (item.type === "LOT") {
        setPreselectedLotForAllocate(item.rawPayload as LotRecord);
      }
      setIsAllocateModalOpen(true);
    } else if (actionType === "assign_order") {
      openAssignOrderModal(item);
    } else if (actionType === "start_order") {
      setStartOrderDialog(item);
    } else if (actionType === "complete_order") {
      setCompleteOrderDialog(item);
    } else {
      setSelectedDetailItem(item);
    }
  };

  return (
    <div className="space-y-4">
      {/* Horizontal Scrollable Kanban Columns Container */}
      <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-300">
        <div className="flex items-start gap-4 min-w-[1400px]">
          {STAGES.map((stage) => {
            const stageItems = itemsByStage[stage.id] || [];
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
                {/* Column Header */}
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

                {/* Subheader: Stage Total Weight */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2 px-1">
                  <span>Total Volume</span>
                  <span className="font-mono font-bold text-slate-800">
                    {metrics.totalKg.toLocaleString("en-IN", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}{" "}
                    KG
                  </span>
                </div>

                {/* Vertically Stacked Draggable Cards */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 scrollbar-none min-h-[160px]">
                  {stageItems.length === 0 ? (
                    <div className="h-32 rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-center p-3 text-slate-400">
                      <Boxes className="h-5 w-5 mb-1.5 text-slate-300" />
                      <p className="text-[11px] font-medium">No stock in this stage</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Drag cards here</p>
                    </div>
                  ) : (
                    stageItems.map((item) => (
                      <StockKanbanCard
                        key={item.id}
                        item={item}
                        isDragging={draggedItem?.id === item.id}
                        onDragStart={handleDragStart}
                        onActionClick={handleActionClick}
                        onCardClick={(clicked) => setSelectedDetailItem(clicked)}
                        isReadOnly={isReadOnly}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Start Order Confirmation Dialog */}
      {startOrderDialog && (
        <Dialog open={!!startOrderDialog} onOpenChange={() => setStartOrderDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <Factory className="h-5 w-5 text-emerald-600" />
                <span>Start Production Order?</span>
              </DialogTitle>
              <DialogDescription>
                Order <strong className="text-slate-900">{startOrderDialog.referenceNumber}</strong> will
                transition from PLANNED to <span className="font-semibold text-emerald-700">IN_PROGRESS</span>.
                The assigned floor team can now begin spinning/knitting.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2 my-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Product:</span>
                <span className="font-bold text-slate-800">{startOrderDialog.title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Allocated Yarn:</span>
                <span className="font-mono font-bold text-slate-800">
                  {startOrderDialog.weightKg.toLocaleString()} KG
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Team:</span>
                <span className="font-semibold text-slate-800">
                  {startOrderDialog.assignedTo || "Floor Team"}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setStartOrderDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const rawOrder = startOrderDialog.rawPayload as ProductionOrder;
                  startOrderMutation.mutate(rawOrder.id);
                }}
                disabled={startOrderMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {startOrderMutation.isPending ? "Starting..." : "Confirm & Start Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Complete Order Confirmation Dialog */}
      {completeOrderDialog && (
        <Dialog open={!!completeOrderDialog} onOpenChange={() => setCompleteOrderDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <CheckCircle2 className="h-5 w-5 text-indigo-600" />
                <span>Complete Production Order?</span>
              </DialogTitle>
              <DialogDescription>
                Close production order <strong className="text-slate-900">{completeOrderDialog.referenceNumber}</strong> and
                finalize yield calculation.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100 text-xs space-y-2 my-2">
              <p className="text-indigo-900">
                This will lock material consumption and reconcile the remaining floor balance for this order.
              </p>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCompleteOrderDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  const rawOrder = completeOrderDialog.rawPayload as ProductionOrder;
                  completeOrderMutation.mutate(rawOrder.id);
                }}
                disabled={completeOrderMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {completeOrderMutation.isPending ? "Closing..." : "Confirm & Close Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Assign Issued Stock to Work Order Modal */}
      {assignOrderDialog && (
        <Dialog open={!!assignOrderDialog} onOpenChange={() => setAssignOrderDialog(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold">
                <Factory className="h-5 w-5 text-amber-600" />
                <span>Assign Yarn to Work Order</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Link issued stock transaction{" "}
                <strong className="text-slate-800">{assignOrderDialog.referenceNumber}</strong> to an active production order.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedOrderIdForAssign) {
                  onShowToast("error", "Please select a production work order.");
                  return;
                }
                if (!selectedTeamIdForAssign) {
                  onShowToast("error", "Please select a production team.");
                  return;
                }
                const kg = parseFloat(assignKg);
                if (isNaN(kg) || kg <= 0) {
                  onShowToast("error", "Allocated KG must be greater than 0.");
                  return;
                }
                if (kg > assignOrderDialog.weightKg + 0.01) {
                  onShowToast("error", `Cannot allocate more than available unallocated weight (${assignOrderDialog.weightKg} KG).`);
                  return;
                }

                const rawIssue = assignOrderDialog.rawPayload;
                assignWorkOrderMutation.mutate({
                  orderId: selectedOrderIdForAssign,
                  payload: {
                    inventoryTransactionId: rawIssue.id,
                    productionTeamId: selectedTeamIdForAssign,
                    allocatedKg: kg,
                    bags: parseInt(assignBags, 10) || 0,
                    remarks: assignNotes || `Allocated from ${assignOrderDialog.referenceNumber}`,
                  },
                });
              }}
              className="space-y-3.5 my-2 text-xs"
            >
              {/* Issued Stock Summary Card */}
              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/80 space-y-1.5">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Source Issue Record:</span>
                  <span className="font-mono font-bold text-slate-900">{assignOrderDialog.referenceNumber}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <span>Yarn Count & Lot:</span>
                  <span className="font-semibold text-slate-800">{assignOrderDialog.title} | {assignOrderDialog.lotNumber}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-amber-200 text-amber-900 font-semibold">
                  <span>Available to Allocate:</span>
                  <span className="font-mono">{assignOrderDialog.weightKg.toLocaleString()} KG ({assignOrderDialog.bagsCount || 0} bags)</span>
                </div>
              </div>

              {/* Target Production Order */}
              <div>
                <Label htmlFor="assign-order-select" className="text-xs font-semibold text-slate-700 mb-1 block">
                  Select Production Work Order <span className="text-red-500">*</span>
                </Label>
                <select
                  id="assign-order-select"
                  value={selectedOrderIdForAssign}
                  onChange={(e) => {
                    const orderId = e.target.value;
                    setSelectedOrderIdForAssign(orderId);
                    const found = orders.find((o) => o.id === orderId);
                    if (found?.productionTeam?.id) {
                      setSelectedTeamIdForAssign(found.productionTeam.id);
                    }
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">-- Choose active work order --</option>
                  {orders
                    .filter((o) => o.status === "PLANNED" || o.status === "IN_PROGRESS" || o.status === "DRAFT")
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNumber} - {o.productName} ({o.status})
                      </option>
                    ))}
                </select>
                {orders.filter((o) => o.status === "PLANNED" || o.status === "IN_PROGRESS" || o.status === "DRAFT").length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span>No active work orders found. You can create one from the </span>
                    <a href="/production" className="underline font-bold text-amber-900 hover:text-amber-950" target="_blank" rel="noreferrer">
                      Production Page →
                    </a>
                  </p>
                )}
              </div>

              {/* Target Production Team */}
              <div>
                <Label htmlFor="assign-team-select" className="text-xs font-semibold text-slate-700 mb-1 block">
                  Assigned Production Team <span className="text-red-500">*</span>
                </Label>
                <select
                  id="assign-team-select"
                  value={selectedTeamIdForAssign}
                  onChange={(e) => setSelectedTeamIdForAssign(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                  required
                >
                  <option value="">-- Choose production team --</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Qty & Bags */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="assign-kg-input" className="text-xs font-semibold text-slate-700 mb-1 block">
                    Weight to Allocate (KG) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="assign-kg-input"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={assignOrderDialog.weightKg}
                    value={assignKg}
                    onChange={(e) => setAssignKg(e.target.value)}
                    className="h-10 text-xs font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="assign-bags-input" className="text-xs font-semibold text-slate-700 mb-1 block">
                    Bags Count
                  </Label>
                  <Input
                    id="assign-bags-input"
                    type="number"
                    min="0"
                    value={assignBags}
                    onChange={(e) => setAssignBags(e.target.value)}
                    className="h-10 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <Label htmlFor="assign-notes-input" className="text-xs font-semibold text-slate-700 mb-1 block">
                  Allocation Remarks (Optional)
                </Label>
                <Input
                  id="assign-notes-input"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. Allocation for Knitting Shift A"
                  className="h-10 text-xs"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setAssignOrderDialog(null)} disabled={assignWorkOrderMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={assignWorkOrderMutation.isPending || !selectedOrderIdForAssign || !selectedTeamIdForAssign}
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                >
                  {assignWorkOrderMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Confirm Work Order Allocation</span>
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Quick Detail Dialog */}
      {selectedDetailItem && (
        <Dialog open={!!selectedDetailItem} onOpenChange={() => setSelectedDetailItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900">
                <Boxes className="h-5 w-5 text-primary" />
                <span>Stock Record: {selectedDetailItem.referenceNumber}</span>
              </DialogTitle>
              <DialogDescription>
                Full lifecycle details and transaction metadata.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 my-2 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block uppercase tracking-wider text-[10px]">
                    {selectedDetailItem.type === "ORDER" ? "Product" : "Yarn Count / Item"}
                  </span>
                  <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                    {(selectedDetailItem.title || "Yarn Stock").replace(/^undefined\s*/i, "Yarn Stock ")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase tracking-wider text-[10px]">Status</span>
                  {selectedDetailItem.type === "ISSUE" ? (
                    <Badge variant="outline" className="mt-1 font-semibold text-amber-700 bg-amber-50 border-amber-200">
                      ISSUED (PENDING ASSIGN)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="mt-1 font-semibold">{selectedDetailItem.status}</Badge>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block uppercase tracking-wider text-[10px]">Net Quantity</span>
                  <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                    {selectedDetailItem.weightKg.toLocaleString()} KG
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase tracking-wider text-[10px]">Location</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {selectedDetailItem.locationOrDepartment || "Floor"}
                  </span>
                </div>
              </div>

              {selectedDetailItem.type === "ISSUE" && (
                <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2">
                  <Factory className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Issued from Warehouse to Factory Floor</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      This yarn has been issued to the {selectedDetailItem.locationOrDepartment || "production"} floor and is waiting to be linked to a specific work order.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setSelectedDetailItem(null)}>
                Close
              </Button>
              {selectedDetailItem.type === "ISSUE" && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const item = selectedDetailItem;
                    setSelectedDetailItem(null);
                    openAssignOrderModal(item);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
                >
                  <Factory className="h-4 w-4" />
                  <span>Assign to Work Order</span>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modals */}
      <OpeningStockModal
        isOpen={isOpeningModalOpen}
        onClose={() => setIsOpeningModalOpen(false)}
        parties={parties}
        existingLots={lots}
        onShowToast={onShowToast}
      />

      <ReceiveStockModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        parties={parties}
        onShowToast={onShowToast}
      />

      <AllocateToProductionModal
        isOpen={isAllocateModalOpen}
        onClose={() => {
          setIsAllocateModalOpen(false);
          setPreselectedLotForAllocate(null);
        }}
        lots={lots}
        parties={parties}
        preselectedLot={preselectedLotForAllocate}
        onShowToast={onShowToast}
      />
    </div>
  );
}
