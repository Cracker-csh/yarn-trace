"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  ShoppingCart,
  Layers,
  AlertCircle,
  Sparkles,
  Calendar,
  Building2,
  FileText,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Party } from "../../types/inventory";
import {
  CreatePOInput,
  CreatePORequirementInput,
  PurchaseOrder,
} from "../../types/purchase-order";

interface CreatePOModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: CreatePOInput) => Promise<void>;
  parties: Party[];
  isLoading: boolean;
  initialData?: PurchaseOrder | null;
}

const COMMON_COUNTS = [
  "1/10 KW",
  "2/20 OE",
  "1/12 KW",
  "2/10 KW",
  "30s Combed",
  "40s Compact",
  "2/40s Combed",
  "20s Carded",
  "34s PC",
  "30s Modal",
];

const PURPOSES = ["KNITTING", "WEAVING", "WARPING", "PILE", "GROUND", "WEFT", "DYED", "NPD", "GENERAL"];

const EMPTY_LINE: CreatePORequirementInput = {
  yarnCount: "",
  quality: "",
  size: "",
  useFor: "",
  purpose: "PILE",
  pcs: undefined,
  qty: undefined,
  requiredKg: 0,
  notes: "",
};

export default function CreatePOModal({
  isOpen,
  onClose,
  onSubmit,
  parties,
  isLoading,
  initialData,
}: CreatePOModalProps) {
  const isEditing = !!initialData;
  const [mounted, setMounted] = useState(false);

  const [poNumber, setPoNumber] = useState("");
  const [partyId, setPartyId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [deliveryDue, setDeliveryDue] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [requirements, setRequirements] = useState<CreatePORequirementInput[]>([
    { ...EMPTY_LINE },
  ]);
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

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setPoNumber(initialData.poNumber);
        setPartyId(initialData.partyId);
        setOrderDate(
          initialData.orderDate
            ? new Date(initialData.orderDate).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0]
        );
        setDeliveryDue(
          initialData.deliveryDue
            ? new Date(initialData.deliveryDue).toISOString().split("T")[0]
            : ""
        );
        setTotalAmount(
          initialData.totalAmount ? initialData.totalAmount.toString() : ""
        );
        setRemarks(initialData.remarks || "");
        setStatus(initialData.status);
        if (initialData.requirements && initialData.requirements.length > 0) {
          setRequirements(
            initialData.requirements.map((r) => ({
              id: r.id,
              yarnCount: r.yarnCount,
              quality: r.quality || "",
              size: r.size || "",
              useFor: r.useFor || "",
              purpose: r.purpose || "PILE",
              pcs: r.pcs != null ? Number(r.pcs) : undefined,
              qty: r.qty != null ? Number(r.qty) : undefined,
              requiredKg: r.requiredKg,
              notes: r.notes || "",
            }))
          );
        } else {
          setRequirements([{ ...EMPTY_LINE }]);
        }
      } else {
        setPoNumber("");
        setPartyId("");
        setOrderDate(new Date().toISOString().split("T")[0]);
        setDeliveryDue("");
        setTotalAmount("");
        setRemarks("");
        setStatus("ACTIVE");
        setRequirements([{ ...EMPTY_LINE }]);
      }
      setError(null);
    }
  }, [isOpen, initialData]);

  // Requirement line helpers
  const handleAddLine = () => {
    setRequirements((prev) => [...prev, { ...EMPTY_LINE }]);
  };

  const handleRemoveLine = (index: number) => {
    if (requirements.length === 1) {
      setRequirements([{ ...EMPTY_LINE }]);
      return;
    }
    setRequirements((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (
    index: number,
    field: keyof CreatePORequirementInput,
    value: string | number | undefined
  ) => {
    setRequirements((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const totalRequiredSum = requirements.reduce(
    (sum, r) => sum + (Number(r.requiredKg) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!poNumber.trim()) {
      setError("Purchase Order Number is required.");
      return;
    }

    if (!partyId) {
      setError("Please select a Party / Customer from the Party Master.");
      return;
    }

    if (requirements.length === 0) {
      setError("Please add at least one yarn requirement line.");
      return;
    }

    for (let i = 0; i < requirements.length; i++) {
      const line = requirements[i];
      if (!line.yarnCount.trim()) {
        setError(`Line #${i + 1}: Yarn count is required.`);
        return;
      }
      if (!line.purpose.trim()) {
        setError(`Line #${i + 1}: Purpose is required.`);
        return;
      }
      if (!line.requiredKg || Number(line.requiredKg) <= 0) {
        setError(`Line #${i + 1}: Required KG must be greater than 0.`);
        return;
      }
    }

    try {
      await onSubmit({
        poNumber: poNumber.trim().toUpperCase(),
        partyId,
        orderDate: orderDate || undefined,
        deliveryDue: deliveryDue || undefined,
        totalAmount: totalAmount ? Number(totalAmount) : undefined,
        remarks: remarks.trim() || undefined,
        status,
        requirements: requirements.map((r) => ({
          id: r.id,
          yarnCount: r.yarnCount.trim(),
          quality: r.quality?.trim() || undefined,
          size: r.size?.trim() || undefined,
          useFor: r.useFor?.trim() || undefined,
          purpose: r.purpose.trim().toUpperCase(),
          pcs: r.pcs ? Number(r.pcs) : undefined,
          qty: r.qty ? Number(r.qty) : undefined,
          requiredKg: Number(r.requiredKg),
          notes: r.notes?.trim() || undefined,
        })),
      });
      onClose();
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const resp = (err as { response?: { data?: { message?: string } } }).response;
        if (resp?.data?.message) {
          setError(resp.data.message);
          return;
        }
      }
      setError(
        err instanceof Error ? err.message : "Failed to save Purchase Order."
      );
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-500/20">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                {isEditing ? "Edit Purchase Order" : "Register Purchase Order"}
              </h2>
              <p className="text-xs text-slate-500">
                Customer yarn requirement specifications & delivery schedules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 animate-in fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: PO Header Info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Building2 className="h-3.5 w-3.5 text-brand-600" />
              <span>Order Header Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* PO Number */}
              <div>
                <Label htmlFor="poNumber" required className="text-xs">
                  PO Number
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="poNumber"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value.toUpperCase())}
                    placeholder="PO-2026-8801"
                    disabled={isEditing}
                    className="font-mono font-bold uppercase text-xs"
                    required
                  />
                </div>
              </div>

              {/* Party Selector */}
              <div>
                <Label htmlFor="partyId" required className="text-xs">
                  Party / Customer
                </Label>
                <select
                  id="partyId"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                  required
                >
                  <option value="">Select Party from Master...</option>
                  {parties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Order Date */}
              <div>
                <Label htmlFor="orderDate" required className="text-xs">
                  Order Date
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="orderDate"
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>
              </div>

              {/* Shipment Due Date */}
              <div>
                <Label htmlFor="deliveryDue" className="text-xs">
                  Shipment Due Date
                </Label>
                <div className="relative mt-1">
                  <Input
                    id="deliveryDue"
                    type="date"
                    value={deliveryDue}
                    onChange={(e) => setDeliveryDue(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Commercial Value (INR) */}
              <div>
                <Label htmlFor="totalAmount" className="text-xs">
                  Total Commercial Amount (INR)
                </Label>
                <Input
                  id="totalAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 font-mono text-xs"
                />
              </div>

              {/* Remarks */}
              <div className="sm:col-span-2 lg:col-span-3">
                <Label htmlFor="remarks" className="text-xs">
                  Order Remarks / Customer Notes
                </Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g., Priority delivery, export quality specs"
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Requirement Lines Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Layers className="h-3.5 w-3.5 text-brand-600" />
                <span>Yarn Requirement Lines ({requirements.length})</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLine}
                className="gap-1 text-xs border-brand-200 text-brand-700 hover:bg-brand-50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Requirement Line</span>
              </Button>
            </div>

            {/* Excel-like Tabular Grid */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[850px] text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-2.5 px-2 text-center w-8">#</th>
                    <th className="py-2.5 px-3 min-w-[140px]">
                      Yarn Count <span className="text-red-500">*</span>
                    </th>
                    <th className="py-2.5 px-2 min-w-[100px]">Quality</th>
                    <th className="py-2.5 px-2 min-w-[90px]">Size</th>
                    <th className="py-2.5 px-2 min-w-[90px]">Use For</th>
                    <th className="py-2.5 px-2 min-w-[100px]">
                      Purpose <span className="text-red-500">*</span>
                    </th>
                    <th className="py-2.5 px-2 min-w-[65px] text-right">Pcs</th>
                    <th className="py-2.5 px-2 min-w-[65px] text-right">Qty</th>
                    <th className="py-2.5 px-2 min-w-[110px] text-right">
                      Req KG <span className="text-red-500">*</span>
                    </th>
                    <th className="py-2.5 px-2 min-w-[130px]">Notes</th>
                    <th className="py-2.5 px-2 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requirements.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-2 text-center font-mono text-slate-400 text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Yarn Count with Datalist */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          list={`yarnCounts-${idx}`}
                          value={line.yarnCount}
                          onChange={(e) =>
                            handleLineChange(idx, "yarnCount", e.target.value)
                          }
                          placeholder="e.g. 1/10 KW"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono font-medium text-slate-900 focus:border-brand-600 focus:outline-none"
                          required
                        />
                        <datalist id={`yarnCounts-${idx}`}>
                          {COMMON_COUNTS.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </td>

                      {/* Quality */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={line.quality || ""}
                          onChange={(e) =>
                            handleLineChange(idx, "quality", e.target.value)
                          }
                          placeholder="e.g. 100% Cotton"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-brand-600 focus:outline-none"
                        />
                      </td>

                      {/* Size */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={line.size || ""}
                          onChange={(e) =>
                            handleLineChange(idx, "size", e.target.value)
                          }
                          placeholder="e.g. 30x60"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-brand-600 focus:outline-none"
                        />
                      </td>

                      {/* Use For */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={line.useFor || ""}
                          onChange={(e) =>
                            handleLineChange(idx, "useFor", e.target.value)
                          }
                          placeholder="e.g. Towel Bath"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 focus:border-brand-600 focus:outline-none"
                        />
                      </td>

                      {/* Purpose */}
                      <td className="py-2 px-2">
                        <select
                          value={line.purpose}
                          onChange={(e) =>
                            handleLineChange(idx, "purpose", e.target.value)
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:border-brand-600 focus:outline-none"
                          required
                        >
                          {PURPOSES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Pcs */}
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={line.pcs ?? ""}
                          onChange={(e) =>
                            handleLineChange(
                              idx,
                              "pcs",
                              e.target.value ? Number(e.target.value) : undefined
                            )
                          }
                          placeholder="-"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono text-right text-slate-800 focus:border-brand-600 focus:outline-none"
                        />
                      </td>

                      {/* Qty */}
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={line.qty ?? ""}
                          onChange={(e) =>
                            handleLineChange(
                              idx,
                              "qty",
                              e.target.value ? Number(e.target.value) : undefined
                            )
                          }
                          placeholder="-"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono text-right text-slate-800 focus:border-brand-600 focus:outline-none"
                        />
                      </td>

                      {/* Required KG */}
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          value={line.requiredKg || ""}
                          onChange={(e) =>
                            handleLineChange(
                              idx,
                              "requiredKg",
                              Number(e.target.value)
                            )
                          }
                          placeholder="0.00"
                          className="w-full rounded-md border border-brand-300 bg-brand-50/30 px-2 py-1 text-xs font-mono font-bold text-brand-900 text-right focus:border-brand-600 focus:outline-none"
                          required
                        />
                      </td>

                      {/* Notes */}
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={line.notes || ""}
                          onChange={(e) =>
                            handleLineChange(idx, "notes", e.target.value)
                          }
                          placeholder="Optional notes"
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-brand-600 focus:outline-none"
                        />
                      </td>

                      {/* Remove */}
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                          title="Delete line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold text-slate-800">
                  <tr>
                    <td colSpan={8} className="py-2.5 px-3 text-right">
                      Total Order Requirement:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-brand-700 text-sm">
                      {totalRequiredSum.toFixed(2)} KG
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-[11px] text-slate-500">
                      (103% Max Issue: {(totalRequiredSum * 1.03).toFixed(2)} KG)
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-200 pt-4 shrink-0">
            <div className="text-[11px] sm:text-xs text-slate-500">
              * Required fields. 103% issue ceiling rule will be automatically
              enforced by the backend.
            </div>
            <div className="flex items-center gap-2.5 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 sm:flex-initial"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isLoading}
                className="gap-1.5 flex-1 sm:flex-initial"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isEditing ? "Save Changes" : "Create Purchase Order"}</span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
