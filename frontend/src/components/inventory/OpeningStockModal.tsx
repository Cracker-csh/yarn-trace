import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Party } from "../../types/inventory";

const openingSchema = z.object({
  transactionDate: z.string().min(1, "Transaction date is required"),
  count: z.string().min(1, "Yarn count is required (e.g. 1/10 KW, 10 + 80 PVA)"),
  partyId: z.string().min(1, "Party must be selected from Party Master"),
  lotNumber: z.string().min(1, "Lot number is required"),
  bags: z.coerce.number().int().min(0, "Bags cannot be negative"),
  kilos: z.coerce.number().positive("Weight in KG must be greater than 0"),
  millLotNumber: z.string().optional(),
  shadeCode: z.string().optional(),
  remarks: z.string().optional(),
});

type OpeningFormValues = z.infer<typeof openingSchema>;

import { apiClient } from "../../lib/axios";

interface OpeningStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (values: OpeningFormValues) => Promise<void>;
  parties: Party[];
  isLoading?: boolean;
  existingLots?: any[];
  onShowToast?: (type: "success" | "error", message: string) => void;
}

export default function OpeningStockModal({
  isOpen,
  onClose,
  onSubmit,
  parties,
  isLoading = false,
  existingLots = [],
  onShowToast,
}: OpeningStockModalProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = isLoading || internalLoading;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OpeningFormValues>({
    resolver: zodResolver(openingSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split("T")[0],
      count: "",
      partyId: "",
      lotNumber: "",
      bags: 0,
      kilos: 0,
      millLotNumber: "",
      shadeCode: "",
      remarks: "",
    },
  });

  const handleFormSubmit = async (values: OpeningFormValues) => {
    try {
      if (onSubmit) {
        await onSubmit(values);
      } else {
        setInternalLoading(true);
        await apiClient.post("/inventory/opening", values);
        onShowToast?.("success", "Opening stock recorded successfully!");
      }
      reset();
      onClose();
    } catch (err: any) {
      if (!onSubmit && onShowToast) {
        onShowToast("error", err?.response?.data?.message || "Failed to add opening stock");
      }
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-100 text-orange-600 border border-orange-200 shrink-0">
              <Plus className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                Add Opening Stock Baseline
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Record baseline opening yarn stock. This creates an immutable OPENING transaction and initial lot ledger.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <Label htmlFor="transactionDate" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Baseline Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="transactionDate"
                type="date"
                {...register("transactionDate")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
              {errors.transactionDate && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.transactionDate.message}</p>
              )}
            </div>

            {/* Party (Dropdown from Party Master) */}
            <div>
              <Label htmlFor="partyId" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Party / Supplier <span className="text-red-500">*</span>
              </Label>
              <select
                id="partyId"
                {...register("partyId")}
                className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
              >
                <option value="">Select Party Master Entry</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              {errors.partyId && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.partyId.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Yarn Count (Manual Text Input) */}
            <div>
              <Label htmlFor="count" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Yarn Count (Manual Input) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="count"
                placeholder="e.g. 1/10 KW, 10 + 80 PVA, 16+80 ZT"
                {...register("count")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.count && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.count.message}</p>
              )}
            </div>

            {/* Lot Number */}
            <div>
              <Label htmlFor="lotNumber" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Lot Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lotNumber"
                placeholder="e.g. LOT-2026-001"
                {...register("lotNumber")}
                className="h-10 text-xs font-mono uppercase bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.lotNumber && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.lotNumber.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bags */}
            <div>
              <Label htmlFor="bags" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Total Bags <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bags"
                type="number"
                min="0"
                step="1"
                {...register("bags")}
                className="h-10 text-xs font-mono bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.bags && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.bags.message}</p>
              )}
            </div>

            {/* Kilos (Decimal) */}
            <div>
              <Label htmlFor="kilos" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Total Weight (KG) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="kilos"
                type="number"
                min="0.01"
                step="0.0001"
                {...register("kilos")}
                className="h-10 text-xs font-mono font-semibold text-brand-700 bg-slate-50/60 focus:bg-white"
              />
              {errors.kilos && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.kilos.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mill Lot Number */}
            <div>
              <Label htmlFor="millLotNumber" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Mill Original Lot (Optional)
              </Label>
              <Input
                id="millLotNumber"
                placeholder="e.g. MILL-994"
                {...register("millLotNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>

            {/* Shade Code */}
            <div>
              <Label htmlFor="shadeCode" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Shade / Color (Optional)
              </Label>
              <Input
                id="shadeCode"
                placeholder="e.g. RAW-NATURAL / DYED-RED"
                {...register("shadeCode")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>
          </div>

          {/* Remarks */}
          <div>
            <Label htmlFor="remarks" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Remarks / Baseline Reference
            </Label>
            <Input
              id="remarks"
              placeholder="e.g. Opening Balance migration as of 30-Aug-2026"
              {...register("remarks")}
              className="h-10 text-xs bg-slate-50/60 focus:bg-white"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={loading} className="h-10 px-5 text-xs font-semibold">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading} className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Save Opening Stock</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
