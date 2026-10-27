import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on the per-module verification switch (#1242,
 * migration `20270104110000_messaging_verification_settings`), over a
 * NOBYPASSRLS role: one business sees and changes only its own switches.
 * Runs only in RLS mode (`TEST_RLS=on`).
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

async function businessWithSetting(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("verify-setting-rls") },
    });
    const setting = await prisma.messagingVerificationSetting.create({
        data: { organizationId: org.id, module: "BOOKING", enabled: true },
    });
    return { orgId: org.id, settingId: setting.id };
}

describeRls("row-level security on MessagingVerificationSetting", () => {
    let a: Awaited<ReturnType<typeof businessWithSetting>>;
    let b: Awaited<ReturnType<typeof businessWithSetting>>;

    beforeAll(async () => {
        a = await businessWithSetting("Rye & Co.");
        b = await businessWithSetting("Pulse Fitness");
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it("shows a business only its own switches, a bogus one none", async () => {
        const own = await runInOrgContext(a.orgId, () =>
            prisma.messagingVerificationSetting.findMany({
                select: { id: true },
            }),
        );
        expect(own).toEqual([{ id: a.settingId }]);
        await expect(
            runInOrgContext("org_does_not_exist", () =>
                prisma.messagingVerificationSetting.count(),
            ),
        ).resolves.toBe(0);
    });

    it("can't change, delete or write another business's switch", async () => {
        const changed = await runInOrgContext(a.orgId, async () => [
            (
                await prisma.messagingVerificationSetting.updateMany({
                    where: { id: b.settingId },
                    data: { enabled: false },
                })
            ).count,
            (
                await prisma.messagingVerificationSetting.deleteMany({
                    where: { id: b.settingId },
                })
            ).count,
        ]);
        expect(changed).toEqual([0, 0]);
        await expect(
            prisma.messagingVerificationSetting.findUniqueOrThrow({
                where: { id: b.settingId },
            }),
        ).resolves.toMatchObject({ enabled: true });
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.messagingVerificationSetting.create({
                    data: { organizationId: b.orgId, module: "ORDER" },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});
