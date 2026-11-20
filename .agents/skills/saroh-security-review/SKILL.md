---
name: saroh-security-review
description: Use when the user says "review security", "security review", "abuse test", "pentest" or "is it battle ready", and before opening any PR into development or main that touches the API, auth, admin, billing, limits, uploads, webhooks, providers or public pages
---

# Saroh security review

One phrase, the whole process. Run every lens below on the change (before a PR)
or on all of `development` (when asked for a full review). Report, then fix only
when the user says so.

## Scope

- **Before a PR:** the diff against the target branch (`git diff origin/development...HEAD`),
  plus every caller and route the diff reaches. Lenses 1–7 by reading; lens 8 only
  if the diff adds a route, a limit, a gate or a heavy write.
- **"review security" / "abuse test":** all of `development`, in a fresh detached
  worktree. All lenses, lens 8 live on the local stack.

## Lenses (one agent each for a full review; never more than five at once)

1. **Responses leak nothing.** Every response, RSC payload and `NEXT_PUBLIC_*`:
   no stored secret, token, hash, ciphertext, other customer's data, internal note,
   migration name or stack trace. Secret-bearing models are read with a `select`.
2. **Limits.** Every public route has a Redis `SharedRateLimiter` keyed by
   `@ClientAddress()` / `visitorAddress()` (never `@Ip()`, `req.ip` or a raw header).
   Every send (email, WhatsApp, SMS, invite) is limited per sender, per recipient
   and overall, counting sends not live rows. Known and unknown accounts answer
   identically (status, body, timing, cooldown).
3. **Plans and roles.** Every cap and locked feature is checked in the service,
   under the lock, on every path: app, v1 API, MCP, import, duplicate, un-archive,
   jobs, webhooks. No subscription row reads as Free. A downgrade stops jobs and syncs.
   Every id-bearing route is scoped to the caller's organization.
4. **Admin.** Every `/admin` route has the staff guards and a declared permission.
   Staff actions can't target a more senior staff member. Every admin write leaves
   an audit row in the same transaction (actor, target, before/after, address).
5. **Load.** A single tenant can't hold pool connections or the main job lane:
   lock waits and statements have timeouts, heavy work is queued and limited,
   list endpoints are paged.
6. **Editions and switches.** India-only and Global-only things stay on their side;
   features behind a switch are hidden in nav, routes, API, MCP and marketing copy
   when off; marketing claims only what is on in production.
7. **Outside services.** Each provider-dependent feature says what it needs, shows
   a plain failure when the provider is unset, down or revoked (never "sent" or
   "connected" when it isn't), and the provider is named in the privacy pages.
8. **Live abuse (local only).** Per `docs/architecture/LOCAL_DEV.md`, on the local
   database: attack as anonymous, a new Free owner, Member/Reviewer, owner of
   another business, API key/MCP client, merchant against admin, lowest staff role.
   Parallel races at caps, header tricks on limits, IDOR by id swapping,
   mass-assignment, XSS into public sites and admin, SSRF, open redirects,
   unsigned/replayed webhooks, oversized bodies. Never touch a deployed host;
   check no real provider key is set before triggering a send.

## Rules

- Never print `.env` values or secrets — names only.
- Re-test every finding still open in the last review before going further.
- Each finding: severity, `file:line` or the exact request (secrets redacted),
  impact in one line, smallest fix. Mark anything unproven "to confirm".
- Write reports to the private reviews folder the user keeps outside this repo,
  never into this public repo. List anything the test left in the local database.
- End with a verdict: ready, or the short list that must be fixed first.
- A finding the review could have caught earlier gets a check (lint, test,
  `scripts/prepush.sh`), per "Learn from every miss" in `AGENTS.md`.
