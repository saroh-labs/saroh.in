# Key rotation: replacing one of the API's encryption keys

> **Read when:** replacing `PAYMENTS_ENC_KEY`, `STAFF_PII_ENC_KEY`,
> `MESSAGING_ENC_KEY`, `APIKEY_ENC_KEY` or `WEBHOOK_SECRET_KEY`, on a
> schedule or because one leaked. Decision: DEC-214. Code:
> `apps/api.saroh.in/src/common/crypto.ts`, re-seal
> `apps/api.saroh.in/src/cli/keys-reseal.ts`.

## How the ring works

Each variable holds one key, or a ring of keys written newest first:

```text
PAYMENTS_ENC_KEY=v2:<new key>,v1:<old key>
```

- A key is 32 bytes, as 64 hex characters or base64. An id is 1 to 16
  lowercase letters or digits. A variable with a single key and no id is `v1`.
- New values are sealed and fingerprinted with the **first** key, and the
  stored ciphertext or fingerprint starts with its id (`v2:...`). A value with
  no id was made with `v1`; `v1` values are still written with no id, so a
  setting with one key stores exactly what it did before the ring.
- A value opens with the key its id names. If that id is no longer on the
  ring, the request fails with an error naming the variable and the id, never
  a value.
- Pick the next unused id (`v2`, then `v3`). Never reuse an id that was
  removed: a stale value would be opened with the wrong key and fail.

## What each key protects, and what a leak exposes

A key alone opens nothing: it is only useful together with a copy of the
database. A database copy alone opens nothing either.

| Variable             | Seals or fingerprints                                                                                                                  | Key **and** database together expose                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_ENC_KEY`   | Merchants' payment provider credentials, their messaging provider credentials, and a queued message's pay link and How to pay us lines | Every connected merchant's provider keys and webhook secrets: payments could be taken or refunded on their accounts |
| `STAFF_PII_ENC_KEY`  | A teammate's tax id (DEC-169)                                                                                                          | Saroh staff tax ids                                                                                                 |
| `MESSAGING_ENC_KEY`  | A WhatsApp send's number and words while it waits to be accepted (cleared after)                                                       | The few messages queued at that moment                                                                              |
| `WEBHOOK_SECRET_KEY` | Businesses' outbound webhook signing secrets                                                                                           | The secrets: someone could sign fake events to a business's receiver                                                |
| `APIKEY_ENC_KEY`     | Fingerprints of public API keys and visitor tokens (never the token)                                                                   | Nothing usable: a token is 32 random bytes and can't be guessed from its fingerprint                                |

**The API key exception.** An API key's fingerprint can't be re-made, because
the token is never stored. It moves to the newest key by itself the next time
the key is used. A key that is never used keeps its old id; removing that id
stops it working, and its owner makes a new one. Visitor tokens live 30
minutes and are never moved.

## Steps

The same steps for every key, on development first, then production. Do one
variable at a time.

### 1. Make the key on the server, never printed

On the server, generate the key into a file only you can read, build the new
ring from it and the current value, and send that to the API's environment
settings (Coolify) over standard input. Never echo, `cat` or paste the key
into a terminal, a chat or a note.

```bash
umask 077
openssl rand -base64 32 > /tmp/new-key      # never cat it
# Build "v2:$(cat /tmp/new-key),<current value>" inside the script that
# updates the setting, and send it on stdin. A current value with no id
# becomes "v1:<value>".
shred -u /tmp/new-key 2>/dev/null || rm -f /tmp/new-key
```

The new value is `v2:<new key>,v1:<old key>`: new key first, the old one kept.

### 2. Deploy, and wait for every replica

Redeploy the API so it reads the new ring. From now on new values are sealed
with `v2`, and both `v2` and `v1` values open.

Wait until no replica runs the old setting before going on: an old replica
can't open a value a new one sealed. Don't roll the API back past the ring's
release once a `v2` value exists.

### 3. Re-seal: dry run first

Run it in a one-off container from the API's image, with the API's own
environment, never inside the serving container (it has little memory):

```bash
# The API image and its environment, in a mode-600 env file removed after.
docker run --rm --env-file "$ENV_FILE" --network "$API_NETWORK" "$API_IMAGE" \
  node apps/api.saroh.in/dist/cli/keys-reseal.cli.js --dry-run --key=PAYMENTS_ENC_KEY
```

Then the real run (without `--dry-run`), then a second dry run, which must
say it would move 0. Leave out `--key` to run all five.

Locally, from `apps/api.saroh.in` with its `.env`:

```bash
pnpm exec tsx src/cli/keys-reseal.cli.ts --dry-run
```

### 4. Check the counts

It prints counts and key ids only, one line per table:

```text
[keys-reseal] payment connections (PAYMENTS_ENC_KEY, newest v2): <n> values, <n> already on v2, moved <n> (v1: <n>), changed meanwhile 0, cannot open 0
[keys-reseal] API key fingerprints (APIKEY_ENC_KEY, newest v2): usable keys by id: v1: <n>, v2: <n>; live visitor tokens by id: none. ...
```

- **changed meanwhile** — the row was edited during the run and left alone.
  Run it again.
- **cannot open** — a value whose key isn't on the ring, or that was
  tampered with. Stop and find out before removing anything.
- Exit 1 means one of the above, or a key that isn't set correctly.
- Safe to run again and to stop partway: a value already on the newest key
  is skipped. Each row is written only if it still holds what was read.
- Covered: payment and messaging connections, queued message sends (pending
  or running), staff tax ids, queued WhatsApp messages, webhook signing
  secrets (current and the one a roll keeps for 24 hours). Failed jobs are
  finished and not re-sealed.

### 5. Remove the old id and deploy

When the second dry run shows 0 to move for the variable:

- `APIKEY_ENC_KEY`: also wait until the usable keys on the old id are 0, or
  accept that the owners of those unused keys make new ones.
- `STAFF_PII_ENC_KEY`: wait 24 hours. A saved profile's retry is matched by a
  fingerprint kept that long; a retry after the old id is gone gets a
  conflict instead of a replay, and the person saves again.

Set the variable to the new key alone (`v2:<new key>`), redeploy, and run the
dry run once more: it must show `cannot open 0`.

## After a leak

Do steps 1 to 5 at once, without waiting on routine timings, and remove the
old id as soon as the re-seal shows 0 to move. A new key protects what is
stored from now on; it does not un-leak a value. If the database may have
leaked with the key, also replace what the key protected:

- `PAYMENTS_ENC_KEY`: ask each connected business to roll its provider keys
  and webhook secrets, and connect again.
- `WEBHOOK_SECRET_KEY`: roll every business's webhook signing secret.
- `STAFF_PII_ENC_KEY`: tax ids can't be changed; record the exposure.
- `MESSAGING_ENC_KEY`: nothing to replace; the exposure is the messages that
  were queued.
- `APIKEY_ENC_KEY`: nothing to replace; removing the old id makes unused keys
  stop working.

Then follow `devops-secrets.md`: check access logs for the window, and write
up the incident (`DEPLOY_ROLLBACK_INCIDENT.md`).
