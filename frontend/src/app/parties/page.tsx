    "use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Building2,
  Plus,
  Search,
  Users2,
  Factory,
  Layers,
  Phone,
  Mail,
  Edit2,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { apiClient } from "../../lib/axios";
import dynamic from "next/dynamic";
import { Party } from "../../types/inventory";
import type { PartyFormValues } from "../../components/parties/PartyModal";
import { usePermissions } from "../../hooks/usePermissions";
const PartyModal = dynamic(() => import("../../components/parties/PartyModal"), { ssr: false });

export default function PartiesPage() {
  const queryClient = useQueryClient();
  const { isReadOnly, canManageParties } = usePermissions();

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showInactive, setShowInactive] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // 1. FETCH PARTIES FROM BACKEND
  // ---------------------------------------------------------------------------
  const {
    data: parties = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<Party[]>({
    queryKey: ["parties", showInactive],
    queryFn: async () => {
      const res = await apiClient.get("/parties", {
        params: { includeInactive: showInactive },
      });
      return res.data.data;
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(canManageParties),
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // 2. MUTATIONS
  // ---------------------------------------------------------------------------
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const createPartyMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => apiClient.post("/parties", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Commercial partner created successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to create party");
    },
  });

  const updatePartyMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      apiClient.patch(`/parties/${id}`, values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "Party details updated successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to update party");
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/parties/${id}`, { isActive }),
    onSuccess: (_, variables) => {
      invalidateAll();
      showToast(
        "success",
        variables.isActive
          ? "Party reactivated successfully!"
          : "Party deactivated successfully."
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast("error", err.response?.data?.message || "Failed to change party status");
    },
  });

  // ---------------------------------------------------------------------------
  // 3. FILTERED PARTIES & METRICS
  // ---------------------------------------------------------------------------
  const filteredParties = useMemo(() => {
    return parties.filter((party) => {
      // Type filter
      if (typeFilter !== "ALL" && party.type !== typeFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = party.name.toLowerCase().includes(query);
        const matchesCode = party.code.toLowerCase().includes(query);
        const matchesContact = party.contactPerson?.toLowerCase().includes(query) ?? false;
        const matchesEmail = party.email?.toLowerCase().includes(query) ?? false;
        if (!matchesName && !matchesCode && !matchesContact && !matchesEmail) {
          return false;
        }
      }
      return true;
    });
  }, [parties, typeFilter, searchTerm]);

  // Summary counts
  const totalCount = parties.length;
  const suppliersCount = parties.filter((p) => p.type === "SUPPLIER").length;
  const dyeingCount = parties.filter((p) => p.type === "DYEING_MILL").length;
  const customersCount = parties.filter((p) => p.type === "CUSTOMER").length;

  const handleOpenCreateModal = () => {
    setEditingParty(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (party: Party) => {
    setEditingParty(party);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (values: PartyFormValues) => {
    // For create: empty optional fields → undefined (omitted from payload, skips @IsOptional)
    // For edit: empty optional fields → null (tells backend to clear the field)
    const emptyVal = editingParty ? null : undefined;
    const { code, ...rest } = values;
    const cleaned = {
      ...(editingParty ? rest : values), // exclude code on edit (immutable)
      contactPerson: values.contactPerson?.trim() || emptyVal,
      email: values.email?.trim() || emptyVal,
      phone: values.phone?.trim() || emptyVal,
      address: values.address?.trim() || emptyVal,
      gstNumber: values.gstNumber?.trim() || emptyVal,
    };
    if (editingParty) {
      await updatePartyMutation.mutateAsync({ id: editingParty.id, values: cleaned });
    } else {
      await createPartyMutation.mutateAsync(cleaned);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "SUPPLIER":
        return <Badge variant="success">Spinning Mill</Badge>;
      case "CUSTOMER":
        return <Badge variant="brand">Customer / Buyer</Badge>;
      case "DYEING_MILL":
        return (
          <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
            Dyeing Unit
          </Badge>
        );
      case "JOB_WORKER":
        return <Badge variant="secondary">Job Worker</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold ${
              toast.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-red-50 border-red-200 text-red-900"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Parties, Suppliers & Dyeing Mills"
        subtitle="Manage supplier master directory, customers, external dyeing mills, and logistics partners."
        action={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-9"
              title="Refresh Parties"
            >
              <RotateCw
                className={`h-3.5 w-3.5 text-slate-500 ${isFetching ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            {isReadOnly && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                <span>Read-Only Mode</span>
              </div>
            )}
            {canManageParties && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateModal}
                className="gap-1.5 h-9"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add New Party</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Error Alert */}
      {isError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>
              Failed to load parties directory:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            className="h-8 text-xs bg-white text-red-700 hover:bg-red-50 border-red-300"
          >
            Retry
          </Button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-brand-600 card-interactive stagger-1 min-w-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                Total Partners
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : totalCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-orange-50 text-orange-600 border border-orange-100 shrink-0">
              <Users2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium truncate">All master directory entries</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-emerald-600 card-interactive stagger-2 min-w-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                Spinning Mills
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : suppliersCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
              <Factory className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium truncate">Yarn spinning & fiber suppliers</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-sky-600 card-interactive stagger-3 min-w-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                Dyeing Units
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : dyeingCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-sky-50 text-sky-600 border border-sky-100 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium truncate">External process houses</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-purple-600 card-interactive stagger-4 min-w-0">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 truncate">
                Customers / Buyers
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : customersCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-100 shrink-0">
              <Layers className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium truncate">Commercial export clients</p>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Directory of Commercial Partners</CardTitle>
              <CardDescription>
                Authoritative Party Master for inward receipts, external sales, and stage handoffs
              </CardDescription>
            </div>
            <Badge variant="secondary" className="font-mono text-xs self-start sm:self-auto">
              {filteredParties.length} {filteredParties.length === 1 ? "Partner" : "Partners"}
            </Badge>
          </div>

          {/* Search and Filters Bar */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-100">
            <div className="sm:col-span-6 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by company name, code, contact person, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-slate-50/70 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="ALL">All Partner Types</option>
                <option value="SUPPLIER">Spinning Mills (Suppliers)</option>
                <option value="CUSTOMER">Customers (Buyers)</option>
                <option value="DYEING_MILL">Dyeing & Processing Units</option>
                <option value="JOB_WORKER">Job Workers / Subcontractors</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex items-center">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
                />
                <span>Include Inactive</span>
              </label>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredParties.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[800px] text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Company Name</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Contact Person</th>
                    <th className="py-3 px-3">Email & Phone</th>
                    <th className="py-3 px-3 text-center">Linked Records</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {filteredParties.map((party) => {
                    const suppliedLots = party._count?.suppliedLots ?? 0;
                    const transactionsCount = party._count?.transactions ?? 0;

                    return (
                      <tr
                        key={party.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          !party.isActive ? "opacity-60 bg-slate-50/40" : ""
                        }`}
                      >
                        {/* Party Code */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800 text-[11px]">
                            {party.code}
                          </span>
                        </td>

                        {/* Company Name */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{party.name}</div>
                          {party.gstNumber && (
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              GST: {party.gstNumber}
                            </div>
                          )}
                        </td>

                        {/* Type */}
                        <td className="py-3.5 px-3">{getTypeBadge(party.type)}</td>

                        {/* Contact Person */}
                        <td className="py-3.5 px-3">
                          {party.contactPerson ? (
                            <span className="font-semibold text-slate-800">
                              {party.contactPerson}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">Not specified</span>
                          )}
                        </td>

                        {/* Email & Phone */}
                        <td className="py-3.5 px-3 space-y-1">
                          {party.email ? (
                            <a
                              href={`mailto:${party.email}`}
                              className="flex items-center gap-1.5 text-slate-600 hover:text-brand-600 truncate max-w-[170px]"
                              title={party.email}
                            >
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate">{party.email}</span>
                            </a>
                          ) : null}
                          {party.phone ? (
                            <a
                              href={`tel:${party.phone}`}
                              className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 hover:text-brand-600"
                            >
                              <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                              <span>{party.phone}</span>
                            </a>
                          ) : null}
                          {!party.email && !party.phone && (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>

                        {/* Linked Records */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-mono text-slate-700">
                            <span>{suppliedLots} lots</span>
                            <span>•</span>
                            <span>{transactionsCount} txns</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-3 text-center">
                          {party.isActive ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditModal(party)}
                            className="h-8 px-2.5 text-xs gap-1"
                            title="Edit Party Details"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: party.id,
                                isActive: !party.isActive,
                              })
                            }
                            className={`h-8 px-2 text-xs ${
                              party.isActive
                                ? "text-slate-500 hover:text-red-600 hover:bg-red-50"
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            }`}
                            title={party.isActive ? "Deactivate Party" : "Reactivate Party"}
                          >
                            {party.isActive ? (
                              <ToggleRight className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-slate-400" />
                            )}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                searchTerm || typeFilter !== "ALL"
                  ? "No matching partners found"
                  : "No commercial parties registered yet"
              }
              description={
                searchTerm || typeFilter !== "ALL"
                  ? "Try clearing or adjusting your search filters to find commercial partners."
                  : "Add spinning mills, dyeing units, or customers to record incoming yarn shipments and dispatches."
              }
              icon={Building2}
              actionLabel={
                searchTerm || typeFilter !== "ALL" ? "Clear Filters" : "+ Add Supplier / Customer"
              }
              onAction={
                searchTerm || typeFilter !== "ALL"
                  ? () => {
                      setSearchTerm("");
                      setTypeFilter("ALL");
                    }
                  : handleOpenCreateModal
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Party Modal */}
      <PartyModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingParty(null);
        }}
        onSubmit={handleFormSubmit}
        editingParty={editingParty}
        isLoading={createPartyMutation.isPending || updatePartyMutation.isPending}
      />
    </AppLayout>
  );
}
