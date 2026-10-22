"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Plus,
  Download,
  Search,
  RotateCw,
  Filter,
  FileText,
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  Undo2,
  Trash2,
  ShoppingBag,
  Wrench,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { apiClient } from "../../lib/axios";
import {
  TransactionRecord,
  TransactionType,
  Party,
  LotRecord,
  PORequirementOption,
} from "../../types/inventory";
import YarnSlipModal from "../../components/inventory/YarnSlipModal";
import OpeningStockModal from "../../components/inventory/OpeningStockModal";
import ReceiveStockModal from "../../components/inventory/ReceiveStockModal";
import IssueStockModal from "../../components/inventory/IssueStockModal";
import { usePermissions } from "../../hooks/usePermissions";

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const { canReceiveStock, canAddOpeningStock, isReadOnly } = usePermissions();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  // Modals state
  const [selectedSlipTx, setSelectedSlipTx] = useState<TransactionRecord | null>(null);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // 1. FETCH TRANSACTIONS FROM REAL BACKEND
  // ---------------------------------------------------------------------------
  const {
    data: txResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["inventory", "transactions", { search, typeFilter, page, limit }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      params.set("page", String(page));
      params.set("limit", String(limit));

      const res = await apiClient.get(`/inventory/transactions?${params.toString()}`);
      return res.data.data;
    },
    staleTime: 30_000,
  });

  const transactions: TransactionRecord[] = txResponse?.items || [];
  const pagination = txResponse?.pagination || { page: 1, totalPages: 1, total: 0 };

  // Fetch Auxiliary Data for Modals
  const { data: partiesData } = useQuery<Party[]>({
    queryKey: ["parties"],
    queryFn: async () => {
      const res = await apiClient.get("/parties");
      return res.data.data;
    },
  });

  const { data: lotsData } = useQuery<LotRecord[]>({
    queryKey: ["inventory", "lots"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/lots");
      return res.data.data;
    },
  });

  const { data: poReqData } = useQuery<PORequirementOption[]>({
    queryKey: ["inventory", "po-requirements"],
    queryFn: async () => {
      const res = await apiClient.get("/inventory/po-requirements");
      return res.data.data;
    },
  });

  const parties = partiesData || [];
  const lots = lotsData || [];
  const poRequirements = poReqData || [];

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    refetch();
  };

  const addOpeningMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/opening", values),
    onSuccess: () => {
      invalidateQueries();
      setIsOpeningModalOpen(false);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/received", values),
    onSuccess: () => {
      invalidateQueries();
      setIsReceiveModalOpen(false);
    },
  });

  const issueMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/inventory/issued", values),
    onSuccess: () => {
      invalidateQueries();
      setIsIssueModalOpen(false);
    },
  });

  // ---------------------------------------------------------------------------
  // 2. EXPORT EXCEL
  // ---------------------------------------------------------------------------
  const handleExport = async () => {
    try {
      const res = await apiClient.get("/inventory/export?format=xlsx", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `YarnTrace_Transactions_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert("Failed to export transactions ledger");
    }
  };

  // Helper for Type Badges
  const renderTypeBadge = (type: TransactionType) => {
    switch (type) {
      case "OPENING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">
            <Boxes className="h-3 w-3" />
            <span>OPENING</span>
          </span>
        );
      case "RECEIVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <ArrowDownLeft className="h-3 w-3" />
            <span>RECEIVED</span>
          </span>
        );
      case "ISSUED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800 border border-sky-200">
            <ArrowUpRight className="h-3 w-3" />
            <span>ISSUED</span>
          </span>
        );
      case "RETURN":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <Undo2 className="h-3 w-3" />
            <span>RETURN</span>
          </span>
        );
      case "RETIRED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <Trash2 className="h-3 w-3" />
            <span>RETIRED</span>
          </span>
        );
      case "SOLD":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <ShoppingBag className="h-3 w-3" />
            <span>SOLD</span>
          </span>
        );
      case "CORRECTION":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Wrench className="h-3 w-3" />
            <span>REVERSAL</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  return (
    <AppLayout>
      <PageHeader
        title="Stock Movement Transactions"
        subtitle="Complete ledger of all yarn movements: Received, Opening, Issued, Returned, Retired, Sold, and Corrections."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-9"
              title="Refresh ledger"
            >
              <RotateCw className={`h-3.5 w-3.5 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="gap-1.5 h-9"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Ledger</span>
            </Button>
            {isReadOnly && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                <span>Read-Only Mode</span>
              </div>
            )}
            {canReceiveStock && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsReceiveModalOpen(true)}
                className="gap-1.5 h-9"
              >
                <ArrowDownLeft className="h-3.5 w-3.5 text-brand-600" />
                <span>Receive Inward</span>
              </Button>
            )}
            {canAddOpeningStock && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsOpeningModalOpen(true)}
                className="gap-1.5 h-9"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Entry</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Error Alert */}
      {isError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>
              Failed to load transactions:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="h-8 text-xs bg-white text-red-700 hover:bg-red-50 border-red-300"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle>Movement Ledger</CardTitle>
              <CardDescription>
                Chronological log of all inward, outward, and adjustment material movements ({pagination.total} records)
              </CardDescription>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-64 min-w-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search tx, lot, count, party..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-9 text-xs w-full"
                />
              </div>

              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg p-1 bg-slate-50 text-xs">
                <Filter className="h-3.5 w-3.5 text-slate-400 ml-1" />
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(1);
                  }}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none pr-1 cursor-pointer"
                >
                  <option value="ALL">All Movement Types</option>
                  <option value="OPENING">Opening Stock</option>
                  <option value="RECEIVED">Received (Inward)</option>
                  <option value="ISSUED">Issued to Floor</option>
                  <option value="RETURN">Returned</option>
                  <option value="RETIRED">Retired / Written Off</option>
                  <option value="SOLD">Commercial Sale</option>
                  <option value="CORRECTION">Correction / Reversal</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 border-b border-slate-100">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              title="No transactions matching filter"
              description="Try adjusting your search criteria or register a new material transaction."
              icon={ArrowLeftRight}
              actionLabel={canAddOpeningStock ? "+ Record Transaction" : undefined}
              onAction={canAddOpeningStock ? () => setIsOpeningModalOpen(true) : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[950px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Tx Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Yarn Count</TableHead>
                    <TableHead>Lot Number</TableHead>
                    <TableHead>Commercial Partner</TableHead>
                    <TableHead className="text-right">Bags</TableHead>
                    <TableHead className="text-right">Weight (KG)</TableHead>
                    <TableHead>PO / Purpose</TableHead>
                    <TableHead>Logged By</TableHead>
                    <TableHead className="text-right">Slip</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {new Date(tx.transactionDate).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-slate-900 text-xs">
                        {tx.transactionNumber}
                      </TableCell>
                      <TableCell>{renderTypeBadge(tx.type)}</TableCell>
                      <TableCell className="font-semibold text-slate-800">
                        {tx.count || "—"}
                      </TableCell>
                      <TableCell className="font-mono font-medium text-brand-700">
                        {tx.lotNumber || "—"}
                      </TableCell>
                      <TableCell className="text-slate-700 max-w-[160px] truncate">
                        {tx.party?.name || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium text-slate-900">
                        {tx.bags.toLocaleString("en-IN")}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">
                        {Number(tx.kilos).toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">KG</span>
                      </TableCell>
                      <TableCell className="text-slate-600 text-xs">
                        {tx.poNumber ? (
                          <span className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            {tx.poNumber}
                          </span>
                        ) : tx.purpose ? (
                          <Badge variant="outline" className="text-[10px]">
                            {tx.purpose}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {tx.createdBy || "System"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSlipTx(tx)}
                          className="h-7 w-7 p-0 text-slate-500 hover:text-brand-600"
                          title="View Yarn Issue / Receipt Slip"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Bar */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 text-xs text-slate-600">
                  <div>
                    Showing page <span className="font-bold">{pagination.page}</span> of{" "}
                    <span className="font-bold">{pagination.totalPages}</span> ({pagination.total} total records)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pagination.page <= 1}
                      className="h-8 gap-1"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      <span>Previous</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page >= pagination.totalPages}
                      className="h-8 gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slip Modal */}
      {selectedSlipTx && (
        <YarnSlipModal
          isOpen={!!selectedSlipTx}
          onClose={() => setSelectedSlipTx(null)}
          transaction={selectedSlipTx}
        />
      )}

      {/* Inward / Opening / Issue Modals */}
      <OpeningStockModal
        isOpen={isOpeningModalOpen}
        onClose={() => setIsOpeningModalOpen(false)}
        onSubmit={async (values) => {
          await addOpeningMutation.mutateAsync(values);
        }}
        parties={parties}
        isLoading={addOpeningMutation.isPending}
      />

      <ReceiveStockModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        onSubmit={async (values) => {
          await receiveMutation.mutateAsync(values);
        }}
        parties={parties}
        isLoading={receiveMutation.isPending}
      />

      <IssueStockModal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        onSubmit={async (values) => {
          await issueMutation.mutateAsync(values);
        }}
        parties={parties}
        lots={lots}
        poRequirements={poRequirements}
        isLoading={issueMutation.isPending}
      />
    </AppLayout>
  );
}
