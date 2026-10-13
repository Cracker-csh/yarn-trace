"use client";

import React, { useState } from "react";
import {
  Printer,
  X,
  Copy,
  Check,
  Building2,
  Calendar,
  Layers,
  FileCheck2,
  QrCode,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Undo2,
  Trash2,
  ShoppingBag,
  Wrench,
} from "lucide-react";
import { Dialog, DialogContent } from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { TransactionRecord, TransactionType } from "../../types/inventory";

interface YarnSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionRecord | null;
}

export default function YarnSlipModal({
  isOpen,
  onClose,
  transaction,
}: YarnSlipModalProps) {
  const [isCopied, setIsCopied] = useState(false);

  if (!transaction) return null;

  const handlePrint = () => {
    const printElement = document.getElementById("yarn-slip-printable");
    if (!printElement) {
      window.print();
      return;
    }

    try {
      // Remove any existing print iframe
      let iframe = document.getElementById(
        "yarn-slip-print-iframe"
      ) as HTMLIFrameElement | null;
      if (iframe) {
        iframe.remove();
      }

      // Create an isolated hidden iframe
      iframe = document.createElement("iframe");
      iframe.id = "yarn-slip-print-iframe";
      iframe.style.position = "fixed";
      iframe.style.top = "0";
      iframe.style.left = "-9999px";
      iframe.style.width = "800px";
      iframe.style.height = "1000px";
      iframe.style.border = "none";
      iframe.style.zIndex = "-1000";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) {
        window.print();
        return;
      }

      // Collect all stylesheets from the document
      const styleSheets = Array.from(
        document.querySelectorAll("link[rel='stylesheet'], style")
      )
        .map((el) => el.outerHTML)
        .join("\n");

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>YarnTrace-Slip-${transaction.transactionNumber}</title>
            ${styleSheets}
            <style>
              @page {
                size: A4 portrait;
                margin: 10mm 12mm;
              }
              *, *::before, *::after {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
                box-sizing: border-box;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background-color: #ffffff !important;
                color: #0f172a !important;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              }
              #yarn-slip-printable {
                width: 100% !important;
                max-width: 780px !important;
                margin: 0 auto !important;
                border: 1.5px solid #cbd5e1 !important;
                border-radius: 12px !important;
                overflow: visible !important;
                background: #ffffff !important;
              }
              /* Explicit background colors so printer drivers render them accurately */
              .bg-orange-600 { background-color: #ea580c !important; color: #ffffff !important; }
              .bg-emerald-700 { background-color: #047857 !important; color: #ffffff !important; }
              .bg-sky-700 { background-color: #0369a1 !important; color: #ffffff !important; }
              .bg-blue-700 { background-color: #1d4ed8 !important; color: #ffffff !important; }
              .bg-rose-700 { background-color: #be123c !important; color: #ffffff !important; }
              .bg-purple-700 { background-color: #7e22ce !important; color: #ffffff !important; }
              .bg-slate-800 { background-color: #1e293b !important; color: #ffffff !important; }
            </style>
          </head>
          <body>
            <div style="padding: 8px;">
              ${printElement.outerHTML}
            </div>
          </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        if (!iframe?.contentWindow) {
          window.print();
          return;
        }
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => {
          if (iframe && document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }, 250);
    } catch (err) {
      console.error("Print iframe fallback to window.print:", err);
      window.print();
    }
  };

  const handleCopy = async () => {
    const slipText = `========================================
YARNTRACE MATERIAL MOVEMENT VOUCHER
========================================
Voucher No:   ${transaction.transactionNumber}
Type:         ${transaction.type}
Date & Time:  ${new Date(transaction.transactionDate).toLocaleString("en-IN")}
Yarn Count:   ${transaction.count || "—"}
Lot Number:   ${transaction.lotNumber || "—"}
Party / Mill: ${transaction.party?.name || "—"} (${transaction.party?.code || ""})
Standard Bags: ${transaction.bags} Bags
Net Weight:   ${Number(transaction.kilos).toFixed(2)} KG
PO Number:    ${transaction.poNumber || "N/A"}
Purpose:      ${transaction.purpose || "N/A"}
Ref / Challan: ${transaction.referenceNumber || "N/A"}
Notes:        ${transaction.notes || "N/A"}
Issued By:    ${transaction.createdBy || "Authorized Officer"}
========================================`;

    try {
      await navigator.clipboard.writeText(slipText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const renderTypeIcon = (type: TransactionType) => {
    switch (type) {
      case "OPENING":
        return <Boxes className="h-3.5 w-3.5" />;
      case "RECEIVED":
        return <ArrowDownLeft className="h-3.5 w-3.5" />;
      case "ISSUED":
        return <ArrowUpRight className="h-3.5 w-3.5" />;
      case "RETURN":
      case "RETURNED":
        return <Undo2 className="h-3.5 w-3.5" />;
      case "RETIRED":
        return <Trash2 className="h-3.5 w-3.5" />;
      case "SOLD":
        return <ShoppingBag className="h-3.5 w-3.5" />;
      case "CORRECTION":
        return <Wrench className="h-3.5 w-3.5" />;
      default:
        return <FileCheck2 className="h-3.5 w-3.5" />;
    }
  };

  const getTypeStyle = (type: TransactionType) => {
    switch (type) {
      case "OPENING":
        return {
          headerBg: "bg-orange-600 text-white",
          badge: "bg-orange-100 text-orange-800 border-orange-300",
          accentText: "text-orange-700",
        };
      case "RECEIVED":
        return {
          headerBg: "bg-emerald-700 text-white",
          badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
          accentText: "text-emerald-700",
        };
      case "ISSUED":
        return {
          headerBg: "bg-sky-700 text-white",
          badge: "bg-sky-100 text-sky-800 border-sky-300",
          accentText: "text-sky-700",
        };
      case "RETURN":
      case "RETURNED":
        return {
          headerBg: "bg-blue-700 text-white",
          badge: "bg-blue-100 text-blue-800 border-blue-300",
          accentText: "text-blue-700",
        };
      case "RETIRED":
        return {
          headerBg: "bg-rose-700 text-white",
          badge: "bg-rose-100 text-rose-800 border-rose-300",
          accentText: "text-rose-700",
        };
      case "SOLD":
        return {
          headerBg: "bg-purple-700 text-white",
          badge: "bg-purple-100 text-purple-800 border-purple-300",
          accentText: "text-purple-700",
        };
      default:
        return {
          headerBg: "bg-slate-800 text-white",
          badge: "bg-slate-100 text-slate-800 border-slate-300",
          accentText: "text-slate-800",
        };
    }
  };

  const theme = getTypeStyle(transaction.type);
  const avgKgPerBag =
    transaction.bags > 0
      ? (Number(transaction.kilos) / transaction.bags).toFixed(2)
      : "—";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 flex flex-col max-h-[92vh] overflow-hidden rounded-2xl border border-slate-200 shadow-2xl bg-white w-full">
        {/* Scrollable / Printable Section */}
        <div
          id="yarn-slip-printable"
          className="flex-1 overflow-y-auto bg-white text-slate-900 font-sans"
        >
          {/* Header Banner */}
          <div className={`${theme.headerBg} p-3.5 sm:p-5 border-b border-slate-200`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-white/20 border border-white/30 text-white shrink-0 shadow-sm">
                  <Layers className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
                      Yarn<span className="text-orange-300">Trace</span>
                    </h2>
                    <span className="rounded bg-white/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white border border-white/30">
                      Official Voucher
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-white/90 mt-0.5 flex items-center gap-1.5 truncate">
                    <Building2 className="h-3.5 w-3.5 text-white/80 shrink-0" />
                    <span className="truncate">Spinning Mill & Floor Tracking • Movement Pass</span>
                  </p>
                </div>
              </div>

              {/* QR / Verification Stamp */}
              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10">
                <div className="flex items-center gap-1.5 bg-white/20 px-2.5 py-1 rounded-lg border border-white/30 text-[11px] font-mono font-bold text-white shadow-sm">
                  <QrCode className="h-3.5 w-3.5 text-white" />
                  <span>VERIFIED</span>
                </div>
                <span className="text-[10px] text-white/80 font-mono sm:mt-1">
                  Plant 04 • Gate Pass
                </span>
              </div>
            </div>
          </div>

          {/* Slip Body */}
          <div className="p-5 sm:p-6 space-y-4">
            {/* Voucher Meta Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b-2 border-slate-100">
              <div className="space-y-0.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Voucher / Slip Number
                </p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300">
                    {transaction.transactionNumber}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${theme.badge}`}
                  >
                    {renderTypeIcon(transaction.type)}
                    <span>{transaction.type}</span>
                  </span>
                </div>
              </div>

              <div className="space-y-0.5 text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Transaction Date & Time
                </p>
                <p className="text-xs font-bold text-slate-800 flex items-center justify-end gap-1.5 font-mono">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    {new Date(transaction.transactionDate).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
              </div>
            </div>

            {/* Split Details & Quantity Cards */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Column: Material & Partner Details */}
              <div className="md:col-span-7 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-600 font-medium">Commercial Partner:</span>
                  <span className="font-bold text-slate-900 text-right max-w-[200px] truncate">
                    {transaction.party?.name || "—"}
                    {transaction.party?.code ? ` (${transaction.party.code})` : ""}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-600 font-medium">Yarn Count:</span>
                  <span className="font-bold text-slate-900 font-mono text-xs">
                    {transaction.count || "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-600 font-medium">Lot Number:</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-300">
                    {transaction.lotNumber || "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-600 font-medium">Purchase Order (PO):</span>
                  <span className="font-mono font-bold text-slate-800">
                    {transaction.poNumber || "—"}
                  </span>
                </div>

                <div className="flex justify-between items-center py-1 border-b border-slate-200">
                  <span className="text-slate-600 font-medium">Purpose / Section:</span>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {transaction.purpose || "GENERAL"}
                  </Badge>
                </div>

                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-600 font-medium">Ref / Challan No:</span>
                  <span className="font-mono text-slate-800 font-semibold">
                    {transaction.referenceNumber || "—"}
                  </span>
                </div>
              </div>

              {/* Right Column: Weight & Bags KPI Banner */}
              <div className="md:col-span-5 flex flex-col justify-between rounded-xl border-2 border-brand-300 bg-brand-50/50 p-4 text-center shadow-sm">
                <div>
                  <p className="text-[11px] font-bold text-brand-900 uppercase tracking-wider">
                    Total Quantity Transacted
                  </p>
                  <div className="mt-2.5">
                    <p className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 tabular-nums">
                      {Number(transaction.kilos).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}
                    </p>
                    <p className="text-xs font-bold text-brand-700 mt-1 uppercase tracking-wider">
                      Net Kilograms (KG)
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-brand-200 flex items-center justify-around text-xs">
                  <div>
                    <span className="text-slate-600 text-[10px] block font-medium">Standard Bags</span>
                    <span className="font-display text-base font-bold text-slate-900">
                      {transaction.bags.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="h-6 w-[1px] bg-brand-200" />
                  <div>
                    <span className="text-slate-600 text-[10px] block font-medium">Avg KG / Bag</span>
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {avgKgPerBag} KG
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Remarks / Purpose Notes */}
            {transaction.notes && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                <span className="font-bold text-slate-700">Remarks / Operational Notes: </span>
                <span className="text-slate-700">{transaction.notes}</span>
              </div>
            )}

            {/* Formal Authorized Signatures */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 pt-4 sm:pt-6 border-t-2 border-slate-200 text-center text-xs">
              <div className="space-y-1">
                <div className="border-t border-dashed border-slate-500 pt-2">
                  <p className="font-bold text-slate-900">
                    {transaction.createdBy || "Authorized Store Officer"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Issued / Handed Over By (Store Head)
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="border-t border-dashed border-slate-500 pt-2">
                  <p className="font-bold text-slate-900">
                    {transaction.party?.contactPerson || "Receiving Floor Supervisor"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Received & Acknowledged By (Floor Head)
                  </p>
                </div>
              </div>
            </div>

            {/* Micro Footer Notice */}
            <div className="pt-2 text-center text-[10px] text-slate-400 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-1">
              <span>YarnTrace Inventory Platform • Plant 04</span>
              <span className="font-mono">
                Doc ID: {transaction.id.slice(0, 8).toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Sticky Action Footer (Hidden on Paper Print) */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-3 sm:p-3.5 bg-slate-50 border-t border-slate-200 print:hidden z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5 text-xs text-slate-600 h-8 flex-1 sm:flex-none"
          >
            {isCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Summary</span>
              </>
            )}
          </Button>

          <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs flex-1 sm:flex-none">
              <X className="h-3.5 w-3.5 mr-1" />
              <span>Close</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 h-8 text-xs shadow-sm flex-1 sm:flex-none"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Slip</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
