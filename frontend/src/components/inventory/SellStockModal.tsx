import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, DollarSign } from "lucide-react";
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
import { Party, LotRecord } from "../../types/inventory";

const sellSchema = z.object({
  transactionDate: z.string().min(1, "Date is required"),
  partyId: z.string().min(1, "Customer must be selected from Party Master"),
  lotNumber: z.string().min(1, "Lot selection is required"),
  count: z.string().min(1, "Yarn count is required"),
  bags: z.coerce.number().int().min(0, "Bags cannot be negative"),
  kilos: z.coerce.number().positive("Sale weight in KG must be greater than 0"),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
});

type SellFormValues = z.infer<typeof sellSchema>;

interface SellStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: SellFormValues) => Promise<void>;
  lots: LotRecord[];
  parties: Party[];
  preselectedLot?: LotRecord | null;
  isLoading: boolean;
}

export default function SellStockModal({
  isOpen,
  onClose,
  onSubmit,
  lots,
  parties,
  preselectedLot,
  isLoading,
}: SellStockModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SellFormValues>({
    resolver: zodResolver(sellSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split("T")[0],
      partyId: "",
      lotNumber: preselectedLot?.lotNumber || "",
      count: preselectedLot?.count || "",
      bags: 0,
      kilos: 0,
      referenceNumber: "",
      remarks: "",
    },
  });

  const handleLotSelect = (lotNum: string) => {
    const found = lots.find((l) => l.lotNumber === lotNum);
    if (found) {
      setValue("lotNumber", found.lotNumber);
      setValue("count", found.count);
      if (found.currentWeightKg > 0) {
        setValue("kilos", Number(found.currentWeightKg));
      }
      if (found.currentBags > 0) {
        setValue("bags", Number(found.currentBags));
      }
      setValue("remarks", `Commercial external sale of lot ${found.lotNumber} (${found.count})`);
    }
  };

  useEffect(() => {
    if (preselectedLot) {
      handleLotSelect(preselectedLot.lotNumber);
    }
  }, [preselectedLot, lots]);

  const handleFormSubmit = async (values: SellFormValues) => {
    await onSubmit(values);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-600 border border-purple-200 shrink-0">
              <DollarSign className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                Record External Yarn Sale
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Record commercial yarn sale to an external buyer or customer. Decreases Main Stock and is reported separately from internal production issues.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-1">
          <div>
            <Label htmlFor="sell-customer" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Customer / Buyer (Party Master) <span className="text-red-500">*</span>
            </Label>
            <select
              id="sell-customer"
              {...register("partyId")}
              className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-sm"
            >
              <option value="">-- Select Customer --</option>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sell-lot" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Lot Being Sold <span className="text-red-500">*</span>
              </Label>
              <select
                id="sell-lot"
                defaultValue={preselectedLot?.lotNumber || ""}
                onChange={(e) => handleLotSelect(e.target.value)}
                className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-sm"
              >
                <option value="">-- Choose Lot --</option>
                {lots
                  .filter((l) => l.currentWeightKg > 0)
                  .map((l) => (
                    <option key={l.id} value={l.lotNumber}>
                      {l.lotNumber} ({l.currentWeightKg.toFixed(2)} KG Avail)
                    </option>
                  ))}
              </select>
              {errors.lotNumber && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.lotNumber.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="sell-count" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Yarn Count <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sell-count"
                placeholder="e.g. 1/10 KW"
                {...register("count")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.count && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.count.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sell-bags" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Bags Sold <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sell-bags"
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
              <Label htmlFor="sell-kilos" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Weight (KG) Sold <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sell-kilos"
                type="number"
                min="0.01"
                step="0.0001"
                {...register("kilos")}
                className="h-10 text-xs font-mono font-semibold text-purple-700 bg-slate-50/60 focus:bg-white"
              />
              {errors.kilos && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.kilos.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sell-date" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Sale Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sell-date"
                type="date"
                {...register("transactionDate")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>

            <div>
              <Label htmlFor="sell-inv" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Sales Invoice / Slip No
              </Label>
              <Input
                id="sell-inv"
                placeholder="e.g. INV-2026-0044"
                {...register("referenceNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="sell-remarks" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Remarks
            </Label>
            <Input
              id="sell-remarks"
              placeholder="e.g. Commercial sale @ agreed rate"
              {...register("remarks")}
              className="h-10 text-xs bg-slate-50/60 focus:bg-white"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={isLoading} className="h-10 px-5 text-xs font-semibold">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading} className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm bg-purple-600 hover:bg-purple-700">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Record Sale</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
