import React, { useState, useEffect, useMemo } from "react";
import { Loader2, ShieldCheck, Check, X, Search } from "lucide-react";
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
import { Badge } from "../ui/badge";
import { RoleListItem, PermissionItem } from "../../types/governance";

interface PermissionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  role: RoleListItem | null;
  allPermissions: PermissionItem[];
  onSave: (roleId: string, permissionIds: string[]) => Promise<void>;
  isLoading: boolean;
}

export default function PermissionManager({
  isOpen,
  onClose,
  role,
  allPermissions,
  onSave,
  isLoading,
}: PermissionManagerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize selected permissions from the role's current assignments
  useEffect(() => {
    if (isOpen && role?.rolePermissions) {
      setSelectedIds(
        new Set(role.rolePermissions.map((rp) => rp.permissionId))
      );
      setSearchTerm("");
      setSubmitError(null);
    }
  }, [isOpen, role]);

  // Group permissions by module
  const permissionsByModule = useMemo(() => {
    const groups: Record<string, PermissionItem[]> = {};
    for (const perm of allPermissions) {
      if (!groups[perm.module]) {
        groups[perm.module] = [];
      }
      groups[perm.module].push(perm);
    }
    return groups;
  }, [allPermissions]);

  // Filter by search
  const filteredModules = useMemo(() => {
    if (!searchTerm.trim()) return permissionsByModule;
    const query = searchTerm.toLowerCase().trim();
    const filtered: Record<string, PermissionItem[]> = {};
    for (const [mod, perms] of Object.entries(permissionsByModule)) {
      const matching = perms.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.key.toLowerCase().includes(query) ||
          mod.toLowerCase().includes(query)
      );
      if (matching.length > 0) {
        filtered[mod] = matching;
      }
    }
    return filtered;
  }, [permissionsByModule, searchTerm]);

  const togglePermission = (permId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) {
        next.delete(permId);
      } else {
        next.add(permId);
      }
      return next;
    });
  };

  const toggleModule = (moduleName: string) => {
    const modulePerms = permissionsByModule[moduleName] || [];
    const allSelected = modulePerms.every((p) => selectedIds.has(p.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        modulePerms.forEach((p) => next.delete(p.id));
      } else {
        modulePerms.forEach((p) => next.add(p.id));
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!role) return;
    setSubmitError(null);
    try {
      await onSave(role.id, Array.from(selectedIds));
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { message?: string } };
      };
      setSubmitError(
        axiosErr?.response?.data?.message ||
          "Failed to assign permissions. Please try again."
      );
    }
  };

  const handleCancel = () => {
    setSubmitError(null);
    onClose();
  };

  if (!role) return null;

  const sortedModules = Object.keys(filteredModules).sort();

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-100 text-brand-600 border border-brand-200 shrink-0">
              <ShieldCheck className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 font-heading">
                Manage Permissions
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Assign or remove permissions for{" "}
                <span className="font-semibold text-slate-700">
                  {role.name}
                </span>{" "}
                ({role.code})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Info banner */}
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium">
          Note: Permission changes take effect when affected users next log in or
          refresh their session.
        </div>

        {submitError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
            <X className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search permissions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-slate-50/70 focus:bg-white"
          />
        </div>

        {/* Permissions grouped by module */}
        <div className="max-h-[400px] overflow-y-auto space-y-4 pr-1">
          {sortedModules.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              No permissions match your search.
            </p>
          ) : (
            sortedModules.map((moduleName) => {
              const modulePerms = filteredModules[moduleName];
              const allPermsInModule = permissionsByModule[moduleName] || [];
              const allSelected = allPermsInModule.every((p) =>
                selectedIds.has(p.id)
              );
              const someSelected =
                !allSelected &&
                allPermsInModule.some((p) => selectedIds.has(p.id));

              return (
                <div
                  key={moduleName}
                  className="border border-slate-200 rounded-xl overflow-hidden"
                >
                  {/* Module header */}
                  <button
                    type="button"
                    onClick={() => toggleModule(moduleName)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded border-2 flex items-center justify-center text-white transition-colors ${
                          allSelected
                            ? "bg-brand-600 border-brand-600"
                            : someSelected
                            ? "bg-brand-300 border-brand-400"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {(allSelected || someSelected) && (
                          <Check className="h-3 w-3" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        {moduleName}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {
                        allPermsInModule.filter((p) => selectedIds.has(p.id))
                          .length
                      }
                      /{allPermsInModule.length}
                    </Badge>
                  </button>
                  {/* Permission items */}
                  <div className="divide-y divide-slate-100">
                    {modulePerms.map((perm) => {
                      const isChecked = selectedIds.has(perm.id);
                      return (
                        <label
                          key={perm.id}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 cursor-pointer transition-colors"
                        >
                          <div
                            className={`h-4 w-4 rounded border-2 flex items-center justify-center text-white transition-colors shrink-0 ${
                              isChecked
                                ? "bg-brand-600 border-brand-600"
                                : "border-slate-300 bg-white"
                            }`}
                            onClick={(e) => {
                              e.preventDefault();
                              togglePermission(perm.id);
                            }}
                          >
                            {isChecked && <Check className="h-3 w-3" />}
                          </div>
                          <div
                            className="flex-1 min-w-0"
                            onClick={(e) => {
                              e.preventDefault();
                              togglePermission(perm.id);
                            }}
                          >
                            <div className="text-xs font-semibold text-slate-800">
                              {perm.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {perm.key}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-3">
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-[11px] text-slate-500 font-medium">
              {selectedIds.size} of {allPermissions.length} permissions selected
            </span>
          </div>
          <Button
            variant="outline"
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="h-10 px-5 text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="h-10 px-5 text-xs font-semibold gap-1.5 shadow-sm"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Save Permissions</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
