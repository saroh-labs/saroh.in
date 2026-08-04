import { ConflictException } from "@nestjs/common";
import type { prisma } from "@saroh/database";

import { fingerprintOf, IdempotencyService } from "./idempotency.service";

type Db = typeof prisma;

const P2002 = Object.assign(new Error("unique"), { code: "P2002" });

function dbWith(existing: Record<string, unknown> | null, onCreate?: Error) {
    return {
        idempotencyRecord: {
            create: jest.fn(
                onCreate
                    ? () => Promise.reject(onCreate)
                    : () => Promise.resolve({}),
            ),
            findUnique: jest.fn().mockResolvedValue(existing),
            update: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
        },
    } as unknown as Db;
}

const ctx = {
    scope: "flags.global.set",
    key: "K",
    actorUserId: "user_1",
};

describe("fingerprintOf", () => {
    it("ignores property order", () => {
        // Without this an identical retry serialized differently would be
        // rejected as a conflict — a safety feature producing spurious 409s.
        expect(fingerprintOf({ a: 1, b: 2 })).toBe(
            fingerprintOf({ b: 2, a: 1 }),
        );
    });

    it("is sensitive to the value being written", () => {
        // The whole defect: the old key encoded actor, operation and target but
        // not the value, so opposite payloads shared one key.
        expect(fingerprintOf({ enabled: true })).not.toBe(
            fingerprintOf({ enabled: false }),
        );
    });

    it("distinguishes nested differences", () => {
        expect(fingerprintOf({ a: { b: 1 } })).not.toBe(
            fingerprintOf({ a: { b: 2 } }),
        );
    });
});

describe("IdempotencyService", () => {
    it("runs the operation when no key is supplied", async () => {
        const operation = jest.fn().mockResolvedValue("done");
        const service = new IdempotencyService(dbWith(null));

        await expect(
            service.run(
                { ...ctx, key: undefined },
                { enabled: true },
                operation,
            ),
        ).resolves.toBe("done");
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it("runs the operation once for a fresh key", async () => {
        const operation = jest.fn().mockResolvedValue({ ok: true });
        const service = new IdempotencyService(dbWith(null));

        await expect(
            service.run(ctx, { enabled: true }, operation),
        ).resolves.toEqual({ ok: true });
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it("replays the stored response for an identical retry", async () => {
        const operation = jest.fn();
        const service = new IdempotencyService(
            dbWith(
                {
                    fingerprint: fingerprintOf({ enabled: true }),
                    status: "COMPLETED",
                    response: { ok: true },
                },
                P2002,
            ),
        );

        await expect(
            service.run(ctx, { enabled: true }, operation),
        ).resolves.toEqual({ ok: true });
        // The point of a retry: the side effect must not happen twice.
        expect(operation).not.toHaveBeenCalled();
    });

    it("REJECTS the same key carrying a different request", async () => {
        // The reproduced defect. Previously this returned 200 and silently
        // discarded the caller's new instruction.
        const operation = jest.fn();
        const service = new IdempotencyService(
            dbWith(
                {
                    fingerprint: fingerprintOf({ enabled: true }),
                    status: "COMPLETED",
                    response: { ok: true },
                },
                P2002,
            ),
        );

        await expect(
            service.run(ctx, { enabled: false }, operation),
        ).rejects.toThrow(ConflictException);
        expect(operation).not.toHaveBeenCalled();
    });

    it("explains how to recover from a conflict", async () => {
        const service = new IdempotencyService(
            dbWith(
                { fingerprint: "other", status: "COMPLETED", response: null },
                P2002,
            ),
        );

        await expect(
            service.run(ctx, { enabled: false }, jest.fn()),
        ).rejects.toThrow(/Use a new key, or resend the original request/);
    });

    it("resolves concurrent duplicates deterministically, never as a 500", async () => {
        // SEC-009: the loser of the unique-constraint race used to surface as
        // an unhandled 500.
        const service = new IdempotencyService(
            dbWith(
                {
                    fingerprint: fingerprintOf({ enabled: true }),
                    status: "IN_PROGRESS",
                    response: null,
                },
                P2002,
            ),
        );

        await expect(
            service.run(ctx, { enabled: true }, jest.fn()),
        ).rejects.toThrow(ConflictException);
        await expect(
            service.run(ctx, { enabled: true }, jest.fn()),
        ).rejects.toThrow(/already in progress/);
    });

    it("does not leave a record behind when the operation fails", async () => {
        // Otherwise the retry of a request that never succeeded would be
        // mistaken for a duplicate of it.
        const db = dbWith(null);
        const service = new IdempotencyService(db);

        await expect(
            service.run(ctx, { enabled: true }, () =>
                Promise.reject(new Error("boom")),
            ),
        ).rejects.toThrow("boom");

        expect(db.idempotencyRecord.delete).toHaveBeenCalled();
    });

    it("scopes keys per actor, so one actor's key cannot satisfy another's", async () => {
        const db = dbWith(null);
        await new IdempotencyService(db).run(ctx, { enabled: true }, jest.fn());

        expect(db.idempotencyRecord.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    scope: "flags.global.set",
                    key: "K",
                    actorUserId: "user_1",
                }),
            }),
        );
    });

    it("rethrows a non-unique database error rather than swallowing it", async () => {
        const service = new IdempotencyService(
            dbWith(
                null,
                Object.assign(new Error("disk full"), { code: "P1001" }),
            ),
        );

        await expect(
            service.run(ctx, { enabled: true }, jest.fn()),
        ).rejects.toThrow("disk full");
    });
});
