"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, X, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import {
  OutputBatchComputed,
  CancelOutputBatchInput,
} from "../../types/product";

interface CancelBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: OutputBatchComputed | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function CancelBatchModal({
  isOpen,
  onClose,
  batch,
  onShowToast,
}: CancelBatchModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

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

  const cancelMutation = useMutation({
    mutationFn: async (payload: CancelOutputBatchInput) => {
      if (!batch) return;
      const res = await apiClient.post(`/products/${batch.id}/cancel`, payload);
      return res.data;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onShowToast(
        "success",
        res.message || "Output batch cancelled successfully"
      );
      setReason("");
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.message || "Failed to cancel output batch";
      onShowToast("error", msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batch) return;
    cancelMutation.mutate({ reason: reason.trim() || undefined });
  };

  if (!isOpen || !mounted || !batch) return null;

  const hasDeliveries = batch.deliveriesCount > 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/20">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Cancel Output Batch
              </h2>
              <p className="text-xs text-rose-700 font-mono">
                {batch.batchNumber}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="text-xs text-slate-600 leading-relaxed">
            <p>
              Are you sure you want to cancel output batch{" "}
              <strong className="text-slate-900">{batch.batchNumber}</strong> (
              {batch.outputQuantityKg} {batch.unit} of {batch.productName})?
            </p>
            <p className="mt-2 text-slate-500">
              This action will mark the batch as CANCELLED and remove its available quantity from the finished product inventory. Yarn consumption records will remain intact for audit traceability.
            </p>
          </div>

          {hasDeliveries && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <span className="font-semibold">Cannot Cancel: </span>
                <span>
                  This batch is linked to {batch.deliveriesCount} delivery record(s). Linked batches cannot be cancelled.
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason for Cancellation / Quarantine
            </label>
            <Input
              placeholder="e.g. Quality defect detected in weaving inspection"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs"
              disabled={hasDeliveries}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-100 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={cancelMutation.isPending}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={cancelMutation.isPending || hasDeliveries}
              className="gap-2 bg-rose-600 hover:bg-rose-700 text-white w-full sm:w-auto"
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Cancelling...</span>
                </>
              ) : (
                <>
                  <AlertOctagon className="h-4 w-4" />
                  <span>Confirm Cancellation</span>
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
