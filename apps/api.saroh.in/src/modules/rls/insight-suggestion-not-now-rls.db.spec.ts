import { prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security on Insights' "Not now" (DEC-171, #1087, migration
 * `20261208153000_insight_suggestion_not_now`), over a NOBYPASSRLS role
 * with enforcement on: one business sees, changes and writes only its own
 * put-off suggestions, even for the same person and the same key.
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema
 * with `db push`, which creates no policies, and connects as the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const until = new Date("2026-10-26T03:30:00.000Z");
const KEY = "late-bill:cm_same_key";

describeRls("row-level security on InsightSuggestionNotNow", () => {
    let userId = "";
    let a = { orgId: "", rowId: "" };
    let b = { orgId: "", rowId: "" };

    async function businessWithNotNow(name: string) {
        const org = await prisma.organization.create({
            data: { name, slug: uniq("not-now-rls") },
        });
        const row = await prisma.insightSuggestionNotNow.create({
            data: {
                organizationId: org.id,
                userId,
                key: KEY,
                hiddenUntil: until,
            },
        });
        return { orgId: org.id, rowId: row.id };
    }

    beforeAll(async () => {
        userId = (
            await prisma.user.create({
                data: { email: `${uniq("asha")}@example.com` },
            })
        ).id;
        a = await businessWithNotNow("Rye & Co.");
        b = await businessWithNotNow("Pulse Fitness");
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
        const own = await runInOrgContext(a.orgId, () =>
            prisma.insightSuggestionNotNow.findMany({
                where: { userId, key: KEY },
                select: { id: true },
            }),
        );
        const bogus = await runInOrgContext("org_does_not_exist", () =>
            prisma.insightSuggestionNotNow.count(),
        );
        const all = await prisma.insightSuggestionNotNow.count({
            where: { id: { in: [a.rowId, b.rowId] } },
        });

        expect(own).toEqual([{ id: a.rowId }]);
        expect(bogus).toBe(0);
        expect(all).toBe(2);
    });

    it("can't change or remove another business's row", async () => {
        const changed = await runInOrgContext(a.orgId, () =>
            prisma.insightSuggestionNotNow.updateMany({
                where: { id: b.rowId },
                data: { hiddenUntil: new Date("2027-01-01T00:00:00.000Z") },
            }),
        );
        const removed = await runInOrgContext(a.orgId, () =>
            prisma.insightSuggestionNotNow.deleteMany({
                where: { id: b.rowId },
            }),
        );
        expect(changed.count).toBe(0);
        expect(removed.count).toBe(0);
        const still = await prisma.insightSuggestionNotNow.findUniqueOrThrow({
            where: { id: b.rowId },
        });
        expect(still.hiddenUntil).toEqual(until);
    });

    it("refuses to write a row for another business inside a context", async () => {
        await expect(
            runInOrgContext(a.orgId, () =>
                prisma.insightSuggestionNotNow.create({
                    data: {
                        organizationId: b.orgId,
                        userId,
                        key: "class-full:cm_other",
                        hiddenUntil: until,
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });
});
