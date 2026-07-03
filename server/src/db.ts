import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import type { Brand, Favorite, FollowAccount, FollowAccountInput, Product, ProductInput } from "./types";

const dbPath = join(import.meta.dir, "..", "data", "follodrobe.sqlite");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    message TEXT,
    product_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    price REAL,
    currency TEXT,
    image_url TEXT,
    product_url TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    instagram_url TEXT,
    website_url TEXT,
    profile_image_url TEXT,
    linked_brand TEXT,
    status TEXT NOT NULL DEFAULT 'needs_url',
    message TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS account_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );
`);

const upsertBrandStmt = db.query<Brand, [string, string, Brand["status"], string | null, number]>(`
  INSERT INTO brands (url, name, status, message, product_count, updated_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(url) DO UPDATE SET
    name = excluded.name,
    status = excluded.status,
    message = excluded.message,
    product_count = excluded.product_count,
    updated_at = CURRENT_TIMESTAMP
  RETURNING *
`);

const insertProductStmt = db.query<{ id: number }, [string, string, string | null, number | null, string | null, string | null, string, string | null]>(`
  INSERT INTO products (brand, name, category, price, currency, image_url, product_url, color)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(product_url) DO UPDATE SET
    brand = excluded.brand,
    name = excluded.name,
    category = excluded.category,
    price = excluded.price,
    currency = excluded.currency,
    image_url = excluded.image_url,
    color = excluded.color
  RETURNING id
`);

const upsertAccountStmt = db.query<FollowAccount, [string, string | null, string | null, string | null, string | null, string | null, FollowAccount["status"], string | null]>(`
  INSERT INTO accounts (username, display_name, instagram_url, website_url, profile_image_url, linked_brand, status, message, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(username) DO UPDATE SET
    display_name = COALESCE(excluded.display_name, accounts.display_name),
    instagram_url = COALESCE(excluded.instagram_url, accounts.instagram_url),
    website_url = COALESCE(excluded.website_url, accounts.website_url),
    profile_image_url = COALESCE(excluded.profile_image_url, accounts.profile_image_url),
    linked_brand = COALESCE(excluded.linked_brand, accounts.linked_brand),
    status = excluded.status,
    message = excluded.message,
    updated_at = CURRENT_TIMESTAMP
  RETURNING *
`);

export function upsertBrand(url: string, name: string, status: Brand["status"], message: string | null, productCount: number) {
  return upsertBrandStmt.get(url, name, status, message, productCount);
}

export function listBrands() {
  return db.query<Brand, []>("SELECT * FROM brands ORDER BY name COLLATE NOCASE").all();
}

export function upsertAccount(account: FollowAccountInput) {
  return upsertAccountStmt.get(
    account.username,
    account.display_name,
    account.instagram_url,
    account.website_url,
    account.profile_image_url,
    account.linked_brand,
    account.status,
    account.message
  );
}

export function listAccounts() {
  return db.query<FollowAccount, []>(`
    SELECT
      accounts.*,
      CASE WHEN account_favorites.id IS NULL THEN 0 ELSE 1 END AS is_favorite,
      account_favorites.created_at AS favorited_at
    FROM accounts
    LEFT JOIN account_favorites ON account_favorites.account_id = accounts.id
    ORDER BY
      is_favorite DESC,
      CASE status WHEN 'ready' THEN 0 WHEN 'imported' THEN 1 WHEN 'needs_url' THEN 2 ELSE 3 END,
      COALESCE(display_name, username) COLLATE NOCASE
  `).all();
}

export function addAccountFavorite(accountId: number) {
  db.query("INSERT OR IGNORE INTO account_favorites (account_id) VALUES (?)").run(accountId);
}

export function removeAccountFavorite(accountId: number) {
  db.query("DELETE FROM account_favorites WHERE account_id = ?").run(accountId);
}

export function countProducts() {
  return db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM products").get()?.count ?? 0;
}

export function saveProducts(products: ProductInput[]) {
  const saveMany = db.transaction((items: ProductInput[]) => {
    let saved = 0;
    for (const item of items) {
      const row = insertProductStmt.get(
        item.brand,
        item.name,
        item.category,
        item.price,
        item.currency,
        item.image_url,
        item.product_url,
        item.color
      );
      if (row?.id) saved += 1;
    }
    return saved;
  });

  return saveMany(products);
}

export type ProductFilters = {
  brand?: string;
  category?: string;
  color?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
};

export function listProducts(filters: ProductFilters) {
  const where: string[] = [];
  const values: (string | number)[] = [];

  if (filters.brand) {
    where.push("brand = ?");
    values.push(filters.brand);
  }
  if (filters.category) {
    where.push("category = ?");
    values.push(filters.category);
  }
  if (filters.color) {
    where.push("color = ?");
    values.push(filters.color);
  }
  if (filters.minPrice !== undefined) {
    where.push("price >= ?");
    values.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    where.push("price <= ?");
    values.push(filters.maxPrice);
  }
  if (filters.search) {
    where.push("(name LIKE ? OR brand LIKE ? OR category LIKE ?)");
    const term = `%${filters.search}%`;
    values.push(term, term, term);
  }

  const sql = `
    SELECT * FROM products
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC, brand COLLATE NOCASE, name COLLATE NOCASE
  `;

  return db.query<Product, (string | number)[]>(sql).all(...values);
}

export function addFavorite(productId: number) {
  db.query("INSERT OR IGNORE INTO favorites (product_id) VALUES (?)").run(productId);
}

export function listFavorites() {
  return db.query<Favorite, []>(`
    SELECT
      favorites.id AS favorite_id,
      favorites.created_at AS favorited_at,
      products.*
    FROM favorites
    JOIN products ON products.id = favorites.product_id
    ORDER BY favorites.created_at DESC
  `).all();
}

export function getFacetValues() {
  const brands = db.query<{ value: string }, []>("SELECT DISTINCT brand AS value FROM products ORDER BY brand COLLATE NOCASE").all();
  const categories = db.query<{ value: string }, []>("SELECT DISTINCT category AS value FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category COLLATE NOCASE").all();
  const colors = db.query<{ value: string }, []>("SELECT DISTINCT color AS value FROM products WHERE color IS NOT NULL AND color != '' ORDER BY color COLLATE NOCASE").all();

  return {
    brands: brands.map((row) => row.value),
    categories: categories.map((row) => row.value),
    colors: colors.map((row) => row.value)
  };
}
