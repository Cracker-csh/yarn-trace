"use client";

import React, { useState } from "react";
import {
  Boxes,
  Factory,
  Copy,
  Check,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Layers,
  Scale,
  Building2,
  Clock,
  Sparkles,
  Eye,
} from "lucide-react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

export interface KanbanItem {
  id: string;
  type: "LOT" | "ORDER" | "ISSUE";
  referenceNumber: string;
  title: string; // e.g. "GREY Cotton Yarn 30s"
  subtitle?: string; // e.g. "Mill Lot: #492" or "Party: Vardhman"
  lotNumber?: string;
  orderNumber?: string;
  weightKg: number;
  bagsCount?: number;
  locationOrDepartment: string;
  assignedTo?: string | null;
  stageId: string;
  status: string;
  updatedAt?: string;
  rawPayload: any;
}

interface StockKanbanCardProps {
  item: KanbanItem;
  isDragging?: boolean;
  onDragStart: (e: React.DragEvent, item: KanbanItem) => void;
  onActionClick: (item: KanbanItem, actionType: string) => void;
  onCardClick?: (item: KanbanItem) => void;
  isReadOnly?: boolean;
}

export default function StockKanbanCard({
  item,
  isDragging = false,
  onDragStart,
  onActionClick,
  onCardClick,
  isReadOnly = false,
}: StockKanbanCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy = item.lotNumber || item.referenceNumber;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStageAction = () => {
    switch (item.stageId) {
      case "opening_received":
        return {
          label: "Allocate",
          action: "allocate",
          color: "bg-slate-900 text-white hover:bg-slate-800",
        };
      case "available_stock":
        return {
          label: "Allocate to Floor",
          action: "allocate",
          color: "bg-purple-600 text-white hover:bg-purple-700 shadow-sm",
        };
      case "pending_allocation":
        return {
          label: "Assign Order",
          action: "assign_order",
          color: "bg-amber-600 text-white hover:bg-amber-700",
        };
      case "allocated_production":
        return {
          label: "Start Production",
          action: "start_order",
          color: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
        };
      case "in_production":
        return {
          label: "Floor Ops",
          action: "floor_ops",
          color: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
        };
      case "reconciliation_qc":
        return {
          label: "Complete Order",
          action: "complete_order",
          color: "bg-indigo-600 text-white hover:bg-indigo-700",
        };
      case "completed_closed":
        return {
          label: "View Trace",
          action: "view_trace",
          color: "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300",
        };
      default:
        return {
          label: "Details",
          action: "details",
          color: "bg-slate-100 text-slate-700 hover:bg-slate-200",
        };
    }
  };

  const action = getStageAction();

  return (
    <div
      draggable={!isReadOnly}
      onDragStart={(e) => {
        if (!isReadOnly) onDragStart(e, item);
      }}
      onClick={() => onCardClick?.(item)}
      className={`group relative rounded-xl border bg-white p-3.5 shadow-sm transition-all duration-200 hover:shadow-md select-none ${
        isReadOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${
        isDragging
          ? "opacity-50 ring-2 ring-primary scale-95 border-primary shadow-xl"
          : "border-slate-200/80 hover:border-slate-300"
      }`}
    >
      {/* Top Header: Reference & Status */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-xs font-bold text-slate-800 tracking-tight truncate">
            {item.referenceNumber}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Copy reference number"
          >
            {copied ? (
              <Check className="h-3 w-3 text-emerald-600" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>

        <Badge
          variant="outline"
          className="text-[10px] font-semibold uppercase tracking-wider py-0 px-2 shrink-0 border-slate-200 text-slate-600 bg-slate-50"
        >
          {item.status}
        </Badge>
      </div>

      {/* Main Content: Title & Count */}
      <div className="mb-3">
        <h4 className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors line-clamp-1">
          {item.title}
        </h4>
        {item.subtitle && (
          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
            {item.subtitle}
          </p>
        )}
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 gap-2 mb-3 bg-slate-50/80 rounded-lg p-2 border border-slate-100">
        <div>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
            Quantity
          </span>
          <span className="font-mono text-xs font-bold text-slate-900 flex items-center gap-1 mt-0.5">
            <Scale className="h-3 w-3 text-primary shrink-0" />
            {item.weightKg.toLocaleString("en-IN", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 2,
            })}{" "}
            KG
          </span>
        </div>

        <div>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block">
            Packaging
          </span>
          <span className="font-mono text-xs font-bold text-slate-700 flex items-center gap-1 mt-0.5">
            <Boxes className="h-3 w-3 text-slate-400 shrink-0" />
            {item.bagsCount ?? 0} Bags
          </span>
        </div>
      </div>

      {/* Location / Department Footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 mb-3">
        <div className="flex items-center gap-1.5 truncate">
          <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
          <span className="truncate font-medium">{item.locationOrDepartment}</span>
        </div>
        {item.assignedTo && (
          <span className="shrink-0 text-slate-600 font-medium bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
            {item.assignedTo}
          </span>
        )}
      </div>

      {/* One Clear Next Action Button */}
      {isReadOnly ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onCardClick?.(item);
          }}
          className="w-full h-7 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <Eye className="h-3 w-3 shrink-0 text-slate-400" />
          <span>View Details</span>
        </Button>
      ) : (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onActionClick(item, action.action);
          }}
          className={`w-full h-7 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 ${action.color}`}
        >
          <span>{action.label}</span>
          <ArrowRight className="h-3 w-3 shrink-0" />
        </Button>
      )}
    </div>
  );
}
