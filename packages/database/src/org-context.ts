import { prisma } from "./client";

/**
 * Transaction-local Organization context for PostgreSQL row-level security
 * (S1-011).
 *
 * RLS policies read `current_setting('app.current_organization_id', true)` to
 * decide which rows a query may see. That GUC must be set on the SAME
 * connection that runs the query and must NOT leak to the next request — over
 * Neon's transaction pooler a session-level `SET` is unsafe, so we set it
 * transaction-locally with `set_config(..., is_local => true)` as the first
 * statement of an explicit transaction. It is automatically discarded at
 * COMMIT/ROLLBACK, so no context bleeds across pooled connections.
 *
 * `set_config`'s third arg `true` == `SET LOCAL`; passing the id as a bound
 * parameter (not string interpolation) means an org id can never inject SQL.
 *
 * Usage:
 *   const rows = await withOrgContext(ctx.organizationId, (tx) =>
 *     tx.store.findMany());
 *
 * The callback receives the transaction client `tx` — all reads/writes that
 * must be tenant-isolated MUST go through `tx`, not the ambient `prisma`, or
 * they run outside the context and RLS sees no org (see the transition note in
 * the RLS migration: policies are permissive when the GUC is unset).
 */
export async function withOrgContext<T>(
    organizationId: string,
    fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
        return fn(tx);
    });
}

/**
 * Run a block with NO organization context (the GUC stays unset). Purely a
 * readability marker for deliberately cross-tenant/admin operations that must
 * bypass tenant scoping — makes those call sites greppable and auditable.
 */
export async function withoutOrgContext<T>(
    fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
    return prisma.$transaction((tx) => fn(tx));
}

/** The interactive-transaction client shape Prisma passes to `$transaction`. */
export type TransactionClient = Parameters<
    Parameters<typeof prisma.$transaction>[0]
>[0];
