import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, ArrowUpRight, AlertCircle, Info } from "lucide-react";
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
import { Party, LotRecord, PORequirementOption } from "../../types/inventory";

const issueSchema = z.object({
  transactionDate: z.string().min(1, "Date is required"),
  lotNumber: z.string().min(1, "Lot selection is required"),
  count: z.string().min(1, "Yarn count is required"),
  partyId: z.string().min(1, "Party is required"),
  bags: z.coerce.number().int().min(0, "Bags cannot be negative"),
  kilos: z.coerce.number().positive("Issue weight in KG must be greater than 0"),
  poNumber: z.string().optional(),
  purpose: z.string().min(1, "Production purpose is required"),
  referenceNumber: z.string().optional(),
  remarks: z.string().optional(),
});

type IssueFormValues = z.infer<typeof issueSchema>;

interface IssueStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: IssueFormValues) => Promise<void>;
  lots: LotRecord[];
  parties: Party[];
  poRequirements: PORequirementOption[];
  preselectedLot?: LotRecord | null;
  isLoading: boolean;
}

export default function IssueStockModal({
  isOpen,
  onClose,
  onSubmit,
  lots,
  parties,
  poRequirements,
  preselectedLot,
  isLoading,
}: IssueStockModalProps) {
  const [selectedLotState, setSelectedLotState] = useState<LotRecord | null>(preselectedLot || null);
  const [matchingRequirement, setMatchingRequirement] = useState<PORequirementOption | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split("T")[0],
      lotNumber: preselectedLot?.lotNumber || "",
      count: preselectedLot?.count || "",
      partyId: preselectedLot?.party?.id || "",
      bags: 0,
      kilos: 0,
      poNumber: "",
      purpose: "PILE",
      referenceNumber: "",
      remarks: "",
    },
  });

  const watchedLotNumber = watch("lotNumber");
  const watchedPoNumber = watch("poNumber");
  const watchedCount = watch("count");
  const watchedPurpose = watch("purpose");
  const watchedKilos = watch("kilos");

  // When preselected lot changes
  useEffect(() => {
    if (preselectedLot) {
      setSelectedLotState(preselectedLot);
      setValue("lotNumber", preselectedLot.lotNumber);
      setValue("count", preselectedLot.count);
      if (preselectedLot.party?.id) {
        setValue("partyId", preselectedLot.party.id);
      }
    }
  }, [preselectedLot, setValue]);

  // When lot selection changes in dropdown
  const handleLotSelect = (lotNum: string) => {
    const found = lots.find((l) => l.lotNumber === lotNum);
    setSelectedLotState(found || null);
    if (found) {
      setValue("lotNumber", found.lotNumber);
      setValue("count", found.count);
      if (found.party?.id) {
        setValue("partyId", found.party.id);
      }
    }
  };

  // Match 103% PO Requirement: PO No + Yarn Count + Purpose
  useEffect(() => {
    if (watchedPoNumber && watchedCount && watchedPurpose) {
      const match = poRequirements.find(
        (r) =>
          r.poNumber.toLowerCase() === watchedPoNumber.trim().toLowerCase() &&
          r.yarnCount.toLowerCase().includes(watchedCount.trim().toLowerCase()) &&
          r.purpose.toUpperCase() === watchedPurpose.trim().toUpperCase()
      );
      setMatchingRequirement(match || null);
    } else {
      setMatchingRequirement(null);
    }
  }, [watchedPoNumber, watchedCount, watchedPurpose, poRequirements]);

  const handleFormSubmit = async (values: IssueFormValues) => {
    await onSubmit(values);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-600 border border-amber-200 shrink-0">
              <ArrowUpRight className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                Issue Yarn to Production
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Issue yarn from Main Stock to a production stage (Pile, Ground, Weft, Dyed, NPD). Enforces PO 103% rule and negative balance prevention.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4 pt-1">
          {/* Lot Selector */}
          <div>
            <Label htmlFor="issue-lot" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Select Lot to Issue From <span className="text-red-500">*</span>
            </Label>
            <select
              id="issue-lot"
              value={watchedLotNumber}
              onChange={(e) => handleLotSelect(e.target.value)}
              className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
            >
              <option value="">-- Choose available lot --</option>
              {lots
                .filter((l) => l.currentWeightKg > 0.001)
                .map((l) => (
                  <option key={l.id} value={l.lotNumber}>
                    {l.lotNumber} | {l.count} | {l.party?.name || "No Party"} | Avail: {l.currentWeightKg.toFixed(2)} KG ({l.currentBags} bags)
                  </option>
                ))}
            </select>
            {errors.lotNumber && (
              <p className="text-[11px] font-medium text-red-500 mt-1">{errors.lotNumber.message}</p>
            )}
          </div>

          {selectedLotState && (
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between text-xs">
              <div>
                <span className="font-semibold text-slate-700">Available in Lot: </span>
                <span className="text-brand-700 font-mono font-bold text-sm">{selectedLotState.currentWeightKg.toFixed(2)} KG</span>
                <span className="text-slate-500 ml-1.5 font-medium">({selectedLotState.currentBags} bags)</span>
              </div>
              <span className="text-slate-600 font-mono text-[11px] bg-amber-100/70 px-2 py-0.5 rounded font-semibold">{selectedLotState.count}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="issue-count" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Yarn Count <span className="text-red-500">*</span>
              </Label>
              <Input
                id="issue-count"
                placeholder="e.g. 1/10 KW"
                {...register("count")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white font-medium"
              />
              {errors.count && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.count.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="issue-party" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Party / Supplier <span className="text-red-500">*</span>
              </Label>
              <select
                id="issue-party"
                {...register("partyId")}
                className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
              >
                <option value="">Select Party</option>
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
              <Label htmlFor="issue-bags" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Bags to Issue <span className="text-red-500">*</span>
              </Label>
              <Input
                id="issue-bags"
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
              <Label htmlFor="issue-kilos" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Weight in KG <span className="text-red-500">*</span>
              </Label>
              <Input
                id="issue-kilos"
                type="number"
                min="0.01"
                step="0.0001"
                {...register("kilos")}
                className="h-10 text-xs font-mono font-semibold text-amber-700 bg-slate-50/60 focus:bg-white"
              />
              {errors.kilos && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.kilos.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* PO Number */}
            <div>
              <Label htmlFor="issue-po" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                PO Number (Optional)
              </Label>
              <Input
                id="issue-po"
                placeholder="e.g. PO-8801"
                {...register("poNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white font-mono"
              />
            </div>

            {/* Purpose */}
            <div>
              <Label htmlFor="issue-purpose" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Production Purpose <span className="text-red-500">*</span>
              </Label>
              <select
                id="issue-purpose"
                {...register("purpose")}
                className="w-full text-xs h-10 px-3 rounded-lg border border-slate-300 bg-slate-50/60 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 shadow-sm"
              >
                <option value="KNITTING">KNITTING</option>
                <option value="WEAVING">WEAVING</option>
                <option value="WARPING">WARPING</option>
                <option value="PILE">PILE</option>
                <option value="GROUND">GROUND</option>
                <option value="WEFT">WEFT</option>
                <option value="DYED">DYED</option>
                <option value="NPD">NPD</option>
                <option value="GENERAL">GENERAL</option>
              </select>
              {errors.purpose && (
                <p className="text-[11px] font-medium text-red-500 mt-1">{errors.purpose.message}</p>
              )}
            </div>
          </div>

          {/* 103% PO Rule Alert / Status */}
          {matchingRequirement && (
            <div className="p-3 rounded-xl border border-amber-300 bg-amber-50/70 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-900">
                <Info className="h-4 w-4 text-amber-600 shrink-0" />
                <span>PO Requirement Rule: 103% Ceiling Active</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-600 pt-0.5 font-medium">
                <div>Required: <span className="font-bold font-mono text-slate-900">{matchingRequirement.requiredKg} KG</span></div>
                <div>103% Max: <span className="font-bold font-mono text-amber-700">{matchingRequirement.ceiling103Kg} KG</span></div>
                <div>Issued: <span className="font-bold font-mono text-slate-900">{matchingRequirement.issuedKg} KG</span></div>
              </div>
              {Number(watchedKilos) + matchingRequirement.issuedKg > matchingRequirement.ceiling103Kg && (
                <p className="text-[11px] text-red-600 font-semibold flex items-center gap-1.5 pt-1">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>Warning: This issue will exceed the 103% ceiling and will be rejected by backend.</span>
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="issue-date" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Issue Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="issue-date"
                type="date"
                {...register("transactionDate")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>

            <div>
              <Label htmlFor="issue-slip" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Yarn Slip / Requisition No
              </Label>
              <Input
                id="issue-slip"
                placeholder="e.g. SLIP-4401"
                {...register("referenceNumber")}
                className="h-10 text-xs bg-slate-50/60 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="issue-remarks" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Remarks
            </Label>
            <Input
              id="issue-remarks"
              placeholder="e.g. Issued to Warping Team #2 for Batch 109"
              {...register("remarks")}
              className="h-10 text-xs bg-slate-50/60 focus:bg-white"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={isLoading} className="h-10 px-5 text-xs font-semibold">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isLoading} className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm bg-amber-600 hover:bg-amber-700">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Issue Yarn</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
