/**
 * The link preview tool's email gate against a real Postgres (resources
 * plan U2, KTD-5): the email lands in the waitlist's store as one entry
 * with source link-preview, the link and the consent; a second unlock
 * updates it; and an entry from the waitlist form is left as it was.
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
import { LinkReportGateService } from "./link-report-gate.service";

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
    it("stores one entry, then updates it, never clearing a yes", async () => {
        await gate.unlock({
            email: mail("Owner"),
            url: "example-bakery.in",
            consent: true,
            ipHash: "h1",
        });
        await gate.unlock({
            email: mail("owner"),
            url: "example-bakery.in/menu",
            consent: false,
        });

        const rows = await prisma.waitlistSignup.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            email: mail("owner"),
            businessKey: "",
            source: "link-preview",
            checkedUrl: "https://example-bakery.in/menu",
            newsConsent: true,
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
        await gate.unlock({
            email: mail("both"),
            url: "example-bakery.in",
            consent: false,
        });
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
});
