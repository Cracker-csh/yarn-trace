import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Factory, X, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { apiClient } from "../../lib/axios";
import { ProductionOrder, ProductionTeam, ProductionOrderStatus } from "../../types/production";
import { Party } from "../../types/inventory";

interface WorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderToEdit?: ProductionOrder | null;
  teams: ProductionTeam[];
  parties: Party[];
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function WorkOrderModal({
  isOpen,
  onClose,
  orderToEdit,
  teams,
  parties,
  onShowToast,
}: WorkOrderModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Form fields
  const [orderNumber, setOrderNumber] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [unit, setUnit] = useState("KG");
  const [priority, setPriority] = useState("MEDIUM");
  const [purpose, setPurpose] = useState("WEAVING");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState("FABRIC_ROLL");
  const [poNumber, setPoNumber] = useState("");
  const [partyId, setPartyId] = useState("");
  const [productionTeamId, setProductionTeamId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<ProductionOrderStatus>("PLANNED");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (orderToEdit) {
      setOrderNumber(orderToEdit.orderNumber);
      setTargetQuantity(orderToEdit.targetQuantity.toString());
      setUnit(orderToEdit.unit || "KG");
      setPriority(orderToEdit.priority || "MEDIUM");
      setPurpose(orderToEdit.purpose || "WEAVING");
      setProductName(orderToEdit.productName || "");
      setProductType(orderToEdit.productType || "FABRIC_ROLL");
      setPoNumber(orderToEdit.poNumber || "");
      setPartyId(orderToEdit.party?.id || "");
      setProductionTeamId(orderToEdit.productionTeam?.id || "");
      setStartDate(orderToEdit.startDate ? orderToEdit.startDate.split("T")[0] : "");
      setTargetDate(orderToEdit.targetDate ? orderToEdit.targetDate.split("T")[0] : "");
      setStatus(orderToEdit.status);
      setRemarks(orderToEdit.remarks || "");
    } else {
      setOrderNumber("");
      setTargetQuantity("");
      setUnit("KG");
      setPriority("MEDIUM");
      setPurpose("WEAVING");
      setProductName("");
      setProductType("FABRIC_ROLL");
      setPoNumber("");
      setPartyId("");
      setProductionTeamId(teams[0]?.id || "");
      setStartDate(new Date().toISOString().split("T")[0]);
      setTargetDate("");
      setStatus("PLANNED");
      setRemarks("");
    }
  }, [orderToEdit, isOpen, teams]);

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post("/production/orders", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast("success", "Production Work Order created successfully");
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to create work order");
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.patch(`/production/orders/${orderToEdit?.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "orders"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
      onShowToast("success", "Work Order updated successfully");
      onClose();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to update work order");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(targetQuantity);
    if (isNaN(qty) || qty <= 0) {
      onShowToast("error", "Target quantity must be a positive number in KG");
      return;
    }

    const payload: any = {
      targetQuantity: qty,
      unit: unit.trim().toUpperCase(),
      priority,
      purpose: purpose.trim() || undefined,
      productName: productName.trim() || undefined,
      productType: productType.trim() || undefined,
      poNumber: poNumber.trim() || undefined,
      partyId: partyId || undefined,
      productionTeamId: productionTeamId || undefined,
      startDate: startDate || undefined,
      targetDate: targetDate || undefined,
      remarks: remarks.trim() || undefined,
    };

    if (orderToEdit) {
      payload.status = status;
      updateMutation.mutate(payload);
    } else {
      if (orderNumber.trim()) {
        payload.orderNumber = orderNumber.trim();
      }
      payload.status = status;
      createMutation.mutate(payload);
    }
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 shrink-0">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {orderToEdit ? `Edit Work Order: ${orderToEdit.orderNumber}` : "New Production Work Order"}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">
                Plan production batches, target weights, assigned floor teams, and product lines
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Work Order Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Order Number
              </label>
              <Input
                type="text"
                placeholder="Auto-generated (e.g. WO-2026-0001)"
                value={orderNumber}
                disabled={Boolean(orderToEdit)}
                onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                className="text-xs bg-slate-50 border-slate-200 uppercase font-mono"
              />
            </div>

            {/* Target Quantity */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Quantity (KG) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 1000.00"
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(e.target.value)}
                className="text-xs font-mono font-semibold"
                required
              />
            </div>

            {/* Assigned Production Team */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Production Team <span className="text-red-500">*</span>
              </label>
              <select
                value={productionTeamId}
                onChange={(e) => setProductionTeamId(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                required
              >
                <option value="">Select Team...</option>
                {teams
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.department} - {t.code})
                    </option>
                  ))}
              </select>
            </div>

            {/* Commercial Party */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Commercial Party (Customer / Mill)
              </label>
              <select
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="">Select Party from Master...</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>

            {/* PO Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Linked Purchase Order #
              </label>
              <Input
                type="text"
                placeholder="e.g. PO-2026-8801"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value.toUpperCase())}
                className="text-xs font-mono uppercase"
              />
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Production Purpose / Process
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="WEAVING">Weaving</option>
                <option value="WARPING">Warping</option>
                <option value="KNITTING">Knitting</option>
                <option value="SPINNING">Spinning</option>
                <option value="DYEING">Dyeing Process</option>
                <option value="SAMPLING">Sampling / NPD</option>
                <option value="GENERAL">General Production</option>
              </select>
            </div>

            {/* Product Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Output Product Name
              </label>
              <Input
                type="text"
                placeholder="e.g. 100% Combed Cotton Terry Towel 40s"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Order Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium (Normal)</option>
                <option value="HIGH">High Priority</option>
                <option value="URGENT">Urgent (Express)</option>
              </select>
            </div>

            {/* Dates */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Planned Start Date
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Target Completion Date
              </label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Status (if editing) */}
            {orderToEdit && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Lifecycle Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProductionOrderStatus)}
                  className="w-full h-9 px-3 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PLANNED">Planned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            )}
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Remarks & Production Notes
            </label>
            <textarea
              rows={2}
              placeholder="Technical specifications, weave pattern instructions, floor guidelines..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" size="sm" type="button" onClick={onClose} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="gap-1.5 w-full sm:w-auto"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              <span>{orderToEdit ? "Save Changes" : "Create Work Order"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
