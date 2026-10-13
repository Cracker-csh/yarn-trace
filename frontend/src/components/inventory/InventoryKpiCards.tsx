import React from "react";
import { Boxes, Package, Factory, Building2, TrendingUp } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { StockSummary } from "../../types/inventory";

interface InventoryKpiCardsProps {
  summary?: StockSummary;
  isLoading: boolean;
}

export default function InventoryKpiCards({ summary, isLoading }: InventoryKpiCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  const totalKg = summary?.totalWeightKg || 0;
  const totalBags = summary?.totalBags || 0;
  const activeLots = summary?.activeLotsCount || 0;
  const totalParties = summary?.totalParties || 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Total Weight */}
      <Card className="border-l-4 border-l-primary shadow-sm hover:shadow-md card-interactive stagger-1 min-w-0">
        <CardContent className="p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              Total In-Stock Weight
            </p>
            <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
              <span className="text-xl sm:text-2xl font-bold font-heading text-foreground tabular-nums break-words">
                {totalKg.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold text-primary shrink-0">KG</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
              <TrendingUp className="h-3 w-3 text-emerald-600 shrink-0" />
              <span>Live warehouse balance</span>
            </p>
          </div>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Package className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* 2. Total Bags */}
      <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md card-interactive stagger-2 min-w-0">
        <CardContent className="p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              Total Bags Count
            </p>
            <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
              <span className="text-xl sm:text-2xl font-bold font-heading text-foreground tabular-nums break-words">
                {totalBags.toLocaleString("en-IN")}
              </span>
              <span className="text-xs font-semibold text-amber-600 shrink-0">Bags</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Available standard bags
            </p>
          </div>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
            <Boxes className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* 3. Active Lots */}
      <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow-md card-interactive stagger-3 min-w-0">
        <CardContent className="p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              Active Lots
            </p>
            <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
              <span className="text-xl sm:text-2xl font-bold font-heading text-foreground tabular-nums break-words">
                {activeLots}
              </span>
              <span className="text-xs font-semibold text-blue-600 shrink-0">Lots</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Lots with positive balance
            </p>
          </div>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
            <Factory className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>

      {/* 4. Active Parties / Mills */}
      <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md card-interactive stagger-4 min-w-0">
        <CardContent className="p-4 flex items-center justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              Parties & Mills
            </p>
            <div className="flex items-baseline gap-1.5 mt-1 min-w-0">
              <span className="text-xl sm:text-2xl font-bold font-heading text-foreground tabular-nums break-words">
                {totalParties}
              </span>
              <span className="text-xs font-semibold text-purple-600 shrink-0">Active</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              Suppliers, mills & customers
            </p>
          </div>
          <div className="h-10 w-10 shrink-0 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
            <Building2 className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
