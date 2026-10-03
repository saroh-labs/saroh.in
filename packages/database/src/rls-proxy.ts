import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "./transaction";

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

/** What an interactive `$transaction` takes as its second argument. */
type TransactionOptions = Parameters<PrismaClient["$transaction"]>[1];

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

/**
 * Run `fn` as if no request had an organization: no ambient org id and no
 * context transaction, so the ambient `prisma` inside it goes to the base
 * client with the GUC unset. For the few reads that are cross-business by
 * nature and must see every business's rows even during one business's
 * request — "is this web address free" (`sites/site-address.ts`). Reads
 * made here are NOT part of the caller's transaction.
 */
export function outsideOrgContext<T>(fn: () => T): T {
    return activeTxStore.exit(() => orgContextStore.exit(fn));
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

/**
 * Set the GUC as the first statement of an interactive tx, then run `body`.
 * `options` are the caller's own — above all `isolationLevel`: a Serializable
 * booking must stay Serializable under enforcement, or the races it exists to
 * catch (a slot's last seat, a pack's last class) quietly get through.
 */
async function withGuc<T>(
    base: PrismaClient,
    orgId: string,
    body: (tx: TransactionClient) => Promise<T>,
    options?: TransactionOptions,
): Promise<T> {
    return base.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${orgId}, true)`;
        // Publish the tx so any ambient prisma.* call inside `body` reuses it.
        return activeTxStore.run(tx, () => body(tx));
    }, options);
}

/** Marks an operation made under an org context, with how to run it on a tx. */
const DEFERRED = Symbol("rls-proxy.deferred");

type RunOn = (tx: TransactionClient) => Promise<unknown>;

/**
 * An org-scoped operation that, like Prisma's own PrismaPromise, does nothing
 * until it is awaited. Being lazy and recognisable is what lets the array form
 * `$transaction([prisma.a.update(…), prisma.b.delete(…)])` work under
 * enforcement: the operations are collected and run, in order, inside ONE
 * transaction that sets the GUC first. An eager per-op transaction would have
 * started each one on its own (no longer atomic) and handed Prisma plain
 * promises, which it refuses — the category merge and post-category delete
 * both failed that way with enforcement on (#53).
 */
class DeferredOp implements PromiseLike<unknown> {
    readonly [DEFERRED]: RunOn;
    private started?: Promise<unknown>;

    constructor(
        private readonly start: () => Promise<unknown>,
        runOn: RunOn,
    ) {
        this[DEFERRED] = runOn;
    }

    private promise(): Promise<unknown> {
        this.started ??= this.start();
        return this.started;
    }

    then<A = unknown, B = never>(
        onFulfilled?: ((value: unknown) => A | PromiseLike<A>) | null,
        onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): Promise<A | B> {
        return this.promise().then(onFulfilled, onRejected);
    }

    catch<B = never>(
        onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): Promise<unknown> {
        return this.promise().catch(onRejected);
    }

    finally(onFinally?: (() => void) | null): Promise<unknown> {
        return this.promise().finally(onFinally);
    }

    readonly [Symbol.toStringTag] = "PrismaPromise";
}

/** An org-scoped op, lazy, that runs in its own GUC'd tx unless batched. */
function deferOp(base: PrismaClient, orgId: string, runOn: RunOn): DeferredOp {
    return new DeferredOp(() => withGuc(base, orgId, runOn), runOn);
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
                return deferOp(base, orgId, (t) => {
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
        return deferOp(base, orgId, (t) =>
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
 *  nests): the interactive form sets the GUC first; the array form runs its
 *  deferred ops, in order, in one transaction that sets it first. */
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
            return withGuc(base, orgId, fn, options as TransactionOptions);
        }
        // Array form: `$transaction([...])`.
        const ops = arg as unknown[];
        if (orgId === null) return runTx(ops, options);
        // Under a context every op here came through this proxy and is a lazy
        // DeferredOp: run them in order inside one GUC'd transaction, as
        // Prisma's own array form runs them in order inside one.
        const batch = ops.map((op) =>
            op instanceof DeferredOp ? op[DEFERRED] : undefined,
        );
        if (batch.some((run) => run === undefined)) {
            return Promise.reject(
                new Error(
                    "$transaction([...]) under an organization context takes only operations made through the RLS-aware prisma client, in the same context.",
                ),
            );
        }
        return withGuc(
            base,
            orgId,
            async (tx) => {
                const results: unknown[] = [];
                for (const run of batch as RunOn[]) results.push(await run(tx));
                return results;
            },
            options as TransactionOptions,
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
