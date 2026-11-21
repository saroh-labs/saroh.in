/**
 * A site's approval verdicts are read for the units at hand only (04 W3,
 * 21 Nov 2026): never every verdict the site ever had, which grows for good
 * and was read inside the publish's transaction.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import { heldForApproval, readUnitVerdicts } from "./change-approvals";

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function siteWithHistory() {
    const org = await prisma.organization.create({
        data: { name: "Gulmohar Studio", slug: uniq("cab-org-") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("cab-")}@example.com`, name: "Kavya" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "REVIEWER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Gulmohar",
            slug: uniq("cab-site-"),
            subdomain: uniq("cabsub"),
        },
    });
    const row = (unitKey: string, outcome: string, at: Date) => ({
        organizationId: org.id,
        siteId: site.id,
        unitKey,
        unitFingerprint: "f-old",
        byUserId: user.id,
        outcome,
        createdAt: at,
    });
    // 10,000 old verdicts on units long published, and two on the one at hand.
    await prisma.siteChangeApproval.createMany({
        data: Array.from({ length: 10_000 }, (_, i) =>
            row(`section:p_old:${i}`, "APPROVED", new Date(2026, 0, 1)),
        ),
    });
    await prisma.siteChangeApproval.createMany({
        data: [
            row("section:p1:k1", "CHANGES_REQUESTED", new Date(2026, 10, 1)),
            {
                ...row("section:p1:k1", "APPROVED", new Date(2026, 10, 2)),
                unitFingerprint: "f1",
            },
        ],
    });
    return { org, site, user };
}

describe("verdicts read only for the units at hand (04 W3)", () => {
    it("reads one row per unit asked about, its newest", async () => {
        const { org, site } = await siteWithHistory();
        const { rows } = await readUnitVerdicts(prisma, {
            organizationId: org.id,
            siteId: site.id,
            editors: [],
            unitKeys: ["section:p1:k1", "section:p1:k1"],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            unitKey: "section:p1:k1",
            outcome: "APPROVED",
            unitFingerprint: "f1",
        });
        const none = await readUnitVerdicts(prisma, {
            organizationId: org.id,
            siteId: site.id,
            editors: [],
            unitKeys: [],
        });
        expect(none.rows).toEqual([]);
    });

    it("lets the publish through on the unit's approval, whatever else the site has", async () => {
        const { org, site, user } = await siteWithHistory();
        const author = await prisma.user.create({
            data: { email: `${uniq("cab-")}@example.com`, name: "Ritika" },
        });
        const held = await prisma.$transaction((tx) =>
            heldForApproval(tx, {
                organizationId: org.id,
                siteId: site.id,
                userId: user.id,
                units: [
                    {
                        key: "section:p1:k1",
                        fingerprint: "f1",
                        editedBy: author.id,
                    } as never,
                ],
            }),
        );
        expect(held).toEqual([]);
    });
});
