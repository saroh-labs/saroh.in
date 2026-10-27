import { prisma } from "@saroh/database";

import { RESEND_COOLDOWN_SECONDS } from "./abuse-guard";
import { VerificationService } from "./verification.service";

/**
 * Abuse controls on Saroh-sent codes (#1239, DEC-191): windows counted on
 * the PhoneVerification rows already written; a refusal is a 429 that
 * writes nothing.
 */
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
// Each test its own numbers and addresses, as the windows span businesses.
const phone = () => `+9197${String(10_000_000 + ++n).slice(-8)}`;

const service = new VerificationService();

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("abuse") },
    });
    return org.id;
}

function start(organizationId: string, phoneE164: string, ipHash?: string) {
    return service.start({
        organizationId,
        module: "BOOKING",
        phoneE164,
        ipHash,
    });
}

/** Rows written `secondsAgo`, straight to the table (past sends). */
async function sentBefore(
    rows: number,
    secondsAgo: number,
    data: { organizationId: string; phoneE164: string; ipHash?: string },
) {
    const createdAt = new Date(Date.now() - secondsAgo * 1000);
    await prisma.phoneVerification.createMany({
        data: Array.from({ length: rows }, () => ({
            ...data,
            module: "BOOKING" as const,
            codeHash: "0".repeat(64),
            expiresAt: new Date(createdAt.getTime() + 600_000),
            createdAt,
        })),
    });
}

async function refused(p: Promise<unknown>, reason: string) {
    const err = (await p.then(
        () => null,
        (e: unknown) => e,
    )) as { getStatus(): number; getResponse(): unknown } | null;
    expect(err).not.toBeNull();
    expect(err!.getStatus()).toBe(429);
    const body = err!.getResponse() as {
        details: { reason: string; retryAfterSeconds: number };
    };
    expect(body.details.reason).toBe(reason);
    expect(body.details.retryAfterSeconds).toBeGreaterThan(0);
    return body.details.retryAfterSeconds;
}

const rowsFor = (where: object) => prisma.phoneVerification.count({ where });

describe("abuse guard", () => {
    let a: string;
    let b: string;
    beforeAll(async () => {
        [a, b] = [await business(), await business()];
    });
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("lets a fresh number, business and address through", async () => {
        const p = phone();
        await expect(start(a, p, uniq("ip"))).resolves.toHaveProperty("code");
        await expect(rowsFor({ phoneE164: p })).resolves.toBe(1);
    });

    it("refuses a resend to the same number within the cooldown, but not another business", async () => {
        const p = phone();
        await start(a, p);
        const wait = await refused(start(a, p), "number");
        expect(wait).toBeLessThanOrEqual(RESEND_COOLDOWN_SECONDS);
        await expect(start(b, p)).resolves.toHaveProperty("code");
        await expect(rowsFor({ phoneE164: p })).resolves.toBe(2);
    });

    it("refuses a fourth code to a number in ten minutes, across businesses, writing nothing", async () => {
        const p = phone();
        await sentBefore(2, 120, { organizationId: a, phoneE164: p });
        await sentBefore(1, 60, { organizationId: b, phoneE164: p });
        const wait = await refused(start(a, p), "number");
        // The oldest of the three ages out in ~8 minutes.
        expect(wait).toBeGreaterThan(7 * 60);
        expect(wait).toBeLessThanOrEqual(8 * 60);
        await expect(rowsFor({ phoneE164: p })).resolves.toBe(3);
    });

    it("refuses an eleventh code to a number in a day", async () => {
        const p = phone();
        await sentBefore(10, 3600, { organizationId: a, phoneE164: p });
        await refused(start(b, p), "number");
        await expect(rowsFor({ phoneE164: p })).resolves.toBe(10);
    });

    it("trips on an address flooding many numbers", async () => {
        const ip = uniq("ip");
        for (let i = 0; i < 10; i++) {
            await expect(start(a, phone(), ip)).resolves.toHaveProperty("code");
        }
        const p = phone();
        await refused(start(b, p, ip), "address");
        await expect(rowsFor({ phoneE164: p })).resolves.toBe(0);
        await expect(rowsFor({ ipHash: ip })).resolves.toBe(10);
        // Another address is not held back.
        await expect(start(b, p, uniq("ip"))).resolves.toHaveProperty("code");
    });

    it("caps a business at 500 codes a day", async () => {
        const capped = await business();
        await prisma.phoneVerification.createMany({
            data: Array.from({ length: 500 }, () => ({
                organizationId: capped,
                phoneE164: phone(),
                module: "BOOKING" as const,
                codeHash: "0".repeat(64),
                expiresAt: new Date(Date.now() + 600_000),
                createdAt: new Date(Date.now() - 3600_000),
            })),
        });
        await refused(start(capped, phone()), "business");
        await expect(rowsFor({ organizationId: capped })).resolves.toBe(500);
        await expect(start(a, phone())).resolves.toHaveProperty("code");
    });

    it("lets only as many parallel starts through as the number has room for", async () => {
        const p = phone();
        await sentBefore(1, 120, { organizationId: a, phoneE164: p });
        const orgs = await Promise.all(Array.from({ length: 6 }, business));
        const results = await Promise.allSettled(orgs.map((o) => start(o, p)));
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
        await expect(rowsFor({ phoneE164: p })).resolves.toBe(3);
    });
});
