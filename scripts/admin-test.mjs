// Admin dashboard (R19) access control + render check.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
let failed = false;

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/agent/dashboard", { timeout: 20000 });
}

try {
  // 1) Anonymous → redirected to /login
  const anon = await (await browser.newContext()).newPage();
  anon.setDefaultNavigationTimeout(30000);
  await anon.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  const anonOk = anon.url().includes("/login");
  console.log(anonOk ? "✅ anon → /login" : `❌ anon not redirected (${anon.url()})`);
  if (!anonOk) failed = true;

  // 2) Regular agent → redirected to /agent/dashboard (not admin)
  const agentCtx = await browser.newContext();
  const agent = await agentCtx.newPage();
  agent.setDefaultNavigationTimeout(30000);
  await login(agent, "agent@clarivue.demo", "clarivue123");
  await agent.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await agent.waitForTimeout(1500);
  const agentBlocked = agent.url().includes("/agent/dashboard");
  console.log(agentBlocked ? "✅ non-admin agent blocked from /admin" : `❌ agent reached ${agent.url()}`);
  if (!agentBlocked) failed = true;

  // 3) Admin → /admin renders Operations
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  admin.setDefaultNavigationTimeout(30000);
  await login(admin, "admin@clarivue.demo", "clarivue123");
  await admin.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  const heading = await admin.getByText("Operations", { exact: false }).first().isVisible().catch(() => false);
  const liveResp = await admin.request.get(`${BASE}/api/admin/live`);
  const liveOk = liveResp.ok();
  console.log(heading ? "✅ admin sees Operations dashboard" : "❌ admin dashboard did not render");
  console.log(liveOk ? "✅ /api/admin/live → 200 for admin" : `❌ /api/admin/live → ${liveResp.status()}`);
  if (!heading || !liveOk) failed = true;

  console.log(failed ? "\n❌ ADMIN CHECKS FAILED" : "\n✅ ADMIN (R19) PASSED");
} catch (err) {
  failed = true;
  console.error("❌ Test error:", err.message);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
