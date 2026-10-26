import { prisma } from "@saroh/database";

import { VerificationService } from "./verification.service";

/**
 * The verification session primitive (#1238, DEC-191): a code is made,
 * kept only as a hash, checked in constant time, and spent at most once;
 * every send to the provider is its own row.
 */
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

const service = new VerificationService();

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: uniq("verify") },
    });
    return org.id;
}

async function started(organizationId: string) {
    return service.start({
        organizationId,
        module: "BOOKING",
        phoneE164: "98450 12345",
        subjectRef: "booking_1",
    });
}

const wrongFor = (code: string) => (code === "000000" ? "111111" : "000000");

describe("VerificationService", () => {
    let orgId: string;

    beforeAll(async () => {
        orgId = await business();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("starts a session and verifies the right code once", async () => {
        const { verificationId, code, expiresAt } = await started(orgId);
        expect(code).toMatch(/^\d{6}$/);
        const ttl = expiresAt.getTime() - Date.now();
        expect(ttl).toBeGreaterThan(9 * 60_000);
        expect(ttl).toBeLessThanOrEqual(10 * 60_000);

        await expect(
            service.check({ organizationId: orgId, verificationId, code }),
        ).resolves.toBe("verified");
        const row = await prisma.phoneVerification.findUniqueOrThrow({
            where: { id: verificationId },
        });
        expect(row).toMatchObject({
            status: "VERIFIED",
            attempts: 1,
            phoneE164: "+919845012345",
            module: "BOOKING",
            subjectRef: "booking_1",
        });
        expect(row.verifiedAt).toBeInstanceOf(Date);

        // Spent: the same code can't be used again.
        await expect(
            service.check({ organizationId: orgId, verificationId, code }),
        ).resolves.toBe("already_verified");
    });

    it("stores a hash, never the code", async () => {
        const { verificationId, code } = await started(orgId);
        const row = await prisma.phoneVerification.findUniqueOrThrow({
            where: { id: verificationId },
        });
        expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
        expect(row.codeHash).not.toContain(code);
        expect(JSON.stringify(row)).not.toContain(code);
    });

    it("refuses a non-Indian or invalid number", async () => {
        for (const phoneE164 of ["+14155550123", "12345", "not a phone", ""]) {
            await expect(
                service.start({
                    organizationId: orgId,
                    module: "ORDER",
                    phoneE164,
                }),
            ).rejects.toThrow();
        }
    });

    it("refuses and expires a code past its time, even the right one", async () => {
        const { verificationId, code } = await started(orgId);
        await prisma.phoneVerification.update({
            where: { id: verificationId },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await expect(
            service.check({ organizationId: orgId, verificationId, code }),
        ).resolves.toBe("expired");
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: verificationId },
            }),
        ).resolves.toMatchObject({ status: "EXPIRED", verifiedAt: null });
    });

    it("counts wrong codes and fails the session at five, right code or not", async () => {
        const { verificationId, code } = await started(orgId);
        const wrong = wrongFor(code);
        for (let i = 0; i < 4; i++) {
            await expect(
                service.check({
                    organizationId: orgId,
                    verificationId,
                    code: wrong,
                }),
            ).resolves.toBe("wrong_code");
        }
        await expect(
            service.check({
                organizationId: orgId,
                verificationId,
                code: wrong,
            }),
        ).resolves.toBe("too_many_attempts");
        await expect(
            service.check({ organizationId: orgId, verificationId, code }),
        ).resolves.toBe("too_many_attempts");
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: verificationId },
            }),
        ).resolves.toMatchObject({
            status: "FAILED",
            attempts: 5,
            verifiedAt: null,
        });
    });

    it("lets one of two parallel right checks win, and never over-counts", async () => {
        const { verificationId, code } = await started(orgId);
        const results = await Promise.all(
            Array.from({ length: 2 }, () =>
                service.check({ organizationId: orgId, verificationId, code }),
            ),
        );
        expect(results.filter((r) => r === "verified")).toHaveLength(1);

        const guessed = await started(orgId);
        const wrong = wrongFor(guessed.code);
        const guesses = await Promise.all(
            Array.from({ length: 12 }, () =>
                service.check({
                    organizationId: orgId,
                    verificationId: guessed.verificationId,
                    code: wrong,
                }),
            ),
        );
        expect(guesses).not.toContain("verified");
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: guessed.verificationId },
            }),
        ).resolves.toMatchObject({ status: "FAILED", attempts: 5 });
    });

    it("writes a row per send, a fallback its own with its own status and price", async () => {
        const { verificationId } = await started(orgId);
        await service.recordSend({
            organizationId: orgId,
            verificationId,
            channel: "WHATSAPP",
            pricePaise: 80,
            providerMessageId: "wamid.1",
            status: "FAILED",
            failureReason: "not on WhatsApp",
        });
        await service.recordSend({
            organizationId: orgId,
            verificationId,
            channel: "SMS",
            pricePaise: 25,
            status: "SENT",
        });
        const sends = await prisma.messagingSend.findMany({
            where: { verificationId },
            orderBy: { createdAt: "asc" },
        });
        expect(sends).toMatchObject([
            {
                organizationId: orgId,
                channel: "WHATSAPP",
                pricePaise: 80,
                providerMessageId: "wamid.1",
                status: "FAILED",
                failureReason: "not on WhatsApp",
            },
            {
                organizationId: orgId,
                channel: "SMS",
                pricePaise: 25,
                providerMessageId: null,
                status: "SENT",
                failureReason: null,
            },
        ]);
    });

    it("never reaches another business's session", async () => {
        const other = await business();
        const { verificationId, code } = await started(orgId);
        await expect(
            service.check({ organizationId: other, verificationId, code }),
        ).resolves.toBe("not_found");
        await expect(
            service.recordSend({
                organizationId: other,
                verificationId,
                channel: "SMS",
                pricePaise: 25,
                status: "SENT",
            }),
        ).rejects.toThrow();
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: verificationId },
            }),
        ).resolves.toMatchObject({ status: "PENDING", attempts: 0 });
        await expect(
            prisma.messagingSend.count({ where: { verificationId } }),
        ).resolves.toBe(0);
    });
});
