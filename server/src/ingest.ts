import { saveProducts, upsertBrand } from "./db";
import type { IngestResult, ProductInput } from "./types";

const USER_AGENT = "FollodrobeBot/0.1 (+https://local.follodrobe.app; product catalog aggregator)";
const MAX_SHOPIFY_PAGES = 8;
const ROBOTS_CACHE = new Map<string, Promise<RobotsRules>>();
const COLOR_WORDS = new Set([
  "black",
  "blue",
  "beige",
  "brown",
  "burgundy",
  "camel",
  "camo",
  "charcoal",
  "coal",
  "copper",
  "coral",
  "cream",
  "dark",
  "denim",
  "espresso",
  "forest",
  "gold",
  "gray",
  "green",
  "grey",
  "indigo",
  "khaki",
  "light",
  "maroon",
  "natural",
  "navy",
  "neutral",
  "oat",
  "oatmeal",
  "olive",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "tan",
  "white",
  "yellow"
]);

type RobotsRules = {
  allow: string[];
  disallow: string[];
};

type ShopifyProduct = {
  title?: string;
  handle?: string;
  product_type?: string;
  vendor?: string;
  tags?: string[] | string;
  variants?: Array<{ price?: string; compare_at_price?: string; option1?: string }>;
  image?: { src?: string };
  images?: Array<{ src?: string }>;
};

type JsonLdNode = Record<string, unknown>;

export async function ingestBrand(siteUrl: string): Promise<IngestResult> {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const fallbackBrand = brandFromUrl(baseUrl);

  upsertBrand(baseUrl, fallbackBrand, "pending", "Ingestion started", 0);

  try {
    let products = await ingestShopify(baseUrl);
    let source: IngestResult["source"] = products.length ? "shopify" : "none";

    if (!products.length) {
      products = await ingestJsonLd(baseUrl);
      source = products.length ? "json-ld" : "none";
    }

    const brandName = products.at(0)?.brand ?? fallbackBrand;
    const saved = saveProducts(products);
    const message = products.length
      ? `Imported ${products.length} product${products.length === 1 ? "" : "s"} from ${source}.`
      : "No Shopify products or JSON-LD Product data found.";

    upsertBrand(baseUrl, brandName, products.length ? "ready" : "failed", message, products.length);

    return {
      brand: brandName,
      productsFound: products.length,
      productsSaved: saved,
      source,
      message
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error";
    console.error(`[ingest] ${baseUrl}: ${message}`);
    upsertBrand(baseUrl, fallbackBrand, "failed", message, 0);

    return {
      brand: fallbackBrand,
      productsFound: 0,
      productsSaved: 0,
      source: "none",
      message
    };
  }
}

export function normalizeSiteUrl(input: string) {
  const withProtocol = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const url = new URL(withProtocol);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

async function ingestShopify(baseUrl: string): Promise<ProductInput[]> {
  const allProducts: ProductInput[] = [];

  for (let page = 1; page <= MAX_SHOPIFY_PAGES; page += 1) {
    const url = new URL(`${baseUrl}/products.json`);
    url.searchParams.set("limit", "250");
    url.searchParams.set("page", String(page));

    const response = await politeFetch(url);
    if (!response.ok) {
      if (page === 1) return [];
      break;
    }

    const payload = (await response.json().catch(() => null)) as { products?: ShopifyProduct[] } | null;
    const products = payload?.products ?? [];
    if (!products.length) break;

    allProducts.push(...products.map((product) => normalizeShopifyProduct(baseUrl, product)).filter(isProductInput));
  }

  return dedupeProducts(allProducts);
}

function isProductInput(product: ProductInput | null): product is ProductInput {
  return product !== null;
}

function normalizeShopifyProduct(baseUrl: string, product: ShopifyProduct): ProductInput | null {
  const handle = product.handle;
  const title = product.title?.trim();
  if (!handle || !title) return null;

  const variant = product.variants?.[0];
  const productUrl = `${baseUrl}/products/${handle}`;
  const color = inferColor(product.tags, variant?.option1);

  return {
    brand: product.vendor?.trim() || brandFromUrl(baseUrl),
    name: title,
    category: product.product_type?.trim() || null,
    price: parsePrice(variant?.price),
    currency: "USD",
    image_url: product.image?.src ?? product.images?.[0]?.src ?? null,
    product_url: productUrl,
    color
  };
}

async function ingestJsonLd(baseUrl: string): Promise<ProductInput[]> {
  const response = await politeFetch(new URL(baseUrl));
  if (!response.ok) return [];

  const html = await response.text();
  const scripts = extractJsonLdScripts(html);
  const products: ProductInput[] = [];

  for (const script of scripts) {
    const parsed = parseJson(script);
    if (!parsed) continue;

    for (const node of flattenJsonLd(parsed)) {
      if (!isProductNode(node)) continue;
      const product = normalizeJsonLdProduct(baseUrl, node);
      if (product) products.push(product);
    }
  }

  return dedupeProducts(products);
}

function normalizeJsonLdProduct(baseUrl: string, node: JsonLdNode): ProductInput | null {
  const name = getString(node.name);
  if (!name) return null;

  const offers = firstObject(node.offers);
  const brand = firstObject(node.brand);
  const productUrl = absoluteUrl(getString(node.url) || getString(offers?.url) || baseUrl, baseUrl);
  if (!productUrl) return null;

  return {
    brand: getString(brand?.name) || brandFromUrl(baseUrl),
    name,
    category: getString(node.category) || getString(node.productType) || null,
    price: parsePrice(getString(offers?.price) || getString(node.price)),
    currency: getString(offers?.priceCurrency) || getString(node.priceCurrency) || "USD",
    image_url: normalizeImage(node.image, baseUrl),
    product_url: productUrl,
    color: getString(node.color) || null
  };
}

async function politeFetch(url: URL) {
  if (!(await canFetch(url))) {
    throw new Error(`Blocked by robots.txt: ${url.toString()}`);
  }

  return fetch(url, {
    headers: {
      "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT
    }
  });
}

async function canFetch(url: URL) {
  const rules = await getRobotsRules(url.origin);
  const path = `${url.pathname}${url.search}`;
  const matchingAllow = longestPrefix(path, rules.allow);
  const matchingDisallow = longestPrefix(path, rules.disallow);

  if (!matchingDisallow) return true;
  return Boolean(matchingAllow && matchingAllow.length >= matchingDisallow.length);
}

function getRobotsRules(origin: string) {
  const cached = ROBOTS_CACHE.get(origin);
  if (cached) return cached;

  const request = fetch(`${origin}/robots.txt`, {
    headers: { "User-Agent": USER_AGENT }
  })
    .then(async (response) => {
      if (!response.ok) return { allow: [], disallow: [] };
      return parseRobots(await response.text());
    })
    .catch(() => ({ allow: [], disallow: [] }));

  ROBOTS_CACHE.set(origin, request);
  return request;
}

function parseRobots(text: string): RobotsRules {
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      current = { agents: [value.toLowerCase()], allow: [], disallow: [] };
      groups.push(current);
      continue;
    }

    if (!current) continue;
    if (key === "allow" && value) current.allow.push(value);
    if (key === "disallow" && value) current.disallow.push(value);
  }

  const applicable = groups.filter((group) => group.agents.includes("*") || group.agents.some((agent) => USER_AGENT.toLowerCase().includes(agent)));
  return applicable.reduce<RobotsRules>(
    (rules, group) => ({
      allow: [...rules.allow, ...group.allow],
      disallow: [...rules.disallow, ...group.disallow]
    }),
    { allow: [], disallow: [] }
  );
}

