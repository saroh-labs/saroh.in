import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on messaging top-ups (#1241, migration
 * `20270101120000_messaging_topup`), over a NOBYPASSRLS role: one business
 * sees and changes only its own. Runs only in RLS mode (`TEST_RLS=on`).
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithTopup(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("topup-rls") },
    });
    const topup = await prisma.messagingTopup.create({
        data: {
            organizationId: org.id,
            packId: "pack-a",
            amountPaise: 100,
            provider: "RAZORPAY",
            providerOrderId: uniq("order"),
        },
    });
    return { orgId: org.id, topupId: topup.id };
}

describeRls("row-level security on MessagingTopup", () => {
    let a: Awaited<ReturnType<typeof businessWithTopup>>;
    let b: Awaited<ReturnType<typeof businessWithTopup>>;

    beforeAll(async () => {
        a = await businessWithTopup("Rye & Co.");
        b = await businessWithTopup("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("shows a business only its own top-ups, a bogus one none", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.messagingTopup.findMany({ select: { id: true } }),
        );
        expect(own).toEqual([{ id: a.topupId }]);
        await expect(
            runInOrgContext("org_does_not_exist", () =>
                prisma.messagingTopup.count(),
            ),
        ).resolves.toBe(0);
    });

    it("can't change, delete or write another business's top-up", async () => {
        const changed = await runInOrgContext(a.orgId, async () => [
            (
                await prisma.messagingTopup.updateMany({
                    where: { id: b.topupId },
                    data: { status: "PAID" },
                })
            ).count,
            (
                await prisma.messagingTopup.deleteMany({
                    where: { id: b.topupId },
                })
            ).count,
        ]);
        expect(changed).toEqual([0, 0]);
        await expect(
            prisma.messagingTopup.findUniqueOrThrow({
                where: { id: b.topupId },
            }),
        ).resolves.toMatchObject({ status: "PENDING" });
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.messagingTopup.create({
                    data: {
                        organizationId: b.orgId,
                        packId: "pack-a",
                        amountPaise: 100,
                        provider: "RAZORPAY",
                        providerOrderId: uniq("order"),
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});
