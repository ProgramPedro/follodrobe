import { listAccounts, upsertAccount } from "./db";
import { ingestBrand, normalizeSiteUrl } from "./ingest";
import type { FollowAccountInput, ImportFollowingResult } from "./types";

const MAX_IMPORT_INGESTIONS = 12;

type RawAccount = {
  username: string;
  displayName: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
  profileImageUrl: string | null;
};

type JsonRecord = Record<string, unknown>;

export async function importFollowingPayload(payload: unknown): Promise<ImportFollowingResult> {
  const rawAccounts = dedupeAccounts(extractAccounts(payload));
  let accountsImported = 0;
  let accountsIngested = 0;

  for (const account of rawAccounts) {
    const status = account.websiteUrl ? "imported" : "needs_url";
    const message = account.websiteUrl ? "Website found in import. Ready to ingest." : "Imported from following JSON. Add a website URL to ingest products.";
    const saved = upsertAccount(toAccountInput(account, status, null, message));
    if (saved) accountsImported += 1;
  }

  const websiteAccounts = rawAccounts.filter((account) => account.websiteUrl).slice(0, MAX_IMPORT_INGESTIONS);
  for (const account of websiteAccounts) {
    if (!account.websiteUrl) continue;
    const result = await ingestBrand(account.websiteUrl);
    const status = result.productsFound ? "ready" : "failed";
    upsertAccount(toAccountInput(account, status, result.productsFound ? result.brand : null, result.message));
    if (result.productsFound) accountsIngested += 1;
  }

  const websiteCandidates = rawAccounts.filter((account) => account.websiteUrl).length;
  const cappedMessage = websiteCandidates > MAX_IMPORT_INGESTIONS
    ? ` Imported the first ${MAX_IMPORT_INGESTIONS} accounts with websites to keep requests modest.`
    : "";

  return {
    accountsFound: rawAccounts.length,
    accountsImported,
    websiteCandidates,
    accountsIngested,
    accounts: listAccounts(),
    message: `Imported ${accountsImported} followed account${accountsImported === 1 ? "" : "s"}. ${accountsIngested} account${accountsIngested === 1 ? "" : "s"} added products to the closet.${cappedMessage}`
  };
}

function extractAccounts(value: unknown): RawAccount[] {
  const accounts: RawAccount[] = [];
  collectAccounts(value, accounts);
  return accounts;
}

function collectAccounts(value: unknown, accounts: RawAccount[]) {
  if (Array.isArray(value)) {
    for (const item of value) collectAccounts(item, accounts);
    return;
  }

  if (!isRecord(value)) return;

  const instagramExportAccount = accountFromInstagramExport(value);
  if (instagramExportAccount) accounts.push(instagramExportAccount);

  const genericAccount = accountFromGenericObject(value);
  if (genericAccount) accounts.push(genericAccount);

  for (const [key, child] of Object.entries(value)) {
    if (["string_list_data", "media_list_data"].includes(key)) continue;
    if (Array.isArray(child) || isRecord(child)) collectAccounts(child, accounts);
  }
}

function accountFromInstagramExport(value: JsonRecord): RawAccount | null {
  const stringListData = Array.isArray(value.string_list_data) ? value.string_list_data : [];
  const firstStringData = stringListData.find(isRecord);
  if (!firstStringData) return null;

  const instagramUrl = normalizeInstagramUrl(getString(firstStringData.href));
  const username = cleanUsername(getString(firstStringData.value) ?? getString(value.title) ?? usernameFromInstagramUrl(instagramUrl));
  if (!username) return null;

  return {
    username,
    displayName: getString(value.title) ?? username,
    instagramUrl,
    websiteUrl: findWebsiteUrl(value),
    profileImageUrl: findProfileImageUrl(value)
  };
}

function accountFromGenericObject(value: JsonRecord): RawAccount | null {
  const instagramUrl = normalizeInstagramUrl(getString(value.instagram_url) ?? getString(value.instagramUrl) ?? getString(value.profile_url) ?? getString(value.profileUrl));
  const username = cleanUsername(
    getString(value.username) ??
    getString(value.handle) ??
    getString(value.account) ??
    getString(value.title) ??
    usernameFromInstagramUrl(instagramUrl)
  );

  const websiteUrl = findWebsiteUrl(value);
  if (!username && !websiteUrl) return null;

  return {
    username: username ?? usernameFromWebsiteUrl(websiteUrl) ?? "unknown-account",
    displayName: getString(value.display_name) ?? getString(value.displayName) ?? getString(value.full_name) ?? getString(value.name) ?? username,
    instagramUrl,
    websiteUrl,
    profileImageUrl: findProfileImageUrl(value)
  };
}

function toAccountInput(account: RawAccount, status: FollowAccountInput["status"], linkedBrand: string | null, message: string): FollowAccountInput {
  return {
    username: account.username,
    display_name: account.displayName,
    instagram_url: account.instagramUrl,
    website_url: account.websiteUrl,
    profile_image_url: account.profileImageUrl,
    linked_brand: linkedBrand,
    status,
    message
  };
}

function dedupeAccounts(accounts: RawAccount[]) {
  const byUsername = new Map<string, RawAccount>();
  for (const account of accounts) {
    const existing = byUsername.get(account.username);
    byUsername.set(account.username, {
      ...existing,
      ...account,
      displayName: account.displayName ?? existing?.displayName ?? account.username,
      instagramUrl: account.instagramUrl ?? existing?.instagramUrl ?? null,
      websiteUrl: account.websiteUrl ?? existing?.websiteUrl ?? null,
      profileImageUrl: account.profileImageUrl ?? existing?.profileImageUrl ?? null
    });
  }
  return [...byUsername.values()].filter((account) => account.username !== "unknown-account");
}

function findWebsiteUrl(value: JsonRecord) {
  const keys = ["website", "website_url", "websiteUrl", "external_url", "externalUrl", "bio_url", "bioUrl", "link", "url"];
  for (const key of keys) {
    const candidate = normalizeWebsiteUrl(getString(value[key]));
    if (candidate) return candidate;
  }
  return null;
}

function findProfileImageUrl(value: JsonRecord) {
  const keys = ["profile_image_url", "profileImageUrl", "profile_pic_url", "profilePicUrl", "avatar", "avatar_url", "image"];
  for (const key of keys) {
    const candidate = getString(value[key]);
    if (candidate && /^https?:\/\//i.test(candidate)) return candidate;
  }
  return null;
}

function normalizeWebsiteUrl(value: string | null) {
  if (!value || isInstagramUrl(value)) return null;
  if (!/^https?:\/\//i.test(value) && !value.includes(".")) return null;

  try {
    return normalizeSiteUrl(value);
  } catch {
    return null;
  }
}

function normalizeInstagramUrl(value: string | null) {
  if (!value || !isInstagramUrl(value)) return null;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function usernameFromInstagramUrl(value: string | null) {
  if (!value) return null;
  try {
    const username = new URL(value).pathname.split("/").filter(Boolean)[0];
    return cleanUsername(username ?? null);
  } catch {
    return null;
  }
}

function usernameFromWebsiteUrl(value: string | null) {
  if (!value) return null;
  try {
    return cleanUsername(new URL(value).hostname.replace(/^www\./, "").split(".")[0] ?? null);
  } catch {
    return null;
  }
}

function cleanUsername(value: string | null) {
  const cleaned = value?.trim().replace(/^@/, "").toLowerCase();
  return cleaned || null;
}

function isInstagramUrl(value: string) {
  return /(^|\.)instagram\.com/i.test(value);
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}