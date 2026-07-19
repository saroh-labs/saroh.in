import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import {
    createRlsProxy,
    isRlsEnforcementEnabled,
    runInOrgContext,
} from "./rls-proxy";

/**
 * A fake PrismaClient that records the call path so we can assert WHETHER an op
 * ran directly on the base client or inside a GUC-setting transaction, and WHAT
 * org id was written into `set_config`. No database is touched.
 */
function makeFake() {
    const calls: string[] = [];
    let lastGuc: unknown;

    const delegate = (via: string) => ({
        findMany: (args: unknown) => {
            calls.push(`${via}.lead.findMany`);
            return Promise.resolve([args]);
        },
        count: () => {
            calls.push(`${via}.lead.count`);
            return Promise.resolve(0);
        },
    });
    const execRaw =
        (via: string) =>
        (_s: TemplateStringsArray, ...vals: unknown[]) => {
            calls.push(`${via}.$executeRaw`);
            lastGuc = vals[0];
            return Promise.resolve(1);
        };
    const queryRaw = (via: string) => () => {
        calls.push(`${via}.$queryRaw`);
        return Promise.resolve([{ v: lastGuc }]);
    };

    const tx = {
        lead: delegate("tx"),
        $executeRaw: execRaw("tx"),
        $queryRaw: queryRaw("tx"),
    };
    const base = {
        lead: delegate("base"),
        $executeRaw: execRaw("base"),
        $queryRaw: queryRaw("base"),
        $transaction: (arg: unknown) => {
            calls.push("base.$transaction");
            if (typeof arg === "function") {
                return (arg as (t: typeof tx) => unknown)(tx);
            }
            return Promise.all(arg as Promise<unknown>[]);
        },
    };
    return {
        proxy: createRlsProxy(base as unknown as PrismaClient),
        calls,
        guc: () => lastGuc,
    };
}

afterEach(() => {
    delete process.env.RLS_ENFORCEMENT;
});

describe("createRlsProxy", () => {
    it("is a transparent pass-through when RLS_ENFORCEMENT is off (default)", async () => {
        delete process.env.RLS_ENFORCEMENT;
        expect(isRlsEnforcementEnabled()).toBe(false);
        const { proxy, calls } = makeFake();

        // Even inside an org context, nothing is wrapped when disabled.
        await runInOrgContext("org_1", () =>
            (
                proxy as unknown as {
                    lead: { findMany: (a: unknown) => Promise<unknown> };
                }
            ).lead.findMany({}),
        );

        expect(calls).toEqual(["base.lead.findMany"]);
    });

    it("runs an op directly on the base client when there is NO org context", async () => {
        process.env.RLS_ENFORCEMENT = "1";
        const { proxy, calls } = makeFake();

        await (
            proxy as unknown as {
                lead: { findMany: (a: unknown) => Promise<unknown> };
            }
        ).lead.findMany({});

        expect(calls).toEqual(["base.lead.findMany"]);
    });

    it("wraps an org-scoped op in a transaction that sets the GUC first", async () => {
        process.env.RLS_ENFORCEMENT = "1";
        const { proxy, calls, guc } = makeFake();

        await runInOrgContext("org_42", () =>
            (
                proxy as unknown as {
                    lead: { findMany: (a: unknown) => Promise<unknown> };
                }
            ).lead.findMany({}),
        );

        // A single transaction; set_config runs before the query, keyed to the org.
        expect(calls).toEqual([
            "base.$transaction",
            "tx.$executeRaw",
            "tx.lead.findMany",
        ]);
        expect(guc()).toBe("org_42");
    });

    it("wraps a raw query under context too", async () => {
        process.env.RLS_ENFORCEMENT = "1";
        const { proxy, calls, guc } = makeFake();

        await runInOrgContext("org_7", () =>
            (
                proxy as unknown as { $queryRaw: () => Promise<unknown> }
            ).$queryRaw(),
        );

        expect(calls).toEqual([
            "base.$transaction",
            "tx.$executeRaw",
            "tx.$queryRaw",
        ]);
        expect(guc()).toBe("org_7");
    });

    it("makes a service's $transaction the ONE context tx (GUC set, no nesting, ambient calls reuse it)", async () => {
        process.env.RLS_ENFORCEMENT = "1";
        const { proxy, calls, guc } = makeFake();
        const p = proxy as unknown as {
            $transaction: (
                fn: (tx: unknown) => Promise<unknown>,
            ) => Promise<unknown>;
            lead: { findMany: (a: unknown) => Promise<unknown> };
        };

        await runInOrgContext("org_9", () =>
            p.$transaction(async (tx) => {
                await (
                    tx as { lead: { count: () => Promise<number> } }
                ).lead.count();
                // An ambient call inside the callback must reuse the same tx,
                // NOT open a second transaction.
                await p.lead.findMany({});
            }),
        );

        expect(calls.filter((c) => c === "base.$transaction")).toHaveLength(1);
        expect(calls).toEqual([
            "base.$transaction",
            "tx.$executeRaw",
            "tx.lead.count",
            "tx.lead.findMany",
        ]);
        expect(guc()).toBe("org_9");
    });
});
