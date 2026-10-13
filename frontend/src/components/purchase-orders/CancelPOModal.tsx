"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { PurchaseOrder } from "../../types/purchase-order";

interface CancelPOModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  po: PurchaseOrder | null;
  isLoading: boolean;
}

export default function CancelPOModal({
  isOpen,
  onClose,
  onConfirm,
  po,
  isLoading,
}: CancelPOModalProps) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  if (!isOpen || !mounted || !po) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onConfirm(reason.trim() || "Cancelled by authorized user");
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel purchase order."
      );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-red-50/50 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">
                Cancel Purchase Order
              </h2>
              <p className="text-xs text-slate-500 font-mono font-semibold">
                {po.poNumber} • {po.party.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <XCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-xs text-slate-600 leading-relaxed">
            Are you sure you want to cancel Purchase Order{" "}
            <span className="font-mono font-bold text-slate-900">
              {po.poNumber}
            </span>
            ? All unfulfilled requirements will be marked as Cancelled.
            Historical records and issued yarn balances will be preserved for
            audit integrity.
          </p>

          <div>
            <Label htmlFor="cancelReason" className="text-xs">
              Reason for Cancellation
            </Label>
            <textarea
              id="cancelReason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer cancelled order or changed delivery terms"
              className="mt-1 block w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600 shadow-sm"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              Back
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              isLoading={isLoading}
              className="gap-1.5 w-full sm:w-auto"
            >
              <XCircle className="h-4 w-4" />
              <span>Confirm Cancellation</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
