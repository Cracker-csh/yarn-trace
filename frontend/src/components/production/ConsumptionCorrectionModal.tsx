import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, RotateCcw } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import { ConsumptionRecord } from "../../types/production";

interface ConsumptionCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ConsumptionRecord | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function ConsumptionCorrectionModal({
  isOpen,
  onClose,
  record,
  onShowToast,
}: ConsumptionCorrectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const [newConsumedKg, setNewConsumedKg] = useState("");
  const [newWasteKg, setNewWasteKg] = useState("0");
  const [newBags, setNewBags] = useState("0");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");

  React.useEffect(() => {
    if (record) {
      setNewConsumedKg(record.consumedKg.toString());
      setNewWasteKg(record.wasteKg.toString());
      setNewBags(record.bags.toString());
      setReason("");
      setRemarks("");
    }
  }, [record, isOpen]);

  // Correction Mutation
  const correctMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!record?.id) throw new Error("Record ID is required");
      const res = await apiClient.post(`/production/consumption/${record.id}/correct`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "orders", record?.productionOrderId] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast("success", "Consumption record corrected successfully with full audit trail");
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to correct consumption record");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      onShowToast("error", "Mandatory correction reason is required");
      return;
    }

    const cKg = parseFloat(newConsumedKg);
    const wKg = parseFloat(newWasteKg) || 0;
    if (isNaN(cKg) || cKg < 0) {
      onShowToast("error", "New consumed KG must be a valid non-negative number");
      return;
    }

    correctMutation.mutate({
      newConsumedKg: cKg,
      newWasteKg: wKg,
      newBags: parseInt(newBags, 10) || 0,
      reason: reason.trim(),
      remarks: remarks.trim() || undefined,
    });
  };

  if (!isOpen || !record || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 shrink-0 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                Correct Floor Consumption Record
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 line-clamp-1">
                Adjust recorded weights while preserving historical audit integrity
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
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          {/* Previous Snapshot */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 font-mono">
            <div className="flex items-center justify-between text-slate-600">
              <span>Original Consumed:</span>
              <span className="font-bold text-slate-900">{record.consumedKg.toFixed(2)} KG</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Original Waste:</span>
              <span className="font-semibold text-slate-700">{record.wasteKg.toFixed(2)} KG</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Recorded Date:</span>
              <span>{new Date(record.consumptionDate).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Corrected Consumed (KG) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newConsumedKg}
                onChange={(e) => setNewConsumedKg(e.target.value)}
                className="text-xs font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Corrected Waste (KG)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={newWasteKg}
                onChange={(e) => setNewWasteKg(e.target.value)}
                className="text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bags Count
              </label>
              <Input
                type="number"
                min="0"
                value={newBags}
                onChange={(e) => setNewBags(e.target.value)}
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mandatory Correction Reason <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. Floor weighing scale calibration adjustment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Additional Remarks / Authorizer Notes
            </label>
            <Input
              type="text"
              placeholder="e.g. Approved by Production Head Rajesh"
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
              disabled={correctMutation.isPending}
              className="gap-1.5 bg-rose-600 hover:bg-rose-700 w-full sm:w-auto"
            >
              {correctMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Confirm Correction</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
