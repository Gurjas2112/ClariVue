// Seed a ready-to-use demo session for judges (D4). Idempotent.
//   DB_URL=... node scripts/seed-demo.mjs
import pg from "pg";

const url = process.env.DB_URL;
if (!url) {
  console.error("DB_URL env var is required");
  process.exit(1);
}

const DEMO_AGENT = "agent@clarivue.demo";
const INVITE_ID = "demo-call";
const ROOM_NAME = "clarivue-demo-room";

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const u = await c.query("select id from profiles where email=$1", [DEMO_AGENT]);
  if (u.rows.length === 0) {
    console.error(`Demo agent ${DEMO_AGENT} not found — create it via the signup page first.`);
    process.exit(1);
  }
  const agentId = u.rows[0].id;

  await c.query(
    `insert into sessions (room_name, invite_id, agent_id, title, status)
     values ($1, $2, $3, 'Demo support session', 'active')
     on conflict (invite_id) do update set status='active', ended_at=null`,
    [ROOM_NAME, INVITE_ID, agentId],
  );

  console.log("Demo session ready.");
  console.log(`  Agent login : ${DEMO_AGENT} / clarivue123`);
  console.log(`  Admin login : admin@clarivue.demo / clarivue123`);
  console.log(`  Invite link : /join/${INVITE_ID}`);
} finally {
  await c.end();
}
