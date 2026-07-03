import { countProducts } from "./db";
import { ingestBrand } from "./ingest";

export const EXAMPLE_BRANDS = [
  "https://www.taylorstitch.com",
  "https://www.pangaia.com",
  "https://www.aloyoga.com"
];

export async function seedExampleBrands(force = false) {
  if (!force && countProducts() > 0) return;

  for (const url of EXAMPLE_BRANDS) {
    const result = await ingestBrand(url);
    console.log(`[seed] ${url}: ${result.message}`);
  }
}

if (import.meta.main) {
  await seedExampleBrands(true);
}
