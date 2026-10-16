import { expect, type Page, test } from "@playwright/test";
import { ADMIN, login, pick, receiptViaApi, seedWorld, type World } from "./helpers";

let world: World;

test.beforeAll(async () => {
  world = await seedWorld();
  await receiptViaApi(world, world.branchA.id, 20);
});

/** The list shows "#<id>" rows; the newest one has the highest id. */
async function newestRow(page: Page) {
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  const ids = (await page.getByRole("row").allInnerTexts())
    .map((text) => /^#(\d+)/.exec(text.trim())?.[1])
    .filter((id): id is string => id !== undefined)
    .map(Number);
  return page.getByRole("row").filter({
    has: page.getByRole("cell", { name: `#${Math.max(...ids)}`, exact: true }),
  });
}

test("login rejects a wrong password and accepts the right one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(ADMIN.email);
  await page.getByLabel("Senha").fill("not-the-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();

  await login(page);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
});

test("registers a stock movement and lists it", async ({ page }) => {
  await login(page);
  await page.goto("/movimentacoes");
  await page.getByRole("button", { name: "Nova movimentação" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByText("Entrada", { exact: true }).click();
  await pick(page, "Filial", world.branchB.name);
  await pick(page, "Variação", world.sku.code);
  await dialog.getByLabel("Quantidade").fill("7");
  // A unique reference: the form otherwise sends an empty one (see the follow-up PR on blank references).
  await dialog.getByLabel("Referência (opcional)").fill(`e2e-${world.tag}`);
  await dialog.getByRole("button", { name: "Registrar entrada" }).click();

  await expect(dialog).toBeHidden();
  // branch B was empty, so the newest move is an entry of 7 leaving a balance of 7
  // the list shows no reference column text for ours, so find it by what only it has:
  // an entry of 7 leaving a balance of 7 (branch B was empty) at the top of the list
  const newest = page.getByRole("row").nth(1);
  await expect(newest).toContainText("Entrada");
  await expect(newest.getByRole("cell", { name: "7", exact: true })).toHaveCount(2);
  await expect(page.getByRole("cell", { name: `e2e-${world.tag}` })).toBeVisible();
});

test("creates, ships and receives a transfer between branches", async ({ page }) => {
  await login(page);
  await page.goto("/transferencias");
  await page.getByRole("button", { name: "Nova transferência" }).click();

  const dialog = page.getByRole("dialog");
  await pick(page, "Filial de origem", world.branchA.name);
  await pick(page, "Local de origem", world.branchA.location);
  await pick(page, "Filial de destino", world.branchB.name);
  await pick(page, "Local de destino", world.branchB.location);
  await dialog.getByPlaceholder("Variação").click();
  await page.getByRole("option", { name: world.sku.code }).first().click();
  await dialog.getByPlaceholder("Qtd").fill("3");
  await dialog.getByRole("button", { name: "Criar transferência" }).click();
  await expect(dialog).toBeHidden();

  const row = await newestRow(page);
  await expect(row).toContainText("Rascunho");
  await row.getByRole("button", { name: "Enviar" }).click();
  await expect(row).toContainText("Enviada");
  await row.getByRole("button", { name: "Receber" }).click();
  await expect(row).toContainText("Recebida");
});

test("opens an inventory count for a branch", async ({ page }) => {
  await login(page);
  await page.goto("/contagem");
  await page.getByRole("button", { name: "Nova contagem" }).click();

  const dialog = page.getByRole("dialog");
  await pick(page, "Filial", world.branchA.name);
  await pick(page, "Local", world.branchA.location);
  await dialog.getByRole("button", { name: "Abrir contagem" }).click();

  await expect(dialog).toBeHidden();
  const row = await newestRow(page);
  await expect(row).toContainText("Aberta");
});
