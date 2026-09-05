---
name: saroh-architecture
description: Use when adding a module, a route, a data-access path, or anything that crosses an app or package boundary
---

# Saroh Architecture

## Overview

Three rules account for most of the rework in this repo. None is enforced by
TypeScript; two are enforced by ESLint, and the third only by review.

**Core principle:** the boundaries are the product decisions. Crossing one to
save a file is how a tenant leak or a credential sprawl starts.

## 1. `api.saroh.in` is the only database-facing service

Frontends never import `@saroh/database` — **and never import a package that
does.** The second half is the one that catches people: `@saroh/templates` is a
pure manifest registry that "never touches Prisma", but it imports the section
contract from `@saroh/database`, so a frontend importing it breaks the rule.

The shared ESLint config rejects it:

```
'@saroh/templates' import is restricted from being used by a pattern.
Frontend apps must not import the database/Prisma directly.
Call the API (api.saroh.in) instead
```

**When a frontend needs data the API does not expose, add the endpoint.** The
public showcase needed the template catalogue, so `GET /public/sites/templates`
exists. That is the shape of the fix, every time.

Frontends reach data through their own `lib/**/service.ts` adapters, which go
through `lib/api/http.ts` — the one place that forwards the session cookie and
the active-organization header.

## 2. Organization is the tenant root

Not Store (ADR-001). `Store.organizationId` has been NOT NULL since Stage 1.
Projects and Teams sit _beneath_ an Organization and are never an ownership,
tenancy or billing root.

Anything org-scoped derives the actor from the session and the organization
from context — never from a client-supplied id. `x-organization-id` is a hint
the API re-validates against real membership, not an instruction.

## 3. Say what is true

A claim in the UI or in marketing must match what ships. The standing example:
"one customer record behind an order _and_ a booking" is **not true yet**, was
deliberately removed from the marketing site rather than left standing, and
must not be reintroduced until auto-linking exists.

The same rule inside the product: a capability that is configured-but-broken
says so rather than reporting healthy, and a screen that could not load says
that rather than showing nothing. See [[saroh-product-states]].

## Where things live

| Thing                                          | Home                                                     |
| ---------------------------------------------- | -------------------------------------------------------- |
| Business logic, all DB access                  | `apps/api.saroh.in`                                      |
| Merchant workspace                             | `apps/app.saroh.in` (Operate mode)                       |
| Identity UI only — auth server runs in the API | `apps/accounts.saroh.in`                                 |
| Merchants' own public sites                    | `apps/saroh.app` (`*.saroh.app`)                         |
| Staff control plane                            | `apps/admin.saroh.in`                                    |
| Shared tokens                                  | `packages/ui/src/globals.css`, `tooling/tailwind-config` |

`--accent` is a shadcn neutral with ~32 component usages, **not** a brand
accent. Renaming it breaks components.

## Red flags

| You are about to…                                          | Stop and…                                 |
| ---------------------------------------------------------- | ----------------------------------------- |
| Import `@saroh/database` (or `@saroh/templates`) in an app | Add the API endpoint instead              |
| Read `process.env` in an app                               | Go through that app's typed `env.ts`      |
| Trust a client-supplied organization id                    | Derive it from the session                |
| Add a tenant model without `organizationId`                | Re-read ADR-001                           |
| Write a claim the code does not yet support                | Say what is true, or ship the thing first |
