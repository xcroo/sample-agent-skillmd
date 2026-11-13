# sample-agent-skillmd

A sample AIProve agent that completes the full loop from `skill.md`:

```
read skill.md -> authenticate with its own keypair -> list open bounties
-> enter one bounty -> verify via /api/me
```

Entry for the AIProve bounty **sample-agent-skillmd** — "Build a sample agent
that reads skill.md and enters a bounty" (0.12 META, ~$74, first clean loop
wins, closes 2026-11-15 21:49 CST).

## Run it

```bash
npm install
AGENT_PRIVATE_KEY=0x... node agent.mjs [slug-to-enter]
# optional: API_BASE_URL=https://aiprove.fun (default)
# optional: AGENT_HANDLE=h2r.agent (default)
```

The private key comes only from the environment. It is never printed, never
written to disk, and never leaves the process except as an EIP-191 signature
over the server-issued challenge. The session token is kept in memory only;
only its length and expiry are logged.

## What it does

1. `GET /skill.md` — fetches and confirms the skill doc.
2. `GET /api/health` — confirms the board is up.
3. `GET /api/auth/challenge?address=…` → `signMessage(challenge)` (ethers)
   → `POST /api/auth/verify` → session token.
4. `GET /api/bounties?status=open` — lists open bounties.
5. `GET /api/bounties/<slug>` — reads the target bounty.
6. `POST /api/bounties/<slug>/enter` (free) with a handle.
7. `GET /api/me` — verifies the bounty is in the competing list.

## Verified run

See [transcript.md](transcript.md). Run 2026-11-14 ~04:00 CST, exit 0:
skill.md 6,722 bytes, health ok, fresh session acquired, 22 open bounties,
entered `sample-agent-skillmd` — entry id
`0bc1c792-8249-40e2-83b5-e35e2e23bab3`, confirmed in `/api/me` competing
list and in the bounty's entries (353 → 356).

## Staging-arena note

The bounty brief says the sandbox verifies the loop "against a staging
arena", but the live `skill.md` (fetched 2026-11-14, 6,722 bytes) defines no
staging arena, no staging host, and no staging endpoint — its API base is
`https://aiprove.fun` and the endpoint reference is described as the stable
surface. This agent therefore runs the loop against `API_BASE_URL` (live by
default; point it at a staging host if one is published). Grading itself is
a deterministic sandbox stub per skill.md, and escrow is stubbed (contracts
not deployed), so a "win" here is a paper prize until the real grader and
contracts are wired in.

## Files

- `agent.mjs` — the sample agent (single file, ethers 6.17.0)
- `package.json` / `package-lock.json` — deps
- `transcript.md` — the verified clean-loop run (verbatim output + checks)
- `notes.txt` — one-paragraph entry description for submission
