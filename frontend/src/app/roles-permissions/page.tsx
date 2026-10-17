"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Key,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { apiClient } from "../../lib/axios";
import dynamic from "next/dynamic";
import { RoleListItem, PermissionItem } from "../../types/governance";
import PermissionManager from "../../components/governance/PermissionManager";
import type {
  CreateRoleFormValues,
  EditRoleFormValues,
} from "../../components/governance/RoleModal";
const RoleModal = dynamic(() => import("../../components/governance/RoleModal"), { ssr: false });

export default function RolesPermissionsPage() {
  const queryClient = useQueryClient();

  // Modals state
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  const [editingRole, setEditingRole] = useState<RoleListItem | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<RoleListItem | null>(null);
  const [managingPermissionsRole, setManagingPermissionsRole] = useState<RoleListItem | null>(null);

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
  // 1. FETCH ROLES & PERMISSIONS FROM BACKEND
  // ---------------------------------------------------------------------------
  const {
    data: roles = [],
    isLoading: isLoadingRoles,
    isError: isErrorRoles,
    error: rolesError,
    refetch: refetchRoles,
    isFetching: isFetchingRoles,
  } = useQuery<RoleListItem[]>({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await apiClient.get("/roles");
      return res.data.data;
    },
    staleTime: 30_000,
  });

  const {
    data: permissions = [],
    isLoading: isLoadingPermissions,
    isError: isErrorPermissions,
  } = useQuery<PermissionItem[]>({
    queryKey: ["permissions"],
    queryFn: async () => {
      const res = await apiClient.get("/permissions");
      return res.data.data;
    },
    staleTime: 300_000, // Permissions change rarely
  });

  const isLoading = isLoadingRoles || isLoadingPermissions;
  const isError = isErrorRoles || isErrorPermissions;
  const error = rolesError;

  // ---------------------------------------------------------------------------
  // 2. MUTATIONS
  // ---------------------------------------------------------------------------
  const invalidateRoles = () => {
    queryClient.invalidateQueries({ queryKey: ["roles"] });
  };

  const createRoleMutation = useMutation({
    mutationFn: (values: CreateRoleFormValues) => apiClient.post("/roles", values),
    onSuccess: () => {
      invalidateRoles();
      showToast("success", "Custom role created successfully!");
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditRoleFormValues }) =>
      apiClient.patch(`/roles/${id}`, values),
    onSuccess: () => {
      invalidateRoles();
      showToast("success", "Role details updated successfully!");
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/roles/${id}`),
    onSuccess: () => {
      invalidateRoles();
      setIsDeleteModalOpen(false);
      setRoleToDelete(null);
      showToast("success", "Role deleted successfully!");
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setIsDeleteModalOpen(false);
      setRoleToDelete(null);
      showToast("error", err.response?.data?.message || "Failed to delete role");
    },
  });

  const assignPermissionsMutation = useMutation({
    mutationFn: ({ id, permissionIds }: { id: string; permissionIds: string[] }) =>
      apiClient.post(`/roles/${id}/permissions`, { permissionIds }),
    onSuccess: (res) => {
      invalidateRoles();
      showToast("success", res.data?.message || "Permissions updated successfully!");
    },
  });

  // ---------------------------------------------------------------------------
  // 3. HANDLERS
  // ---------------------------------------------------------------------------
  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setIsRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: RoleListItem) => {
    setEditingRole(role);
    setIsRoleModalOpen(true);
  };

  const handleOpenDeleteRole = (role: RoleListItem) => {
    setRoleToDelete(role);
    setIsDeleteModalOpen(true);
  };

  const handleOpenManagePermissions = (role: RoleListItem) => {
    setManagingPermissionsRole(role);
    setIsPermissionModalOpen(true);
  };

  const handleRoleFormSubmit = async (values: CreateRoleFormValues | EditRoleFormValues) => {
    if (editingRole) {
      await updateRoleMutation.mutateAsync({
        id: editingRole.id,
        values: values as EditRoleFormValues,
      });
    } else {
      await createRoleMutation.mutateAsync(values as CreateRoleFormValues);
    }
  };

  const handleDeleteConfirm = () => {
    if (roleToDelete) {
      deleteRoleMutation.mutate(roleToDelete.id);
    }
  };

  const handleSavePermissions = async (roleId: string, permissionIds: string[]) => {
    await assignPermissionsMutation.mutateAsync({ id: roleId, permissionIds });
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
        title="Roles & Granular Permissions"
        subtitle="Configure role hierarchy (Stock Head, Production Lead, Quality QA) and assign granular action capabilities."
        action={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchRoles()}
              disabled={isFetchingRoles}
              className="gap-1.5 h-9"
              title="Refresh Roles"
            >
              <RotateCw
                className={`h-3.5 w-3.5 text-slate-500 ${
                  isFetchingRoles ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreateRole}
              className="gap-1.5 h-9"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Custom Role</span>
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
              Failed to load roles/permissions:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              refetchRoles();
              queryClient.invalidateQueries({ queryKey: ["permissions"] });
            }}
            className="h-8 text-xs bg-white text-red-700 hover:bg-red-50 border-red-300"
          >
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Role Access Matrix</CardTitle>
              <CardDescription>
                System RBAC roles with associated capability permissions
              </CardDescription>
            </div>
            <Badge
              variant="secondary"
              className="font-mono text-xs self-start sm:self-auto"
            >
              {roles.length} {roles.length === 1 ? "Role" : "Roles"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : roles.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[700px] text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Role details</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3 text-center">Users Assigned</th>
                    <th className="py-3 px-3 text-center">Permissions</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                  {roles.map((role) => (
                    <tr
                      key={role.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Details */}
                      <td className="py-3.5 px-4 max-w-[280px]">
                        <div className="font-bold text-slate-900 text-sm">
                          {role.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5 mb-1">
                          {role.code}
                        </div>
                        {role.description && (
                          <div className="text-xs text-slate-500 truncate" title={role.description}>
                            {role.description}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td className="py-3.5 px-3">
                        {role.isSystem ? (
                          <Badge variant="brand" className="gap-1 bg-slate-100 text-slate-700 border-slate-200">
                            <ShieldAlert className="h-3 w-3" />
                            System
                          </Badge>
                        ) : (
                          <Badge variant="outline">Custom</Badge>
                        )}
                      </td>

                      {/* Users Count */}
                      <td className="py-3.5 px-3 text-center">
                        <Badge variant={role._count?.users ? "secondary" : "outline"}>
                          {role._count?.users || 0}
                        </Badge>
                      </td>

                      {/* Permissions Count */}
                      <td className="py-3.5 px-3 text-center">
                        <Badge variant={role.rolePermissions?.length ? "success" : "outline"} className="gap-1">
                          <Key className="h-3 w-3" />
                          {role.rolePermissions?.length || 0}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenManagePermissions(role)}
                          className="h-8 px-2.5 text-xs gap-1"
                          title="Manage Permissions"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">Permissions</span>
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditRole(role)}
                          className="h-8 px-2.5 text-xs gap-1 text-slate-500 hover:text-slate-900"
                          title="Edit Role"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDeleteRole(role)}
                          disabled={role.code === "ADMIN"}
                          className="h-8 px-2 text-xs gap-1 text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                          title={
                            role.code === "ADMIN"
                              ? "Primary Administrator role cannot be deleted"
                              : "Delete Role"
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No roles configured"
              description="System roles should be initialized from backend seeds. Please run database migrations."
              icon={ShieldCheck}
            />
          )}
        </CardContent>
      </Card>

      {/* Role Create/Edit Modal */}
      <RoleModal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setEditingRole(null);
        }}
        onSubmit={handleRoleFormSubmit}
        editingRole={editingRole}
        isLoading={createRoleMutation.isPending || updateRoleMutation.isPending}
      />

      {/* Permission Manager Modal */}
      <PermissionManager
        isOpen={isPermissionModalOpen}
        onClose={() => {
          setIsPermissionModalOpen(false);
          setManagingPermissionsRole(null);
        }}
        role={managingPermissionsRole}
        allPermissions={permissions}
        onSave={handleSavePermissions}
        isLoading={assignPermissionsMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteModalOpen}
        onOpenChange={setIsDeleteModalOpen}
        title="Delete Role"
        description={
          roleToDelete?._count?.users && roleToDelete._count.users > 0
            ? `Cannot delete "${roleToDelete?.name}" directly because ${roleToDelete._count.users} user(s) are currently assigned to it. Please reassign those users to another role first.`
            : `Are you sure you want to delete the role "${roleToDelete?.name}"? This action cannot be undone.`
        }
        confirmLabel="Delete Role"
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        isLoading={deleteRoleMutation.isPending}
      />
    </AppLayout>
  );
}
