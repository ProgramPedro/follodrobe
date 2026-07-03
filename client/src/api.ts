import type { Brand, Facets, Favorite, Filters, FollowAccount, ImportFollowingResult, Product } from "./types";

export async function fetchProducts(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  const response = await fetch(`/api/products?${params.toString()}`);
  if (!response.ok) throw new Error("Could not load products.");
  return response.json() as Promise<{ products: Product[]; facets: Facets }>;
}

export async function fetchBrands() {
  const response = await fetch("/api/brands");
  if (!response.ok) throw new Error("Could not load brands.");
  return response.json() as Promise<{ brands: Brand[] }>;
}

export async function fetchAccounts() {
  const response = await fetch("/api/accounts");
  if (!response.ok) throw new Error("Could not load followed accounts.");
  return response.json() as Promise<{ accounts: FollowAccount[] }>;
}

export async function saveAccountFavorite(accountId: number) {
  const response = await fetch("/api/account-favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId })
  });
  if (!response.ok) throw new Error("Could not favorite account.");
  return response.json() as Promise<{ accounts: FollowAccount[] }>;
}

export async function removeAccountFavorite(accountId: number) {
  const response = await fetch(`/api/account-favorites/${accountId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Could not update account favorite.");
  return response.json() as Promise<{ accounts: FollowAccount[] }>;
}

export async function importFollowingJson(payload: unknown) {
  const response = await fetch("/api/import/following", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Could not import following JSON.");
  return data as Promise<{ result: ImportFollowingResult; accounts: FollowAccount[] }>;
}

export async function addBrand(url: string) {
  const response = await fetch("/api/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });

  const payload = await response.json();
  if (!response.ok && !payload.result) throw new Error(payload.error ?? "Could not add brand.");
  return payload as Promise<{ url: string; result: { message: string; productsFound: number } }>;
}

export async function fetchFavorites() {
  const response = await fetch("/api/favorites");
  if (!response.ok) throw new Error("Could not load favorites.");
  return response.json() as Promise<{ favorites: Favorite[] }>;
}

export async function saveFavorite(productId: number) {
  const response = await fetch("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId })
  });
  if (!response.ok) throw new Error("Could not save favorite.");
  return response.json() as Promise<{ favorites: Favorite[] }>;
}
