import {
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  Factory,
  ShoppingCart,
  Layers,
  Users2,
  Network,
  BarChart3,
  UserCog,
  ShieldCheck,
  FileClock,
  Kanban,
  Settings,
} from "lucide-react";
import { NavItem } from "../types/navigation";

export const NAVIGATION_ITEMS: NavItem[] = [
  // MAIN CORE WORKFLOW
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    section: "MAIN",
  },
  {
    title: "Stock Workflow",
    href: "/workflow",
    icon: Kanban,
    section: "MAIN",
    requiredPermission: "view_inventory",
  },
  {
    title: "Inventory",
    href: "/inventory",
    icon: Boxes,
    section: "MAIN",
    requiredPermission: "view_inventory",
  },
  {
    title: "Transactions",
    href: "/transactions",
    icon: ArrowLeftRight,
    section: "MAIN",
    requiredPermission: "view_inventory",
  },
  {
    title: "Production",
    href: "/production",
    icon: Factory,
    section: "MAIN",
    requiredPermission: "manage_production",
  },
  {
    title: "Traceability",
    href: "/traceability",
    icon: Network,
    section: "MAIN",
    requiredPermission: "view_traceability",
  },

  // COMMERCIAL & OUTPUT
  {
    title: "Purchase Orders",
    href: "/purchase-orders",
    icon: ShoppingCart,
    section: "COMMERCIAL",
    requiredPermission: "manage_purchase_orders",
  },
  {
    title: "Products",
    href: "/products",
    icon: Layers,
    section: "COMMERCIAL",
    requiredPermission: "view_inventory",
  },
  {
    title: "Parties & Suppliers",
    href: "/parties",
    icon: Users2,
    section: "COMMERCIAL",
    requiredPermission: "manage_parties",
  },
  {
    title: "Reports & Analytics",
    href: "/reports",
    icon: BarChart3,
    section: "COMMERCIAL",
    requiredPermission: "view_reports",
  },

  // GOVERNANCE & ACCESS
  {
    title: "Users",
    href: "/users",
    icon: UserCog,
    section: "GOVERNANCE",
    requiredPermission: "manage_users",
  },
  {
    title: "Roles & Permissions",
    href: "/roles-permissions",
    icon: ShieldCheck,
    section: "GOVERNANCE",
    requiredPermission: "manage_roles",
  },
  {
    title: "Audit Logs",
    href: "/audit-logs",
    icon: FileClock,
    section: "GOVERNANCE",
    requiredPermission: "view_audit_logs",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    section: "GOVERNANCE",
  },
];
