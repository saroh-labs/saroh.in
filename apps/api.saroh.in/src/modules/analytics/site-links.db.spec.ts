/**
 * The links a business makes in Saroh to share its site (DEC-181, #1099)
 * against a real Postgres: made from a name with the label shown and
 * editable, listed with their visits and paid in the period (a small count
 * held back), archived and brought back with Undo, each write in Activity;
 * a label taken on the site is a 409 and one made from the name takes the
 * next free one; another business's site or link is a 404; and the
 * permissions are Insights' to read and the website's to write. Runs in
 * the integration project, plain and under TEST_RLS=on, each call in the
 * business's context as a request is.
 */
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { MakeSiteLink } from "./site-links.service";
import { SiteLinksService } from "./site-links.service";

const tag = `${process.pid}-${Date.now()}`;
// Monday 19 Oct 2026, 09:00 in Mumbai: 4 weeks from 22 Sep.
const NOW = new Date("2026-10-19T03:30:00.000Z");
const service = new SiteLinksService();

let rye = "";
let pulse = "";
let ryeSite = "";
let ryeShop = "";
let pulseSite = "";
let ownerId = "";

function ctx(
    organizationId: string,
    role: OrganizationContext["role"] = "OWNER",
): OrganizationContext {
    return { organizationId, userId: ownerId, role };
}

const inOrg = <T>(c: OrganizationContext, run: () => Promise<T>) =>
    runInOrgContext(c.organizationId, run);
const make = (c: OrganizationContext, input: MakeSiteLink) =>
    inOrg(c, () => service.create(c, input));
const list = (c: OrganizationContext, siteId: string | null = null) =>
    inOrg(c, () => service.list(c, "4w", siteId, NOW));

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `links-${name}-${tag}`.toLowerCase() },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    return org.id;
}

async function site(organizationId: string, name: string) {
    return (
        await prisma.site.create({
            data: {
                organizationId,
                name,
                slug: `links-${name}-${tag}`.toLowerCase(),
            },
        })
    ).id;
}

/** A link's visits and paid by day, as `analytics.aggregate` writes them. */
async function counted(
    organizationId: string,
    siteId: string,
    label: string,
    visits: number,
    paid: number,
    day = "2026-10-12",
    allSites = true,
) {
    await prisma.analyticsDailyAggregate.createMany({
        data: [
            ["site.visit", visits],
            ["site.paid", paid],
        ].flatMap(([type, count]) =>
            // The all-sites row too, which the list never double counts.
            (allSites ? [siteId, ""] : [siteId]).map((s) => ({
                organizationId,
                siteId: s,
                date: new Date(`${day}T00:00:00Z`),
                type: type as string,
                dimension: "ref",
                dimensionValue: label,
                count: count as number,
            })),
        ),
    });
}

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `links-owner-${tag}@example.com` },
        })
    ).id;
    rye = await business("Rye");
    pulse = await business("Pulse");
    ryeSite = await site(rye, "Rye");
    ryeShop = await site(rye, "RyeShop");
    pulseSite = await site(pulse, "Pulse");
});

