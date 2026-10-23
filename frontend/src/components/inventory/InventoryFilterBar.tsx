import React from "react";
import { Search, RotateCcw, Filter } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Party, InventoryFilters, TransactionType } from "../../types/inventory";

interface InventoryFilterBarProps {
  filters: InventoryFilters;
  parties: Party[];
  onFilterChange: (newFilters: Partial<InventoryFilters>) => void;
  onReset: () => void;
  activeTab: "lots" | "transactions" | "counts" | "parties";
}

export default function InventoryFilterBar({
  filters,
  parties,
  onFilterChange,
  onReset,
  activeTab,
}: InventoryFilterBarProps) {
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.count ||
      filters.partyId ||
      filters.lotNumber ||
      filters.type ||
      filters.purpose ||
      filters.poNumber ||
      filters.startDate ||
      filters.endDate
  );

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-6 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filters & Search
          </span>
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Filters</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* 1. Global Search */}
        <div className="relative lg:col-span-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search lot, count, party, PO#..."
            value={filters.search || ""}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="pl-8 text-xs h-9 bg-background"
          />
        </div>

        {/* 2. Yarn Count Filter (Manual input) */}
        <div>
          <Input
            placeholder="Filter Count (e.g. 1/10 KW)"
            value={filters.count || ""}
            onChange={(e) => onFilterChange({ count: e.target.value })}
            className="text-xs h-9 bg-background"
          />
        </div>

        {/* 3. Party Master Dropdown */}
        <div>
          <select
            value={filters.partyId || ""}
            onChange={(e) => onFilterChange({ partyId: e.target.value || undefined })}
            className="w-full text-xs h-9 px-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Parties / Mills</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        {/* 4. Transaction Type (shown on transactions tab) or Purpose */}
        {activeTab === "transactions" ? (
          <div>
            <select
              value={filters.type || ""}
              onChange={(e) =>
                onFilterChange({
                  type: (e.target.value as TransactionType) || undefined,
                })
              }
              className="w-full text-xs h-9 px-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Types</option>
              <option value="OPENING">OPENING</option>
              <option value="RECEIVED">RECEIVED</option>
              <option value="ISSUED">ISSUED</option>
              <option value="RETURN">RETURN</option>
              <option value="RETIRED">RETIRED</option>
              <option value="SOLD">SOLD</option>
              <option value="CORRECTION">CORRECTION</option>
            </select>
          </div>
        ) : (
          <div>
            <Input
              placeholder="Filter Lot Number"
              value={filters.lotNumber || ""}
              onChange={(e) => onFilterChange({ lotNumber: e.target.value })}
              className="text-xs h-9 bg-background"
            />
          </div>
        )}

        {/* 5. Purpose */}
        <div>
          <select
            value={filters.purpose || ""}
            onChange={(e) =>
              onFilterChange({ purpose: e.target.value || undefined })
            }
            className="w-full text-xs h-9 px-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Purposes</option>
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
        </div>
      </div>

      {/* Date Range on Transactions Tab */}
      {activeTab === "transactions" && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50">
          <span className="text-xs text-muted-foreground font-medium">Date Range:</span>
          <Input
            type="date"
            value={filters.startDate || ""}
            onChange={(e) => onFilterChange({ startDate: e.target.value || undefined })}
            className="w-36 text-xs h-8 bg-background"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={filters.endDate || ""}
            onChange={(e) => onFilterChange({ endDate: e.target.value || undefined })}
            className="w-36 text-xs h-8 bg-background"
          />
        </div>
      )}
    </div>
  );
}
