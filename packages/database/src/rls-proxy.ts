import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "./org-context";

/**
 * RLS enforcement layer (the "enforcement half" of S1-011 that was never built).
 *
 * The RLS policies (B1/B2) filter by the transaction-local GUC
 * `app.current_organization_id`. For them to bite, that GUC must be set on the
 * same connection that runs each org-scoped query — but every service uses the
 * ambient `prisma` singleton, not a context-bound `tx`. This module makes the
 * ambient client set the GUC automatically, with ZERO service changes:
 *
 *  1. `runInOrgContext(orgId, fn)` stores the request's org id in an
 *     AsyncLocalStorage. An api interceptor calls it around each org-scoped
 *     request (after `OrganizationGuard` resolves the org).
 *  2. {@link createRlsProxy} wraps the base client so that, WHEN an org id is in
 *     the ALS, every model operation / raw query runs inside a short transaction
 *     whose first statement sets the GUC (`set_config(..., is_local => true)`).
 *     A service's own `prisma.$transaction(...)` becomes that one transaction
 *     (GUC set first, the callback's writes participate) — never a nested one.
 *
 * Design choices:
 *  - PER-OPERATION micro-transactions (not one transaction around the whole
 *    request): a handler that makes an external call mid-request (payment /
 *    billing provider, DNS verify) never holds a DB transaction open across the
 *    network I/O, and can't exhaust the pool or hit the tx timeout.
 *  - Background jobs and public endpoints run with NO org id in the ALS, so they
 *    fall through to the base client (GUC unset → the policies' permissive
 *    branch → cross-org access, as the job worker requires).
 *  - FLAG-GATED: enforcement only activates when `RLS_ENFORCEMENT` is on. Off by
 *    default, the proxy is a transparent pass-through, so merging it changes
 *    nothing until an operator enables it AND deploys the non-BYPASSRLS role.
 */

/** The request's active organization id (set by the api interceptor). */
const orgContextStore = new AsyncLocalStorage<string>();

/** The active interactive transaction, so ambient calls inside a service's
 *  `$transaction` callback reuse it instead of opening a new micro-tx. */
const activeTxStore = new AsyncLocalStorage<TransactionClient>();

/** Run `fn` with `organizationId` as the ambient RLS context. */
export function runInOrgContext<T>(organizationId: string, fn: () => T): T {
    return orgContextStore.run(organizationId, fn);
}

/** The current ambient org id, or undefined (job/public/no-context paths). */
export function currentOrgContext(): string | undefined {
    return orgContextStore.getStore();
}

/** True when RLS enforcement is switched on via env (default OFF). */
export function isRlsEnforcementEnabled(): boolean {
    const v = process.env.RLS_ENFORCEMENT;
    return v === "1" || v === "on" || v === "true";
}

/** The raw-query methods that must also carry the GUC when org-scoped. */
const RAW_METHODS = new Set([
    "$queryRaw",
    "$queryRawUnsafe",
    "$executeRaw",
    "$executeRawUnsafe",
]);

/** The org id to enforce right now, or null when the base client should be used
 *  verbatim (enforcement off, or no context, or already inside a context tx). */
function activeOrgId(): string | null {
    if (!isRlsEnforcementEnabled()) return null;
    if (activeTxStore.getStore()) return null; // already in a GUC'd tx
    return orgContextStore.getStore() ?? null;
}