describe("site links (DEC-181)", () => {
    it("makes a link from a name, with the label made from it, and writes it to Activity", async () => {
        const link = await make(ctx(rye), {
            siteId: ryeSite,
            name: "  Diwali post ",
        });

        expect(link).toMatchObject({
            siteId: ryeSite,
            name: "Diwali post",
            label: "diwali-post",
            visits: null,
            paid: null,
            few: true,
        });
        const row = await prisma.siteLink.findUniqueOrThrow({
            where: { id: link.id },
        });
        expect(row).toMatchObject({
            organizationId: rye,
            createdByUserId: ownerId,
            archivedAt: null,
        });
        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: { organizationId: rye, targetId: link.id },
        });
        expect(audit).toMatchObject({
            action: "site-link.created",
            actorUserId: ownerId,
            targetType: "site-link",
            outcome: "SUCCESS",
            metadata: {
                siteId: ryeSite,
                name: "Diwali post",
                label: "diwali-post",
            },
        });
    });

    it("keeps the label as edited, and refuses one that isn't a label", async () => {
        const link = await make(ctx(rye), {
            siteId: ryeSite,
            name: "Instagram bio",
            label: "Bio",
        });
        expect(link.label).toBe("bio");

        for (const label of [
            "asha-98765-43210",
            "cmh2k9x0a0001qz8l3v5d7f9b",
            "has space",
            "instagram",
        ]) {
            await expect(
                make(ctx(rye), { siteId: ryeSite, name: "Bad", label }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        // A name that makes no label at all.
        await expect(
            make(ctx(rye), { siteId: ryeSite, name: "!!!" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses a label another live link of the site has; one made from the name takes the next free one", async () => {
        await expect(
            make(ctx(rye), {
                siteId: ryeSite,
                name: "Another",
                label: "diwali-post",
            }),
        ).rejects.toBeInstanceOf(ConflictException);

        const again = await make(ctx(rye), {
            siteId: ryeSite,
            name: "Diwali post",
        });
        expect(again.label).toBe("diwali-post-2");

        // Another website of the business may use the same label.
        const shop = await make(ctx(rye), {
            siteId: ryeShop,
            name: "Diwali post",
            label: "diwali-post",
        });
        expect(shop.label).toBe("diwali-post");
    });

    it("lists the live links newest first, with visits and paid in the period, a small count held back", async () => {
        await counted(rye, ryeSite, "diwali-post", 12, 2);
        await counted(rye, ryeSite, "bio", 2, 1);
        // Before the period: not counted.
        await counted(rye, ryeSite, "diwali-post", 500, 50, "2026-08-01");
        // The shop's own diwali-post: never added to the site's.
        await counted(rye, ryeShop, "diwali-post", 4, 0, "2026-10-12", false);

        const onSite = await list(ctx(rye), ryeSite);
        expect(
            onSite.links.map((l) => [l.label, l.visits, l.paid, l.few]),
        ).toEqual([
            ["diwali-post-2", null, null, true],
            ["bio", null, null, true],
            ["diwali-post", 12, 2, false],
        ]);
        expect(onSite.minVisits).toBe(3);

        const all = await list(ctx(rye));
        expect(all.links.map((l) => [l.siteId, l.label, l.visits])).toEqual([
            [ryeShop, "diwali-post", 4],
            [ryeSite, "diwali-post-2", null],
            [ryeSite, "bio", null],
            [ryeSite, "diwali-post", 12],
        ]);
    });

    it("archives a link and brings it back with Undo, each in Activity", async () => {
        const link = await make(ctx(rye), {
            siteId: ryeSite,
            name: "Story",
        });

        const archived = await inOrg(ctx(rye), () =>
            service.archive(ctx(rye), link.id),
        );
        expect(archived.id).toBe(link.id);
        expect(
            (await list(ctx(rye), ryeSite)).links.some((l) => l.id === link.id),
        ).toBe(false);
        // Archiving again changes nothing and writes nothing more.
        await inOrg(ctx(rye), () => service.archive(ctx(rye), link.id));

        await inOrg(ctx(rye), () => service.restore(ctx(rye), link.id));
        expect(
            (await list(ctx(rye), ryeSite)).links.some((l) => l.id === link.id),
        ).toBe(true);

        const actions = await prisma.auditEvent.findMany({
            where: { organizationId: rye, targetId: link.id },
            orderBy: { createdAt: "asc" },
            select: { action: true },
        });
        expect(actions.map((a) => a.action)).toEqual([
            "site-link.created",
            "site-link.archived",
            "site-link.restored",
        ]);
    });

    it("frees an archived link's label, and its Undo is a 409 once another link took it", async () => {
        const first = await make(ctx(rye), { siteId: ryeSite, name: "Reel" });
        await inOrg(ctx(rye), () => service.archive(ctx(rye), first.id));
        const second = await make(ctx(rye), {
            siteId: ryeSite,
            name: "Reel",
            label: "reel",
        });
        expect(second.label).toBe("reel");

        await expect(
            inOrg(ctx(rye), () => service.restore(ctx(rye), first.id)),
        ).rejects.toBeInstanceOf(ConflictException);
        const still = await prisma.siteLink.findUniqueOrThrow({
            where: { id: first.id },
        });
        expect(still.archivedAt).not.toBeNull();
    });

    it("never reaches another business's site or link", async () => {
        await expect(
            make(ctx(rye), { siteId: pulseSite, name: "Theirs" }),
        ).rejects.toBeInstanceOf(NotFoundException);

        const theirs = await make(ctx(pulse), {
            siteId: pulseSite,
            name: "Their post",
        });
        await expect(
            inOrg(ctx(rye), () => service.archive(ctx(rye), theirs.id)),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(
            (await list(ctx(rye))).links.some((l) => l.id === theirs.id),
        ).toBe(false);
        expect((await list(ctx(pulse))).links.map((l) => l.label)).toEqual([
            "their-post",
        ]);
    });

    it("reads with Insights, writes with the website's permission", async () => {
        const member = ctx(rye, "MEMBER");
        await expect(list(member)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            make(member, { siteId: ryeSite, name: "Nope" }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        // Insights without the website: reads, never writes.
        const reader: OrganizationContext = {
            ...ctx(rye, "MEMBER"),
            actions: new Set(["analytics:read"]),
        };
        await expect(list(reader)).resolves.toBeDefined();
        await expect(
            make(reader, { siteId: ryeSite, name: "Nope" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
