import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import {
    ENSURE_CONTACT_LOCK_TIMEOUT,
    ensureContactForPaidOrder,
} from "./ensure-contact";

/**
 * The contact a payment makes never fails the payment (review C-3): it runs
 * under a savepoint with a short lock_timeout, and any error rolls the
 * savepoint back, logs a warning without the customer's details, and lets
 * the payment go on. The real locks are in `ensure-contact.db.spec.ts`.
 */

const PAID = {
    organizationId: "org_1",
    customerId: "cust_1",
    paymentStatus: "PAID",
};

function fakeTx(findFirst: jest.Mock) {
    const statements: string[] = [];
    const tx = {
        $executeRawUnsafe: jest.fn((sql: string) => {
            statements.push(sql);
            return Promise.resolve(0);
        }),
        $queryRaw: jest.fn((strings: TemplateStringsArray, ...values) => {
            statements.push(
                `${strings.join("?")} [${values.map(String).join(", ")}]`,
            );
            return Promise.resolve([{ lock_timeout: "0" }]);
        }),
        customerIdentityLink: { findFirst },
    };
    return { tx: tx as unknown as Prisma.TransactionClient, statements };
}

describe("ensureContactForPaidOrder", () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, "warn").mockImplementation();
    });
    afterEach(() => warn.mockRestore());

    it("makes the contact under a savepoint with a short lock_timeout, then puts it back", async () => {
        const { tx, statements } = fakeTx(
            jest.fn().mockResolvedValue({ id: "link_1" }),
        );

        await expect(ensureContactForPaidOrder(tx, PAID)).resolves.toBe(
            "already-linked",
        );

        expect(statements).toEqual([
            expect.stringContaining("current_setting('lock_timeout')"),
            "SAVEPOINT ensure_paying_contact",
            expect.stringContaining(`[${ENSURE_CONTACT_LOCK_TIMEOUT}]`),
            expect.stringContaining("set_config('lock_timeout', ?, true) [0]"),
            "RELEASE SAVEPOINT ensure_paying_contact",
        ]);
        expect(warn).not.toHaveBeenCalled();
    });

    it("rolls back to the savepoint and lets the payment go on when anything fails", async () => {
        const failure = Object.assign(
            new Error(
                "Invalid `tx.contact.createMany()` invocation: email: 'asha@example.com'",
            ),
            { code: "P2010" },
        );
        const { tx, statements } = fakeTx(jest.fn().mockRejectedValue(failure));

        await expect(ensureContactForPaidOrder(tx, PAID)).resolves.toBeNull();

        expect(statements.at(-1)).toBe(
            "ROLLBACK TO SAVEPOINT ensure_paying_contact",
        );
        expect(statements).not.toContain(
            "RELEASE SAVEPOINT ensure_paying_contact",
        );
        expect(warn).toHaveBeenCalledTimes(1);
        const line = String(warn.mock.calls[0][0]);
        expect(line).toContain("org_1");
        expect(line).toContain("cust_1");
        expect(line).toContain("P2010");
        // Never the message: Prisma quotes the call's arguments in it.
        expect(line).not.toContain("asha@example.com");
    });

    it("touches nothing for an order that isn't paid", async () => {
        const { tx, statements } = fakeTx(jest.fn());
        await expect(
            ensureContactForPaidOrder(tx, { ...PAID, paymentStatus: "UNPAID" }),
        ).resolves.toBeNull();
        expect(statements).toEqual([]);
    });
});
