import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, X, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import { ProductionOrderDetail } from "../../types/production";

interface RecordReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ProductionOrderDetail | null;
  selectedAllocationId?: string | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function RecordReturnModal({
  isOpen,
  onClose,
  order,
  selectedAllocationId,
  onShowToast,
}: RecordReturnModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [allocationId, setAllocationId] = useState("");
  const [returnedKg, setReturnedKg] = useState("");
  const [returnedBags, setReturnedBags] = useState("0");
  const [returnDate, setReturnDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [reason, setReason] = useState("Surplus unused yarn after batch completion");
  const [remarks, setRemarks] = useState("");

  const allocations = useMemo(() => order?.itemizedAllocations || [], [order?.itemizedAllocations]);

  React.useEffect(() => {
    if (selectedAllocationId) {
      setAllocationId(selectedAllocationId);
    } else if (allocations.length > 0 && !allocationId) {
      setAllocationId(allocations[0].id);
    }
  }, [selectedAllocationId, allocations, allocationId, isOpen]);

  const currentAllocation = allocations.find((a) => a.id === allocationId);
  const availableReturnBalance = currentAllocation?.balanceKg ?? 0;

  // Return Mutation
  const returnMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!order?.id) throw new Error("Order ID is required");
      const res = await apiClient.post(`/production/orders/${order.id}/returns`, payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["production", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "lots"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast(
        "success",
        `Unused yarn returned to Main Stock (Inventory Tx: ${data?.data?.inventoryTransaction?.transactionNumber || ""})`,
      );
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to return unused yarn");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAllocation) {
      onShowToast("error", "Please select an allocated yarn input");
      return;
    }

    const rKg = parseFloat(returnedKg);
    if (isNaN(rKg) || rKg <= 0) {
      onShowToast("error", "Returned KG must be greater than 0");
      return;
    }

    if (rKg > availableReturnBalance + 0.0001) {
      onShowToast(
        "error",
        `Return quantity (${rKg.toFixed(2)} KG) exceeds available unconsumed team balance (${availableReturnBalance.toFixed(2)} KG)`,
      );
      return;
    }

    returnMutation.mutate({
      yarnAllocationId: currentAllocation.id,
      returnedKg: rKg,
      returnedBags: parseInt(returnedBags, 10) || 0,
      returnDate: returnDate || undefined,
      reason: reason.trim() || undefined,
      remarks: remarks.trim() || undefined,
    });
  };

  if (!isOpen || !order || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <ArrowDownLeft className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Return Unused Yarn to Main Stock
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Transfer surplus unconsumed yarn from floor team back to main warehouse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Synchronized Inventory Info Banner */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Real-Time Main Stock Synchronization</span>
            </div>
            <p className="text-[11px] text-emerald-700">
              This action creates a verified <strong>RETURN</strong> transaction in the Inventory ledger, replenishes Main Warehouse stock, and releases team allocation hold.
            </p>
          </div>

          {/* Select Allocation Line */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Select Allocated Yarn Input <span className="text-red-500">*</span>
            </label>
            <select
              value={allocationId}
              onChange={(e) => setAllocationId(e.target.value)}
              className="w-full h-10 px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              required
            >
              {allocations.map((a) => (
                <option key={a.id} value={a.id}>
                  Lot: {a.lotNumber} | Count: {a.yarnCount} | Unconsumed Balance: {a.balanceKg.toFixed(2)} KG ({a.teamName})
                </option>
              ))}
            </select>
          </div>

          {/* Info Card */}
          {currentAllocation && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Source Issue Transaction:</span>
                <span className="font-bold text-slate-900">{currentAllocation.sourceTxNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Floor Team:</span>
                <span className="font-semibold text-slate-800">{currentAllocation.teamName}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-emerald-800">Max Returnable Balance:</span>
                <span className="font-bold text-emerald-800 text-sm">{availableReturnBalance.toFixed(2)} KG</span>
              </div>
            </div>
          )}

          {/* Quantities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Returning Weight (KG) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={availableReturnBalance}
                placeholder="e.g. 50.00"
                value={returnedKg}
                onChange={(e) => setReturnedKg(e.target.value)}
                className="text-xs font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Returning Bags Count
              </label>
              <Input
                type="number"
                min="0"
                value={returnedBags}
                onChange={(e) => setReturnedBags(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Return Effective Date
              </label>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Return
              </label>
              <Input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks / Gate Pass Reference
            </label>
            <Input
              type="text"
              placeholder="e.g. Returned to Bay 4 pallet via internal transfer"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={returnMutation.isPending || availableReturnBalance <= 0}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
            >
              {returnMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Confirm Stock Return</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
