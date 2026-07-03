import { ExternalLink, Heart, Import, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { addBrand, fetchAccounts, fetchBrands, fetchFavorites, fetchProducts, importFollowingJson, removeAccountFavorite, saveAccountFavorite, saveFavorite } from "./api";
import type { Brand, Facets, Favorite, Filters, FollowAccount, Product } from "./types";

const emptyFilters: Filters = {
  brand: "",
  category: "",
  color: "",
  search: "",
  minPrice: "",
  maxPrice: ""
};

const emptyFacets: Facets = { brands: [], categories: [], colors: [] };

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [accounts, setAccounts] = useState<FollowAccount[]>([]);
  const [facets, setFacets] = useState<Facets>(emptyFacets);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [view, setView] = useState<"closet" | "favorites">("closet");
  const [visibleCount, setVisibleCount] = useState(72);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Curating the rack...");
  const refreshId = useRef(0);

  async function refresh() {
    const requestId = refreshId.current + 1;
    refreshId.current = requestId;
    setLoading(true);
    try {
      const [productData, brandData, accountData, favoriteData] = await Promise.all([
        fetchProducts(filters),
        fetchBrands(),
        fetchAccounts(),
        fetchFavorites()
      ]);
      if (requestId !== refreshId.current) return;
      setProducts(productData.products);
      setFacets(productData.facets);
      setBrands(brandData.brands);
      setAccounts(accountData.accounts);
      setFavorites(favoriteData.favorites);
      setStatus("");
    } catch (error) {
      if (requestId !== refreshId.current) return;
      setStatus(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      if (requestId === refreshId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [filters.brand, filters.category, filters.color, filters.search, filters.minPrice, filters.maxPrice]);

  useEffect(() => {
    setVisibleCount(72);
  }, [view, filters.brand, filters.category, filters.color, filters.search, filters.minPrice, filters.maxPrice]);

  const favoriteIds = new Set(favorites.map((favorite) => favorite.id));
  const shownProducts = view === "favorites" ? favorites : products;
  const visibleProducts = shownProducts.slice(0, visibleCount);
  const activeAccount = accounts.find((account) => account.linked_brand && account.linked_brand === filters.brand);

  async function handleFavorite(productId: number) {
    try {
      const data = await saveFavorite(productId);
      setFavorites(data.favorites);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save favorite.");
    }
  }

  async function handleAccountFavorite(account: FollowAccount) {
    try {
      const data = account.is_favorite ? await removeAccountFavorite(account.id) : await saveAccountFavorite(account.id);
      setAccounts(data.accounts);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update account favorite.");
    }
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(183,110,85,0.18),transparent_30%),linear-gradient(120deg,rgba(237,226,207,0.8),rgba(251,248,241,0)_45%)]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-7 px-5 py-5 sm:px-8 lg:px-10">
        <header className="border-b border-ink/10 pb-5">
          <h1 className="mx-auto w-fit font-display text-5xl leading-none text-ink sm:text-6xl">Follodrobe</h1>
          <div className="mx-auto mt-5 grid w-full max-w-5xl gap-3 lg:grid-cols-2">
            <ImportFollowingForm onImported={refresh} setStatus={setStatus} />
            <AddBrandForm onAdded={refresh} setStatus={setStatus} />
          </div>
        </header>

        <AccountRail
          accounts={accounts}
          activeBrand={filters.brand}
          onSelect={(account) => {
            if (account.linked_brand && account.linked_brand === filters.brand) {
              setFilters({ ...filters, brand: "" });
              return;
            }
            if (!account.linked_brand) {
              setStatus(account.message ?? "This account needs a website URL before products can be added.");
              return;
            }
            setView("closet");
            setFilters({ ...filters, brand: account.linked_brand });
          }}
          onFavorite={handleAccountFavorite}
        />

        <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="h-fit rounded-lg border border-ink/10 bg-white/75 p-4 shadow-soft backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-ink/65">Filters</h2>
              <SlidersHorizontal className="h-4 w-4 text-clay" />
            </div>
            <FiltersPanel facets={facets} filters={filters} setFilters={setFilters} />
            <BrandList brands={brands} />
          </aside>

          <section className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-ink/55">{shownProducts.length} pieces found</p>
                <h2 className="font-display text-3xl text-ink">{view === "closet" ? activeAccount?.display_name ?? activeAccount?.username ?? "Closet" : "Wishlist"}</h2>
              </div>
              <div className="grid grid-cols-2 rounded-lg border border-ink/10 bg-white/70 p-1 text-sm font-bold">
                <button className={tabClass(view === "closet")} onClick={() => setView("closet")}>Closet</button>
                <button className={tabClass(view === "favorites")} onClick={() => setView("favorites")}>Favorites</button>
              </div>
            </div>

            {status ? <p className="rounded-lg border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-ink/75">{status}</p> : null}
            {loading ? <LoadingGrid /> : <ProductGrid products={visibleProducts} totalCount={shownProducts.length} favoriteIds={favoriteIds} onFavorite={handleFavorite} onLoadMore={() => setVisibleCount((count) => count + 72)} />}
          </section>
        </section>
      </div>
    </main>
  );
}

function ImportFollowingForm({ onImported, setStatus }: { onImported: () => Promise<void>; setStatus: (status: string) => void }) {
  const [fileName, setFileName] = useState("");
  const [payload, setPayload] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      setPayload(JSON.parse(await file.text()));
      setStatus(`Ready to import ${file.name}.`);
    } catch {
      setPayload(null);
      setStatus("That file is not valid JSON.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!payload) return;

    setSubmitting(true);
    setStatus("Importing followed accounts and checking public catalogs...");
    try {
      const response = await importFollowingJson(payload);
      setStatus(response.result.message);
      await onImported();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import following JSON.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-ink/10 bg-white/75 p-3 shadow-soft backdrop-blur">
      <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-ink/60" htmlFor="following-json">Import following JSON</label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <label className="flex min-h-11 cursor-pointer items-center rounded-md border border-dashed border-ink/20 bg-paper px-3 text-sm font-bold text-ink/60 transition hover:border-clay hover:text-clay" htmlFor="following-json">
          <Import className="mr-2 h-4 w-4" />
          <span className="truncate">{fileName || "Choose JSON export"}</span>
        </label>
        <input id="following-json" type="file" accept="application/json,.json" className="sr-only" onChange={handleFileChange} />
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-clay px-4 text-sm font-extrabold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-60" disabled={!payload || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Import
        </button>
      </div>
    </form>
  );
}

function AccountRail({ accounts, activeBrand, onSelect, onFavorite }: { accounts: FollowAccount[]; activeBrand: string; onSelect: (account: FollowAccount) => void; onFavorite: (account: FollowAccount) => Promise<void> }) {
  if (!accounts.length) return null;

  return (
    <section className="relative overflow-hidden rounded-lg border border-ink/10 bg-[linear-gradient(90deg,rgba(183,110,85,0.14),rgba(237,226,207,0.9)_16%,rgba(251,248,241,0.92)_50%,rgba(237,226,207,0.88)_84%,rgba(183,110,85,0.14)),repeating-linear-gradient(90deg,rgba(23,21,18,0.06)_0,rgba(23,21,18,0.06)_1px,transparent_1px,transparent_96px)] px-4 pb-5 pt-8 shadow-soft backdrop-blur">
      <div className="absolute left-6 right-6 top-7 h-2 rounded-full bg-ink/75 shadow-[0_10px_22px_rgba(23,21,18,0.22)]" />
      <div className="absolute bottom-2 left-5 right-5 h-3 rounded-full bg-clay/25 blur-sm" />
      <div className="relative flex snap-x gap-5 overflow-x-auto px-1 pb-2 pt-5 [scrollbar-width:thin]">
        {accounts.map((account) => {
          const active = Boolean(account.linked_brand && account.linked_brand === activeBrand);
          return (
            <div key={account.id} className="relative shrink-0 snap-start">
              <button title={account.display_name ?? account.username} aria-label={account.display_name ?? account.username} onClick={() => onSelect(account)} className="group block rounded-full outline-none ring-clay/35 transition hover:-translate-y-1 focus:ring-4">
                <Avatar account={account} active={active} />
              </button>
              <button
                title={account.is_favorite ? "Unfavorite account" : "Favorite account"}
                aria-label={account.is_favorite ? `Unfavorite ${account.username}` : `Favorite ${account.username}`}
                onClick={() => void onFavorite(account)}
                className={`absolute -right-1 bottom-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white shadow-md transition hover:scale-105 ${account.is_favorite ? "bg-clay text-white" : "bg-paper text-ink/55 hover:text-clay"}`}
              >
                <Heart className="h-4 w-4" fill={account.is_favorite ? "currentColor" : "none"} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Avatar({ account, active }: { account: FollowAccount; active: boolean }) {
  const label = (account.display_name ?? account.username).slice(0, 2).toUpperCase();
  return (
    <span className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 text-lg font-black shadow-lg transition ${active ? "border-clay ring-4 ring-clay/20" : account.is_favorite ? "border-moss" : "border-white"} bg-gradient-to-br from-oat via-white to-clay/30 text-ink`}>
      {account.profile_image_url ? <img src={account.profile_image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : label}
    </span>
  );
}

function AddBrandForm({ onAdded, setStatus }: { onAdded: () => Promise<void>; setStatus: (status: string) => void }) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;

    setSubmitting(true);
    setStatus("Fetching public product data...");
    try {
      const response = await addBrand(url);
      setStatus(response.result.message);
      setUrl("");
      await onAdded();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not add brand.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full rounded-lg border border-ink/10 bg-white/75 p-3 shadow-soft backdrop-blur lg:max-w-md">
      <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-ink/60" htmlFor="brand-url">Add brand website</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="brand-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://brand.com"
          className="min-h-11 flex-1 rounded-md border border-ink/10 bg-paper px-3 text-sm outline-none ring-clay/30 transition focus:ring-4"
        />
        <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-extrabold text-white transition hover:bg-clay disabled:cursor-wait disabled:opacity-70" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Ingest
        </button>
      </div>
    </form>
  );
}

function FiltersPanel({ facets, filters, setFilters }: { facets: Facets; filters: Filters; setFilters: (filters: Filters) => void }) {
  return (
    <div className="grid gap-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        <input
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder="Search pieces"
          className="min-h-11 w-full rounded-md border border-ink/10 bg-paper pl-9 pr-3 text-sm outline-none ring-clay/30 transition focus:ring-4"
        />
      </label>
      <Select label="Brand" value={filters.brand} options={facets.brands} onChange={(brand) => setFilters({ ...filters, brand })} />
      <Select label="Category" value={filters.category} options={facets.categories} onChange={(category) => setFilters({ ...filters, category })} />
      <Select label="Color" value={filters.color} options={facets.colors} onChange={(color) => setFilters({ ...filters, color })} />
      <div className="grid grid-cols-2 gap-2">
        <input
          value={filters.minPrice}
          onChange={(event) => setFilters({ ...filters, minPrice: event.target.value })}
          placeholder="Min $"
          type="number"
          className="min-h-11 rounded-md border border-ink/10 bg-paper px-3 text-sm outline-none ring-clay/30 transition focus:ring-4"
        />
        <input
          value={filters.maxPrice}
          onChange={(event) => setFilters({ ...filters, maxPrice: event.target.value })}
          placeholder="Max $"
          type="number"
          className="min-h-11 rounded-md border border-ink/10 bg-paper px-3 text-sm outline-none ring-clay/30 transition focus:ring-4"
        />
      </div>
      <button className="min-h-10 rounded-md border border-ink/10 text-sm font-bold text-ink/70 transition hover:border-clay hover:text-clay" onClick={() => setFilters(emptyFilters)}>
        Clear filters
      </button>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium normal-case tracking-normal text-ink outline-none ring-clay/30 transition focus:ring-4">
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function BrandList({ brands }: { brands: Brand[] }) {
  if (!brands.length) return null;
  return (
    <div className="mt-5 border-t border-ink/10 pt-4">
      <h3 className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-ink/55">Sources</h3>
      <div className="grid gap-2">
        {brands.map((brand) => (
          <div key={brand.id} className="rounded-md bg-paper px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2 font-bold">
              <span className="truncate">{brand.name}</span>
              <span className={brand.status === "ready" ? "text-moss" : "text-clay"}>{brand.product_count}</span>
            </div>
            <p className="truncate text-xs text-ink/45">{brand.message ?? brand.url}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductGrid({ products, totalCount, favoriteIds, onFavorite, onLoadMore }: { products: Product[]; totalCount: number; favoriteIds: Set<number>; onFavorite: (productId: number) => Promise<void>; onLoadMore: () => void }) {
  if (!totalCount) {
    return <div className="rounded-lg border border-dashed border-ink/20 bg-white/60 p-10 text-center text-ink/60">No pieces match the current rack.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => <ProductCard key={product.id} product={product} saved={favoriteIds.has(product.id)} onFavorite={onFavorite} />)}
      </div>
      {products.length < totalCount ? (
        <button className="mx-auto mt-3 min-h-11 rounded-md border border-ink/10 bg-white px-5 text-sm font-extrabold text-ink/70 transition hover:border-clay hover:text-clay" onClick={onLoadMore}>
          Load more pieces
        </button>
      ) : null}
    </>
  );
}

function ProductCard({ product, saved, onFavorite }: { product: Product; saved: boolean; onFavorite: (productId: number) => Promise<void> }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-ink/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-soft">
      <div className="aspect-[4/5] overflow-hidden bg-oat">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center font-display text-2xl text-ink/35">Follodrobe</div>
        )}
      </div>
      <div className="grid gap-3 p-4">
        <div>
          <div className="mb-1 flex items-center justify-between gap-3 text-xs font-extrabold uppercase tracking-[0.15em] text-clay">
            <span className="truncate">{product.brand}</span>
            <span>{formatPrice(product.price, product.currency)}</span>
          </div>
          <h3 className="line-clamp-2 min-h-12 text-lg font-extrabold leading-6">{product.name}</h3>
          <p className="mt-1 text-sm text-ink/50">{product.category ?? "Uncategorized"}{product.color ? ` / ${product.color}` : ""}</p>
        </div>
        <div className="grid grid-cols-[1fr_44px] gap-2">
          <a href={product.product_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-extrabold text-white transition hover:bg-denim">
            Shop
            <ExternalLink className="h-4 w-4" />
          </a>
          <button aria-label="Save favorite" title="Save favorite" onClick={() => onFavorite(product.id)} className={`inline-flex min-h-11 items-center justify-center rounded-md border transition ${saved ? "border-clay bg-clay text-white" : "border-ink/10 text-ink/65 hover:border-clay hover:text-clay"}`}>
            <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </article>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border border-ink/10 bg-white">
          <div className="aspect-[4/5] animate-pulse bg-oat" />
          <div className="grid gap-3 p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-ink/10" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-ink/10" />
            <div className="h-11 animate-pulse rounded bg-ink/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function tabClass(active: boolean) {
  return `min-h-10 rounded-md px-4 transition ${active ? "bg-ink text-white" : "text-ink/55 hover:text-ink"}`;
}

function formatPrice(price: number | null, currency: string | null) {
  if (price === null) return "Price n/a";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency ?? "USD" }).format(price);
  } catch {
    return `$${price.toFixed(2)}`;
  }
}
