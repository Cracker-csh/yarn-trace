"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, X, Loader2, CheckCircle2, Calendar } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import {
  OutputBatchComputed,
  UpdateOutputBatchInput,
} from "../../types/product";

interface EditBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: OutputBatchComputed | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function EditBatchModal({
  isOpen,
  onClose,
  batch,
  onShowToast,
}: EditBatchModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productType, setProductType] = useState("FABRIC_ROLL");
  const [outputQuantityKg, setOutputQuantityKg] = useState("");
  const [unit, setUnit] = useState("KG");
  const [outputDate, setOutputDate] = useState("");
  const [status, setStatus] = useState("READY");
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  useEffect(() => {
    if (batch) {
      setProductName(batch.productName);
      setProductCode(batch.productCode);
      setProductType(batch.productType || "FABRIC_ROLL");
      setOutputQuantityKg(batch.outputQuantityKg.toString());
      setUnit(batch.unit || "KG");
      setOutputDate(
        batch.outputDate ? batch.outputDate.split("T")[0] : ""
      );
      setStatus(batch.status);
      setRemarks(batch.remarks || "");
    }
  }, [batch]);

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateOutputBatchInput) => {
      if (!batch) return;
      const res = await apiClient.patch(`/products/${batch.id}`, payload);
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });
      onShowToast(
        "success",
        res.message || "Output batch updated successfully"
      );
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.message || "Failed to update output batch";
      onShowToast("error", msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch) return;

    const newErrors: Record<string, string> = {};
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

    const payload: UpdateOutputBatchInput = {
      productName: productName.trim(),
      productCode: productCode.trim() ? productCode.trim().toUpperCase() : undefined,
      productType,
      outputQuantityKg: qty,
      unit: unit.trim().toUpperCase() || "KG",
      outputDate: outputDate || undefined,
      status,
      remarks: remarks.trim() || undefined,
    };

    updateMutation.mutate(payload);
  };

  if (!isOpen || !mounted || !batch) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Edit Output Batch: {batch.batchNumber}
              </h2>
              <p className="text-xs text-slate-500">
                Work Order: {batch.productionOrder.orderNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <Input
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
                Product Code
              </label>
              <Input
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                className="text-xs font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Product Type
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
                Batch Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="READY">READY</option>
                <option value="PRODUCED">PRODUCED</option>
                <option value="DELIVERED">DELIVERED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Output Quantity <span className="text-rose-500">*</span>
              </label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={outputQuantityKg}
                onChange={(e) => {
                  setOutputQuantityKg(e.target.value);
                  setErrors((prev) => ({ ...prev, outputQuantityKg: "" }));
                }}
                className={`text-xs font-semibold ${
                  errors.outputQuantityKg ? "border-rose-300 ring-1 ring-rose-300" : ""
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Unit
              </label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="text-xs uppercase"
              />
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Remarks
            </label>
            <Input
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-4 border-t border-slate-100 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={updateMutation.isPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={updateMutation.isPending}
              className="gap-2 w-full sm:w-auto"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Save Changes</span>
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
