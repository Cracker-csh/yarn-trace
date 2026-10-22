import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, ArrowDownLeft } from "lucide-react";
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

const receiveSchema = z.object({
  transactionDate: z.string().min(1, "Transaction date is required"),
  count: z.string().min(1, "Yarn count is required"),
  partyId: z.string().min(1, "Supplier must be selected"),
  lotNumber: z.string().min(1, "Lot number is required"),
  bags: z.coerce.number().int().min(0, "Bags cannot be negative"),
  kilos: z.coerce.number().positive("Weight in KG must be greater than 0"),
  poNumber: z.string().optional(),
  purpose: z.string().optional(),
  referenceNumber: z.string().optional(),
  millLotNumber: z.string().optional(),
  shadeCode: z.string().optional(),
  parentLotId: z.string().optional(),
  remarks: z.string().optional(),
});

type ReceiveFormValues = z.infer<typeof receiveSchema>;

import { apiClient } from "../../lib/axios";

interface ReceiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (values: ReceiveFormValues) => Promise<void>;
  parties: Party[];
  isLoading?: boolean;
  onShowToast?: (type: "success" | "error", message: string) => void;
}

export default function ReceiveStockModal({
  isOpen,
  onClose,
  onSubmit,
  parties,
  isLoading = false,
  onShowToast,
}: ReceiveStockModalProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = isLoading || internalLoading;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReceiveFormValues>({
    resolver: zodResolver(receiveSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split("T")[0],
      count: "",
      partyId: "",
      lotNumber: "",
      bags: 0,
      kilos: 0,
      poNumber: "",
      purpose: "GENERAL",
      referenceNumber: "",
      millLotNumber: "",
      shadeCode: "",
      parentLotId: "",
      remarks: "",
    },
  });

  const handleFormSubmit = async (values: ReceiveFormValues) => {
    try {
      if (onSubmit) {
        await onSubmit(values);
      } else {
        setInternalLoading(true);
        await apiClient.post("/inventory/received", values);
        onShowToast?.("success", "Inward stock received and recorded successfully!");
      }
      reset();
      onClose();
    } catch (err: any) {
      if (!onSubmit && onShowToast) {
        onShowToast("error", err?.response?.data?.message || "Failed to receive inward stock");
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
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 border border-emerald-200 shrink-0">
              <ArrowDownLeft className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                Receive Inward Yarn Stock
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Record new inward yarn received from spinning mills or dyeing houses. Increases Main Stock.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rcv-date" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Receipt Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rcv-date"
                type="date"
                {...register("transactionDate")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
              {errors.transactionDate && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.transactionDate.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="rcv-party" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Supplier / Mill <span className="text-red-500">*</span>
              </Label>
              <select
                id="rcv-party"
                {...register("partyId")}
                className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
              >
                <option value="">Select Supplier</option>
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
            <div>
              <Label htmlFor="rcv-count" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Yarn Count (Manual Input) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rcv-count"
                placeholder="e.g. 1/10 OE, 10 + 80 PVA"
                {...register("count")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.count && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.count.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="rcv-lot" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Inward Lot Number <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rcv-lot"
                placeholder="e.g. LOT-2026-088"
                {...register("lotNumber")}
                className="h-10 text-xs font-mono uppercase bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.lotNumber && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.lotNumber.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rcv-bags" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Bags Received <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rcv-bags"
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

            <div>
              <Label htmlFor="rcv-kilos" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Net Weight (KG) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="rcv-kilos"
                type="number"
                min="0.01"
                step="0.0001"
                {...register("kilos")}
                className="h-10 text-xs font-mono font-semibold text-emerald-700 bg-slate-50/60 focus:bg-white"
              />
              {errors.kilos && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.kilos.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rcv-po" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                PO Number (Optional)
              </Label>
              <Input
                id="rcv-po"
                placeholder="e.g. PO-2026-902"
                {...register("poNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>

            <div>
              <Label htmlFor="rcv-ref" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Delivery Challan / Invoice No
              </Label>
              <Input
                id="rcv-ref"
                placeholder="e.g. DC-7789"
                {...register("referenceNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="rcv-remarks" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Remarks / Notes
            </Label>
            <Input
              id="rcv-remarks"
              placeholder="e.g. Received in sound condition, moisture test approved"
              {...register("remarks")}
              className="h-10 text-xs bg-slate-50/60 focus:bg-white"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={loading} className="h-10 px-5 text-xs font-semibold">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={loading} className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Receive Inward Stock</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
