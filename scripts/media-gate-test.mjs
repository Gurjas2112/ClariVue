// Phase 2 media gate: two real browsers (fake camera/mic) join the same session
// through our SFU. Proves agent ↔ customer media routes via LiveKit by asserting
// each side renders the OTHER side's video with actual frames (videoWidth > 0).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const FAKE = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

// Email confirmation is required, so we log in as the pre-confirmed demo agent
// (a fresh signup would land on the "check your email" screen, not the dashboard).
const agentEmail = "agent@clarivue.demo";
const password = "clarivue123";

function log(...a) {
  console.log("•", ...a);
}

async function countLiveVideos(page) {
  return page.evaluate(() => {
    const vids = Array.from(document.querySelectorAll("video"));
    return vids.filter((v) => v.videoWidth > 0 && v.videoHeight > 0).length;
  });
}

const browser = await chromium.launch({ args: FAKE });
let failed = false;
try {
  // ── Agent: log in → create session → grab invite → open call ───────────
  const agentCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const agent = await agentCtx.newPage();
  agent.setDefaultTimeout(45000);
  agent.setDefaultNavigationTimeout(60000);

  log("agent login", agentEmail);
  await agent.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await agent.fill('input[type="email"]', agentEmail);
  await agent.fill('input[type="password"]', password);
  await agent.click('button[type="submit"]');

  await agent.waitForURL("**/agent/dashboard", { timeout: 25000 });
  log("agent on dashboard");

  await agent.getByRole("button", { name: /start support session/i }).first().click();
  const inviteInput = agent.locator('input[aria-label="Invite link"]');
  await inviteInput.waitFor({ timeout: 15000 });
  const inviteUrl = await inviteInput.inputValue();
  log("invite url", inviteUrl);

  await agent.getByRole("button", { name: /join the call/i }).click();
  await agent.waitForURL("**/agent/session/**", { timeout: 15000 });
  log("agent joined the room");

  // ── Customer: open invite → name → join ────────────────────────────────
  const custCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
  const cust = await custCtx.newPage();
  cust.setDefaultTimeout(45000);
  cust.setDefaultNavigationTimeout(60000);
  await cust.goto(inviteUrl, { waitUntil: "domcontentloaded" });
  await cust.fill('input[placeholder="e.g. Jordan"]', "Test Customer");
  await cust.getByRole("button", { name: /join the call/i }).click();
  log("customer joining…");

  // ── Assert: both sides render 2 videos with frames (self + remote SFU) ──
  const deadline = Date.now() + 30000;
  let agentVids = 0;
  let custVids = 0;
  while (Date.now() < deadline) {
    agentVids = await countLiveVideos(agent);
    custVids = await countLiveVideos(cust);
    if (agentVids >= 2 && custVids >= 2) break;
    await agent.waitForTimeout(1000);
  }

  log(`live videos → agent: ${agentVids}, customer: ${custVids}`);
  if (agentVids >= 2 && custVids >= 2) {
    console.log("✅ MEDIA GATE PASSED — both peers see each other through the SFU.");
  } else {
    failed = true;
    console.log("❌ MEDIA GATE FAILED — remote video did not arrive. Check ICE/TCP config.");
  }

  // ── Chat (R10–R12): agent sends, customer receives in real time ─────────
  const chatText = `hello-${Date.now()}`;
  await agent.getByRole("button", { name: /toggle chat/i }).click();
  await agent.locator('input[aria-label="Message"]').fill(chatText);
  await agent.getByRole("button", { name: /^send$/i }).click();

  await cust.getByRole("button", { name: /toggle chat/i }).click();
  let chatOk = false;
  try {
    await cust.getByText(chatText, { exact: false }).waitFor({ timeout: 10000 });
    chatOk = true;
  } catch {
    chatOk = false;
  }
  log(`chat delivered to customer: ${chatOk}`);
  if (chatOk) {
    console.log("✅ CHAT PASSED — real-time message delivered over the data channel.");
  } else {
    failed = true;
    console.log("❌ CHAT FAILED — message did not arrive on the peer.");
  }

  // ── File sharing (R17): agent uploads → customer sees the file card ──────
  const fixture = join(tmpdir(), `clarivue-fixture-${Date.now()}.txt`);
  writeFileSync(fixture, "ClariVue shared file test.");
  const fixtureName = fixture.split(/[\\/]/).pop();
  await agent.locator('input[type="file"]').setInputFiles(fixture);
  let fileOk = false;
  try {
    await cust.getByText(fixtureName, { exact: false }).waitFor({ timeout: 15000 });
    fileOk = true;
  } catch {
    fileOk = false;
  }
  log(`file shared to customer: ${fileOk}`);
  if (fileOk) {
    console.log("✅ FILE SHARING PASSED — uploaded file delivered to the peer.");
  } else {
    failed = true;
    console.log("❌ FILE SHARING FAILED — file card did not arrive on the peer.");
  }
} catch (err) {
  failed = true;
  console.error("\n❌ Test error:", err.message);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
