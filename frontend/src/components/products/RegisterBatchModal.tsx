"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  X,
  Loader2,
  AlertTriangle,
  Info,
  Calendar,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import {
  EligibleProductionOrder,
  RegisterOutputBatchInput,
} from "../../types/product";

interface RegisterBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (type: "success" | "error", message: string) => void;
  preselectedOrderId?: string;
}

export default function RegisterBatchModal({
  isOpen,
  onClose,
  onShowToast,
  preselectedOrderId,
}: RegisterBatchModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Form State
  const [productionOrderId, setProductionOrderId] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productType, setProductType] = useState("FABRIC_ROLL");
  const [outputQuantityKg, setOutputQuantityKg] = useState("");
  const [unit, setUnit] = useState("KG");
  const [outputDate, setOutputDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [status, setStatus] = useState("READY");
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch eligible production orders
  const { data: eligibleOrders = [], isLoading: loadingOrders } = useQuery<
    EligibleProductionOrder[]
  >({
    queryKey: ["products", "eligible-orders"],
    queryFn: async () => {
      const res = await apiClient.get("/products/eligible-orders");
      return res.data.data;
    },
    enabled: isOpen,
  });

  // Selected Order
  const selectedOrder = eligibleOrders.find((o) => o.id === productionOrderId);

  // Sync selected order attributes
  useEffect(() => {
    if (preselectedOrderId && eligibleOrders.length > 0) {
      setProductionOrderId(preselectedOrderId);
    }
  }, [preselectedOrderId, eligibleOrders]);

  useEffect(() => {
    if (selectedOrder) {
      if (!productName || productName === "Finished Goods") {
        setProductName(selectedOrder.productName || "Finished Fabric Roll");
      }
      if (selectedOrder.productType) {
        setProductType(selectedOrder.productType);
      }
      if (!outputQuantityKg && selectedOrder.remainingPlannedKg > 0) {
        setOutputQuantityKg(selectedOrder.remainingPlannedKg.toString());
      }
      setUnit(selectedOrder.unit || "KG");
    }
  }, [selectedOrder]);

  // Reset Form on Close
  const handleClose = () => {
    setProductionOrderId("");
    setBatchNumber("");
    setProductName("");
    setProductCode("");
    setProductType("FABRIC_ROLL");
    setOutputQuantityKg("");
    setUnit("KG");
    setOutputDate(new Date().toISOString().split("T")[0]);
    setStatus("READY");
    setRemarks("");
    setErrors({});
    onClose();
  };

  // Yield Calculation Preview
  const qtyNumber = parseFloat(outputQuantityKg) || 0;
  const consumedKg = selectedOrder ? selectedOrder.consumedKg : 0;
  const yieldPct =
    consumedKg > 0 ? ((qtyNumber / consumedKg) * 100).toFixed(1) : null;
  const isYieldSuspicious =
    yieldPct !== null && (parseFloat(yieldPct) > 105 || parseFloat(yieldPct) < 70);

  // Mutation
  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterOutputBatchInput) => {
      const res = await apiClient.post("/products/output-batch", payload);
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onShowToast(
        "success",
        res.message || "Finished output batch registered successfully"
      );
      handleClose();
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.message ||
        "Failed to register finished output batch";
      onShowToast("error", msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!productionOrderId) {
      newErrors.productionOrderId = "Please select a production order";
    }
    if (!productName.trim()) {
      newErrors.productName = "Product name is required";
    }
    const qty = parseFloat(outputQuantityKg);
    if (isNaN(qty) || qty <= 0) {
      newErrors.outputQuantityKg = "Quantity must be greater than 0";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload: RegisterOutputBatchInput = {
      productionOrderId,
      productName: productName.trim(),
      productCode: productCode.trim() ? productCode.trim().toUpperCase() : undefined,
      productType,
      batchNumber: batchNumber.trim() ? batchNumber.trim().toUpperCase() : undefined,
      outputQuantityKg: qty,
      unit: unit.trim().toUpperCase() || "KG",
      outputDate,
      status,
      remarks: remarks.trim() || undefined,
    };

    registerMutation.mutate(payload);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={handleClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-2xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20 shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-800">
                Register Output Batch
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Record finished fabric rolls or yarn products from completed production orders
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* 1. Production Order Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Production Work Order <span className="text-rose-500">*</span>
            </label>
            {loadingOrders ? (
              <div className="flex items-center gap-2 p-3 text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                <span>Loading active production orders...</span>
              </div>
            ) : eligibleOrders.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold">No active production orders found</p>
                  <p className="mt-0.5 text-amber-700">
                    Production output must come from an active work order. Please create a work order first on the Production page.
                  </p>
                </div>
              </div>
            ) : (
              <select
                value={productionOrderId}
                onChange={(e) => {
                  setProductionOrderId(e.target.value);
                  setErrors((prev) => ({ ...prev, productionOrderId: "" }));
                }}
                className={`w-full rounded-xl border ${
                  errors.productionOrderId
                    ? "border-rose-300 ring-1 ring-rose-300"
                    : "border-slate-300"
                } bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20`}
              >
                <option value="">-- Select Production Order --</option>
                {eligibleOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — {o.productName || "Finished Goods"} ({o.partyName}) | Rem: {o.remainingPlannedKg} {o.unit}
                  </option>
                ))}
              </select>
            )}
            {errors.productionOrderId && (
              <p className="mt-1 text-xs text-rose-500 font-medium">
                {errors.productionOrderId}
              </p>
            )}
          </div>

          {/* Selected Order Context Card */}
          {selectedOrder && (
            <div className="rounded-xl bg-brand-50/60 border border-brand-200/70 p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Work Order</span>
                <span className="font-bold text-slate-800">
                  {selectedOrder.orderNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Customer / Party</span>
                <span className="font-semibold text-slate-800 truncate block">
                  {selectedOrder.partyName}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Production Team</span>
                <span className="font-semibold text-slate-800">
                  {selectedOrder.teamName}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Consumed Yarn</span>
                <span className="font-bold text-brand-700">
                  {selectedOrder.consumedKg.toFixed(1)} {selectedOrder.unit}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Planned Target</span>
                <span className="font-semibold text-slate-700">
                  {selectedOrder.targetQuantity.toFixed(1)} {selectedOrder.unit}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Existing Output</span>
                <span className="font-semibold text-slate-700">
                  {selectedOrder.existingOutputKg.toFixed(1)} {selectedOrder.unit}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[11px]">Remaining Planned</span>
                <span className="font-bold text-emerald-700">
                  {selectedOrder.remainingPlannedKg.toFixed(1)} {selectedOrder.unit}
                </span>
              </div>
            </div>
          )}

          {/* 2. Product Name & Product Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product Name / Specification <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g. 100% Combed Cotton Bath Towel Fabric"
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value);
                  setErrors((prev) => ({ ...prev, productName: "" }));
                }}
                className={`text-xs ${
                  errors.productName ? "border-rose-300 ring-1 ring-rose-300" : ""
                }`}
              />
              {errors.productName && (
                <p className="mt-1 text-xs text-rose-500 font-medium">
                  {errors.productName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product Code <span className="text-slate-400 font-normal">(Auto-generated if blank)</span>
              </label>
              <Input
                placeholder="e.g. PROD-FAB-001"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                className="text-xs uppercase font-mono"
              />
            </div>
          </div>

          {/* 3. Product Type & Output Batch Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product Type / Category
              </label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="FABRIC_ROLL">Finished Fabric Roll</option>
                <option value="FINISHED_YARN">Processed / Twisted Yarn</option>
                <option value="MANUFACTURED_BATCH">Manufactured Batch</option>
                <option value="GARMENT">Finished Garment</option>
                <option value="OTHER">Other Finished Good</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Output Batch Number <span className="text-slate-400 font-normal">(e.g. OUT-2026-0001)</span>
              </label>
              <Input
                placeholder="Auto-assigned (e.g. OUT-2026-0001)"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                className="text-xs uppercase font-mono"
              />
            </div>
          </div>

          {/* 4. Output Quantity, Unit & Production Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Output Quantity <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                placeholder="0.00"
                value={outputQuantityKg}
                onChange={(e) => {
                  setOutputQuantityKg(e.target.value);
                  setErrors((prev) => ({ ...prev, outputQuantityKg: "" }));
                }}
                className={`text-xs font-semibold ${
                  errors.outputQuantityKg ? "border-rose-300 ring-1 ring-rose-300" : ""
                }`}
              />
              {errors.outputQuantityKg && (
                <p className="mt-1 text-xs text-rose-500 font-medium">
                  {errors.outputQuantityKg}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Unit of Measurement
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="KG">KG (Kilograms)</option>
                <option value="METERS">Meters</option>
                <option value="ROLLS">Rolls</option>
                <option value="PIECES">Pieces</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Production Date
              </label>
              <div className="relative">
                <Input
                  type="date"
                  value={outputDate}
                  onChange={(e) => setOutputDate(e.target.value)}
                  className="text-xs pr-8"
                />
                <Calendar className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* 5. Live Yield Calculation Preview */}
          {yieldPct !== null && (
            <div
              className={`rounded-xl p-3.5 border flex items-center justify-between text-xs ${
                isYieldSuspicious
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : "bg-emerald-50 border-emerald-200 text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp
                  className={`h-4 w-4 ${
                    isYieldSuspicious ? "text-amber-600" : "text-emerald-600"
                  }`}
                />
                <div>
                  <span className="font-semibold">Calculated Production Yield: </span>
                  <span className="font-bold text-sm ml-1">
                    {yieldPct}%
                  </span>
                  <span className="text-slate-500 text-[11px] ml-2">
                    ({qtyNumber.toFixed(1)} {unit} Output / {consumedKg.toFixed(1)} {unit} Consumed)
                  </span>
                </div>
              </div>
              {isYieldSuspicious && (
                <span className="text-[11px] font-medium bg-amber-200/70 text-amber-800 px-2 py-0.5 rounded-md">
                  Yield Variance Flagged
                </span>
              )}
            </div>
          )}

          {/* 6. Initial Status & Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Initial Batch Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="READY">READY (Passed QA inspection & available)</option>
                <option value="PRODUCED">PRODUCED (Manufactured, awaiting QA)</option>
                <option value="DELIVERED">DELIVERED (Dispatched immediately)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Remarks / Inspection Notes
              </label>
              <Input
                placeholder="e.g. Inspected Grade A fabric roll output"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClose}
              disabled={registerMutation.isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={registerMutation.isPending || eligibleOrders.length === 0}
              className="gap-2 w-full sm:w-auto"
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Registering Batch...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Register Output Batch</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
