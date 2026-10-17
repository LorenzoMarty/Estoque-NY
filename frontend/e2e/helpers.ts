import { expect, type Page } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
export const ADMIN = { name: "E2E Admin", email: "e2e-admin@example.com", password: "Sup3r-Secret-Pass" };

async function api<T>(path: string, token: string | null, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** Registers the admin (the first user becomes admin; later calls just log in) and returns a token. */
export async function adminToken(): Promise<string> {
  await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ADMIN),
  });
  const tokens = await api<{ access_token: string }>("/auth/login", null, {
    email: ADMIN.email,
    password: ADMIN.password,
  });
  return tokens.access_token;
}

export interface World {
  token: string;
  tag: string;
  branchA: { id: number; name: string; location: string };
  branchB: { id: number; name: string; location: string };
  sku: { id: number; code: string };
}

/** Fresh branches and a SKU per run so specs never depend on leftovers. */
export async function seedWorld(): Promise<World> {
  const token = await adminToken();
  const tag = Date.now().toString(36);
  const branch = async (label: string) => {
    const created = await api<{ id: number; name: string }>("/branches", token, { name: `E2E ${label} ${tag}` });
    const location = await api<{ name: string }>("/locations", token, {
      branch_id: created.id,
      name: `Deposito ${label} ${tag}`,
      type: "STOCK",
    });
    return { id: created.id, name: created.name, location: location.name };
  };
  const [branchA, branchB] = [await branch("A"), await branch("B")];
  const product = await api<{ id: number }>("/catalog/products", token, { name: `E2E produto ${tag}` });
  const code = `E2E-${tag}`;
  const sku = await api<{ id: number }>("/catalog/skus", token, {
    product_id: product.id,
    sku_code: code,
    unit: "UN",
  });
  return { token, tag, branchA, branchB, sku: { id: sku.id, code } };
}

export async function receiptViaApi(world: World, branchId: number, qty: number): Promise<void> {
  const locations = await api<{ items: { id: number; branch_id: number }[] }>(
    `/locations?branch_id=${branchId}`,
    world.token
  );
  await api("/stock/receipts", world.token, {
    branch_id: branchId,
    location_id: locations.items[0].id,
    sku_id: world.sku.id,
    qty,
  });
}

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill(ADMIN.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Opens a Mantine Select inside the open dialog by its label and picks an option by text. */
export async function pick(page: Page, label: string | RegExp, option: string): Promise<void> {
  const name = typeof label === "string" ? new RegExp(String.raw`^${label}( \*)?$`) : label;
  await page.getByRole("dialog").getByRole("combobox", { name }).click();
  await page.getByRole("option", { name: option }).first().click();
}
