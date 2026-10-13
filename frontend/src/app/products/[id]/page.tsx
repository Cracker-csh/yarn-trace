"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Layers,
  ArrowLeft,
  Sparkles,
  Calendar,
  Factory,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  TrendingUp,
  PackageCheck,
  AlertTriangle,
  History,
  FileText,
  Tag,
  ExternalLink,
  Edit2,
  AlertOctagon,
  Scale,
} from "lucide-react";
import AppLayout from "../../../components/layout/AppLayout";
import PageHeader from "../../../components/common/PageHeader";
import { Button } from "../../../components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { apiClient } from "../../../lib/axios";
import { OutputBatchComputed } from "../../../types/product";

import EditBatchModal from "../../../components/products/EditBatchModal";
import CancelBatchModal from "../../../components/products/CancelBatchModal";

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Output Batch & Genealogy details
  const {
    data: batch,
    isLoading,
    isError,
    error,
  } = useQuery<OutputBatchComputed>({
    queryKey: ["products", id],
    queryFn: async () => {
      const res = await apiClient.get(`/products/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-xs text-slate-500 space-y-3">
          <div className="inline-flex h-8 w-8 animate-spin items-center justify-center rounded-full border-2 border-brand-600 border-t-transparent" />
          <p>Loading finished product & deep genealogy...</p>
        </div>
      </AppLayout>
    );
  }

  if (isError || !batch) {
    return (
      <AppLayout>
        <div className="p-8">
          <Card className="border-rose-200 bg-rose-50/50">
            <CardContent className="p-8 text-center space-y-4">
              <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
              <h2 className="text-base font-bold text-slate-800">
                Finished Product Not Found
              </h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">
                {(error as any)?.response?.data?.message ||
                  `The finished product or output batch "${id}" could not be located in the database.`}
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push("/products")}
              >
                Back to Finished Products
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const isCancelled = batch.status === "CANCELLED";

  // Status Badge Helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "READY":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5" />
            READY FOR DELIVERY
          </span>
        );
      case "PRODUCED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <Clock className="h-3.5 w-3.5" />
            PRODUCED (AWAITING QA)
          </span>
        );
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            <Truck className="h-3.5 w-3.5" />
            DELIVERED
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="h-3.5 w-3.5" />
            CANCELLED / QUARANTINED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  const formatProductType = (type: string) => {
    switch (type) {
      case "FABRIC_ROLL":
        return "Finished Fabric Roll";
      case "FINISHED_YARN":
        return "Processed Yarn";
      case "MANUFACTURED_BATCH":
        return "Manufactured Batch";
      case "GARMENT":
        return "Finished Garment";
      default:
        return type.replace(/_/g, " ");
    }
  };

  return (
    <AppLayout>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 animate-slide-up">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium ${
              toast.type === "success"
                ? "bg-emerald-900/90 text-emerald-100 border-emerald-700/50 backdrop-blur-md"
                : "bg-rose-900/90 text-rose-100 border-rose-700/50 backdrop-blur-md"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-400" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Back button & Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/products")}
            className="gap-1.5 text-xs text-slate-600 border-slate-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All Products</span>
          </Button>
          <span className="text-slate-300">/</span>
          <span className="font-mono text-xs font-bold text-slate-800">
            {batch.batchNumber}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Trace Product (Backward Trace) */}
          <Link
            href={`/traceability?product=${encodeURIComponent(
              batch.productCode || batch.batchNumber
            )}&tab=backward`}
          >
            <Button
              variant="primary"
              size="sm"
              className="gap-2 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Trace Product</span>
            </Button>
          </Link>

          {!isCancelled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-slate-200 text-slate-700"
              onClick={() => setIsEditOpen(true)}
            >
              <Edit2 className="h-3.5 w-3.5" />
              <span>Edit</span>
            </Button>
          )}

          {!isCancelled && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => setIsCancelOpen(true)}
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </Button>
          )}
        </div>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 font-mono text-xs font-bold border border-brand-200">
                {batch.batchNumber}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {batch.productCode}
              </span>
              {getStatusBadge(batch.status)}
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-2">
              {batch.productName}
            </h1>
            <p className="text-xs text-slate-500">
              Manufactured on{" "}
              <strong className="text-slate-700">
                {new Date(batch.outputDate).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </strong>{" "}
              under Work Order{" "}
              <strong className="text-slate-700 font-mono">
                {batch.productionOrder.orderNumber}
              </strong>
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-right">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Batch Output Quantity
              </span>
              <span className="text-2xl font-bold text-slate-900 font-mono">
                {batch.outputQuantityKg.toFixed(2)}{" "}
                <span className="text-sm font-normal text-slate-500">
                  {batch.unit}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left 2 Cols: Genealogy, Consumed Yarn, Source Lots */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECTION: Consumed Yarn & Source Lots */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-brand-600" />
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Consumed Yarn Genealogy & Source Lots
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {batch.yarnLots.length} Source Lot(s)
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Actual yarn lots issued and consumed on the floor to manufacture this output batch
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0">
              {batch.yarnLots.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No yarn consumption records found for this work order.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="px-4 py-2.5">Yarn Count</th>
                        <th className="px-4 py-2.5">Yarn Lot #</th>
                        <th className="px-4 py-2.5">Supplier</th>
                        <th className="px-4 py-2.5 text-right">Consumed KG</th>
                        <th className="px-4 py-2.5 text-right">Waste KG</th>
                        <th className="px-4 py-2.5">Consumption Date</th>
                        <th className="px-4 py-2.5 text-right">Trace Lot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batch.yarnLots.map((lot, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {lot.yarnCount}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold text-brand-700">
                            <Link
                              href={`/traceability?lot=${encodeURIComponent(
                                lot.lotNumber
                              )}`}
                              className="hover:underline flex items-center gap-1"
                            >
                              <span>{lot.lotNumber}</span>
                              <ExternalLink className="h-3 w-3 text-slate-400 opacity-60" />
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {lot.supplierName}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                            {lot.consumedKg.toFixed(2)} KG
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                            {lot.wasteKg > 0 ? `${lot.wasteKg.toFixed(2)} KG` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                            {new Date(lot.consumptionDate).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              href={`/traceability?lot=${encodeURIComponent(
                                lot.lotNumber
                              )}`}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-brand-600 hover:text-brand-800 hover:bg-brand-50"
                              >
                                View Lineage
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-800">
                        <td colSpan={3} className="px-4 py-2.5 text-right">
                          Total Yarn Consumed:
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-brand-700">
                          {batch.consumedYarnKg.toFixed(2)} KG
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                          {batch.totalWasteKg.toFixed(2)} KG
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION: Production Order & Floor Details */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-brand-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Production Order & Manufacturing Context
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Work Order Number</span>
                  <Link
                    href="/production"
                    className="font-mono font-bold text-brand-700 hover:underline flex items-center gap-1 mt-0.5"
                  >
                    <span>{batch.productionOrder.orderNumber}</span>
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </Link>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Order Status</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {batch.productionOrder.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Priority</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {batch.productionOrder.priority}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Target Planned Qty</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">
                    {batch.productionOrder.targetQuantity.toFixed(2)}{" "}
                    {batch.productionOrder.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Production Team</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {batch.productionTeam?.name || "Floor Team"} (
                    {batch.productionTeam?.department || "MANUFACTURING"})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Team Lead</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {batch.productionTeam?.teamLead || "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SECTION: Remarks & Inspection Notes */}
          {batch.remarks && (
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-500" />
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Quality Inspection Notes & Remarks
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {batch.remarks}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 1 Col: Yield Metrics, Party, Delivery Status, Genealogy Flow */}
        <div className="space-y-6">
          {/* SECTION: Quantity & Yield Breakdown */}
          <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-white to-slate-50">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Yield & Mass Balance
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Output Quantity:</span>
                <span className="font-bold font-mono text-slate-900">
                  {batch.outputQuantityKg.toFixed(2)} {batch.unit}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Total Consumed Yarn:</span>
                <span className="font-bold font-mono text-slate-700">
                  {batch.consumedYarnKg.toFixed(2)} KG
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-slate-500">Total Floor Waste:</span>
                <span className="font-bold font-mono text-amber-700">
                  {batch.totalWasteKg.toFixed(2)} KG
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-bold text-slate-800">Production Yield:</span>
                <span
                  className={`text-base font-bold font-mono px-2 py-0.5 rounded-lg ${
                    batch.yieldPercentage > 102 || batch.yieldPercentage < 75
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {batch.yieldPercentage.toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* SECTION: Party / Buyer Master */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-brand-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Buyer / Customer Party
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 text-xs space-y-2.5">
              {batch.party ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Party Name:</span>
                    <Link
                      href="/parties"
                      className="font-bold text-slate-900 hover:text-brand-600 flex items-center gap-1"
                    >
                      <span>{batch.party.name}</span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Party Code:</span>
                    <span className="font-mono text-slate-700">
                      {batch.party.code}
                    </span>
                  </div>
                  {batch.party.contactPerson && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Contact Person:</span>
                      <span className="text-slate-700">
                        {batch.party.contactPerson}
                      </span>
                    </div>
                  )}
                  {batch.party.phone && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Phone:</span>
                      <span className="text-slate-700 font-mono">
                        {batch.party.phone}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 italic">
                  Manufactured for internal inventory stock. No external buyer assigned.
                </p>
              )}
            </CardContent>
          </Card>

          {/* SECTION: Delivery Foundation */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-purple-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Delivery & Dispatch
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Dispatched Quantity:</span>
                <span className="font-bold font-mono text-purple-700">
                  {batch.dispatchedKg.toFixed(2)} {batch.unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Remaining Available:</span>
                <span className="font-bold font-mono text-emerald-700">
                  {batch.availableKg.toFixed(2)} {batch.unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Delivery Records:</span>
                <span className="font-semibold text-slate-800">
                  {batch.deliveriesCount} dispatch(es)
                </span>
              </div>
            </CardContent>
          </Card>

          {/* SECTION: Genealogy Trace Flow */}
          <Card className="shadow-sm border-indigo-200 bg-indigo-50/40">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <span className="font-bold text-xs text-indigo-900">
                  Full Genealogy Traceable
                </span>
              </div>
              <p className="text-[11px] text-indigo-700/90 leading-relaxed mb-3">
                This batch is mathematically linked backward to yarn consumption records, source lot numbers, and inward supplier shipments.
              </p>
              <Link
                href={`/traceability?product=${encodeURIComponent(
                  batch.productCode || batch.batchNumber
                )}&tab=backward`}
              >
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                >
                  <span>Open Backward Trace</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <EditBatchModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        batch={batch}
        onShowToast={showToast}
      />

      <CancelBatchModal
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        batch={batch}
        onShowToast={showToast}
      />
    </AppLayout>
  );
}
