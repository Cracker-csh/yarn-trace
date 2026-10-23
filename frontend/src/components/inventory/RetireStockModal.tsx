import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, AlertOctagon } from "lucide-react";
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
import { LotRecord } from "../../types/inventory";

const retireSchema = z.object({
  transactionDate: z.string().min(1, "Date is required"),
  lotNumber: z.string().min(1, "Lot selection is required"),
  bags: z.coerce.number().int().min(0, "Bags cannot be negative"),
  kilos: z.coerce.number().positive("Retire weight in KG must be greater than 0"),
  reason: z.string().min(5, "Mandatory reason is required (min 5 characters)"),
  referenceNumber: z.string().optional(),
});

type RetireFormValues = z.infer<typeof retireSchema>;

interface RetireStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: RetireFormValues) => Promise<void>;
  lots: LotRecord[];
  preselectedLot?: LotRecord | null;
  isLoading: boolean;
}

export default function RetireStockModal({
  isOpen,
  onClose,
  onSubmit,
  lots,
  preselectedLot,
  isLoading,
}: RetireStockModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<RetireFormValues>({
    resolver: zodResolver(retireSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split("T")[0],
      lotNumber: preselectedLot?.lotNumber || "",
      bags: 0,
      kilos: 0,
      reason: "",
      referenceNumber: "",
    },
  });

  const populateRetireLot = (lotNum: string) => {
    setValue("lotNumber", lotNum);
    const found = lots.find((l) => l.lotNumber === lotNum);
    if (found) {
      if (found.currentWeightKg > 0) {
        setValue("kilos", Number(found.currentWeightKg));
      }
      if (found.currentBags > 0) {
        setValue("bags", Number(found.currentBags));
      }
      setValue("referenceNumber", `QA-SCRAP-${found.lotNumber.slice(-4)}`);
      setValue("reason", `Quality inspection rejection / damage write-off for lot ${found.lotNumber}`);
    }
  };

  useEffect(() => {
    if (preselectedLot) {
      populateRetireLot(preselectedLot.lotNumber);
    }
  }, [preselectedLot, lots]);

  const handleFormSubmit = async (values: RetireFormValues) => {
    await onSubmit(values);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-100 text-red-600 border border-red-200 shrink-0">
              <AlertOctagon className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                Retire / Write-Off Yarn Stock
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Permanently remove yarn from usable Main Stock due to damage, contamination, physical audit adjustment, or scrap. Requires mandatory justification.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-1">
          <div>
            <Label htmlFor="retire-lot" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Select Lot to Retire <span className="text-red-500">*</span>
            </Label>
            <select
              id="retire-lot"
              defaultValue={preselectedLot?.lotNumber || ""}
              onChange={(e) => populateRetireLot(e.target.value)}
              className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 shadow-sm"
            >
              <option value="">-- Choose Lot --</option>
              {lots
                .filter((l) => l.currentWeightKg > 0)
                .map((l) => (
                  <option key={l.id} value={l.lotNumber}>
                    {l.lotNumber} | {l.count} | Avail: {l.currentWeightKg.toFixed(2)} KG ({l.currentBags} bags)
                  </option>
                ))}
            </select>
            {errors.lotNumber && (
              <p className="text-[11px] font-medium text-red-500 mt-1">{errors.lotNumber.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="retire-bags" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Bags to Retire <span className="text-red-500">*</span>
              </Label>
              <Input
                id="retire-bags"
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
              <Label htmlFor="retire-kilos" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Weight (KG) to Retire <span className="text-red-500">*</span>
              </Label>
              <Input
                id="retire-kilos"
                type="number"
                min="0.01"
                step="0.0001"
                {...register("kilos")}
                className="h-10 text-xs font-mono font-semibold text-red-700 bg-slate-50/60 focus:bg-white"
              />
              {errors.kilos && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.kilos.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="retire-date" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Retirement Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="retire-date"
                type="date"
                {...register("transactionDate")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>

            <div>
              <Label htmlFor="retire-ref" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                QA / Audit Slip No
              </Label>
              <Input
                id="retire-ref"
                placeholder="e.g. QA-SCRAP-91"
                {...register("referenceNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="retire-reason" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Mandatory Reason / Justification <span className="text-red-500">*</span>
            </Label>
            <Input
              id="retire-reason"
              placeholder="e.g. Severe water damage in Storage Bay B - QA write-off approved"
              {...register("reason")}
              className="h-10 text-xs bg-slate-50/60 focus:bg-white"
            />
            {errors.reason && (
              <p className="text-[11px] font-medium text-red-500 mt-1">{errors.reason.message}</p>
            )}
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={isLoading} className="h-10 px-5 text-xs font-semibold">
              Cancel
            </Button>
            <Button variant="destructive" type="submit" disabled={isLoading} className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Confirm Retirement</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
