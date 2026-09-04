# saroh.in

The marketing site: what Saroh is, what each capability module does, and the
waitlist.

Dev port **3008** · package name `web` (`pnpm --filter web …`)

## What's here

| Route             | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `/`               | Landing page, product shots, waitlist form                |
| `/modules`        | The capability modules a business can turn on             |
| `/modules/[slug]` | One module in detail                                      |
| `/api/waitlist`   | POST forwarder to the public waitlist endpoint on the API |

Module copy lives in [`lib/modules.ts`](lib/modules.ts), page chrome in
[`components/site/`](components/site/).

### Why the waitlist is a route handler

Only `api.saroh.in` touches the database, so `/api/waitlist` is a thin forwarder
to the public waitlist endpoint there. It stays a server route rather than the
form posting to the API directly: that keeps the API origin out of the browser
bundle, avoids a CORS preflight on the conversion path, and gives one place to
translate the API's response into the shape the client form already expects.

It previously `console.log`ged the address and returned success, which meant
every signup since launch was acknowledged to the visitor and then dropped.
Changes here are worth testing end to end against a running API.

## Local development

```bash
pnpm install
pnpm --filter web dev        # https://saroh.localhost
```

The pages render without a backend; only the waitlist POST needs `api.saroh.in`.

## Environment

See [`env.ts`](env.ts) for the validated schema.

```dotenv
API_URL=https://api.saroh.localhost              # server-only, waitlist route only
NEXT_PUBLIC_AUTH_APP_URL=https://accounts.saroh.localhost # hero CTA → sign-up
```

`API_URL` is server-only on purpose: the route handler is the only thing here
that talks to the API, and the browser has no reason to know that origin.

## Verification

```bash
pnpm --filter web typecheck
pnpm --filter web lint
SKIP_ENV_VALIDATION=1 pnpm --filter web build
```
