# ADR-009 — Vercel for Saroh-managed multi-tenant sites

**Status:** Superseded by DEC-107 — 2026-10-08 (was Accepted 2026-09-24)
**Source:** Architecture discussion with the repository owner.
**Builds on:** ADR-001 (Organization tenancy), ADR-002 (published snapshots).

> **Note, 2026-10-09:** superseded by DEC-107, and Vercel is retired as of
> 9 Oct 2026. The merchant sites run on one Saroh-owned Cloudflare Worker
> (`saroh-sites`, built with OpenNext) that serves `*.saroh.app` and verified
> custom domains, deployed from GitHub Actions (`deploy-frontends.yml`); every
> other Saroh web app has its own Worker. The single-codebase, multi-tenant
> model, the hostname-to-Organization resolution and the rule that only the
> Saroh API touches the database still hold. The text below is the decision
> as accepted on 24 Sep and is kept as history.

## Context

Businesses use Saroh's modules and publish customer-facing sites built from
Saroh's components. A gym can sell supplements, offer memberships and take
class bookings while its staff operate from the Saroh dashboard. Managed
hosting must not require the business to obtain a hosting account or repository.

## Decision

Use Vercel for Platforms' single-codebase, multi-tenant model for managed
client applications: one Saroh-owned Vercel project serves `*.saroh.app` and
verified customer domains through the `apps/saroh.app` Next.js application.
Resolve the hostname to the Site and its Organization before serving content.
Provisioning a business or publishing content does not require a new project
or a per-business application deployment.

The Next.js application is the customer-facing frontend and backend-for-frontend:
it handles pages, browser sessions and customer-facing server endpoints while
calling the Saroh API for business operations. The Saroh API remains the only
database-facing service and enforces tenant, customer and capability permissions.
Customer authentication and the customer API contract require implementation;
this decision does not claim that a complete customer portal exists today.
An application credential alone never authorizes access to a customer's records.

Provider credentials remain server-side and organization-scoped. R2 remains
the object-storage integration. Merchant identity and customer identity are
separate authorization concerns.

## Alternatives and trade-offs

- Separate Saroh-owned Vercel projects or Workers for Platforms deployments
  provide independent application releases but add deployment fleet management.
  They are not the initial managed hosting model.
- Client-owned hosting remains a future optional starter/SDK deployment path,
  connected to the same Saroh API; it is not required for managed clients.
- Fully independent client backends and databases are not selected. Hosted
  storefront transactions still depend on Saroh's API availability.

Drafts, publication snapshots, customer sessions, caches and authorization must
be isolated by tenant. Shared application releases can affect every business;
use compatible component contracts, previews and staged releases. This is
logical tenant isolation, not independent compute or an outage guarantee.

## Implementation follow-up

Configure and verify wildcard DNS/TLS, custom-domain onboarding, tenant-aware
session and cache boundaries, customer authorization, and preview/production
separation. Confirm Vercel's current wildcard DNS requirements and plan limits
before rollout. No infrastructure, credentials or production deployments are
changed by accepting this ADR.

## References

- [Vercel for Platforms](https://vercel.com/platforms)
- [Multi-tenant concepts](https://vercel.com/docs/platforms/multi-tenant-platforms/concepts)
- [Multi-project concepts](https://vercel.com/docs/platforms/multi-project-platforms/concepts)
