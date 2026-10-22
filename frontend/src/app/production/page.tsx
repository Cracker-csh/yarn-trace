"use client";

import React, { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "../../hooks/useDebounce";
import {
  Factory,
  Plus,
  Users,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Kanban,
  List,
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
  ProductionOrder,
  ProductionTeam,
  ProductionSummary,
  ProductionOrderStatus,
} from "../../types/production";
import { Party } from "../../types/inventory";

import dynamic from "next/dynamic";

// Production Components & Modals (Lazy Loaded)
import ProductionKpiCards from "../../components/production/ProductionKpiCards";
import ProductionFilters from "../../components/production/ProductionFilters";
const ProductionTeamsModal = dynamic(() => import("../../components/production/ProductionTeamsModal"), { ssr: false });
const WorkOrderModal = dynamic(() => import("../../components/production/WorkOrderModal"), { ssr: false });
const WorkOrderDetailModal = dynamic(() => import("../../components/production/WorkOrderDetailModal"), { ssr: false });
const AllocateYarnModal = dynamic(() => import("../../components/production/AllocateYarnModal"), { ssr: false });
import ProductionKanbanBoard from "../../components/kanban/ProductionKanbanBoard";
import { usePermissions } from "../../hooks/usePermissions";

export default function ProductionPage() {
  const { canCreateWorkOrder, canManageTeams, isViewer } = usePermissions();
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

  // Toast Notification State
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
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | "">("");
  const [teamFilter, setTeamFilter] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [page, setPage] = useState(1);

  // Modals State
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);
  const [isWorkOrderModalOpen, setIsWorkOrderModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<ProductionOrder | null>(null);
  const [selectedOrderDetailId, setSelectedOrderDetailId] = useState<string | null>(null);

  // Quick Action Modal States
  const [quickAllocateOrder, setQuickAllocateOrder] = useState<ProductionOrder | null>(null);

  // ---------------------------------------------------------------------------
  // 1. FETCH PRODUCTION SUMMARY / KPIS
  // ---------------------------------------------------------------------------
  const { data: summaryData, isLoading: isLoadingSummary } = useQuery<ProductionSummary>({
    queryKey: ["production", "summary"],
    queryFn: async () => {
      const res = await apiClient.get("/production/summary");
      return res.data.data;
    },
    staleTime: 30_000,
  });

  // ---------------------------------------------------------------------------
  // 2. FETCH TEAMS MASTER
  // ---------------------------------------------------------------------------
  const { data: teams = [] } = useQuery<ProductionTeam[]>({
    queryKey: ["production", "teams"],
    queryFn: async () => {
      const res = await apiClient.get("/production/teams");
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // 3. FETCH PARTIES MASTER
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
  // 4. FETCH WORK ORDERS
  // ---------------------------------------------------------------------------
  const {
    data: ordersResponse,
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
  } = useQuery<{ data: ProductionOrder[]; meta: { total: number; page: number; limit: number; totalPages: number } }>({
    queryKey: ["production", "orders", { search: debouncedSearch, status: statusFilter, teamId: teamFilter, partyId: partyFilter, page }],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter) params.status = statusFilter;
      if (teamFilter) params.productionTeamId = teamFilter;
      if (partyFilter) params.partyId = partyFilter;

      const res = await apiClient.get("/production/orders", { params });
      return res.data;
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const orders = ordersResponse?.data || [];
  const meta = ordersResponse?.meta;

  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("");
    setTeamFilter("");
    setPartyFilter("");
    setPage(1);
  };

  const getStatusBadgeVariant = (status: ProductionOrderStatus) => {
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

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Production & Floor Allocation"
        subtitle="Manage production work orders, team allocations, floor consumption records, and waste tracking."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* View Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "kanban"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Kanban className="h-3.5 w-3.5 text-primary" />
                <span>Production Board</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  viewMode === "table"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <List className="h-3.5 w-3.5 text-slate-500" />
                <span>Orders Table</span>
              </button>
            </div>

            {canManageTeams && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTeamsModalOpen(true)}
                className="gap-1.5 h-8 text-xs"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Teams</span>
              </Button>
            )}
            {canCreateWorkOrder && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setOrderToEdit(null);
                  setIsWorkOrderModalOpen(true);
                }}
                className="gap-1.5 h-8 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Work Order</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Production Overview KPI Cards */}
      <ProductionKpiCards summary={summaryData} isLoading={isLoadingSummary} />

      {/* Main Content: Kanban Board or Orders Table */}
      {viewMode === "kanban" ? (
        <ProductionKanbanBoard onShowToast={showToast} teams={teams} />
      ) : (
        <>
          {/* Filters Bar */}
          <ProductionFilters
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        status={statusFilter}
        onStatusChange={(s) => {
          setStatusFilter(s);
          setPage(1);
        }}
        teamId={teamFilter}
        onTeamChange={(t) => {
          setTeamFilter(t);
          setPage(1);
        }}
        partyId={partyFilter}
        onPartyChange={(p) => {
          setPartyFilter(p);
          setPage(1);
        }}
        teams={teams}
        parties={parties}
        onReset={handleResetFilters}
      />

      {/* Active Work Orders Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <CardTitle>Active Work Orders</CardTitle>
            <CardDescription>
              Work orders in progress across Spinning, Warping, Weaving, and Knitting teams
            </CardDescription>
          </div>
          {isFetchingOrders && !isLoadingOrders && (
            <div className="flex items-center gap-1.5 text-xs text-brand-600 font-medium self-start sm:self-auto">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Refreshing...</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoadingOrders ? (
            <div className="space-y-3 py-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              title="No active production orders"
              description="Create a production order to allocate issued yarn lots to specific floor teams."
              icon={Factory}
              actionLabel="+ Create Production Order"
              onAction={() => {
                setOrderToEdit(null);
                setIsWorkOrderModalOpen(true);
              }}
            />
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm">
              <table className="w-full min-w-[1050px] text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Work Order</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Team</th>
                    <th className="py-3 px-4">Party / PO</th>
                    <th className="py-3 px-4">Product / Purpose</th>
                    <th className="py-3 px-4 text-right">Target (KG)</th>
                    <th className="py-3 px-4 text-right">Allocated (KG)</th>
                    <th className="py-3 px-4 text-right">Consumed (KG)</th>
                    <th className="py-3 px-4 text-right font-bold text-brand-700">
                      Remaining Team Stock
                    </th>
                    <th className="py-3 px-4 text-right">Output & Yield</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrderDetailId(order.id)}
                      className="hover:bg-slate-50/90 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700">
                          <span>{order.orderNumber}</span>
                          <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans">
                        <Badge variant={getStatusBadgeVariant(order.status)} className="text-[10px] uppercase">
                          {order.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 font-sans font-medium text-slate-800">
                        {order.productionTeam ? (
                          <div>
                            <span className="block font-semibold">{order.productionTeam.name}</span>
                            <span className="text-[10px] text-slate-500">{order.productionTeam.department}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-700">
                        <div>
                          <span className="font-medium text-slate-900">{order.party?.name || "—"}</span>
                          {order.poNumber && (
                            <span className="block font-mono text-[10px] text-slate-500">PO: {order.poNumber}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-sans text-slate-700">
                        <div>
                          <span className="font-medium text-slate-900">{order.productName || "—"}</span>
                          {order.purpose && (
                            <span className="block text-[10px] text-slate-500">{order.purpose}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                        {order.targetQuantity.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-sky-700">
                        {order.totalAllocatedKg.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-amber-700">
                        {order.totalConsumedKg.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 bg-amber-50/40">
                        {order.remainingTeamBalanceKg.toFixed(2)}{" "}
                        <span className="text-[10px] text-slate-500 font-sans">KG</span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-emerald-800 font-semibold">
                        {order.totalOutputKg > 0 ? (
                          <div>
                            <span>{order.totalOutputKg.toFixed(2)} KG</span>
                            <span className="block text-[10px] text-emerald-600 font-bold font-sans">
                              ({order.yieldPercentage}%)
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-sans text-[11px]">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-sans" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedOrderDetailId(order.id)}
                            className="h-7 px-2 text-slate-600 hover:text-slate-900"
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!isViewer && canCreateWorkOrder && order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setQuickAllocateOrder(order)}
                              className="h-7 px-2 text-xs text-sky-700 border-sky-200 hover:bg-sky-50"
                            >
                              Allocate
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

          {/* Pagination Controls */}
          {meta && meta.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <div className="text-center sm:text-left">
                Showing page <span className="font-bold">{meta.page}</span> of{" "}
                <span className="font-bold">{meta.totalPages}</span> ({meta.total} total work orders)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-8 text-xs"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  className="h-8 text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )}

      {/* Production Teams Management Modal */}
      <ProductionTeamsModal
        isOpen={isTeamsModalOpen}
        onClose={() => setIsTeamsModalOpen(false)}
        onShowToast={showToast}
      />

      {/* Create / Edit Work Order Modal */}
      <WorkOrderModal
        isOpen={isWorkOrderModalOpen}
        onClose={() => {
          setIsWorkOrderModalOpen(false);
          setOrderToEdit(null);
        }}
        orderToEdit={orderToEdit}
        teams={teams}
        parties={parties}
        onShowToast={showToast}
      />

      {/* Work Order Deep Detail Modal */}
      <WorkOrderDetailModal
        isOpen={Boolean(selectedOrderDetailId)}
        onClose={() => setSelectedOrderDetailId(null)}
        orderId={selectedOrderDetailId}
        teams={teams}
        onShowToast={showToast}
      />

      {/* Quick Allocate Modal */}
      {quickAllocateOrder && (
        <AllocateYarnModal
          isOpen={Boolean(quickAllocateOrder)}
          onClose={() => setQuickAllocateOrder(null)}
          order={quickAllocateOrder}
          teams={teams}
          onShowToast={showToast}
        />
      )}
    </AppLayout>
  );
}
