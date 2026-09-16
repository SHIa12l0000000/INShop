export function hasAdminAccess(role: string, assurance: string) {
  return role === "admin" && assurance === "aal2";
}
export function ownsResource(userId: string, ownerId: string) {
  return !!userId && userId === ownerId;
}
export function mayEditSellerProduct(
  role: string,
  userSellerId: string,
  productSellerId: string,
) {
  return (
    role === "admin" ||
    (role === "seller" && !!userSellerId && userSellerId === productSellerId)
  );
}
