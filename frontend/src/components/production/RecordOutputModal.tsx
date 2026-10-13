import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, X, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import { ProductionOrderDetail } from "../../types/production";

interface RecordOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ProductionOrderDetail | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function RecordOutputModal({
  isOpen,
  onClose,
  order,
  onShowToast,
}: RecordOutputModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [outputQuantityKg, setOutputQuantityKg] = useState("");
  const [unit, setUnit] = useState("KG");
  const [outputDate, setOutputDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [remarks, setRemarks] = useState("");

  React.useEffect(() => {
    if (order) {
      setProductName(order.productName || "Finished Grey Fabric");
      setProductCode(order.productType || "FABRIC-ROLL");
      setOutputQuantityKg("");
      setUnit(order.unit || "KG");
      setOutputDate(new Date().toISOString().split("T")[0]);
      setRemarks("");
    }
  }, [order, isOpen]);

  const totalConsumedKg = order?.totalConsumedKg ?? 0;
  const currentOutputKg = order?.totalOutputKg ?? 0;
  const newOutputNum = parseFloat(outputQuantityKg) || 0;
  const projectedTotalOutput = currentOutputKg + newOutputNum;
  const projectedYield =
    totalConsumedKg > 0
      ? Number(((projectedTotalOutput / totalConsumedKg) * 100).toFixed(2))
      : 0;

  // Output Mutation
  const outputMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!order?.id) throw new Error("Order ID is required");
      const res = await apiClient.post(`/production/orders/${order.id}/output`, payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast(
        "success",
        `Production output recorded (${data?.data?.output?.outputQuantityKg} KG | Yield: ${data?.data?.productionYield?.yieldPercentage}%)`,
      );
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to record production output");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productName.trim()) {
      onShowToast("error", "Product name is required");
      return;
    }

    const qty = parseFloat(outputQuantityKg);
    if (isNaN(qty) || qty <= 0) {
      onShowToast("error", "Output quantity must be greater than 0");
      return;
    }

    outputMutation.mutate({
      productName: productName.trim(),
      productCode: productCode.trim() || undefined,
      outputQuantityKg: qty,
      unit: unit.trim().toUpperCase(),
      outputDate: outputDate || undefined,
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
            <div className="h-9 w-9 shrink-0 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Record Finished Output: {order.orderNumber}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-1">
                Log completed fabric rolls/products and compute batch conversion yield
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Finished Product Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. 100% Cotton Grey Fabric Roll 40s"
                className="text-xs font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product SKU / Code
              </label>
              <Input
                type="text"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="e.g. PROD-FAB-401"
                className="text-xs font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Output Quantity (KG) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 580.00"
                value={outputQuantityKg}
                onChange={(e) => setOutputQuantityKg(e.target.value)}
                className="text-xs font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit of Measure
              </label>
              <Input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value.toUpperCase())}
                className="text-xs uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Output Completion Date
              </label>
              <Input
                type="date"
                value={outputDate}
                onChange={(e) => setOutputDate(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {/* Yield Calculation Preview Card */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-indigo-900 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Live Batch Conversion Yield
              </span>
              <span className="font-mono font-bold text-sm text-indigo-950">
                {projectedYield > 0 ? `${projectedYield}%` : "—"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 pt-1 border-t border-indigo-100">
              <div>
                Total Consumed: <span className="font-bold text-slate-800">{totalConsumedKg.toFixed(2)} KG</span>
              </div>
              <div className="text-right">
                Projected Output: <span className="font-bold text-slate-800">{projectedTotalOutput.toFixed(2)} KG</span>
              </div>
            </div>

            {projectedYield > 0 && (projectedYield < 85 || projectedYield > 105) && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200 mt-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Notice: High yield variance ({projectedYield}%). Flagged for review according to governance guidelines.</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks & Quality Inspection Notes
            </label>
            <Input
              type="text"
              placeholder="e.g. A-grade fabric inspection completed with 0 major defects"
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
              disabled={outputMutation.isPending || newOutputNum <= 0}
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
            >
              {outputMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Record Output</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
