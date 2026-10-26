import { prisma } from "@saroh/database";

import { WalletService } from "./wallet.service";

/** The prepaid messaging wallet (#1240), against a real database. Paise values are arbitrary. */

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const service = new WalletService();
const HOUR = 60 * 60 * 1000;

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: uniq("wallet") },
    });
    return org.id;
}

async function send(
    organizationId: string,
    pricePaise: number,
    createdAt?: Date,
) {
    const verification = await prisma.phoneVerification.create({
        data: {
            organizationId,
            module: "BOOKING",
            phoneE164: "+919800000000",
            codeHash: "hash",
            expiresAt: new Date(Date.now() + HOUR),
        },
    });
    const row = await prisma.messagingSend.create({
        data: {
            organizationId,
            verificationId: verification.id,
            channel: "WHATSAPP",
            pricePaise,
            ...(createdAt ? { createdAt } : {}),
        },
    });
    return row.id;
}

/** A send that holds its price first, as the sender will. */
async function heldSend(
    organizationId: string,
    pricePaise: number,
    createdAt?: Date,
) {
    await expect(service.hold(organizationId, pricePaise)).resolves.toEqual({
        ok: true,
    });
    return send(organizationId, pricePaise, createdAt);
}

const entries = (organizationId: string) =>
    prisma.messagingLedgerEntry.findMany({
        where: { organizationId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

afterAll(async () => {
    await prisma.$disconnect();
});

describe("WalletService", () => {
    it("a business with no wallet has nothing, and can't hold", async () => {
        const org = await business();
        await expect(service.get(org)).resolves.toEqual({
            balancePaise: 0,
            heldPaise: 0,
            availablePaise: 0,
            expiresAt: null,
        });
        await expect(service.hold(org, 1)).resolves.toEqual({
            ok: false,
            reason: "INSUFFICIENT_BALANCE",
        });
    });

    it("credit → hold → debit reconciles, balanceAfter chains and held returns to 0", async () => {
        const org = await business();
        await service.credit(org, 1000, { topupId: "topup_1", reason: "test" });
        const a = await heldSend(org, 70);
        const b = await heldSend(org, 30);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 1000,
            heldPaise: 100,
            availablePaise: 900,
        });
        await expect(service.debit(a)).resolves.toBe(true);
        await expect(service.debit(b)).resolves.toBe(true);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 900,
            heldPaise: 0,
            availablePaise: 900,
        });
        const trail = await entries(org);
        expect(
            trail.map((e) => [e.kind, e.amountPaise, e.balanceAfter]),
        ).toEqual([
            ["TOPUP", 1000, 1000],
            ["DEBIT", -70, 930],
            ["DEBIT", -30, 900],
        ]);
        expect(trail[0]).toMatchObject({ topupId: "topup_1", reason: "test" });
        expect(trail.reduce((s, e) => s + e.amountPaise, 0)).toBe(900);
        const charged = await prisma.messagingSend.findUniqueOrThrow({
            where: { id: a },
        });
        expect(charged.chargedAt).not.toBeNull();
    });

    it("a second top-up adds to the balance and resets the expiry", async () => {
        const org = await business();
        await service.credit(org, 500);
        await prisma.messagingWallet.update({
            where: { organizationId: org },
            data: { expiresAt: new Date(Date.now() + HOUR) },
        });
        const second = await service.credit(org, 200);
        expect(second.balancePaise).toBe(700);
        const elevenMonths = Date.now() + 330 * 24 * HOUR;
        expect(second.expiresAt!.getTime()).toBeGreaterThan(elevenMonths);
    });

    it("holds exactly what is available, then refuses the next", async () => {
        const org = await business();
        await service.credit(org, 100);
        await expect(service.hold(org, 60)).resolves.toEqual({ ok: true });
        await expect(service.hold(org, 40)).resolves.toEqual({ ok: true });
        await expect(service.hold(org, 1)).resolves.toEqual({
            ok: false,
            reason: "INSUFFICIENT_BALANCE",
        });
        expect((await service.get(org)).availablePaise).toBe(0);
    });

    it("refuses to hold an expired balance", async () => {
        const org = await business();
        await service.credit(org, 100);
        await prisma.messagingWallet.update({
            where: { organizationId: org },
            data: { expiresAt: new Date(Date.now() - HOUR) },
        });
        await expect(service.hold(org, 10)).resolves.toMatchObject({
            ok: false,
        });
    });

    it("concurrent holds past the balance: exactly the affordable number win", async () => {
        const org = await business();
        await service.credit(org, 500);
        const results = await Promise.all(
            Array.from({ length: 12 }, () => service.hold(org, 70)),
        );
        expect(results.filter((r) => r.ok)).toHaveLength(7);
        const w = await service.get(org);
        expect(w).toMatchObject({
            balancePaise: 500,
            heldPaise: 490,
            availablePaise: 10,
        });
    });

    it("release restores the available balance and charges nothing", async () => {
        const org = await business();
        await service.credit(org, 300);
        const id = await heldSend(org, 50);
        await expect(service.release(id)).resolves.toBe(true);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 300,
            heldPaise: 0,
            availablePaise: 300,
        });
        const trail = await entries(org);
        expect(
            trail.map((e) => [e.kind, e.amountPaise, e.balanceAfter]),
        ).toEqual([
            ["TOPUP", 300, 300],
            ["RELEASE", 0, 300],
        ]);
    });

    it("charges a duplicate debit once, even raced", async () => {
        const org = await business();
        await service.credit(org, 300);
        const id = await heldSend(org, 50);
        const raced = await Promise.all([service.debit(id), service.debit(id)]);
        expect(raced.filter(Boolean)).toHaveLength(1);
        await expect(service.debit(id)).resolves.toBe(false);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 250,
            heldPaise: 0,
        });
        expect(
            (await entries(org)).filter((e) => e.kind === "DEBIT"),
        ).toHaveLength(1);
    });

    it("a debit after a release charges nothing", async () => {
        const org = await business();
        await service.credit(org, 300);
        const id = await heldSend(org, 50);
        await service.release(id);
        await expect(service.debit(id)).resolves.toBe(false);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 300,
            heldPaise: 0,
        });
        expect((await entries(org)).some((e) => e.kind === "DEBIT")).toBe(
            false,
        );
    });

    it("pages the ledger newest first", async () => {
        const org = await business();
        for (const amount of [1, 2, 3]) await service.credit(org, amount);
        const first = await service.ledger(org, { limit: 2 });
        expect(first.entries.map((e) => e.amountPaise)).toEqual([3, 2]);
        const second = await service.ledger(org, {
            limit: 2,
            cursor: first.nextCursor!,
        });
        expect(second.entries.map((e) => e.amountPaise)).toEqual([1]);
        expect(second.nextCursor).toBeNull();
    });
});

