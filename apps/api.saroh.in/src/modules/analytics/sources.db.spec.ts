/**
 * Insights' sources and the path from visit to paid (DEC-171, plan U16,
 * #1101) against a real Postgres: the 4 weeks to Monday 19 Oct in Mumbai,
 * read from the daily rollups U15 writes. The path never goes up; a
 * source with too few visits is folded into Other sites and one nobody
 * came from is left out; the merchant's own links are listed; counting
 * that began inside the period says from when, and a business with
 * nothing counted says so; a website chosen narrows the visits and never
 * the paid; another business's rows never count; and a role without
 * Insights is refused. Runs in the integration project, plain and under
 * TEST_RLS=on, each read in the business's context as a request is.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { SourcesService } from "./sources.service";

const tag = `${process.pid}-${Date.now()}`;
const ZONE = "Asia/Kolkata";
// Monday 19 Oct 2026, 09:00 in Mumbai: 22 Sep to 19 Oct.
const NOW = new Date("2026-10-19T03:30:00.000Z");

const service = new SourcesService();

function ctx(organizationId: string): OrganizationContext {
    return { organizationId, userId: `user-${tag}`, role: "OWNER" };
}

/** The read as a request makes it: in the business's own context. */
function read(
    c: OrganizationContext,
    period: "7d" | "4w" | "3m" = "4w",
    siteId: string | null = null,
) {
    return runInOrgContext(c.organizationId, () =>
        service.read(c, period, siteId, NOW),
    );
}

async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `u16-${name}-${tag}`.toLowerCase() },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: ZONE },
    });
    return org.id;
}

type Row = {
    day: string;
    type: string;
    siteId?: string;
    dimension?: string;
    value?: string;
    count: number;
};

/** Rollup rows, as `analytics.aggregate` writes them. */
async function rollups(organizationId: string, rows: Row[]) {
    await prisma.analyticsDailyAggregate.createMany({
        data: rows.map((r) => ({
            organizationId,
            siteId: r.siteId ?? "",
            date: new Date(`${r.day}T00:00:00Z`),
            type: r.type,
            dimension: r.dimension ?? "",
            dimensionValue: r.value ?? "",
            count: r.count,
        })),
    });
}

/** One source's step on a day, for every site and for `site`. */
function step(
    day: string,
    type: string,
    source: string,
    count: number,
    site?: string,
): Row[] {
    const rows: Row[] = [
        { day, type, dimension: "source", value: source, count },
    ];
    if (site) {
        rows.push({
            day,
            type,
            siteId: site,
            dimension: "source",
            value: source,
            count,
        });
    }
    return rows;
}

let bakery = "";
let other = "";
let quiet = "";
const SITE = `site-${tag}`;

beforeAll(async () => {
    bakery = await business("Rye");
    other = await business("Pulse");
    quiet = await business("Quiet");

    await rollups(bakery, [
        // Counting began on 10 Oct, inside the 4 weeks.
        { day: "2026-10-10", type: "site.visit", count: 30 },
        { day: "2026-10-12", type: "site.visit", count: 70 },
        // Instagram: 50 visits, 20 looked, 6 started, 9 paid (a paid
        // order whose visit was before the period): the path holds paid
        // to what started.
        ...step("2026-10-10", "site.visit", "instagram", 20, SITE),
        ...step("2026-10-12", "site.visit", "instagram", 30, SITE),
        ...step("2026-10-12", "site.looked", "instagram", 20, SITE),
        ...step("2026-10-12", "site.started", "instagram", 6, SITE),
        ...step("2026-10-12", "order.paid", "instagram", 10),
        ...step("2026-10-13", "order.refunded", "instagram", 1),
        // Google: 30 visits on another website, 4 paid.
        ...step("2026-10-12", "site.visit", "google", 30, `${SITE}-b`),
        ...step("2026-10-12", "site.looked", "google", 10, `${SITE}-b`),
        ...step("2026-10-12", "site.started", "google", 5, `${SITE}-b`),
        ...step("2026-10-13", "order.paid", "google", 4),
        // WhatsApp: 3 visits, too few, folded into Other sites with its
        // paid order.
        ...step("2026-10-12", "site.visit", "whatsapp", 3, SITE),
        ...step("2026-10-12", "order.paid", "whatsapp", 1),
        // Other sites: 17 visits.
        ...step("2026-10-12", "site.visit", "other", 17, SITE),
        // Nobody typed the address: left out.
        // Before the period: never counted.
        ...step("2026-08-01", "site.visit", "instagram", 500, SITE),
        // The merchant's own links.
        {
            day: "2026-10-12",
            type: "site.visit",
            dimension: "ref",
            value: "diwali-post",
            count: 12,
        },
        {
            day: "2026-10-12",
            type: "order.paid",
            dimension: "ref",
            value: "diwali-post",
            count: 2,
        },
        {
            day: "2026-10-12",
            type: "site.visit",
            dimension: "ref",
            value: "bio",
            count: 30,
        },
    ]);
    // Another business's visits, on the same days.
    await rollups(other, [
        { day: "2026-09-01", type: "site.visit", count: 9 },
        ...step("2026-10-12", "site.visit", "instagram", 900),
        ...step("2026-10-12", "order.paid", "instagram", 90),
    ]);
});

