// sample-agent-skillmd — a sample AIProve agent that completes the full loop:
//   read skill.md -> authenticate with its own keypair -> list open bounties
//   -> enter one bounty -> verify via /api/me.
//
// Usage:
//   AGENT_PRIVATE_KEY=0x... node agent.mjs [slug-to-enter]
//   API_BASE_URL=https://aiprove.fun   (default; override for a staging arena)
//
// The private key is read ONLY from the environment. It is never printed,
// never written to disk, and never sent anywhere except as an EIP-191
// signature over the server-issued challenge (the key itself never leaves
// this process). The session token is kept in memory only and never printed
// (only its length / expiry are logged).
//
// Staging note: the bounty brief says the sandbox verifies the loop "against
// a staging arena", but the live skill.md (GET /skill.md, 2026-11-14) defines
// no staging arena, no staging host, and no staging endpoint — its API base
// is https://aiprove.fun and the endpoint reference is the stable surface.
// So this agent runs the loop against API_BASE_URL (live by default, or a
// staging host via API_BASE_URL when one is provided).

import { Wallet } from 'ethers';

const API = process.env.API_BASE_URL || 'https://aiprove.fun';
const ENTER_SLUG = process.argv[2] || 'sample-agent-skillmd';
const HANDLE = process.env.AGENT_HANDLE || 'h2r.agent';

const key = process.env.AGENT_PRIVATE_KEY;
if (!key) {
  console.error('ERROR: set AGENT_PRIVATE_KEY env var (never commit a key).');
  process.exit(1);
}
const wallet = new Wallet(key.trim());
const address = wallet.address;

const step = (n, msg) => console.log(`[step ${n}] ${msg}`);
const fail = (where, detail) => {
  console.error(`FAIL at ${where}: ${detail}`);
  process.exit(1);
};

async function getJson(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

async function postJson(path, token, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { _raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

console.log('=== sample-agent-skillmd: full loop ===');
console.log(`api: ${API}`);
console.log(`agent address: ${address}`);
console.log(`target bounty to enter: ${ENTER_SLUG}`);

// 1. Read skill.md
step(1, 'read skill.md');
{
  const res = await fetch(`${API}/skill.md`);
  const md = await res.text();
  if (res.status !== 200 || !md.includes('Authenticate')) fail('read skill.md', `HTTP ${res.status}`);
  const firstLine = md.split('\n').find((l) => l.startsWith('# ')) || '(no title)';
  console.log(`  skill.md OK: ${md.length} bytes, title: ${firstLine}`);
}

// 2. Health check
step(2, 'health check');
{
  const { status, body } = await getJson('/api/health');
  console.log(`  /api/health HTTP ${status} -> ${JSON.stringify(body).slice(0, 200)}`);
  if (status !== 200) fail('health check', `HTTP ${status}`);
}

// 3. Authenticate: challenge -> sign -> verify
step(3, 'authenticate (challenge -> EIP-191 sign -> verify)');
let token;
{
  const { status, body } = await getJson(`/api/auth/challenge?address=${address}`);
  if (status !== 200 || !body.challenge) fail('auth challenge', `HTTP ${status} ${JSON.stringify(body).slice(0, 200)}`);
  console.log(`  challenge received (len ${String(body.challenge).length})`);
  const signature = await wallet.signMessage(body.challenge);
  console.log(`  challenge signed (sig len ${signature.length})`);
  const v = await postJson('/api/auth/verify', null, { address, signature });
  if (v.status !== 200 || !v.body.token) fail('auth verify', `HTTP ${v.status} ${JSON.stringify(v.body).slice(0, 200)}`);
  token = v.body.token;
  console.log(`  session acquired (token len ${token.length}), expiresAt=${v.body.expiresAt ?? 'n/a'}`);
}

// 4. List open bounties
step(4, 'list open bounties');
let openSlugs = [];
{
  const { status, body } = await getJson('/api/bounties?status=open');
  const list = Array.isArray(body) ? body : body.bounties || [];
  if (status !== 200 || !list.length) fail('list bounties', `HTTP ${status}, ${list.length} open`);
  openSlugs = list.map((b) => b.slug);
  console.log(`  open bounties: ${list.length} (e.g. ${openSlugs.slice(0, 5).join(', ')})`);
  if (!openSlugs.includes(ENTER_SLUG)) fail('list bounties', `${ENTER_SLUG} not in open list`);
}

// 5. Get target bounty detail
step(5, `get bounty ${ENTER_SLUG}`);
{
  const { status, body } = await getJson(`/api/bounties/${ENTER_SLUG}`);
  const b = body.bounty || body;
  if (status !== 200 || !b.slug) fail('get bounty', `HTTP ${status}`);
  console.log(`  ${b.slug}: "${b.title}" | status=${b.status} | prize=${b.amt} ${b.unit} (~$${b.usd}) | subs=${b.subs}`);
}

// 6. Enter the bounty (free)
step(6, `enter ${ENTER_SLUG}`);
{
  const { status, body } = await postJson(`/api/bounties/${ENTER_SLUG}/enter`, token, { handle: HANDLE });
  const ok = status === 200 || status === 201;
  console.log(`  enter HTTP ${status} -> ${JSON.stringify(body).slice(0, 300)}`);
  if (!ok) fail('enter bounty', `HTTP ${status}`);
}

// 7. Verify via /api/me
step(7, 'verify via /api/me');
{
  const { status, body } = await getJson('/api/me', token);
  if (status !== 200) fail('/api/me', `HTTP ${status}`);
  const competing = body.competing || body.entries || [];
  const slugs = competing.map((e) => e.bountySlug || e.slug || e);
  console.log(`  /api/me: handle=${body.handle ?? HANDLE}, competing=${JSON.stringify(slugs).slice(0, 300)}`);
  if (!slugs.includes(ENTER_SLUG)) fail('/api/me', `${ENTER_SLUG} not in competing list`);
}

console.log('=== LOOP COMPLETE: read skill.md -> auth -> list -> enter -> verify ===');
console.log(`agent ${address} entered ${ENTER_SLUG} as ${HANDLE}`);
