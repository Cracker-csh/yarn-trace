import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Search,
  Edit2,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { apiClient } from "../../lib/axios";
import { ProductionTeam } from "../../types/production";

interface ProductionTeamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (type: "success" | "error", message: string) => void;
}

export default function ProductionTeamsModal({
  isOpen,
  onClose,
  onShowToast,
}: ProductionTeamsModalProps) {
  const [mounted, setMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTeam, setEditingTeam] = useState<ProductionTeam | null>(null);
  const [selectedTeamDetail, setSelectedTeamDetail] = useState<ProductionTeam | null>(null);

  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("SPINNING");
  const [teamLead, setTeamLead] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Fetch Teams
  const { data: teams = [], isLoading } = useQuery<ProductionTeam[]>({
    queryKey: ["production", "teams"],
    queryFn: async () => {
      const res = await apiClient.get("/production/teams?includeInactive=true");
      return res.data.data;
    },
    enabled: isOpen,
  });

  // Fetch Team Detail with Inventory Breakdown
  const { data: teamInventoryDetail, isLoading: isLoadingDetail } = useQuery<ProductionTeam>({
    queryKey: ["production", "teams", selectedTeamDetail?.id],
    queryFn: async () => {
      if (!selectedTeamDetail?.id) return null;
      const res = await apiClient.get(`/production/teams/${selectedTeamDetail.id}`);
      return res.data.data;
    },
    enabled: Boolean(selectedTeamDetail?.id),
  });

  // Reset Form
  const resetForm = () => {
    setCode("");
    setName("");
    setDepartment("SPINNING");
    setTeamLead("");
    setRemarks("");
    setIsActive(true);
    setIsCreating(false);
    setEditingTeam(null);
  };

  const handleStartEdit = (team: ProductionTeam) => {
    setEditingTeam(team);
    setCode(team.code);
    setName(team.name);
    setDepartment(team.department);
    setTeamLead(team.teamLead || "");
    setRemarks(team.remarks || "");
    setIsActive(team.isActive);
    setIsCreating(true);
  };

  // Create Team Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post("/production/teams", payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      onShowToast("success", "Production team created successfully");
      resetForm();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to create production team");
    },
  });

  // Update Team Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiClient.patch(`/production/teams/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["production", "summary"] });
      onShowToast("success", "Production team updated successfully");
      resetForm();
    },
    onError: (err: any) => {
      onShowToast("error", err?.response?.data?.message || "Failed to update production team");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast("error", "Team name is required");
      return;
    }

    if (editingTeam) {
      updateMutation.mutate({
        id: editingTeam.id,
        payload: {
          name: name.trim(),
          department: department.trim().toUpperCase(),
          teamLead: teamLead.trim() || undefined,
          remarks: remarks.trim() || undefined,
          isActive,
        },
      });
    } else {
      if (!code.trim()) {
        onShowToast("error", "Team code is required");
        return;
      }
      createMutation.mutate({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        department: department.trim().toUpperCase(),
        teamLead: teamLead.trim() || undefined,
        remarks: remarks.trim() || undefined,
        isActive,
      });
    }
  };

  if (!isOpen || !mounted) return null;

  const filteredTeams = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase()) ||
      t.department.toLowerCase().includes(search.toLowerCase()) ||
      (t.teamLead && t.teamLead.toLowerCase().includes(search.toLowerCase())),
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Production Teams Master</h2>
              <p className="text-xs text-slate-500">
                Manage floor units, team leads, active work allocations, and floor stock balances
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Top Actions & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search teams by code, name, department, or lead..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-slate-50 border-slate-200"
              />
            </div>
            {!isCreating && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  resetForm();
                  setIsCreating(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Add Production Team</span>
              </Button>
            )}
          </div>

          {/* Form (Create / Edit) */}
          {isCreating && (
            <form
              onSubmit={handleSubmit}
              className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {editingTeam ? `Edit Team: ${editingTeam.name}` : "Create New Production Team"}
                </h3>
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 text-xs">
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Team Code <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. SPIN-B, WARP-2"
                    value={code}
                    disabled={Boolean(editingTeam)}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="text-xs uppercase bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Team Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. Ring Spinning Team Bravo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-xs bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department / Stage <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-9 px-3 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                  >
                    <option value="SPINNING">Spinning</option>
                    <option value="WARPING">Warping</option>
                    <option value="WEAVING">Weaving</option>
                    <option value="KNITTING">Knitting</option>
                    <option value="DYEING_HOUSE">Dyeing House</option>
                    <option value="FINISHING">Finishing / Inspection</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Responsible Lead</label>
                  <Input
                    type="text"
                    placeholder="e.g. Mahesh Patel"
                    value={teamLead}
                    onChange={(e) => setTeamLead(e.target.value)}
                    className="text-xs bg-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Remarks / Location</label>
                  <Input
                    type="text"
                    placeholder="e.g. Air-jet Loom Shed 2, Floor B"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                  <span>Active for Work Orders & Allocations</span>
                </label>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="gap-1.5"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>{editingTeam ? "Save Changes" : "Create Team"}</span>
                  </Button>
                </div>
              </div>
            </form>
          )}

          {/* Teams Table */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full min-w-[700px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Code & Team Name</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Responsible Lead</th>
                  <th className="py-3 px-4 text-center">Active Orders</th>
                  <th className="py-3 px-4 text-right">Floor Stock (KG)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
                      Loading production teams...
                    </td>
                  </tr>
                ) : filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      No production teams found. Click &quot;+ Add Production Team&quot; to register one.
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team) => (
                    <tr
                      key={team.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedTeamDetail(team)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                            {team.code}
                          </span>
                          <span className="font-semibold text-slate-900">{team.name}</span>
                        </div>
                        {team.remarks && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">
                            {team.remarks}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {team.department}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {team.teamLead || "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700">
                          {team.activeOrdersCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {team.currentStockKg.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}{" "}
                        <span className="text-[10px] text-slate-500">KG</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {team.isActive ? (
                          <Badge variant="success" className="text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleStartEdit(team)}
                            className="h-7 px-2 text-slate-600 hover:text-slate-900"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTeamDetail(team)}
                            className="h-7 px-2 text-xs text-brand-600 border-brand-200 hover:bg-brand-50"
                          >
                            Inventory
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Selected Team Inventory Breakdown Drawer */}
          {selectedTeamDetail && (
            <div className="border border-brand-200 bg-brand-50/20 rounded-xl p-5 space-y-4 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Team Inventory Breakdown: {selectedTeamDetail.name} ({selectedTeamDetail.code})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Live floor balances derived from Yarn Allocations minus Actual Consumed and Returned
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTeamDetail(null)}
                  className="h-7 text-xs text-slate-500 hover:text-slate-800"
                >
                  Close Breakdown
                </Button>
              </div>

              {isLoadingDetail ? (
                <div className="py-4 text-center text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-600" />
                </div>
              ) : teamInventoryDetail?.inventoryBreakdown &&
                teamInventoryDetail.inventoryBreakdown.length > 0 ? (
                <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                  <table className="w-full min-w-[650px] text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold text-[11px]">
                        <th className="py-2.5 px-3">Lot Number</th>
                        <th className="py-2.5 px-3">Yarn Count</th>
                        <th className="py-2.5 px-3 text-right">Allocated (KG)</th>
                        <th className="py-2.5 px-3 text-right">Consumed (KG)</th>
                        <th className="py-2.5 px-3 text-right">Returned (KG)</th>
                        <th className="py-2.5 px-3 text-right font-bold text-brand-700">
                          Current Team Stock (KG)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {teamInventoryDetail.inventoryBreakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {item.lotNumber}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{item.yarnCount}</td>
                          <td className="py-2.5 px-3 text-right">{item.allocatedKg.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right text-amber-600">
                            {item.consumedKg.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-600">
                            {item.returnedKg.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 bg-amber-50/50">
                            {item.availableBalanceKg.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg">
                  No yarn currently allocated to this team.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