describe("WalletService.expireSweep", () => {
    it("zeroes the free part of an expired balance, keeping in-flight holds", async () => {
        const org = await business();
        await service.credit(org, 400);
        const inFlight = await heldSend(org, 60);
        await prisma.messagingWallet.update({
            where: { organizationId: org },
            data: { expiresAt: new Date(Date.now() - HOUR) },
        });
        const result = await service.expireSweep(new Date());
        expect(result.expired).toBeGreaterThanOrEqual(1);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 60,
            heldPaise: 60,
            availablePaise: 0,
        });
        const expire = (await entries(org)).find((e) => e.kind === "EXPIRE");
        expect(expire).toMatchObject({ amountPaise: -340, balanceAfter: 60 });
        // The in-flight send still charges when it is delivered.
        await expect(service.debit(inFlight)).resolves.toBe(true);
        expect(await service.get(org)).toMatchObject({
            balancePaise: 0,
            heldPaise: 0,
        });
        // Run again: nothing left to expire.
        await service.expireSweep(new Date());
        expect(
            (await entries(org)).filter((e) => e.kind === "EXPIRE"),
        ).toHaveLength(1);
    });

    it("leaves a balance before its expiry alone", async () => {
        const org = await business();
        await service.credit(org, 400);
        await service.expireSweep(new Date());
        expect((await service.get(org)).balancePaise).toBe(400);
    });

    it("releases a WhatsApp hold with no report after 24 hours, and only that one", async () => {
        const org = await business();
        await service.credit(org, 400);
        const stale = await heldSend(org, 40, new Date(Date.now() - 25 * HOUR));
        const fresh = await heldSend(org, 30, new Date(Date.now() - HOUR));
        const result = await service.expireSweep(new Date());
        expect(result.released).toBeGreaterThanOrEqual(1);
        const [s, f] = await Promise.all(
            [stale, fresh].map((id) =>
                prisma.messagingSend.findUniqueOrThrow({ where: { id } }),
            ),
        );
        expect(s.releasedAt).not.toBeNull();
        expect(f.releasedAt).toBeNull();
        expect(await service.get(org)).toMatchObject({
            balancePaise: 400,
            heldPaise: 30,
        });
    });
});
