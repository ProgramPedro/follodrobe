export type Product = {
  id: number;
  brand: string;
  name: string;
  category: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  product_url: string;
  color: string | null;
  created_at: string;
};

export type ProductInput = Omit<Product, "id" | "created_at">;

export type Brand = {
  id: number;
  url: string;
  name: string;
  status: "pending" | "ready" | "failed";
  message: string | null;
  product_count: number;
  created_at: string;
  updated_at: string;
};

export type FollowAccount = {
  id: number;
  username: string;
  display_name: string | null;
  instagram_url: string | null;
  website_url: string | null;
  profile_image_url: string | null;
  linked_brand: string | null;
  status: "needs_url" | "imported" | "ready" | "failed";
  message: string | null;
  is_favorite: 0 | 1;
  favorited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowAccountInput = Omit<FollowAccount, "id" | "is_favorite" | "favorited_at" | "created_at" | "updated_at">;

export type Favorite = Product & {
  favorite_id: number;
  favorited_at: string;
};

export type IngestResult = {
  brand: string;
  productsFound: number;
  productsSaved: number;
  source: "shopify" | "json-ld" | "none";
  message: string;
};

export type ImportFollowingResult = {
  accountsFound: number;
  accountsImported: number;
  websiteCandidates: number;
  accountsIngested: number;
  accounts: FollowAccount[];
  message: string;
};
