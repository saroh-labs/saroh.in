# Capabilities (modules) — API notes

The module registry, the four gates (ADR-003) and the lifecycle commands. The
rules for who may do what are in `docs/patterns/backend-auth-and-access.md`;
the rollout switches in `docs/architecture/runbooks/MODULE_ROLLOUT.md`.

## Turning a module on with its minimum (DEC-068)

```
PUT /organizations/:orgId/modules/:key
{ "status": "ENABLED", "setup"?: <per module> }
```

- **No `setup`**: as before — the module switches on, nothing is created, and
  the answer is `{ data: ModuleView }`. The app from before the Turn on sheet
  keeps working.
- **With `setup`** (`setup/module-setup.service.ts`): `module:manage`, then
    - already on → nothing validated or applied: `alreadyEnabled: true`;
    - the refusals enable meets anyway, in the same words — not rolled out
      or hidden, or a module it needs is off (400);
    - the setup is validated against the module's shape (400, below);
    - the action for what it creates (`store:create` / `store:write`,
      `service:write`, `pipeline:manage`, `site:create`) and the plan's caps;
    - **one transaction**: the switch, its audit event and the minimum. Any
      failure writes nothing.

    The answer is `{ data: ModuleView, alreadyEnabled, created }`, `created`
    naming what was made or reused (`storefrontId`, `serviceId`, `pipelineId`,
    `siteId` + `siteAddress`).

- `setup` with any status but `ENABLED` is a 400 on `setup`.

| Module                                                             | `setup`                                                                                                   | Creates                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMMERCE`                                                         | `{ storefrontName: 1–80, fulfilment: ("PICKUP"\|"LOCAL_DELIVERY"\|"SHIPPING")[] ≥1, unique }`             | The first open storefront is renamed and given the ways (the old collection/shipping toggles kept in step); with none, one is made, owned by the caller, in the business's currency (else INR). ACTIVE.                                                                 |
| `APPOINTMENTS`                                                     | `{ hours: { weekday 0–6, open "HH:MM", close "HH:MM" }[] ≥1, service: { name, durationMinutes, price } }` | The first service (price a decimal INR string, `""` for none; the business's time zone, else Asia/Kolkata) and one availability rule per window. A business with a service already keeps it and nothing is added. ACTIVE.                                               |
| `CRM`                                                              | `{}`                                                                                                      | The default pipeline, "Sales", New → Lost, when the business has none. ACTIVE.                                                                                                                                                                                          |
| `WEBSITE`                                                          | `{ siteName: 1–120, address }`                                                                            | The starter site on `<address>.saroh.app`, through the `/sites/new` rules (`sites/site-create.ts`): the address's shape, reserved words, other businesses' reservations and other sites. Not published: `WEBSITE_NO_PUBLICATION` is left. A site already there is kept. |
| `PAYMENTS`, `COMMUNICATIONS`, `INSIGHTS`, `CLASS_PACKS`, `COURSES` | `{}`                                                                                                      | Nothing. A provider is connected later on the Providers screen.                                                                                                                                                                                                         |
| `AUTOMATIONS`                                                      | `{}`                                                                                                      | Refused: hidden (below).                                                                                                                                                                                                                                                |

**Refusals** carry the field as a path in the body:

```
400 { message: "<first problem, merchant words>",
      details: { field: "setup.service.price", fields: [{ field, message }, …] } }
409 { message, details: { field: "setup.address", reason: "taken", suggestion: "rye-studio-2" } }
```

An address in use is never swapped for none (DEC-069): the 409 suggests a
free one (`freeAddress` in `sites/site-address.ts`).

**Dependencies are the client's job.** The API never turns one on: the app
turns each needed module on first (with its own setup), then the module.
`setup-defaults` lists them in that order. Sell never makes the website
itself: when an online way is chosen and `alsoWebsite` is true, the app sends
Website with its setup right after (an already-on Website answers
`alreadyEnabled: true`).

## What the sheet prefills

```
GET /organizations/:orgId/modules/:key/setup-defaults   (module:manage)
→ { data: { moduleKey, hidden, dependencies, setup, existing, alsoWebsite? } }
```

- `setup` — the payload, prefilled: the storefront named after the business
  and Pick-up (or the first storefront's name and ways, when there is one);
  Mon–Sat 10:00–19:00 and a blank service (a business's type is its legal
  form, which suggests no service); the site named after the business on its
  own address, or a free one like it.
- `dependencies` — every module it needs, directly or through another, on or
  off, a module after what it needs (CLASS_PACKS: `["CRM", "APPOINTMENTS"]`).
  The app skips those already on.
- `existing` — the minimum already there, which saving reuses; null when it
  is made new.
- `alsoWebsite` (COMMERCE) — no website yet, so choosing an online way means
  the app turns Website on with its setup too (DEC-069).
- `hidden` — never shown to this business (not rolled out, or hidden).

## Hidden modules

`hidden: true` on a descriptor (Automations, until it has a screen) makes
`moduleRolledOut` false whatever the rollout flag says. It is read wherever
rollout is: the list shows `ROLLOUT_DISABLED`, which the app's `rolledOut`
hides; enable refuses it in words; `impact` 404s. A business that had it on
keeps its setting.
