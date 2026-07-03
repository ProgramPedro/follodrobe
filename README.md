# Follodrobe

Follodrobe is a Bun-powered digital closet. Add clothing brand website URLs gathered from Instagram bio links, and the app pulls public product catalog data into one browsable, filterable wardrobe.

The app does not scrape Instagram. It only fetches public brand websites supplied manually by the user.

## Stack

- Runtime and package manager: Bun
- Backend: Bun HTTP server with Hono
- Database: `bun:sqlite`
- Frontend: React, Vite, Tailwind CSS
- Language: TypeScript throughout

## Setup

Install dependencies and generate the Bun lockfile:

```bash
bun install
```

Run the API and Vite client together:

```bash
bun run dev
```

Open the Vite URL printed by the client, usually `http://127.0.0.1:5173`.

Useful scripts:

```bash
bun run seed       # Re-ingest the bundled example brands
bun run typecheck  # TypeScript validation
bun run build      # Typecheck and build the client
```

## How Brand Ingestion Works

When a brand URL is added with `POST /api/brands`, Follodrobe normalizes the URL and tries two public catalog paths:

1. Shopify catalog detection: fetches `{siteUrl}/products.json?limit=250&page=N` and paginates until the catalog is empty or the modest page cap is reached. Each Shopify product is normalized into brand, name, category, price, image, color hint, and a direct `/products/{handle}` URL.
2. JSON-LD fallback: if Shopify data is unavailable, the server fetches the homepage HTML and parses `schema.org` Product JSON-LD blocks for name, price, image, and URL.

Products are stored in SQLite and deduplicated by `product_url`. Failed sources are logged, marked on the brand record, and skipped without crashing the server.

The ingestion fetcher uses a descriptive `User-Agent`, checks `robots.txt`, and keeps requests modest.

## API

- `POST /api/brands` with `{ "url": "https://brand.com" }` adds a brand and triggers ingestion.
- `GET /api/brands` lists added brand sources and ingest status.
- `POST /api/import/following` imports a JSON following export, stores followed accounts, and ingests accounts that include public website URLs.
- `GET /api/accounts` lists imported followed accounts for the swipeable account selector.
- `POST /api/account-favorites` with `{ "accountId": 1 }` favorites a followed clothing account.
- `DELETE /api/account-favorites/:accountId` removes a followed account favorite.
- `GET /api/products` lists products. Filters: `brand`, `category`, `minPrice`, `maxPrice`, `color`, `search`.
- `POST /api/favorites` with `{ "productId": 1 }` saves a product to the wishlist.
- `GET /api/favorites` returns saved wishlist products.

## Importing Followed Accounts

Use the Import following JSON form to upload a JSON export that contains accounts you follow. Follodrobe understands common Instagram data-export shapes such as `relationships_following`, plus generic account objects with fields like `username`, `display_name`, `instagram_url`, `website_url`, `external_url`, and `profile_image_url`.

The app does not scrape Instagram profiles or bio pages. If the export only contains Instagram profile URLs, those accounts are stored in the horizontal closet rail. If an account object includes a public brand website URL, Follodrobe ingests that website and links the account avatar to the imported closet products.

The account rail is designed like a closet rack: swipe sideways through circular profile-picture buttons, tap an account to open that closet, and tap the heart overlay to favorite the clothing account. Favorited accounts sort first.

To keep requests modest, a single import ingests up to 12 accounts with website URLs at a time. All accounts from the JSON are still saved for browsing in the side-swipe account rail.

## Demo Seeds

On first server start, Follodrobe attempts to ingest these example Shopify storefronts so the closet has data immediately:

- `https://www.taylorstitch.com`
- `https://www.pangaia.com`
- `https://www.aloyoga.com`

Some storefronts may block catalog access or disallow paths in `robots.txt`; those failures are recorded and the app keeps running.

## Adding Brands

Use the Add Brand form in the app, paste a clothing brand website URL, and submit. The request waits for ingestion to finish and then refreshes the closet grid, filters, and brand source list.
