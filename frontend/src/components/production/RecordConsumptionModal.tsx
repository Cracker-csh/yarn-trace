import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flame, X, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import { ProductionOrderDetail } from "../../types/production";

interface RecordConsumptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ProductionOrderDetail | null;
  selectedAllocationId?: string | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function RecordConsumptionModal({
  isOpen,
  onClose,
  order,
  selectedAllocationId,
  onShowToast,
}: RecordConsumptionModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [allocationId, setAllocationId] = useState("");
  const [consumedKg, setConsumedKg] = useState("");
  const [wasteKg, setWasteKg] = useState("0");
  const [wasteCategory, setWasteCategory] = useState("HARD_WASTE");
  const [bags, setBags] = useState("0");
  const [purpose, setPurpose] = useState("WEAVING_FLOOR");
  const [consumptionDate, setConsumptionDate] = useState(
    new Date().toISOString().split("T")[0],
  );
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
  const availableBalance = currentAllocation?.balanceKg ?? 0;

  // Consumption Mutation
  const consumptionMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!order?.id) throw new Error("Order ID is required");
      const res = await apiClient.post(`/production/orders/${order.id}/consumption`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["production", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast(
        "success",
        `Actual yarn consumption recorded for Lot ${currentAllocation?.lotNumber || ""}`,
      );
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to record consumption");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAllocation) {
      onShowToast("error", "Please select an allocated yarn lot to consume from");
      return;
    }

    const cKg = parseFloat(consumedKg);
    const wKg = parseFloat(wasteKg) || 0;
    if (isNaN(cKg) || cKg <= 0) {
      onShowToast("error", "Consumed KG must be greater than 0");
      return;
    }

    const totalSession = cKg + wKg;
    if (totalSession > availableBalance + 0.0001) {
      onShowToast(
        "error",
        `Total consumption + waste (${totalSession.toFixed(2)} KG) exceeds available team balance (${availableBalance.toFixed(2)} KG)`,
      );
      return;
    }

    consumptionMutation.mutate({
      yarnAllocationId: currentAllocation.id,
      consumedKg: cKg,
      wasteKg: wKg > 0 ? wKg : undefined,
      wasteCategory: wKg > 0 ? wasteCategory : undefined,
      bags: parseInt(bags, 10) || 0,
      netProducedKg: Math.max(0, cKg - wKg),
      purpose: purpose.trim() || undefined,
      consumptionDate: consumptionDate || undefined,
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
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Flame className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Record Floor Consumption: {order.orderNumber}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-1">
                Log actual yarn utilized and waste generated by the production team
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 sm:space-y-4">
          {/* Select Allocation Line */}
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Select Allocated Yarn Input <span className="text-red-500">*</span>
            </label>
            <select
              value={allocationId}
              onChange={(e) => setAllocationId(e.target.value)}
              className="w-full h-10 px-3 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              required
            >
              {allocations.map((a) => (
                <option key={a.id} value={a.id}>
                  Lot: {a.lotNumber} | Count: {a.yarnCount} | Balance: {a.balanceKg.toFixed(2)} KG ({a.teamName})
                </option>
              ))}
            </select>
          </div>

          {/* Allocation Info Card */}
          {currentAllocation && (
            <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-600">Total Allocated:</span>
                <span className="font-bold text-slate-900">{currentAllocation.allocatedKg.toFixed(2)} KG</span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-600">Already Consumed / Returned:</span>
                <span className="font-semibold text-slate-700">
                  {(currentAllocation.consumedKg + currentAllocation.wasteKg + currentAllocation.returnedKg).toFixed(2)} KG
                </span>
              </div>
              <div className="flex items-center justify-between font-mono pt-1 border-t border-amber-200">
                <span className="font-bold text-amber-900">Current Available to Consume:</span>
                <span className="font-bold text-amber-900 text-sm">{availableBalance.toFixed(2)} KG</span>
              </div>
            </div>
          )}

          {/* Quantities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Actual Consumed (KG) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={availableBalance}
                placeholder="e.g. 100.00"
                value={consumedKg}
                onChange={(e) => setConsumedKg(e.target.value)}
                className="text-xs font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Waste / Loss Generated (KG)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 1.50"
                value={wasteKg}
                onChange={(e) => setWasteKg(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Waste Classification
              </label>
              <select
                value={wasteCategory}
                onChange={(e) => setWasteCategory(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value="HARD_WASTE">Hard Waste (Non-reusable)</option>
                <option value="FLY_WASTE">Fly / Fibre Waste</option>
                <option value="DEFECTIVE">Defective Section</option>
                <option value="FLOOR_SWEEPING">Floor Sweeping</option>
                <option value="SIZING_WASTE">Sizing / Beam Waste</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bags Emptied
              </label>
              <Input
                type="number"
                min="0"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Consumption Date
              </label>
              <Input
                type="date"
                value={consumptionDate}
                onChange={(e) => setConsumptionDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Floor Process / Purpose
              </label>
              <Input
                type="text"
                placeholder="e.g. Warp Sizing, Loom Weft"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks & Batch Observations
            </label>
            <Input
              type="text"
              placeholder="e.g. High speed loom run completed with 0 breakages"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={consumptionMutation.isPending || availableBalance <= 0}
              className="gap-1.5 w-full sm:w-auto"
            >
              {consumptionMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Record Consumption</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
