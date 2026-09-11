# API modules (NestJS)

> **Read when:** adding or changing a module, controller, service, DTO or guard
> in `apps/api.saroh.in`.
> Adapted from claude-patterns `backend/02-nestjs-typescript.md`.

`api.saroh.in` is the only database-facing service (DEC-004).

## Layout

```
src/
  main.ts          helmet, CORS, ValidationPipe, global interceptors and filter
  common/          auth/ decorators/ guards/ filters/ interceptors/
                   logging/ idempotency/ types/
  modules/<feature>/
    <feature>.module.ts
    <feature>.controller.ts       public-<feature>.controller.ts for open routes
    <feature>.service.ts
    dto.ts
    *.spec.ts
```

## Rules

### Controllers do HTTP; services do everything else

- **Guards at the class:**
  `@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)` with
  `@RequireModule("<KEY>")` — or on individual handlers when some routes must
  keep working with the module off. `module-annotations.spec.ts` pins which is
  which.
- Handlers take `@OrgContext() ctx: OrganizationContext` and pass it on.
- **Authorization happens in the service:** `authorize(ctx, "lead:write")` from
  `modules/organizations/organization-policy.ts`.
- Controllers never touch Prisma. Prefer returning DTO or view types over Prisma
  model types.

### Services

- Import `prisma` from `@saroh/database`; there is no injected `PrismaService`.
- Org-scoped queries filter by `ctx.organizationId`, and a record in another
  organization is a **404**, not a 403.
- Guards shared by several services are module functions, not private methods
  one class has to own — `modules/sites/site-access.ts` (`assertSiteInOrg`,
  `assertPageInSite`, …).
- **Split a large service along its specs.** `sites.service.ts` is still about
  2,080 lines, and `sites-editing`, `sites-pages`, `sites-review` and
  `site-settings` specs already exist with no service beside them. Those are the
  seams.

### DTOs and validation

- `class-validator` and `class-transformer`, with trimming and normalising
  transforms on the DTO (`modules/leads/dto.ts`).
- The global `ValidationPipe` sets `whitelist` and `forbidNonWhitelisted`.
- Enumerations are `as const` arrays with a derived type (`LEAD_STATUSES`).

### Responses and errors

- **Success is bare JSON** — no success envelope.
- **Errors are thrown Nest exceptions.** `AllExceptionsFilter` shapes every one
  as `{ error: { code, message, statusCode, correlationId, details? } }` and
  keeps 5xx messages generic.

### Cross-cutting

- `OrgRlsInterceptor` runs the request inside the organization's RLS context;
  `LoggingInterceptor` writes one line per request.
- Retry-safe writes use `IdempotencyService`: the same key with the same request
  fingerprint replays the original response; the same key with a different
  request is a 409.
- Abusable public endpoints use `FixedWindowRateLimiter` and answer 429. It is
  per process, so the limit is per instance.
- Log with the class `Logger` or `structuredLogger`, never `console.log`
  (`devops-observability.md`).

### Tests

- Unit specs mock `@saroh/database` and need no database. **The unit Jest
  project lists its directories explicitly** in `jest.config.js` `testMatch`: a
  new module's mocked specs must be added there, or they only run in the
  integration project.
- DB-backed specs run under `jest.integration.config.js` against
  `TEST_DATABASE_URL`.

## Not adopted

An injected `PrismaService`, a success `ApiResponse<T>` envelope, and
`nestjs-pino`.
