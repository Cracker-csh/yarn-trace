import { Party } from "./inventory";

export type POStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "ACTIVE"
  | "IN_PRODUCTION"
  | "PARTIALLY_DELIVERED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "CANCELLED";

export type RequirementStatus =
  | "PENDING"
  | "PARTIAL"
  | "COMPLETED"
  | "N/A"
  | "CANCELLED";

export type PurposeType =
  | "KNITTING"
  | "WEAVING"
  | "WARPING"
  | "PILE"
  | "GROUND"
  | "WEFT"
  | "DYED"
  | "NPD"
  | "GENERAL";

export interface POTransaction {
  id: string;
  transactionNumber: string;
  transactionDate: string;
  type: string;
  kilos: number;
  bags: number;
  lotNumber?: string | null;
  createdByName?: string | null;
}

export interface PORequirement {
  id: string;
  purchaseOrderId?: string | null;
  poNumber?: string | null;
  yarnCount: string;
  quality?: string | null;
  size?: string | null;
  useFor?: string | null;
  purpose: PurposeType | string;
  pcs?: number | null;
  qty?: number | null;
  requiredKg: number;
  issuedKg: number;
  remainingKg: number;
  fulfillmentPct: number;
  ceiling103Kg?: number;
  status: RequirementStatus;
  isActive?: boolean;
  isArchived?: boolean;
  archivedAt?: string | null;
  archivedById?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  transactions?: POTransaction[];
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  partyId: string;
  party: Party;
  status: POStatus | string;
  orderDate: string;
  deliveryDue?: string | null;
  totalAmount?: number | null;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
  totalRequiredKg: number;
  totalIssuedKg: number;
  totalRemainingKg: number;
  overallFulfillmentPct: number;
  requirementsCount: number;
  requirements: PORequirement[];
}

export interface POSummaryMetrics {
  totalPOs: number;
  activePOs: number;
  partiallyFulfilledPOs: number;
  fulfilledPOs: number;
  cancelledPOs: number;
  totalRequiredKg: number;
  totalIssuedKg: number;
  totalRemainingKg: number;
}

export interface CreatePORequirementInput {
  id?: string;
  yarnCount: string;
  quality?: string;
  size?: string;
  useFor?: string;
  purpose: string;
  pcs?: number;
  qty?: number;
  requiredKg: number;
  notes?: string;
}

export interface CreatePOInput {
  poNumber: string;
  partyId: string;
  orderDate?: string;
  deliveryDue?: string;
  totalAmount?: number;
  remarks?: string;
  status?: string;
  requirements: CreatePORequirementInput[];
}

export interface UpdatePOInput {
  partyId?: string;
  orderDate?: string;
  deliveryDue?: string;
  totalAmount?: number;
  remarks?: string;
  status?: string;
  requirements?: CreatePORequirementInput[];
}

export interface POFilterParams {
  search?: string;
  partyId?: string;
  status?: string;
  fulfillmentStatus?: string;
  startDate?: string;
  endDate?: string;
}
