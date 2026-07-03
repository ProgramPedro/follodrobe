import { cors } from "hono/cors";
import { Hono } from "hono";
import { join } from "node:path";
import { addAccountFavorite, addFavorite, getFacetValues, listAccounts, listBrands, listFavorites, listProducts, removeAccountFavorite } from "./db";
import { importFollowingPayload } from "./importFollowing";
import { ingestBrand, normalizeSiteUrl } from "./ingest";
import { seedExampleBrands } from "./seed";

const app = new Hono();
const port = Number(Bun.env.PORT ?? 3001);

app.use("/api/*", cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));

app.get("/api/health", (context) => context.json({ ok: true, name: "Follodrobe" }));

app.get("/api/brands", (context) => context.json({ brands: listBrands() }));

app.get("/api/accounts", (context) => context.json({ accounts: listAccounts() }));

app.post("/api/account-favorites", async (context) => {
  const body = await context.req.json().catch(() => null) as { accountId?: number } | null;
  if (!body?.accountId) return context.json({ error: "accountId is required." }, 400);
  addAccountFavorite(body.accountId);
  return context.json({ accounts: listAccounts() }, 201);
});

app.delete("/api/account-favorites/:accountId", (context) => {
  const accountId = Number(context.req.param("accountId"));
  if (!Number.isFinite(accountId)) return context.json({ error: "Valid accountId is required." }, 400);
  removeAccountFavorite(accountId);
  return context.json({ accounts: listAccounts() });
});

app.post("/api/import/following", async (context) => {
  const body = await context.req.json().catch(() => null) as unknown;
  if (!body) return context.json({ error: "A JSON export is required." }, 400);

  const result = await importFollowingPayload(body);
  return context.json({ result, accounts: result.accounts }, 201);
});

app.post("/api/brands", async (context) => {
  const body = await context.req.json().catch(() => null) as { url?: string } | null;
  if (!body?.url) return context.json({ error: "Brand website URL is required." }, 400);

  let url: string;
  try {
    url = normalizeSiteUrl(body.url);
  } catch {
    return context.json({ error: "Please enter a valid website URL." }, 400);
  }

  const result = await ingestBrand(url);
  return context.json({ url, result }, result.productsFound ? 201 : 202);
});

app.get("/api/products", (context) => {
  const query = context.req.query();
  const filters = {
    brand: query.brand || undefined,
    category: query.category || undefined,
    color: query.color || undefined,
    search: query.search || undefined,
    minPrice: parseOptionalNumber(query.minPrice),
    maxPrice: parseOptionalNumber(query.maxPrice)
  };

  return context.json({ products: listProducts(filters), facets: getFacetValues() });
});

app.get("/api/favorites", (context) => context.json({ favorites: listFavorites() }));

app.post("/api/favorites", async (context) => {
  const body = await context.req.json().catch(() => null) as { productId?: number } | null;
  if (!body?.productId) return context.json({ error: "productId is required." }, 400);
  addFavorite(body.productId);
  return context.json({ favorites: listFavorites() }, 201);
});

app.get("/assets/*", async (context) => {
  const pathname = new URL(context.req.url).pathname;
  const assetPath = pathname.replace(/^\/+/, "");
  const file = Bun.file(join(import.meta.dir, "..", "..", "client", "dist", assetPath));
  if (!(await file.exists())) return context.notFound();
  return new Response(file);
});

app.get("*", async (context) => {
  const index = Bun.file(join(import.meta.dir, "..", "..", "client", "dist", "index.html"));
  if (await index.exists()) return new Response(index, { headers: { "Content-Type": "text/html" } });
  return context.json({ name: "Follodrobe API", client: "Run bun run client:dev for the Vite app." });
});

function parseOptionalNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

Bun.serve({ port, fetch: app.fetch });
console.log(`Follodrobe API listening on http://127.0.0.1:${port}`);

void seedExampleBrands().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown seed error";
  console.error(`[seed] ${message}`);
});
