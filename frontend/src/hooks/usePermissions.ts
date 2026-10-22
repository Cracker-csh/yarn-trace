import { useAppSelector } from "../store/hooks";

export function usePermissions() {
  const user = useAppSelector((state) => state.auth.user);

  const roleCode = user?.role?.code || "";
  const isAdmin = roleCode === "ADMIN";
  const isViewer = roleCode === "VIEWER";

  const hasPermission = (permissionKey: string | string[]): boolean => {
    if (!user) return false;
    if (isAdmin) return true;
    if (isViewer) return false;

    const userPerms = user.permissions || [];
    if (Array.isArray(permissionKey)) {
      return permissionKey.some((k) => userPerms.includes(k));
    }
    return userPerms.includes(permissionKey);
  };

  // Explicit action capabilities
  const canReceiveStock = !isViewer && (isAdmin || hasPermission(["inventory.receive", "add_yarn", "receive_stock"]));
  const canAddOpeningStock = !isViewer && (isAdmin || hasPermission(["inventory.add_opening", "add_yarn"]));
  const canAllocateToFloor = !isViewer && (isAdmin || hasPermission(["inventory.issue", "issue_yarn", "manage_production", "production.create"]));
  const canManageParties = !isViewer && (isAdmin || hasPermission(["manage_parties", "manage_suppliers"]));
  const canManagePurchaseOrders = !isViewer && (isAdmin || hasPermission(["manage_purchase_orders", "purchase_orders.create"]));
  const canCreateWorkOrder = !isViewer && (isAdmin || hasPermission(["production.create", "manage_production"]));
  const canManageTeams = !isViewer && (isAdmin || hasPermission(["production.manage_teams", "manage_production"]));
  const canExecuteProduction = !isViewer && (isAdmin || hasPermission(["production.consume", "record_consumption", "production.output"]));
  const canCreateProductBatch = !isViewer && (isAdmin || hasPermission(["products.create", "manage_production"]));

  return {
    user,
    roleCode,
    isAdmin,
    isViewer,
    isReadOnly: isViewer,
    hasPermission,
    canReceiveStock,
    canAddOpeningStock,
    canAllocateToFloor,
    canManageParties,
    canManagePurchaseOrders,
    canCreateWorkOrder,
    canManageTeams,
    canExecuteProduction,
    canCreateProductBatch,
  };
}
