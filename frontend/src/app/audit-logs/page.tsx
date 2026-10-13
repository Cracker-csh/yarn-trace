"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileClock,
  Filter,
  Download,
  Shield,
  Search,
  RotateCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  User,
  Clock,
  Activity,
} from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";
import PageHeader from "../../components/common/PageHeader";
import EmptyState from "../../components/common/EmptyState";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { apiClient } from "../../lib/axios";

interface AuditLogRecord {
  id: string;
  userId: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const {
    data: logsResponse,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<{ data: AuditLogRecord[]; meta: { total: number } }>({
    queryKey: ["audit-logs", moduleFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (moduleFilter !== "ALL") params.append("module", moduleFilter);
      if (search.trim()) params.append("search", search.trim());
      params.append("limit", "100");

      const res = await apiClient.get(`/audit-logs?${params.toString()}`);
      return res.data;
    },
    staleTime: 15_000,
  });

  const logs = logsResponse?.data || [];
  const totalCount = logsResponse?.meta?.total ?? logs.length;

  const modules = ["ALL", "AUTH", "INVENTORY", "PRODUCTION", "USERS", "ROLES", "COMMERCIAL"];

  const getActionBadgeVariant = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes("DELETE") || act.includes("RETIRE") || act.includes("CANCEL")) {
      return "destructive";
    }
    if (act.includes("CREATE") || act.includes("RECEIVE") || act.includes("ISSUE")) {
      return "success";
    }
    if (act.includes("UPDATE") || act.includes("CORRECT")) {
      return "warning";
    }
    return "secondary";
  };

  const exportAuditCsv = () => {
    if (logs.length === 0) return;
    const headers = ["Timestamp", "Action", "Module", "Entity", "User", "IP Address"];
    const rows = logs.map((l) => [
      new Date(l.timestamp).toISOString(),
      l.action,
      l.module,
      l.entityType,
      l.user?.email || "SYSTEM",
      l.ipAddress || "-",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppLayout>
      <PageHeader
        title="Audit Logs & System Governance"
        subtitle="Immutable security trail of every user action, entity modification, stock movement, and security event."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportAuditCsv}
              disabled={logs.length === 0}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
          </div>
        }
      />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="min-w-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Logged Events
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1 break-words">{totalCount}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Ledger Status
                </p>
                <p className="text-2xl font-bold text-emerald-600 mt-1 break-words">Active</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Security Model
                </p>
                <p className="text-2xl font-bold text-slate-900 mt-1 break-words">Immutable</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Shield className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle>System Activity Ledger</CardTitle>
            <CardDescription>
              Chronological immutable log of state mutations with before/after snapshots
            </CardDescription>
          </div>

          {/* Module Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {modules.map((mod) => (
              <Button
                key={mod}
                size="sm"
                variant={moduleFilter === mod ? "primary" : "outline"}
                className="h-7 text-xs"
                onClick={() => setModuleFilter(mod)}
              >
                {mod}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {/* Search bar */}
          <div className="mb-4 flex items-center gap-3">
            <div className="relative w-full max-w-full sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search action, entity or user..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-xs w-full"
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="No audit events found"
              description={
                search || moduleFilter !== "ALL"
                  ? "Try adjusting your search query or module filter."
                  : "Audit events will automatically appear here as users perform actions."
              }
              icon={FileClock}
            />
          ) : (
            <div className="rounded-md border border-slate-200">
              <Table className="min-w-[750px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Triggered By</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getActionBadgeVariant(log.action)}
                          className="font-mono text-[10px]"
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {log.module}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-slate-800">
                        {log.entityType}
                        {log.entityId && (
                          <span className="block font-mono text-[10px] text-slate-400 truncate max-w-[150px]">
                            {log.entityId}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs text-slate-700">
                            {log.user
                              ? `${log.user.firstName} ${log.user.lastName}`
                              : "SYSTEM"}
                          </span>
                        </div>
                        {log.user?.email && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {log.user.email}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(log.oldValue || log.newValue) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Snapshot Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 text-xs sm:text-sm break-words">
                  Audit Snapshot — {selectedLog.action} on {selectedLog.entityType}
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-500 font-mono mt-0.5 truncate">
                  ID: {selectedLog.id}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLog(null)}
                className="h-8 w-8 p-0 shrink-0"
              >
                ✕
              </Button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono">
              {selectedLog.oldValue && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-1">Previous State (Before):</h4>
                  <pre className="bg-slate-50 p-3 rounded border border-slate-200 overflow-x-auto text-slate-800">
                    {JSON.stringify(selectedLog.oldValue, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.newValue && (
                <div>
                  <h4 className="font-bold text-slate-700 mb-1">Updated State (After):</h4>
                  <pre className="bg-emerald-50/50 p-3 rounded border border-emerald-200 overflow-x-auto text-emerald-900">
                    {JSON.stringify(selectedLog.newValue, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Button size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
