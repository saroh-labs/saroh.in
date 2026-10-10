import { describe, expect, it } from "vitest";

import type { Db } from "./helpers";
import {
    PLACEHOLDER_CREDENTIALS,
    seedStandInCommunicationProvider,
    seedStandInPaymentProvider,
    writesStandIns,
} from "./stand-in-providers";

const LOCAL = { DATABASE_URL: "postgresql://u:p@localhost:5432/saroh_test" };
const SHARED = { DATABASE_URL: "postgresql://u:p@db.example.net:5432/dev" };

interface Call {
    model: string;
    op: string;
    args: Record<string, unknown>;
}

function recorder(): { db: Db; calls: Call[] } {
    const calls: Call[] = [];
    const db = new Proxy(
        {},
        {
            get: (_t, model: string) =>
                new Proxy(
                    {},
                    {
                        get:
                            (_m, op: string) =>
                            (args: Record<string, unknown>) => {
                                calls.push({ model, op, args });
                                return Promise.resolve({ count: 0 });
                            },
                    },
                ),
        },
    ) as unknown as Db;
    return { db, calls };
}

const PAYMENT = {
    id: "seed_payments_cashfree",
    organizationId: "seed_org",
    provider: "CASHFREE",
};
const EMAIL = {
    id: "seed_comms_email",
    organizationId: "seed_org",
    channel: "EMAIL",
    provider: "RESEND",
    fromAddress: "northwind@example.com",
};

describe("stand-in provider connections", () => {
    it("are written only on this machine's database", () => {
        expect(writesStandIns(LOCAL)).toBe(true);
        expect(writesStandIns(SHARED)).toBe(false);
        expect(writesStandIns({})).toBe(false);
    });

    it("read CONNECTED, with placeholder keys, on a throwaway database", async () => {
        const { db, calls } = recorder();
        expect(await seedStandInPaymentProvider(db, PAYMENT, LOCAL)).toBe(true);
        expect(await seedStandInCommunicationProvider(db, EMAIL, LOCAL)).toBe(
            true,
        );

        expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
            "merchantPaymentProvider.upsert",
            "communicationProvider.upsert",
        ]);
        for (const c of calls) {
            expect(c.args.create).toMatchObject({
                status: "CONNECTED",
                ...PLACEHOLDER_CREDENTIALS,
            });
            // A re-seed never overwrites keys someone entered for real.
            expect(Object.keys(c.args.update as object)).not.toContain(
                "encryptedCredentials",
            );
        }
    });

    it("are never written on a shared database, and an earlier seed's are removed", async () => {
        const { db, calls } = recorder();
        expect(await seedStandInPaymentProvider(db, PAYMENT, SHARED)).toBe(
            false,
        );
        expect(await seedStandInCommunicationProvider(db, EMAIL, SHARED)).toBe(
            false,
        );

        expect(calls.map((c) => `${c.model}.${c.op}`)).toEqual([
            "merchantPaymentProvider.deleteMany",
            "communicationProvider.deleteMany",
        ]);
        // Only a row still holding the placeholder: a real connection stays.
        for (const c of calls) {
            expect(c.args.where).toMatchObject({
                organizationId: "seed_org",
                status: "CONNECTED",
                encryptedCredentials:
                    PLACEHOLDER_CREDENTIALS.encryptedCredentials,
            });
        }
    });
});
