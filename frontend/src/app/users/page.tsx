"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserCog,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Users2,
  Mail,
  Phone,
  Edit2,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
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
import { SystemUser, RoleListItem } from "../../types/governance";
import type {
  CreateUserFormValues,
  EditUserFormValues,
} from "../../components/governance/UserModal";
const UserModal = dynamic(() => import("../../components/governance/UserModal"), { ssr: false });
const ResetPasswordModal = dynamic(() => import("../../components/governance/ResetPasswordModal"), { ssr: false });

export default function UsersPage() {
  const queryClient = useQueryClient();

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  // Password reset modal and temporary credentials state
  const [resettingUser, setResettingUser] = useState<SystemUser | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [revealedTempUsers, setRevealedTempUsers] = useState<Record<string, boolean>>({});
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

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
  // 1. FETCH USERS FROM BACKEND
  // ---------------------------------------------------------------------------
  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<SystemUser[]>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await apiClient.get("/users");
      return res.data.data;
    },
    staleTime: 30_000,
  });

  // ---------------------------------------------------------------------------
  // 2. FETCH ROLES FOR DROPDOWN
  // ---------------------------------------------------------------------------
  const { data: roles = [] } = useQuery<RoleListItem[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await apiClient.get("/roles");
      return res.data.data;
    },
    staleTime: 60_000,
  });

  // ---------------------------------------------------------------------------
  // 3. MUTATIONS
  // ---------------------------------------------------------------------------
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const createUserMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      apiClient.post("/users", values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "User account created successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to create user"
      );
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Record<string, unknown>;
    }) => apiClient.patch(`/users/${id}`, values),
    onSuccess: () => {
      invalidateAll();
      showToast("success", "User details updated successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update user"
      );
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.patch(`/users/${id}/status`, { status }),
    onSuccess: (_, variables) => {
      invalidateAll();
      showToast(
        "success",
        variables.status === "ACTIVE"
          ? "User account activated successfully!"
          : "User account deactivated."
      );
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      showToast(
        "error",
        err.response?.data?.message || "Failed to change user status"
      );
    },
  });

  // ---------------------------------------------------------------------------
  // 4. FILTERED USERS & METRICS
  // ---------------------------------------------------------------------------
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      // Role filter
      if (roleFilter !== "ALL" && user.role.code !== roleFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== "ALL" && user.status !== statusFilter) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesName = `${user.firstName} ${user.lastName}`
          .toLowerCase()
          .includes(query);
        const matchesEmail = user.email.toLowerCase().includes(query);
        const matchesPhone = user.phoneNumber?.toLowerCase().includes(query) ?? false;
        if (!matchesName && !matchesEmail && !matchesPhone) {
          return false;
        }
      }
      return true;
    });
  }, [users, roleFilter, statusFilter, searchTerm]);

  // Summary counts
  const totalCount = users.length;
  const activeCount = users.filter((u) => u.status === "ACTIVE").length;
  const adminCount = users.filter((u) => u.role.code === "ADMIN").length;
  const inactiveCount = users.filter(
    (u) => u.status === "INACTIVE" || u.status === "SUSPENDED"
  ).length;

  // Unique role codes for filter dropdown
  const uniqueRoles = useMemo(() => {
    const roleMap = new Map<string, string>();
    users.forEach((u) => roleMap.set(u.role.code, u.role.name));
    return Array.from(roleMap.entries());
  }, [users]);

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: SystemUser) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (
    values: CreateUserFormValues | EditUserFormValues
  ) => {
    if (editingUser) {
      const editValues = values as EditUserFormValues;
      const cleaned: Record<string, unknown> = {
        firstName: editValues.firstName,
        lastName: editValues.lastName,
        phoneNumber: editValues.phoneNumber?.trim() || null,
        roleId: editValues.roleId,
      };
      await updateUserMutation.mutateAsync({
        id: editingUser.id,
        values: cleaned,
      });
    } else {
      const createValues = values as CreateUserFormValues;
      await createUserMutation.mutateAsync(createValues);
    }
  };

  const handleOpenResetModal = (user: SystemUser) => {
    setResettingUser(user);
    setIsResetModalOpen(true);
  };

  const handleResetSuccess = (userId: string, temporaryPassword: string) => {
    setTempPasswords((prev) => ({ ...prev, [userId]: temporaryPassword }));
    showToast("success", "Temporary password generated and active sessions revoked.");
  };

  const toggleRevealTempPassword = (userId: string) => {
    setRevealedTempUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleCopyTempPassword = async (userId: string, pass: string) => {
    try {
      await navigator.clipboard.writeText(pass);
      setCopiedUserId(userId);
      setTimeout(() => setCopiedUserId(null), 2000);
    } catch {
      setCopiedUserId(userId);
      setTimeout(() => setCopiedUserId(null), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case "INACTIVE":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
            Inactive
          </span>
        );
      case "SUSPENDED":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            Suspended
          </span>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoleBadge = (roleCode: string, roleName: string) => {
    switch (roleCode) {
      case "ADMIN":
        return (
          <Badge variant="brand" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            {roleName}
          </Badge>
        );
      case "STOCK_HEAD":
        return <Badge variant="success">{roleName}</Badge>;
      case "PRODUCTION_HEAD":
        return (
          <Badge
            variant="secondary"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            {roleName}
          </Badge>
        );
      case "QUALITY_HEAD":
        return (
          <Badge
            variant="secondary"
            className="bg-purple-50 text-purple-700 border-purple-200"
          >
            {roleName}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{roleName}</Badge>;
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
        title="User Accounts & Access Management"
        subtitle="Manage operators, stock heads, production managers, and system administrators."
        action={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5 h-9"
              title="Refresh Users"
            >
              <RotateCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isFetching ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateModal}
              className="gap-1.5 h-9"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add User Account</span>
            </Button>
          </div>
        }
      />

      {/* Error Alert */}
      {isError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-900">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            <span>
              Failed to load users:{" "}
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
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total Users
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : totalCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-brand-50 text-brand-600 border border-brand-100 shrink-0">
              <Users2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            All registered system users
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-emerald-600 card-interactive stagger-2 min-w-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Active Users
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : activeCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Currently active accounts
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-purple-600 card-interactive stagger-3 min-w-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Administrators
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 break-words">
                {isLoading ? <Skeleton className="h-7 w-12" /> : adminCount}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-100 shrink-0">
              <Shield className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Users with admin access
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card border-l-4 border-l-slate-400 card-interactive stagger-4 min-w-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Inactive / Suspended
              </p>
              <h3 className="font-display text-2xl font-bold text-slate-900 mt-1 break-words">
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  inactiveCount
                )}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
              <XCircle className="h-5 w-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            Deactivated accounts
          </p>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>System Users</CardTitle>
              <CardDescription>
                Registered staff members and their active operational roles
              </CardDescription>
            </div>
            <Badge
              variant="secondary"
              className="font-mono text-xs self-start sm:self-auto"
            >
              {filteredUsers.length}{" "}
              {filteredUsers.length === 1 ? "User" : "Users"}
            </Badge>
          </div>

          {/* Search and Filters Bar */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-100">
            <div className="sm:col-span-5 relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs bg-slate-50/70 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="ALL">All Roles</option>
                {uniqueRoles.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-xs h-9 px-3 rounded-lg border border-slate-300 bg-slate-50/70 hover:bg-slate-50 focus:bg-white text-slate-800 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
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
          ) : filteredUsers.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[900px] text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Phone</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3">Password</th>
                    <th className="py-3 px-3">Joined</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        user.status !== "ACTIVE"
                          ? "opacity-60 bg-slate-50/40"
                          : ""
                      }`}
                    >
                      {/* Name */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700 font-bold text-[11px] border border-brand-100 shrink-0">
                            {user.firstName[0]}
                            {user.lastName[0]}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-sm">
                              {user.firstName} {user.lastName}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-3">
                        <a
                          href={`mailto:${user.email}`}
                          className="flex items-center gap-1.5 text-slate-600 hover:text-brand-600 truncate max-w-[200px]"
                          title={user.email}
                        >
                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{user.email}</span>
                        </a>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-3">
                        {user.phoneNumber ? (
                          <a
                            href={`tel:${user.phoneNumber}`}
                            className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 hover:text-brand-600"
                          >
                            <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>{user.phoneNumber}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">
                            —
                          </span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-3">
                        {getRoleBadge(user.role.code, user.role.name)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 text-center">
                        {getStatusBadge(user.status)}
                      </td>

                      {/* Password */}
                      <td className="py-3.5 px-3">
                        {tempPasswords[user.id] ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/90 rounded-md px-2 py-1 max-w-[170px]">
                              <span className="font-mono text-xs font-bold text-slate-800 tracking-wider truncate">
                                {revealedTempUsers[user.id]
                                  ? tempPasswords[user.id]
                                  : "••••••••"}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleRevealTempPassword(user.id)}
                                aria-label={
                                  revealedTempUsers[user.id]
                                    ? "Hide temporary password"
                                    : "Show temporary password"
                                }
                                title={
                                  revealedTempUsers[user.id]
                                    ? "Hide temporary password"
                                    : "Show temporary password"
                                }
                                className="text-amber-700 hover:text-amber-900 p-0.5 rounded transition-colors shrink-0 ml-1"
                              >
                                {revealedTempUsers[user.id] ? (
                                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyTempPassword(user.id, tempPasswords[user.id])
                                }
                                aria-label="Copy temporary password"
                                title="Copy temporary password"
                                className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors shrink-0"
                              >
                                {copiedUserId === user.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </button>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenResetModal(user)}
                              className="h-7 px-1.5 text-[11px] text-slate-500 hover:text-brand-700 hover:bg-brand-50"
                              title="Re-issue temporary password"
                            >
                              <KeyRound className="h-3.5 w-3.5 text-amber-600" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 text-slate-400 bg-slate-50 border border-slate-200/60 rounded-md px-2 py-1">
                              <span className="font-mono text-[11px] select-none tracking-widest text-slate-400">
                                ••••••••
                              </span>
                              <button
                                type="button"
                                disabled
                                aria-label="Cryptographic hash cannot be revealed"
                                title="Stored as cryptographic bcrypt hash and cannot be revealed. Click Reset to issue a temporary password."
                                className="text-slate-300 cursor-not-allowed p-0.5 rounded"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenResetModal(user)}
                              className="h-7 px-2 text-[11px] gap-1 text-slate-700 hover:text-brand-700 hover:border-brand-300 hover:bg-brand-50/50"
                              title="Reset password and issue temporary credential"
                            >
                              <KeyRound className="h-3 w-3 text-brand-600" />
                              <span>Reset</span>
                            </Button>
                          </div>
                        )}
                      </td>

                      {/* Joined */}
                      <td className="py-3.5 px-3 text-slate-500 text-[11px] font-mono">
                        {new Date(user.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditModal(user)}
                          className="h-8 px-2.5 text-xs gap-1"
                          title="Edit User Details"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleStatusMutation.mutate({
                              id: user.id,
                              status:
                                user.status === "ACTIVE"
                                  ? "INACTIVE"
                                  : "ACTIVE",
                            })
                          }
                          className={`h-8 px-2 text-xs ${
                            user.status === "ACTIVE"
                              ? "text-slate-500 hover:text-red-600 hover:bg-red-50"
                              : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          }`}
                          title={
                            user.status === "ACTIVE"
                              ? "Deactivate User"
                              : "Activate User"
                          }
                        >
                          {user.status === "ACTIVE" ? (
                            <ToggleRight className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-slate-400" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                searchTerm || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "No matching users found"
                  : "No user accounts registered yet"
              }
              description={
                searchTerm || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "Try clearing or adjusting your search filters to find users."
                  : "Create user accounts to manage system access for staff members."
              }
              icon={UserPlus}
              actionLabel={
                searchTerm || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? "Clear Filters"
                  : "+ Create User Account"
              }
              onAction={
                searchTerm || roleFilter !== "ALL" || statusFilter !== "ALL"
                  ? () => {
                      setSearchTerm("");
                      setRoleFilter("ALL");
                      setStatusFilter("ALL");
                    }
                  : handleOpenCreateModal
              }
            />
          )}
        </CardContent>
      </Card>

      {/* Add / Edit User Modal */}
      <UserModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingUser(null);
        }}
        onSubmit={handleFormSubmit}
        editingUser={editingUser}
        roles={roles}
        isLoading={
          createUserMutation.isPending || updateUserMutation.isPending
        }
      />

      {/* Secure Password Reset Modal */}
      <ResetPasswordModal
        isOpen={isResetModalOpen}
        onClose={() => {
          setIsResetModalOpen(false);
          setResettingUser(null);
        }}
        user={resettingUser}
        onSuccess={handleResetSuccess}
      />
    </AppLayout>
  );
}