function longestPrefix(path: string, rules: string[]) {
  return rules
    .filter((rule) => path.startsWith(rule.replace(/\*$/, "")))
    .sort((a, b) => b.length - a.length)
    .at(0);
}

function extractJsonLdScripts(html: string) {
  const scripts: string[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    scripts.push(decodeHtml(match[1]?.trim() ?? ""));
  }

  return scripts;
}

function flattenJsonLd(value: unknown): JsonLdNode[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (!value || typeof value !== "object") return [];

  const node = value as JsonLdNode;
  const graph = node["@graph"];
  return [node, ...flattenJsonLd(graph)];
}

function isProductNode(node: JsonLdNode) {
  const type = node["@type"];
  return Array.isArray(type) ? type.includes("Product") : type === "Product";
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstObject(value: unknown): JsonLdNode | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? (candidate as JsonLdNode) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeImage(value: unknown, baseUrl: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === "string") return absoluteUrl(candidate, baseUrl);
  if (candidate && typeof candidate === "object") return absoluteUrl(getString((candidate as JsonLdNode).url) ?? "", baseUrl);
  return null;
}

function absoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function parsePrice(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function inferColor(tags: ShopifyProduct["tags"], option: string | undefined) {
  const values = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",") : [];
  const taggedColor = values.find((tag) => /^color[:_-]/i.test(tag.trim()));
  if (taggedColor) {
    const color = taggedColor.split(/[:_-]/).slice(1).join(" ").trim();
    return color && isLikelyColor(color) ? color : null;
  }
  return option && isLikelyColor(option) ? option : null;
}

function isLikelyColor(value: string) {
  if (/default title/i.test(value) || /\d/.test(value)) return false;
  const words = value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.some((word) => COLOR_WORDS.has(word));
}

function dedupeProducts(products: ProductInput[]) {
  const byUrl = new Map<string, ProductInput>();
  for (const product of products) byUrl.set(product.product_url, product);
  return [...byUrl.values()];
}

function brandFromUrl(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname.replace(/^www\./, "");
  return hostname.split(".")[0]?.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) ?? hostname;
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
