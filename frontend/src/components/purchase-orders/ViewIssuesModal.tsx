"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowUpRight, ExternalLink, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PORequirement } from "../../types/purchase-order";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface ViewIssuesModalProps {
  isOpen: boolean;
  onClose: () => void;
  requirement: PORequirement | null;
  poNumber: string;
}

export default function ViewIssuesModal({
  isOpen,
  onClose,
  requirement,
  poNumber,
}: ViewIssuesModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !mounted || !requirement) return null;

  const transactions = requirement.transactions || [];
  const totalIssued = transactions.reduce((sum, t) => sum + t.kilos, 0);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-transparent"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 sm:px-6 py-3 sm:py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 shrink-0">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Issued Yarn Transactions
                </h2>
                <Badge variant="brand" className="text-[10px]">
                  {requirement.purpose}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                {poNumber} • Count: {requirement.yarnCount}{" "}
                {requirement.size ? `(${requirement.size})` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* KPI Mini Header */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                Total Required
              </span>
              <p className="font-mono font-bold text-slate-800 text-sm">
                {requirement.requiredKg.toFixed(2)} KG
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                Total Issued
              </span>
              <p className="font-mono font-bold text-blue-700 text-sm">
                {requirement.issuedKg.toFixed(2)} KG
              </p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">
                103% Max Ceiling
              </span>
              <p className="font-mono font-bold text-emerald-700 text-sm">
                {(requirement.requiredKg * 1.03).toFixed(2)} KG
              </p>
            </div>
          </div>

          {/* Transactions Table */}
          {transactions.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[600px] text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Tx Number</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Lot Number</th>
                    <th className="py-2.5 px-3 text-right">Bags</th>
                    <th className="py-2.5 px-3 text-right">Issued KG</th>
                    <th className="py-2.5 px-3">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        {tx.transactionNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {new Date(tx.transactionDate).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-brand-700">
                        {tx.lotNumber || "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {tx.bags}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                        {tx.kilos.toFixed(2)} KG
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {tx.createdByName || "System Admin"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                  <tr>
                    <td colSpan={4} className="py-2 px-3 text-right text-xs">
                      Total Issued from Transactions:
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-blue-800 text-xs">
                      {totalIssued.toFixed(2)} KG
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-6 text-center">
              <ShieldCheck className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">
                No yarn issued against this requirement yet
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm mx-auto">
                Once yarn is issued from the warehouse ledger referencing PO{" "}
                <span className="font-mono font-bold">{poNumber}</span> and{" "}
                <span className="font-bold">{requirement.yarnCount}</span> (
                {requirement.purpose}), verified transaction entries will
                appear here.
              </p>
            </div>
          )}

          {/* Action links */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 shrink-0">
            <button
              onClick={() => {
                onClose();
                router.push(`/inventory`);
              }}
              className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              <span>Go to Inventory Ledger to Issue Yarn</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
