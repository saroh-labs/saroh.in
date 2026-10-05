/**
 * The link preview tool's email gate against a real Postgres (resources
 * plan U2, KTD-5): the email lands in the waitlist's store as one entry
 * with source link-preview and the link (origin and path), never a news
 * consent; a second unlock updates only the link; an entry from the
 * waitlist form is left as it was; and the email caps are counted in the
 * database, per address and per day.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/email", () => ({
    sendLinkReportEmail: jest.fn().mockResolvedValue("sent"),
}));

import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import { WaitlistService } from "../waitlist/waitlist.service";
import { LinkPreviewService } from "./link-preview.service";
import {
    EMAILS_PER_DAY,
    LinkReportGateService,
    REPORT_EMAILS_PER_DAY,
} from "./link-report-gate.service";

const tag = `${process.pid}-${Date.now()}`;
const mail = (who: string) => `${who}-${tag}@example.test`;

const PAGE = `<html><head><title>Bakery</title>
<meta property="og:title" content="Fresh bread">
<meta property="og:description" content="Out by ten.">
<meta name="twitter:card" content="summary_large_image">
</head><body></body></html>`;

const preview = new LinkPreviewService({
    resolve: () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]),
    transport: () =>
        Promise.resolve({
            status: 200,
            headers: { "content-type": "text/html" },
            body: Buffer.from(PAGE),
            truncated: false,
        }),
    testHosts: new Set(),
});
const gate = new LinkReportGateService(preview);

beforeEach(async () => {
    await prisma.waitlistSignup.deleteMany({});
    jest.clearAllMocks();
});

describe("unlocking the report", () => {
    it("stores one entry, then updates only its link, never a consent", async () => {
        await gate.unlock({
            email: mail("Owner"),
            url: "example-bakery.in",
            ipHash: "h1",
        });
        await gate.unlock({
            email: mail("owner"),
            url: "example-bakery.in/menu?utm_source=secret",
        });

        const rows = await prisma.waitlistSignup.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            email: mail("owner"),
            businessKey: "",
            source: "link-preview",
            checkedUrl: "https://example-bakery.in/menu",
            newsConsent: false,
            reportEmailCount: 2,
            ipHash: "h1",
            refCode: null,
        });
        expect(rows[0]?.checkedAt).toBeInstanceOf(Date);
        expect(sendLinkReportEmail).toHaveBeenCalledTimes(2);
    });

    it("leaves a waitlist entry for a business alone and keeps its own row", async () => {
        await new WaitlistService().join({
            email: mail("both"),
            business: "Glow Studio",
            kind: "salon",
            source: "direct",
        });
        await gate.unlock({ email: mail("both"), url: "example-bakery.in" });
        const rows = await prisma.waitlistSignup.findMany({
            orderBy: { position: "asc" },
            select: {
                businessName: true,
                source: true,
                checkedUrl: true,
                newsConsent: true,
            },
        });
        expect(rows).toEqual([
            {
                businessName: "Glow Studio",
                source: "direct",
                checkedUrl: null,
                newsConsent: null,
            },
            {
                businessName: null,
                source: "link-preview",
                checkedUrl: "https://example-bakery.in/",
                newsConsent: false,
            },
        ]);
    });

    it(`emails one address at most ${EMAILS_PER_DAY} times a UTC day`, async () => {
        const now = new Date("2026-10-05T23:00:00Z");
        const results = [];
        for (let i = 0; i <= EMAILS_PER_DAY; i += 1) {
            results.push(
                await gate.unlock({
                    email: mail("cap"),
                    url: "example-bakery.in",
                    now,
                }),
            );
        }
        expect(results.map((r) => r.unlocked && r.emailed)).toEqual([
            ...Array<string>(EMAILS_PER_DAY).fill("sent"),
            "limited",
        ]);
        // A new gate (a restart, another process) still knows.
        const fresh = new LinkReportGateService(preview);
        await expect(
            fresh.unlock({ email: mail("cap"), url: "example-bakery.in", now }),
        ).resolves.toMatchObject({ emailed: "limited" });
        // The next UTC day starts again.
        await expect(
            fresh.unlock({
                email: mail("cap"),
                url: "example-bakery.in",
                now: new Date("2026-10-06T00:30:00Z"),
            }),
        ).resolves.toMatchObject({ emailed: "sent" });
    });

    it(`sends no copy once ${REPORT_EMAILS_PER_DAY} went today, and still unlocks`, async () => {
        const now = new Date("2026-10-05T12:00:00Z");
        await prisma.waitlistSignup.create({
            data: {
                email: mail("busy"),
                emailKey: mail("busy"),
                source: "link-preview",
                reportEmailDay: new Date("2026-10-05T00:00:00Z"),
                reportEmailCount: REPORT_EMAILS_PER_DAY,
            },
        });
        await expect(
            gate.unlock({ email: mail("late"), url: "example-bakery.in", now }),
        ).resolves.toMatchObject({ unlocked: true, emailed: "not-sent" });
        expect(sendLinkReportEmail).not.toHaveBeenCalled();
        // Yesterday's count doesn't hold today back.
        await expect(
            gate.unlock({
                email: mail("late"),
                url: "example-bakery.in",
                now: new Date("2026-10-06T08:00:00Z"),
            }),
        ).resolves.toMatchObject({ emailed: "sent" });
    });
});
