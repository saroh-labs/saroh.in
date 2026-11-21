/**
 * A page's results counted by page against a real Postgres (DEC-235): an
 * enquiry and a started booking that carry the site page they came from
 * are rolled up by that page's path and read back by `PageResultsService`;
 * an older one with no path counts in the site's totals only, and a
 * private page is never kept. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AnalyticsAggregateHandler } from "../analytics/analytics-aggregate.handler";
import { enquirySubmittedEvent } from "../analytics/enquiry-event";
import { validateEventProperties } from "../analytics/event-contract";
import { PageResultsService } from "./page-results";

const tag = `${process.pid}-${Date.now()}`;

describe("a page's results, counted by page (DEC-235, DB)", () => {
    const now = new Date();
    const at = new Date(now.getTime() - 10 * 60 * 1000);
    let organizationId = "";
    let siteId = "";

    async function started(path?: string) {
        await prisma.analyticsEvent.create({
            data: {
                organizationId,
                siteId,
                type: "site.started",
                properties: validateEventProperties("site.started", 1, {
                    source: "direct",
                    ...(path === undefined ? {} : { path }),
                }) as object,
                occurredAt: at,
                receivedAt: at,
            },
        });
    }

    beforeAll(async () => {
        organizationId = (
            await prisma.organization.create({
                data: { name: "Rye", slug: `page-results-${tag}` },
            })
        ).id;
        siteId = (
            await prisma.site.create({
                data: { organizationId, name: "Rye", slug: `pr-${tag}` },
            })
        ).id;
        const enquiry = (n: number, pagePath?: string) =>
            prisma.analyticsEvent.create({
                data: enquirySubmittedEvent({
                    organizationId,
                    siteId,
                    formId: "form_1",
                    leadId: `lead_${n}`,
                    submissionId: `sub_${tag}_${n}`,
                    pagePath,
                    now: at,
                }),
            });
        await enquiry(1, "/bridal?name=Asha#form");
        await enquiry(2, "/bridal/");
        await enquiry(3); // from before paths: totals only
        await enquiry(4, "/account/messages"); // private: never kept
        await started("/bridal");
        await started(); // landed on the booking page: totals only
        await new AnalyticsAggregateHandler().handle({
            payload: { organizationId, date: at.toISOString().slice(0, 10) },
        } as unknown as Job);
    });

    it("keeps the path alone, and none for a private page", async () => {
        const events = await prisma.analyticsEvent.findMany({
            where: { organizationId, type: "enquiry.submitted" },
            select: { properties: true },
        });
        const paths = events.map(
            (e) => (e.properties as { path?: string }).path ?? null,
        );
        expect(paths.sort()).toEqual(["/bridal", "/bridal", null, null]);
    });

    it("counts the page's questions and starts; older events stay in the totals", async () => {
        const rows = await prisma.analyticsDailyAggregate.findMany({
            where: { organizationId, siteId },
            select: {
                type: true,
                dimension: true,
                dimensionValue: true,
                count: true,
            },
        });
        const row = (type: string, dimension: string, value: string) =>
            rows.find(
                (r) =>
                    r.type === type &&
                    r.dimension === dimension &&
                    r.dimensionValue === value,
            )?.count;
        expect(row("enquiry.submitted", "", "")).toBe(4);
        expect(row("enquiry.submitted", "path", "/bridal")).toBe(2);
        expect(row("site.started", "", "")).toBe(2);
        expect(row("site.started", "path", "/bridal")).toBe(1);
        expect(
            rows.filter(
                (r) => r.dimension === "path" && r.dimensionValue !== "/bridal",
            ),
        ).toEqual([]);

        const ctx: OrganizationContext = {
            organizationId,
            userId: "user_1",
            role: "OWNER",
        };
        const { results } = await new PageResultsService().read(
            ctx,
            siteId,
            "/bridal",
            now,
        );
        expect(results?.questions?.count).toBe(2);
    });
});