/** Set the GUC as the first statement of an interactive tx, then run `body`. */
async function withGuc<T>(
    base: PrismaClient,
    orgId: string,
    body: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
    return base.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgId}, true)`;
        // Publish the tx so any ambient prisma.* call inside `body` reuses it.
        return activeTxStore.run(tx, () => body(tx));
    });
}

/** Wrap one model delegate (e.g. `prisma.lead`) so each op carries the GUC. */
function wrapDelegate(
    base: PrismaClient,
    model: string,
): Record<string, unknown> {
    const baseDelegate = (base as unknown as Record<string, unknown>)[
        model
    ] as Record<string, unknown>;
    return new Proxy(baseDelegate, {
        get(target, op: string) {
            const orig = target[op];
            if (typeof orig !== "function") return orig;
            return (...args: unknown[]): unknown => {
                const tx = activeTxStore.getStore();
                if (tx) {
                    // Inside a context tx already — run on it (GUC set there).
                    const d = (tx as unknown as Record<string, unknown>)[
                        model
                    ] as Record<string, (...a: unknown[]) => unknown>;
                    return d[op](...args);
                }
                const orgId = activeOrgId();
                if (orgId === null) {
                    return (orig as (...a: unknown[]) => unknown).apply(
                        target,
                        args,
                    );
                }
                return withGuc(base, orgId, (t) => {
                    const d = (t as unknown as Record<string, unknown>)[
                        model
                    ] as Record<string, (...a: unknown[]) => Promise<unknown>>;
                    return d[op](...args);
                });
            };
        },
    });
}

/** Wrap a raw-query method so it carries the GUC when org-scoped. */
function wrapRaw(base: PrismaClient, method: string) {
    return (...args: unknown[]): unknown => {
        const tx = activeTxStore.getStore();
        if (tx) {
            return (
                tx as unknown as Record<string, (...a: unknown[]) => unknown>
            )[method](...args);
        }
        const orgId = activeOrgId();
        if (orgId === null) {
            return (
                base as unknown as Record<string, (...a: unknown[]) => unknown>
            )[method](...args);
        }
        return withGuc(base, orgId, (t) =>
            (
                t as unknown as Record<
                    string,
                    (...a: unknown[]) => Promise<unknown>
                >
            )[method](...args),
        );
    };
}

/** Wrap `$transaction` so a service's atomic block carries the GUC (and never
 *  nests): interactive form sets the GUC first; array form prepends it. */
function wrapTransaction(base: PrismaClient) {
    // Prisma's `$transaction` has two overloads (interactive fn / array) that do
    // not unify under a generic wrapper; call it through a permissive signature.
    const runTx = base.$transaction.bind(base) as unknown as (
        arg: unknown,
        options?: unknown,
    ) => Promise<unknown>;

    return (arg: unknown, options?: unknown): unknown => {
        const existing = activeTxStore.getStore();
        if (existing) {
            // Already inside a context tx: participate, do not nest.
            if (typeof arg === "function") {
                return (arg as (tx: TransactionClient) => unknown)(existing);
            }
            // Array form inside a tx is not used by services; run sequentially.
            return Promise.all(arg as Promise<unknown>[]);
        }
        const orgId = activeOrgId();
        if (typeof arg === "function") {
            const fn = arg as (tx: TransactionClient) => Promise<unknown>;
            if (orgId === null) return runTx(fn, options);
            return withGuc(base, orgId, fn);
        }
        // Array form: `$transaction([...])`.
        const ops = arg as Promise<unknown>[];
        if (orgId === null) return runTx(ops, options);
        const setGuc = base.$executeRaw`SELECT set_config('app.current_organization_id', ${orgId}, true)`;
        return runTx([setGuc, ...ops], options).then((res) =>
            (res as unknown[]).slice(1),
        );
    };
}

/**
 * Wrap a base PrismaClient so org-scoped operations carry the RLS GUC. When
 * enforcement is off (or there is no org context), every path falls through to
 * the base client unchanged, so this is a safe no-op wrapper by default.
 */
export function createRlsProxy(base: PrismaClient): PrismaClient {
    const delegateCache = new Map<string, Record<string, unknown>>();

    return new Proxy(base, {
        get(target, prop, receiver) {
            if (typeof prop !== "string") {
                return Reflect.get(target, prop, receiver) as unknown;
            }
            if (prop === "$transaction") return wrapTransaction(target);
            if (RAW_METHODS.has(prop)) return wrapRaw(target, prop);

            // Model delegates: lowercase, not a `$`/`_` internal, object-valued.
            if (!prop.startsWith("$") && !prop.startsWith("_")) {
                const value = (target as unknown as Record<string, unknown>)[
                    prop
                ];
                if (value && typeof value === "object") {
                    let wrapped = delegateCache.get(prop);
                    if (!wrapped) {
                        wrapped = wrapDelegate(target, prop);
                        delegateCache.set(prop, wrapped);
                    }
                    return wrapped;
                }
            }

            const value = Reflect.get(target, prop, receiver) as unknown;
            return typeof value === "function"
                ? (value as (...a: unknown[]) => unknown).bind(target)
                : value;
        },
    });
}
