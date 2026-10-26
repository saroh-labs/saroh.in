import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on Saroh-sent verification codes (#1238, migration
 * `20270101100000_messaging_verification_wallet`), over a NOBYPASSRLS role with
 * enforcement on: one business sees and writes only its own sessions and
 * sends, and the database refuses a negative send price.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies and no CHECKs, and connects as
 * the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithSend(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("verify-rls") },
    });
    const verification = await prisma.phoneVerification.create({
        data: {
            organizationId: org.id,
            module: "BOOKING",
            phoneE164: "+919845012345",
            codeHash: "0".repeat(64),
            expiresAt: new Date(Date.now() + 600_000),
        },
    });
    const send = await prisma.messagingSend.create({
        data: {
            organizationId: org.id,
            verificationId: verification.id,
            channel: "WHATSAPP",
            pricePaise: 80,
        },
    });
    return { orgId: org.id, verificationId: verification.id, sendId: send.id };
}

describeRls("row-level security on PhoneVerification and MessagingSend", () => {
    let a: Awaited<ReturnType<typeof businessWithSend>>;
    let b: Awaited<ReturnType<typeof businessWithSend>>;

    beforeAll(async () => {
        a = await businessWithSend("Rye & Co.");
        b = await businessWithSend("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("connects as a role row-level security applies to", async () => {
        const [role] = await prisma.$queryRaw<
            Array<{ rolsuper: boolean; rolbypassrls: boolean }>
        >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
        expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it("shows a business only its own rows, a bogus one none, and no context all", async () => {
        const own = await runInOrgContext(a.orgId, async () => ({
            verifications: await prisma.phoneVerification.findMany({
                select: { id: true },
            }),
            sends: await prisma.messagingSend.findMany({
                select: { id: true },
            }),
        }));
        const bogus = await runInOrgContext("org_does_not_exist", async () => [
            await prisma.phoneVerification.count(),
            await prisma.messagingSend.count(),
        ]);
        expect(own).toEqual({
            verifications: [{ id: a.verificationId }],
            sends: [{ id: a.sendId }],
        });
        expect(bogus).toEqual([0, 0]);
        await expect(
            prisma.phoneVerification.count({
                where: { id: { in: [a.verificationId, b.verificationId] } },
            }),
        ).resolves.toBe(2);
        await expect(
            prisma.messagingSend.count({
                where: { id: { in: [a.sendId, b.sendId] } },
            }),
        ).resolves.toBe(2);
    });

    it("can't change or delete another business's session or send", async () => {
        const changed = await runInOrgContext(a.orgId, async () => [
            (
                await prisma.phoneVerification.updateMany({
                    where: { id: b.verificationId },
                    data: { status: "VERIFIED", verifiedAt: new Date() },
                })
            ).count,
            (
                await prisma.messagingSend.updateMany({
                    where: { id: b.sendId },
                    data: { status: "DELIVERED" },
                })
            ).count,
            (
                await prisma.messagingSend.deleteMany({
                    where: { id: b.sendId },
                })
            ).count,
            (
                await prisma.phoneVerification.deleteMany({
                    where: { id: b.verificationId },
                })
            ).count,
        ]);
        expect(changed).toEqual([0, 0, 0, 0]);
        await expect(
            prisma.phoneVerification.findUniqueOrThrow({
                where: { id: b.verificationId },
            }),
        ).resolves.toMatchObject({ status: "PENDING" });
        await expect(
            prisma.messagingSend.findUniqueOrThrow({ where: { id: b.sendId } }),
        ).resolves.toMatchObject({ status: "QUEUED" });
    });

    it("refuses to write another business's rows inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.phoneVerification.create({
                    data: {
                        organizationId: b.orgId,
                        module: "ORDER",
                        phoneE164: "+919845012345",
                        codeHash: "0".repeat(64),
                        expiresAt: new Date(),
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.messagingSend.create({
                    data: {
                        organizationId: b.orgId,
                        verificationId: b.verificationId,
                        channel: "SMS",
                        pricePaise: 25,
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });

    it("refuses a negative send price", async () => {
        await expect(
            prisma.messagingSend.create({
                data: {
                    organizationId: a.orgId,
                    verificationId: a.verificationId,
                    channel: "SMS",
                    pricePaise: -1,
                },
            }),
        ).rejects.toThrow(/MessagingSend_pricePaise_check/);
    });
});
