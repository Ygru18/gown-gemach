// End-to-end browser test of the main Gemach workflows.
// Runs against a local dev server started with E2E_LOCAL_MODE=1 (local auth + storage).
//   E2E_LOCAL_MODE=1 npx next dev -p 3000   then   node e2e/workflow.e2e.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR || "e2e-screens";
const fs = require("node:fs");
fs.mkdirSync(SHOTS, { recursive: true });

const ymd = (d) => d.toISOString().slice(0, 10);
const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

async function makeImage(browser, color) {
  const p = await browser.newPage({ viewport: { width: 600, height: 800 } });
  await p.setContent(`<body style="margin:0;background:linear-gradient(${color},#fff)"><div style="font:80px serif;padding:200px 100px;color:#a85a64">Gown</div></body>`);
  const buf = await p.screenshot({ type: "jpeg", quality: 80 });
  await p.close();
  return buf;
}

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  const t = Date.now();
  await fn();
  console.log(`ok (${Date.now() - t}ms)`);
};

async function toast(page, re) {
  await page.getByRole("status").filter({ hasText: re }).first().waitFor({ timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const img1 = await makeImage(browser, "#f5d5d6");
  const img2 = await makeImage(browser, "#ecdcc0");

  const login = async (email) => {
    await page.goto(`${BASE}/login`);
    await page.fill("#email", email);
    await page.fill("#password", "irrelevant-in-local-mode");
    await page.click("button[type=submit]");
    await page.waitForURL(/dashboard|account/, { timeout: 30000 });
  };

  await step("first-run setup or admin login", async () => {
    await page.goto(`${BASE}/setup`);
    if (page.url().includes("/setup")) {
      await page.fill("#fullName", "Sarah Feldman");
      await page.fill("#email", "admin@example.test");
      await page.fill("#password", "supersecret1");
      await page.fill("#confirmPassword", "supersecret1");
      await page.click("button[type=submit]");
      await page.waitForURL("**/dashboard", { timeout: 30000 });
    } else {
      await login("admin@example.test");
    }
    await page.getByText("In Loving Memory").first().waitFor();
    await page.getByText("Sharing beauty, kindness and generosity in loving memory of Chaya Surah Feldman.").first().waitFor();
  });

  await step("admin sets default fee and deposit in Settings", async () => {
    await page.goto(`${BASE}/settings`);
    await page.fill("#defaultRentalFeeCents", "36");
    await page.fill("#defaultDepositCents", "100");
    await page.click("button:has-text('Save settings')");
    await toast(page, /Settings saved/);
  });

  let gownUrl;
  const desc = `Ivory lace A-line ${Date.now() % 100000}`;
  await step("gown intake with two photos", async () => {
    await page.goto(`${BASE}/intake`);
    await page.fill("#description", desc);
    await page.fill("#style", "A-line");
    await page.fill("#size", "8");
    await page.fill("#color", "Ivory");
    await page.fill("#designer", "Pronovias");
    await page.selectOption("#intakeCondition", "EXCELLENT");
    await page.fill("#bust", "34 in");
    await page.getByText("New donor", { exact: true }).click();
    await page.fill("#donorName", "Leah Gold");
    await page.fill("#donorPhone", "718-555-2222");
    await page.setInputFiles('[data-testid="photo-input"]', [
      { name: "front.jpg", mimeType: "image/jpeg", buffer: img1 },
      { name: "back.jpg", mimeType: "image/jpeg", buffer: img2 },
    ]);
    await page.getByText("MAIN").first().waitFor();
    await page.click("button:has-text('Save gown')");
    await page.waitForURL(/\/inventory\/[0-9a-f-]{36}/, { timeout: 60000 });
    gownUrl = page.url().split("?")[0];
    await page.getByText(desc).first().waitFor();
    await page.locator('img[alt="Gown photograph"]').waitFor();
    const thumbs = await page.locator("button img").count();
    assert.ok(thumbs >= 2, `expected 2 photo thumbnails, got ${thumbs}`);
    await page.getByText("Leah Gold").first().waitFor();
    await page.screenshot({ path: `${SHOTS}/gown-detail.png`, fullPage: true });
  });

  await step("second gown without donor; inventory gallery & table", async () => {
    await page.goto(`${BASE}/intake`);
    await page.fill("#description", "Blush tulle ball gown");
    await page.fill("#style", "Ball gown");
    await page.fill("#size", "10");
    await page.fill("#color", "Blush");
    await page.click("button:has-text('Save gown')");
    await page.waitForURL(/\/inventory\/[0-9a-f-]{36}/, { timeout: 60000 });
    await page.goto(`${BASE}/inventory`);
    await page.getByText(desc).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/inventory-gallery.png`, fullPage: true });
    await page.goto(`${BASE}/inventory?view=table&size=8`);
    await page.getByText(desc).first().waitFor();
    assert.equal(await page.getByText("Blush tulle ball gown").count(), 0, "size filter should hide size 10");
  });

  await step("admin creates an assistant account", async () => {
    await page.goto(`${BASE}/staff`);
    if (!(await page.getByText("miriam@example.test").count())) {
      await page.click("button:has-text('Add staff member')");
      await page.fill("#fullName", "Miriam Assistant");
      await page.fill("#email", "miriam@example.test");
      await page.fill("#temporaryPassword", "temporary-pass-1");
      await page.click("dialog button[type=submit]");
      await page.getByText("miriam@example.test").waitFor({ timeout: 20000 });
    }
  });

  let resUrl;
  await step("new reservation with a new customer (no email)", async () => {
    await page.goto(`${BASE}${new URL(gownUrl).pathname}`);
    await page.click("a:has-text('Reserve this gown')");
    await page.waitForURL(/reservations\/new/);
    await page.click("button:has-text('New customer')");
    const phone = `718-555-${String(Date.now() % 10000).padStart(4, "0")}`;
    await page.fill("#fullName", `Rivka Klein ${phone.slice(-4)}`);
    await page.fill("#phone", phone);
    await page.click("button:has-text('Add customer')");
    await page.getByText("Change").waitFor({ timeout: 20000 });
    await page.fill("#pickup", plus(0));
    await page.fill("#ret", plus(3));
    await page.getByText("Available for these dates").first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${SHOTS}/reservation-new.png`, fullPage: true });
    await page.click("button:has-text('Create pending reservation')");
    await page.waitForURL(/reservations\/[0-9a-f-]{36}/, { timeout: 30000 });
    resUrl = page.url().split("?")[0];
    await page.getByText("Pending reservation.").waitFor();
  });

  await step("confirm reservation (step 2)", async () => {
    await page.click("button:has-text('Confirm reservation')");
    await page.click("dialog button[type=submit]");
    await toast(page, /confirmed/i);
    await page.getByText("Confirm pickup").first().waitFor();
  });

  await step("record partial payment and deposit", async () => {
    await page.click("button:has-text('Record payment')");
    await page.fill("dialog #amountCents", "20");
    await page.click("dialog button[type=submit]");
    await toast(page, /Saved/);
    await page.getByText("Partially Paid").first().waitFor();
    await page.click("button:has-text('Record deposit')");
    await page.fill("dialog #damount", "100");
    await page.click("dialog button[type=submit]");
    await toast(page, /Deposit entry saved/);
  });

  await step("confirm pickup", async () => {
    await page.click("button:has-text('Confirm pickup')");
    await page.click("dialog button[type=submit]");
    await toast(page, /Pickup confirmed/);
    await page.getByText("Mark as returned").first().waitFor();
  });

  await step("double booking is refused for overlapping dates", async () => {
    await page.goto(`${BASE}/reservations/new?gownId=${gownUrl.split("/").pop()}`);
    await page.locator('input[aria-label="Search customers"]').fill("Rivka");
    await page.locator("ul button:has-text('Rivka')").first().click();
    await page.getByText("Change").waitFor();
    await page.fill("#pickup", plus(1));
    await page.fill("#ret", plus(2));
    await page.getByText(/Checked out on R-/).first().waitFor({ timeout: 20000 });
    assert.ok(await page.locator("button:has-text('Create pending reservation')").isDisabled());
  });

  await step("return with damage → Pending Inspection", async () => {
    await page.goto(resUrl);
    await page.click("button:has-text('Mark as returned')");
    await page.getByText("Damage noticed").click();
    await page.fill("#damageNotes", "Small mark on hem");
    await page.setInputFiles('dialog [data-testid="photo-input"]', [{ name: "dmg.jpg", mimeType: "image/jpeg", buffer: img2 }]);
    await page.click("dialog button:has-text('Record return')");
    await toast(page, /pending inspection/i);
    await page.getByText("Awaiting inspection").first().waitFor();
    await page.goto(gownUrl);
    await page.getByText("Pending Inspection").first().waitFor();
  });

  await step("inspection: needs cleaning, then complete & mark ready", async () => {
    await page.click("button:has-text('Inspect now')");
    await page.locator("dialog label:has-text('Needs cleaning')").click();
    await page.fill("dialog #cleaningReason", "Hem soiled");
    await page.click("dialog button[type=submit]");
    await toast(page, /Inspection recorded/);
    await page.getByText("Pending Cleaning").first().waitFor();
    await page.goto(`${BASE}/returns`);
    await page.getByText("Hem soiled").first().waitFor();
    await page.screenshot({ path: `${SHOTS}/returns.png`, fullPage: true });
    await page.locator("#cleaning button:has-text('Update')").first().click();
    await page.fill("dialog #costCents", "18");
    await page.click("dialog button[type=submit]");
    await toast(page, /Cleaning updated/);
    await page.goto(gownUrl);
    await page.getByText("Available").first().waitFor();
  });

  await step("payments: settle balance; dashboard & calendar", async () => {
    await page.goto(resUrl);
    await page.click("button:has-text('Record payment')");
    await page.click("dialog button[type=submit]");
    await toast(page, /Saved/);
    await page.getByText("Paid", { exact: true }).first().waitFor();
    await page.goto(`${BASE}/dashboard`);
    await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });
    await page.goto(`${BASE}/reservations?view=calendar`);
    await page.getByText("Pending pickup").first().waitFor();
    await page.screenshot({ path: `${SHOTS}/calendar.png`, fullPage: true });
  });

  await step("reports load and CSV export works", async () => {
    for (const tab of ["inventory", "donations", "reservations", "customers", "overdue", "financial", "activity"]) {
      await page.goto(`${BASE}/reports?tab=${tab}`);
      await page.getByRole("heading", { name: "Reports & records" }).waitFor();
    }
    await page.goto(`${BASE}/reports?tab=financial`);
    await page.screenshot({ path: `${SHOTS}/reports-financial.png`, fullPage: true });
    const res = await page.request.get(`${BASE}/reports/export?report=inventory`);
    assert.equal(res.status(), 200);
    const csv = await res.text();
    assert.ok(csv.startsWith("Gown ID,"), "CSV header");
    assert.ok(csv.includes(desc), "CSV contains gown");
  });

  await step("assistant: restricted areas hidden and blocked server-side", async () => {
    await page.context().clearCookies();
    await login("miriam@example.test");
    if (page.url().includes("/account")) {
      await page.fill("#newPassword", "my-own-password-1");
      await page.fill("#confirmPassword", "my-own-password-1");
      await page.click("button[type=submit]");
      await page.waitForURL("**/dashboard", { timeout: 20000 });
    }
    assert.equal(await page.locator("nav a:has-text('Staff / Users')").count(), 0);
    assert.equal(await page.locator("nav a:has-text('Settings')").count(), 0);
    await page.goto(`${BASE}/staff`);
    await page.waitForURL(/dashboard/);
    await page.goto(`${BASE}/settings`);
    await page.waitForURL(/dashboard/);
    // Operational access: assistant can open intake and inventory, and has no delete button.
    await page.goto(gownUrl);
    assert.equal(await page.getByText("Delete permanently").count(), 0);
    await page.getByText("Archive").first().waitFor();
  });

  await step("mobile layout", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/dashboard`);
    await page.screenshot({ path: `${SHOTS}/mobile-dashboard.png`, fullPage: false });
    await page.click("button[aria-label='Open menu']");
    await page.locator("div.fixed nav a[href='/inventory']").click();
    await page.waitForURL(/inventory/);
    await page.screenshot({ path: `${SHOTS}/mobile-inventory.png`, fullPage: false });
  });

  await browser.close();
  const real = errors.filter((e) => !/hydrat/i.test(e));
  if (real.length) {
    console.error("Page errors:", real);
    process.exit(1);
  }
  console.log("\nAll end-to-end checks passed.");
})().catch((e) => {
  console.error("\nE2E FAILED:", e);
  process.exit(1);
});
