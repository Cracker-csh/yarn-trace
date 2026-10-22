"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Factory,
  X,
  Loader2,
  AlertCircle,
  Scale,
  Boxes,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
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
import { Badge } from "../ui/badge";
import { apiClient } from "../../lib/axios";
import { LotRecord, Party } from "../../types/inventory";
import { ProductionOrder, ProductionTeam } from "../../types/production";

interface AllocateToProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  lots: LotRecord[];
  parties: Party[];
  preselectedLot?: LotRecord | null;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function AllocateToProductionModal({
  isOpen,
  onClose,
  lots,
  parties,
  preselectedLot,
  onShowToast,
}: AllocateToProductionModalProps) {
  const queryClient = useQueryClient();

  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [allocatedKg, setAllocatedKg] = useState<string>("");
  const [bags, setBags] = useState<string>("1");
  const [purpose, setPurpose] = useState<string>("KNITTING");
  const [remarks, setRemarks] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Available lots (lots with current weight > 0)
  const availableLots = useMemo(() => {
    return lots.filter((l) => Number(l.currentWeightKg) > 0);
  }, [lots]);

  // Fetch Production Teams
  const { data: teams = [] } = useQuery<ProductionTeam[]>({
    queryKey: ["production", "teams"],
    queryFn: async () => {
      const res = await apiClient.get("/production/teams");
      return res.data.data || [];
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  // Fetch Active Work Orders
  const { data: ordersResponse } = useQuery({
    queryKey: ["production", "orders", "active"],
    queryFn: async () => {
      const res = await apiClient.get("/production/orders?limit=50");
      return res.data.data;
    },
    enabled: isOpen,
    staleTime: 30_000,
  });
  const activeOrders: ProductionOrder[] = useMemo(() => {
    return (ordersResponse?.items || []).filter(
      (o: ProductionOrder) => o.status === "PLANNED" || o.status === "IN_PROGRESS"
    );
  }, [ordersResponse]);

  // Pre-fill when opened with a preselected lot
  useEffect(() => {
    if (preselectedLot) {
      setSelectedLotId(preselectedLot.id);
      setAllocatedKg(String(preselectedLot.currentWeightKg));
      setBags(String(preselectedLot.currentBags || 1));
    } else if (availableLots.length > 0 && !selectedLotId) {
      setSelectedLotId(availableLots[0].id);
      setAllocatedKg(String(availableLots[0].currentWeightKg));
      setBags(String(availableLots[0].currentBags || 1));
    }
  }, [preselectedLot, availableLots, isOpen]);

  // Pre-fill default team
  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams]);

  const currentLot = useMemo(() => {
    return availableLots.find((l) => l.id === selectedLotId);
  }, [availableLots, selectedLotId]);

  const availableWeight = currentLot ? Number(currentLot.currentWeightKg) : 0;
  const requestedWeight = Number(allocatedKg) || 0;
  const remainingWeight = Math.max(0, availableWeight - requestedWeight);
  const isOverAllocated = requestedWeight > availableWeight;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentLot) {
      onShowToast("error", "Please select a valid yarn lot.");
      return;
    }
    if (requestedWeight <= 0) {
      onShowToast("error", "Allocation weight in KG must be greater than 0.");
      return;
    }
    if (isOverAllocated) {
      onShowToast("error", `Requested weight (${requestedWeight} KG) exceeds available store balance (${availableWeight} KG).`);
      return;
    }

    try {
      setIsSubmitting(true);

      // 1. Issue stock from main store
      const issueRes = await apiClient.post("/inventory/issued", {
        transactionDate: new Date().toISOString().split("T")[0],
        count: currentLot.count,
        partyId: currentLot.party?.id || parties[0]?.id,
        lotNumber: currentLot.lotNumber,
        bags: Number(bags) || 0,
        kilos: requestedWeight,
        purpose: purpose || "PRODUCTION_FLOOR",
        remarks: remarks || `Allocated to ${teams.find((t) => t.id === selectedTeamId)?.name || "Production Floor"}`,
      });

      const issueTx = issueRes.data.data;

      // 2. Link allocation to production order if selected
      if (selectedOrderId) {
        await apiClient.post(`/production/orders/${selectedOrderId}/allocations`, {
          lotId: currentLot.id,
          allocatedKg: requestedWeight,
          allocatedBags: Number(bags) || 0,
          sourceTransactionId: issueTx?.id,
          notes: remarks || "Direct floor allocation from inventory workflow",
        });
      }

      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["production"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      onShowToast(
        "success",
        `Successfully allocated ${requestedWeight.toFixed(2)} KG of ${currentLot.lotNumber} to production!`
      );
      onClose();
    } catch (err: any) {
      onShowToast("error", err?.response?.data?.message || "Failed to complete allocation to production.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 border border-purple-200 shrink-0">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 font-heading">
                Allocate Yarn to Production Floor
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Issue stock from warehouse store and assign it directly to a production work order or department team.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Yarn Lot Selector */}
          <div>
            <Label htmlFor="alloc-lot" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Source Yarn Lot <span className="text-red-500">*</span>
            </Label>
            <select
              id="alloc-lot"
              value={selectedLotId}
              onChange={(e) => {
                setSelectedLotId(e.target.value);
                const l = availableLots.find((lot) => lot.id === e.target.value);
                if (l) {
                  setAllocatedKg(String(l.currentWeightKg));
                  setBags(String(l.currentBags || 1));
                }
              }}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary font-mono"
            >
              {availableLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber} | {l.count} | Avail: {Number(l.currentWeightKg).toFixed(1)} KG ({l.currentBags} bags)
                </option>
              ))}
            </select>
          </div>

          {/* Live Math Calculation Summary Card */}
          {currentLot && (
            <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl text-xs space-y-1.5">
              <div className="flex justify-between items-center text-slate-600">
                <span>Available in Store:</span>
                <span className="font-mono font-bold text-slate-900">{availableWeight.toFixed(2)} KG</span>
              </div>
              <div className="flex justify-between items-center text-purple-700">
                <span>Requested Allocation:</span>
                <span className="font-mono font-bold">{requestedWeight.toFixed(2)} KG</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-purple-200 font-semibold">
                <span className="text-slate-700">Remaining in Store:</span>
                <span className={`font-mono ${isOverAllocated ? "text-red-600 font-bold" : "text-emerald-700"}`}>
                  {remainingWeight.toFixed(2)} KG
                </span>
              </div>
              {isOverAllocated && (
                <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 pt-1">
                  <AlertCircle className="h-3 w-3" />
                  Cannot allocate more than available store balance!
                </p>
              )}
            </div>
          )}

          {/* Quantity & Bags Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="alloc-kg" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Quantity to Allocate (KG) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="alloc-kg"
                type="number"
                step="0.01"
                min="0.01"
                value={allocatedKg}
                onChange={(e) => setAllocatedKg(e.target.value)}
                className={`h-10 text-xs font-mono font-bold ${
                  isOverAllocated ? "border-red-500 bg-red-50" : ""
                }`}
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <Label htmlFor="alloc-bags" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Bags Count
              </Label>
              <Input
                id="alloc-bags"
                type="number"
                min="0"
                value={bags}
                onChange={(e) => setBags(e.target.value)}
                className="h-10 text-xs font-mono"
                placeholder="1"
              />
            </div>
          </div>

          {/* Target Production Order & Team */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="alloc-team" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Target Team / Department
              </Label>
              <select
                id="alloc-team"
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="alloc-order" className="text-xs font-semibold text-slate-700 mb-1.5 block">
                Link to Production Order (Optional)
              </Label>
              <select
                id="alloc-order"
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">-- General Floor Allocation --</option>
                {activeOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} - {o.productName} ({o.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <Label htmlFor="alloc-remarks" className="text-xs font-semibold text-slate-700 mb-1.5 block">
              Remarks / Purpose Notes
            </Label>
            <Input
              id="alloc-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Allocation for Knitting Batch #204"
              className="h-10 text-xs"
            />
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting} className="h-10 text-xs">
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting || isOverAllocated || requestedWeight <= 0}
              className="h-10 text-xs font-semibold gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Allocating...</span>
                </>
              ) : (
                <>
                  <Factory className="h-4 w-4" />
                  <span>Confirm Allocation ({requestedWeight.toFixed(1)} KG)</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