describe("Insights: sources and the path from visit to paid (U16)", () => {
    it("draws the path from visit to paid, never going up", async () => {
        const r = await read(ctx(bakery));

        expect(r.period).toBe("4w");
        expect(r.window).toEqual({
            days: 28,
            from: "2026-09-22",
            to: "2026-10-19",
        });
        // 50 + 30 + 3 + 17 visits; 30 looked; 11 started; paid 9 + 4 + 1
        // = 14 is more than started, so held to 11.
        expect(r.path).toEqual({
            visits: 100,
            looked: 30,
            started: 11,
            paid: 11,
        });
    });

    it("lists sources by visits, folds a small one into Other sites, leaves out one nobody came from", async () => {
        const r = await read(ctx(bakery));

        expect(r.sources).toEqual([
            { source: "instagram", visits: 50, paid: 9 },
            { source: "google", visits: 30, paid: 4 },
            { source: "other", visits: 20, paid: 1 },
        ]);
        expect(r.folded).toEqual(["whatsapp"]);
        expect(r.sources.some((s) => s.source === "direct")).toBe(false);
        expect(r.refs).toEqual([
            { ref: "bio", visits: 30, paid: 0 },
            { ref: "diwali-post", visits: 12, paid: 2 },
        ]);
        expect(r.moreRefs).toBe(0);
    });

    it("says from when it counted when that is inside the period", async () => {
        // Counting began on 10 Oct, inside 22 Sep to 19 Oct.
        const fourWeeks = await read(ctx(bakery));
        expect(fourWeeks.countedFrom).toBe("2026-10-10");
        expect(fourWeeks.countedPart).toBe(true);

        // 13 to 19 Oct: it began before, so the whole week is counted. No
        // visit in it, so nothing paid on the path either.
        const week = await read(ctx(bakery), "7d");
        expect(week.countedFrom).toBe("2026-10-10");
        expect(week.countedPart).toBe(false);
        expect(week.path).toEqual({
            visits: 0,
            looked: 0,
            started: 0,
            paid: 0,
        });
        // Paid is still said by source: Google's order was paid on 13 Oct.
        expect(week.sources).toEqual([{ source: "other", visits: 0, paid: 4 }]);
        expect(week.folded).toEqual(["google"]);
    });

    it("says nothing has been counted for a business with no visit yet", async () => {
        const r = await read(ctx(quiet));

        expect(r.countedFrom).toBeNull();
        expect(r.countedPart).toBe(false);
        expect(r.path).toEqual({ visits: 0, looked: 0, started: 0, paid: 0 });
        expect(r.sources).toEqual([]);
        expect(r.refs).toEqual([]);
    });

    it("narrows the visits to the website chosen; paid stays the business's", async () => {
        const r = await read(ctx(bakery), "4w", SITE);

        expect(r.siteId).toBe(SITE);
        expect(r.sources.find((s) => s.source === "instagram")).toEqual({
            source: "instagram",
            visits: 50,
            paid: 9,
        });
        // Google's visits were on the other website; its paid is the
        // business's, so it is still said, folded with Other sites.
        expect(r.sources.find((s) => s.source === "google")).toBeUndefined();
        expect(r.folded).toEqual(["google", "whatsapp"]);
        expect(r.path.visits).toBe(70);
    });

    it("never counts another business's visits, even given its website", async () => {
        const r = await read(ctx(bakery));
        expect(r.path.visits).toBe(100);

        const theirs = await read(ctx(other));
        expect(theirs.path.visits).toBe(900);
        expect(theirs.countedFrom).toBe("2026-09-01");
    });

    it("refuses a role without Insights", async () => {
        await expect(
            read({ ...ctx(bakery), role: "MEMBER" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
