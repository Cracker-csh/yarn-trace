import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, X, Loader2, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { apiClient } from "../../lib/axios";
import { ProductionOrder, ProductionTeam, EligibleIssue } from "../../types/production";

interface AllocateYarnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ProductionOrder | null;
  teams: ProductionTeam[];
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function AllocateYarnModal({
  isOpen,
  onClose,
  order,
  teams,
  onShowToast,
}: AllocateYarnModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [searchIssue, setSearchIssue] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<EligibleIssue | null>(null);
  const [allocatedKg, setAllocatedKg] = useState("");
  const [bags, setBags] = useState("1");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [remarks, setRemarks] = useState("");

  // Fetch eligible issued transactions from backend
  const { data: eligibleIssues = [], isLoading: isLoadingIssues } = useQuery<EligibleIssue[]>({
    queryKey: ["production", "eligible-issues"],
    queryFn: async () => {
      const res = await apiClient.get("/production/eligible-issues");
      return res.data.data;
    },
    enabled: isOpen,
  });

  // Default target team to order's team
  React.useEffect(() => {
    if (order?.productionTeam?.id) {
      setTargetTeamId(order.productionTeam.id);
    } else if (teams.length > 0 && !targetTeamId) {
      setTargetTeamId(teams[0].id);
    }
  }, [order, teams, targetTeamId]);

  // Allocation Mutation
  const allocateMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!order?.id) throw new Error("Order ID is required");
      const res = await apiClient.post(`/production/orders/${order.id}/allocations`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["production", "eligible-issues"] });
      queryClient.invalidateQueries({ queryKey: ["production", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast("success", `Yarn allocated to Work Order ${order?.orderNumber} successfully`);
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to allocate yarn");
    },
  });

  const handleSelectIssue = (issue: EligibleIssue) => {
    setSelectedIssue(issue);
    setAllocatedKg(issue.unallocatedKg.toString());
    setBags(issue.issuedBags ? Math.max(1, issue.issuedBags).toString() : "1");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue) {
      onShowToast("error", "Please select an issued yarn lot to allocate");
      return;
    }

    const qty = parseFloat(allocatedKg);
    if (isNaN(qty) || qty <= 0) {
      onShowToast("error", "Allocated KG must be greater than 0");
      return;
    }

    if (qty > selectedIssue.unallocatedKg + 0.0001) {
      onShowToast(
        "error",
        `Allocation cannot exceed available unallocated balance (${selectedIssue.unallocatedKg.toFixed(2)} KG)`,
      );
      return;
    }

    if (!targetTeamId) {
      onShowToast("error", "Please select a target production team");
      return;
    }

    allocateMutation.mutate({
      inventoryTransactionId: selectedIssue.id,
      productionTeamId: targetTeamId,
      allocatedKg: qty,
      bags: parseInt(bags, 10) || 0,
      remarks: remarks.trim() || undefined,
    });
  };

  if (!isOpen || !order || !mounted) return null;

  const filteredIssues = eligibleIssues.filter(
    (i) =>
      i.lotNumber.toLowerCase().includes(searchIssue.toLowerCase()) ||
      i.yarnCount.toLowerCase().includes(searchIssue.toLowerCase()) ||
      i.partyName.toLowerCase().includes(searchIssue.toLowerCase()) ||
      (i.poNumber && i.poNumber.toLowerCase().includes(searchIssue.toLowerCase())) ||
      i.transactionNumber.toLowerCase().includes(searchIssue.toLowerCase()),
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Allocate Issued Yarn: {order.orderNumber}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-1">
                Assign yarn from verified Main Stock Issue transactions to this work order
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Work Order Target Info Banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 font-medium">Target Work Order:</span>{" "}
              <span className="font-bold text-slate-900">{order.orderNumber}</span>
              {order.productName && (
                <span className="text-slate-600 ml-2">({order.productName})</span>
              )}
            </div>
            <div className="font-mono text-slate-700">
              Target: <span className="font-bold">{order.targetQuantity.toFixed(2)} KG</span>
            </div>
          </div>

          {/* 1. Select Issued Yarn Transaction */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                1. Select Eligible Issued Lot <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                {eligibleIssues.length} available {eligibleIssues.length === 1 ? "issue" : "issues"}
              </span>
            </div>

            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                type="text"
                placeholder="Filter by lot, count, party, PO..."
                value={searchIssue}
                onChange={(e) => setSearchIssue(e.target.value)}
                className="pl-8 text-xs h-8 bg-slate-50"
              />
            </div>

            {/* Issues List Container */}
            <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
              {isLoadingIssues ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1 text-brand-600" />
                  Loading eligible issues...
                </div>
              ) : filteredIssues.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">
                  No unallocated issued yarn found in inventory. Record an &quot;Issue&quot; in Inventory first.
                </div>
              ) : (
                filteredIssues.map((issue) => {
                  const isSelected = selectedIssue?.id === issue.id;
                  return (
                    <div
                      key={issue.id}
                      onClick={() => handleSelectIssue(issue)}
                      className={`p-3 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected ? "bg-sky-50/80 border-l-4 border-sky-600" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono">{issue.lotNumber}</span>
                          <span className="font-semibold text-slate-700">{issue.yarnCount}</span>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {issue.purpose}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {issue.partyName} {issue.poNumber ? `| PO: ${issue.poNumber}` : ""} |{" "}
                          <span className="font-mono text-[10px]">{issue.transactionNumber}</span>
                        </p>
                      </div>

                      <div className="text-right font-mono">
                        <div className="font-bold text-sky-700 text-sm">
                          {issue.unallocatedKg.toFixed(2)}{" "}
                          <span className="text-[10px] text-slate-500 font-sans">KG unallocated</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          (Total issued: {issue.totalIssuedKg.toFixed(2)} KG)
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 2. Allocation Parameters */}
          {selectedIssue && (
            <div className="p-4 bg-sky-50/40 border border-sky-200 rounded-xl space-y-4 animate-in fade-in duration-150">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                2. Set Allocation Quantities & Floor Team
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Allocated Weight (KG) <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={selectedIssue.unallocatedKg}
                    value={allocatedKg}
                    onChange={(e) => setAllocatedKg(e.target.value)}
                    className="text-xs font-mono font-bold bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Max eligible: {selectedIssue.unallocatedKg.toFixed(2)} KG
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Allocated Bags
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={bags}
                    onChange={(e) => setBags(e.target.value)}
                    className="text-xs font-mono bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Floor Team <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={targetTeamId}
                    onChange={(e) => setTargetTeamId(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                    required
                  >
                    {teams
                      .filter((t) => t.isActive)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.department})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Allocation Remarks / Staging Notes
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Assigned to Loom 14 for Weft winding"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!selectedIssue || allocateMutation.isPending}
              className="gap-1.5 w-full sm:w-auto"
            >
              {allocateMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Confirm Yarn Allocation</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
