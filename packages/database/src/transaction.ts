import type { PrismaClient } from "@prisma/client";

/**
 * The interactive-transaction client shape Prisma passes to `$transaction`.
 *
 * Derived from the `PrismaClient` *type* rather than from the `prisma`
 * *instance*. That distinction is the whole point of this file: deriving it
 * from the instance meant this type lived in `org-context.ts`, which imports
 * `client.ts`, which imports `rls-proxy.ts`, which needs this type back —
 * a circular dependency that `pnpm check:cycles` fails on.
 *
 * The cycle only ever closed through an `import type`, so it did not exist at
 * runtime, but a type-only cycle is still a real coupling problem and the CI
 * check is right to refuse it. Sourcing the type from a module that imports
 * nothing but Prisma's own types breaks it properly.
 */
export type TransactionClient = Parameters<
    Parameters<PrismaClient["$transaction"]>[0]
>[0];
