import React from "react";
import { Search, RotateCcw } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { ProductionTeam, ProductionOrderStatus } from "../../types/production";
import { Party } from "../../types/inventory";

interface ProductionFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: ProductionOrderStatus | "";
  onStatusChange: (status: ProductionOrderStatus | "") => void;
  teamId: string;
  onTeamChange: (teamId: string) => void;
  partyId: string;
  onPartyChange: (partyId: string) => void;
  teams: ProductionTeam[];
  parties: Party[];
  onReset: () => void;
}

export default function ProductionFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  teamId,
  onTeamChange,
  partyId,
  onPartyChange,
  teams,
  parties,
  onReset,
}: ProductionFiltersProps) {
  const hasActiveFilters = Boolean(search || status || teamId || partyId);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 min-w-0 w-full md:min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search work order #, lot, count, party, PO..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 text-xs bg-slate-50/50 border-slate-200 focus:bg-white h-9 w-full"
        />
      </div>

      {/* Filter Dropdowns */}
      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
        {/* Status Filter */}
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as ProductionOrderStatus | "")}
          className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white cursor-pointer flex-1 sm:flex-none"
        >
          <option value="">All Statuses</option>
          <option value="PLANNED">Planned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="DRAFT">Draft</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        {/* Team Filter */}
        <select
          value={teamId}
          onChange={(e) => onTeamChange(e.target.value)}
          className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white cursor-pointer flex-1 sm:flex-none max-w-full sm:max-w-[180px] truncate"
        >
          <option value="">All Teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.department})
            </option>
          ))}
        </select>

        {/* Party Filter */}
        <select
          value={partyId}
          onChange={(e) => onPartyChange(e.target.value)}
          className="h-9 px-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white cursor-pointer flex-1 sm:flex-none max-w-full sm:max-w-[180px] truncate"
        >
          <option value="">All Commercial Parties</option>
          {parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Reset Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 px-2.5 text-xs text-slate-500 hover:text-slate-800 gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </Button>
        )}
      </div>
    </div>
  );
}
