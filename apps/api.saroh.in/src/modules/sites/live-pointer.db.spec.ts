/**
 * `putLive`'s site lock against a real Postgres, with two connections at
 * once (DEC-071, KTD-3): what it serialises, and what it must not deadlock
 * with.
 *
 * Every interleaving here is pinned, never timed: one transaction is held
 * open at a known point, the other is started, and the test waits until
 * Postgres shows it waiting on the first (`test/lock-wait.ts`).
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { backendPid, gate, waitUntilBlockedBy } from "../../../test/lock-wait";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import type { LiveSource } from "./live-pointer";
import { putLive } from "./live-pointer";
import { draftFingerprint } from "./review-route";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

/** A business with a published site, and its owner Asha. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind LP", slug: uniq("lp-org-") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("lp-owner-")}@example.test`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("lp-site-"),
            subdomain: uniq("lpsub"),
        },
    });
    const page = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const version = await prisma.pageVersion.create({
        data: {
            pageId: page.id,
            organizationId: org.id,
            status: "DRAFT",
            createdByUserId: owner.id,
        },
    });
    await prisma.section.create({
        data: {
            pageVersionId: version.id,
            organizationId: org.id,
            type: "richText",
            contractVersion: 1,
            order: 0,
            key: "intro",
            content: { value: "<p>Fresh bread daily</p>" },
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
        roleKey: "OWNER",
    };
    const published = await sites.publishSite(ctx, site.id);
    const live = await prisma.publication.findUniqueOrThrow({
        where: { id: published.publicationId },
        select: {
            id: true,
            snapshot: true,
            templateId: true,
            templateVersion: true,
        },
    });
    return { org, owner, site, ctx, live };
}

type Business = Awaited<ReturnType<typeof business>>;

/** Put the published version live again, as `source`, inside `tx`. */
function putLiveAgain(
    tx: Prisma.TransactionClient,
    b: Business,
    source: LiveSource,
) {
    return putLive(tx, {
        site: { id: b.site.id, organizationId: b.org.id },
        snapshot: b.live.snapshot,
        source,
        actor: { userId: b.owner.id, owner: true },
        fingerprint: draftFingerprint(b.live.snapshot),
        template: { id: b.live.templateId, version: b.live.templateVersion },
    });
}

/** A transaction in the business's context, the way a request runs one. */
function inTx<T>(
    b: Business,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
    return runInOrgContext(b.org.id, () =>
        prisma.$transaction(fn, { timeout: 20_000 }),
    );
}

describe("putLive's site lock (KTD-3)", () => {
    it("queues behind a web-address change rather than deadlocking with it", async () => {
        const b = await business();
        const address = uniq("lpnew");

        // The web-address change's shape (`WebAddressService.move`): a row
        // naming the site goes in first, which takes FOR KEY SHARE on the
        // Site for its foreign key; then the Site's own address changes.
        const inserted = gate<number>();
        const goOn = gate();
        const change = inTx(b, async (tx) => {
            const pid = await backendPid(tx);
            await tx.addressReservation.create({
                data: {
                    organizationId: b.org.id,
                    address: uniq("lpold"),
                    siteId: b.site.id,
                    reservedUntil: new Date(Date.now() + 86_400_000),
                },
                select: { id: true },
            });
            inserted.release(pid);
            await goOn.wait;
            await tx.site.update({
                where: { id: b.site.id },
                data: { subdomain: address },
                select: { id: true },
            });
        });
        const changer = await inserted.wait;

        // A publish starts while the change holds its KEY SHARE, and must
        // wait for it, before it holds anything the change then needs.
        const publish = inTx(b, (tx) => putLiveAgain(tx, b, "publish"));
        await waitUntilBlockedBy(changer);

        goOn.release();
        await expect(change).resolves.toBeUndefined();
        const live = await publish;

        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { subdomain: true, currentPublicationId: true },
        });
        expect(site).toEqual({
            subdomain: address,
            currentPublicationId: live.publicationId,
        });
    });

    it("puts versions live one at a time: a restore waits for a publish, then reads what it committed", async () => {
        const b = await business();

        // A publish that has put its version live and not yet committed.
        // Before it commits it also turns "Publishing needs approval" on,
        // something putLive reads: a restore that waited for it sees the
        // setting and is refused; one that read beside it would not.
        const wrote = gate<{ pid: number; publicationId: string }>();
        const commit = gate();
        const publish = inTx(b, async (tx) => {
            const pid = await backendPid(tx);
            const live = await putLiveAgain(tx, b, "publish");
            await tx.site.update({
                where: { id: b.site.id },
                data: { publishNeedsApproval: true },
                select: { id: true },
            });
            wrote.release({ pid, publicationId: live.publicationId });
            await commit.wait;
            return live;
        });
        const first = await wrote.wait;

        const restore = inTx(b, (tx) => putLiveAgain(tx, b, "restore"));
        // Not a guess: Postgres shows the restore waiting on the publish.
        await waitUntilBlockedBy(first.pid);

        commit.release();
        await publish;
        await expect(restore).rejects.toMatchObject({
            response: { details: { code: "APPROVAL_REQUIRED" } },
        });

        // The publish's version stays live, and the restore wrote nothing.
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: b.site.id },
            select: { currentPublicationId: true },
        });
        expect(site.currentPublicationId).toBe(first.publicationId);
        expect(
            await prisma.publication.count({
                where: { siteId: b.site.id, kind: "LIVE" },
            }),
        ).toBe(2);
    });
});
