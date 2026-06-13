// Verifies recording end-to-end on the live site after the webhook fix:
// agent logs in → starts a session → records → stops → the pill reaches "ready".
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "https://clari-vue.vercel.app";
const FAKE = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

const browser = await chromium.launch({ args: FAKE });
let failed = false;
try {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(60000);

  // Login (demo agent is already confirmed, so no email step needed)
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', "agent@clarivue.demo");
  await page.fill('input[type="password"]', "clarivue123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/agent/dashboard", { timeout: 25000 });
  console.log("• agent logged in");

  // Start session → open the call
  await page.getByRole("button", { name: /start support session/i }).first().click();
  await page.locator('input[aria-label="Invite link"]').waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /join the call/i }).click();
  await page.waitForURL("**/agent/session/**", { timeout: 15000 });
  console.log("• agent joined the room");

  // Wait for media to be live, then start recording
  await page.waitForTimeout(4000);
  await page.getByRole("button", { name: /start recording/i }).click();
  console.log("• recording started");
  await page.waitForTimeout(8000);

  // Stop recording
  await page.getByRole("button", { name: /stop recording/i }).click();
  console.log("• recording stopped — waiting for ready…");

  // The pill becomes a "Recording ready" download link when status=ready
  let ready = false;
  try {
    await page.getByText("Recording ready", { exact: false }).waitFor({ timeout: 45000 });
    ready = true;
  } catch {
    ready = false;
  }

  if (ready) {
    console.log("\n✅ RECORDING PASSED — egress completed and the recording is ready to download.");
  } else {
    failed = true;
    console.log("\n❌ RECORDING FAILED — never reached 'ready' (check egress container + webhook).");
  }
} catch (err) {
  failed = true;
  console.error("\n❌ Test error:", err.message);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
