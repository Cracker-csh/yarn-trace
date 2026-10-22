export type TransactionType =
  | 'OPENING'
  | 'RECEIVED'
  | 'ISSUED'
  | 'RETURN'
  | 'RETURNED'
  | 'RETIRED'
  | 'SOLD'
  | 'CORRECTION'
  | 'ADJUSTMENT'
  | 'TRANSFER';

export type LotStatus =
  | 'RECEIVED'
  | 'QUALITY_PENDING'
  | 'APPROVED'
  | 'IN_PRODUCTION'
  | 'EXHAUSTED'
  | 'QUARANTINED'
  | 'RETIRED';

export interface Party {
  id: string;
  code: string;
  name: string;
  type: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    suppliedLots?: number;
    purchaseOrders?: number;
    deliveries?: number;
    transactions?: number;
  };
}

export interface LotRecord {
  id: string;
  lotNumber: string;
  count: string;
  yarnCount?: string;
  party: {
    id: string;
    name: string;
    code: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  parentLot?: {
    id: string;
    lotNumber: string;
  } | null;
  initialWeightKg: number;
  initialBags: number;
  totalInKg: number;
  totalIssuedKg: number;
  totalReturnedKg: number;
  totalRetiredKg: number;
  totalSoldKg: number;
  currentWeightKg: number;
  currentBags: number;
  status: LotStatus;
  millLotNumber?: string;
  shadeCode?: string;
  receivedDate: string;
}

export interface TransactionRecord {
  id: string;
  transactionNumber: string;
  transactionDate: string;
  type: TransactionType;
  status: string;
  count: string;
  party: {
    id: string;
    name: string;
    code: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  lotNumber: string;
  bags: number;
  kilos: number;
  poNumber?: string | null;
  purpose?: string | null;
  referenceNumber?: string | null;
  referenceTransaction?: {
    id: string;
    transactionNumber: string;
    type: TransactionType;
  } | null;
  correctionReason?: string | null;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface StockSummary {
  totalWeightKg: number;
  totalBags: number;
  activeLotsCount: number;
  totalParties: number;
  totalTransactions: number;
  recentTransactions: Array<{
    id: string;
    transactionNumber: string;
    transactionDate: string;
    type: TransactionType;
    yarnCount?: string;
    bags: number;
    kilos: number;
    lot?: { lotNumber: string };
    party?: { name: string };
  }>;
}

export interface PORequirementOption {
  id: string;
  poNumber: string;
  yarnCount: string;
  purpose: string;
  party: { name: string } | null;
  requiredKg: number;
  issuedKg: number;
  ceiling103Kg: number;
  remainingEligibleKg: number;
  isCeilingReached: boolean;
  isActive?: boolean;
  isArchived?: boolean;
}

export interface InventoryFilters {
  search?: string;
  count?: string;
  partyId?: string;
  lotNumber?: string;
  type?: TransactionType;
  purpose?: string;
  poNumber?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}
