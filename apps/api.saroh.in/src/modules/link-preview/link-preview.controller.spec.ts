jest.mock("@saroh/database", () => ({
    prisma: {
        waitlistSignup: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}));
jest.mock("../../common/email", () => ({
    sendLinkReportEmail: jest.fn(),
}));

import type { LookupAddress } from "node:dns";

import { HttpException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import { signSiteRelay } from "../site-accounts/site-relay";
import { checkView, LinkPreviewController } from "./link-preview.controller";
import { LinkPreviewService } from "./link-preview.service";
import {
    EMAILS_PER_DAY,
    LinkReportGateService,
} from "./link-report-gate.service";
import type {
    Transport,
    TransportRequest,
    TransportResponse,
} from "./safe-fetch";
import type { Resolver } from "./ssrf-guard";

/**
 * The link preview routes (resources plan U2): every failure is a typed
 * state and never a 500, a check is cached for a minute per address, the
 * visitor is rate-limited, and unlocking stores the email in the
 * waitlist's store with its source, link and consent and sends one email.
 */

const RELAY_SECRET = "saroh-dev-insecure-site-relay-secret-not-for-production";
const PUBLIC = "93.184.216.34";

const resolver: Resolver = (host) =>
    host.endsWith(".example.com") || host === "example-bakery.in"
        ? Promise.resolve([{ address: PUBLIC, family: 4 } as LookupAddress])
        : Promise.reject(new Error("ENOTFOUND"));

const GOOD_PAGE = `<!doctype html><html><head>
<title>Example Bakery</title>
<meta name="description" content="Sourdough from Hill Road.">
<meta property="og:title" content="Fresh bread every morning">
<meta property="og:description" content="Sourdough from Hill Road.">
<meta property="og:image" content="/cover.png">
<meta property="og:url" content="https://example-bakery.in/">
</head><body>hi</body></html>`;

function png(width: number, height: number): Buffer {
    const b = Buffer.alloc(24);
    b.writeUInt32BE(0x89504e47, 0);
    b.write("IHDR", 12, "ascii");
    b.writeUInt32BE(width, 16);
    b.writeUInt32BE(height, 20);
    return b;
}

type Reply = TransportResponse | Error | "hang";

function transport(replies: Record<string, Reply>) {
    const calls: TransportRequest[] = [];
    const fn: Transport = (request) => {
        calls.push(request);
        const reply = replies[request.url.href];
        if (!reply) return Promise.reject(new Error("ECONNREFUSED"));
        if (reply === "hang") return new Promise(() => undefined);
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve(reply);
    };
    return { fn, calls };
}

const html = (
    body: string,
    extra: Record<string, string> = {},
): TransportResponse => ({
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...extra },
    body: Buffer.from(body),
    truncated: false,
});

const SITE: Record<string, Reply> = {
    "https://example-bakery.in/": html(GOOD_PAGE),
    "https://example-bakery.in/cover.png": {
        status: 206,
        headers: {
            "content-type": "image/png",
            "content-range": "bytes 0-23/700000",
        },
        body: png(600, 315),
        truncated: false,
    },
    "https://plain.example.com/": html(
        "<html><head></head><body>No tags</body></html>",
    ),
    "https://pdf.example.com/": {
        status: 200,
        headers: { "content-type": "application/pdf" },
        body: Buffer.from("%PDF-1.7"),
        truncated: false,
    },
    "https://gone.example.com/": html("Not found", {}),
    "https://huge.example.com/": {
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.from(`<html><head><script>${"x".repeat(1000)}`),
        truncated: true,
    },
    "https://slow.example.com/": "hang",
    "https://broken.example.com/": new Error("socket hang up"),
};
(SITE["https://gone.example.com/"] as TransportResponse).status = 404;

function setup(replies: Record<string, Reply> = SITE) {
    const t = transport(replies);
    const preview = new LinkPreviewService({
        resolve: resolver,
        transport: t.fn,
        testHosts: new Set(),
    });
    const gate = new LinkReportGateService(preview);
    const controller = new LinkPreviewController(preview, gate);
    return { controller, preview, gate, calls: t.calls };
}

/** A different visitor each time, so the limits stay out of the way. */
let visitor = 0;
const ip = () => `203.0.113.${(visitor += 1) % 250}`;
const relayFor = (address: string) =>
    signSiteRelay({ address, host: "www.saroh.in" }, RELAY_SECRET);

beforeEach(() => {
    jest.clearAllMocks();
    (sendLinkReportEmail as jest.Mock).mockResolvedValue("sent");
    (prisma.waitlistSignup.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.waitlistSignup.create as jest.Mock).mockResolvedValue({ id: "w1" });
    (prisma.waitlistSignup.update as jest.Mock).mockResolvedValue({ id: "w1" });
});

describe("GET /public/tools/link-preview", () => {
    it("answers the facts, the verdicts and the score, and keeps the fixes for the unlock", async () => {
        const { controller } = setup();
        const view = await controller.check(
            { url: "example-bakery.in" },
            ip(),
            undefined,
        );
        if (!view.ok) throw new Error(view.failure);
        expect(view.url).toBe("https://example-bakery.in/");
        expect(view.facts).toMatchObject({
            domain: "example-bakery.in",
            title: "Fresh bread every morning",
            image: {
                url: "https://example-bakery.in/cover.png",
                width: 600,
                height: 315,
                bytes: 700000,
                loads: true,
            },
        });
        // Small and heavy picture, no twitter:card.
        expect(view.score).toBe(
            "Looks right on 2 of 6 apps. Fix 3 things to fix all 6.",
        );
        expect(view.fixCount).toBe(3);
        expect(view).not.toHaveProperty("fixes");
        expect(view).not.toHaveProperty("report");
        expect(JSON.stringify(view)).not.toContain("<body>");
    });

    it.each([
        ["plain.example.com", "no-tags"],
        ["pdf.example.com", "not-html"],
        ["gone.example.com", "unreachable"],
        ["huge.example.com", "too-large"],
        ["broken.example.com", "unreachable"],
        ["nowhere.invalid", "unreachable"],
        ["ftp://example-bakery.in/", "invalid"],
        ["http://169.254.169.254/latest/meta-data/", "blocked"],
        ["localhost", "blocked"],
    ])(
        "answers %s as the typed state %s, never a 500",
        async (url, failure) => {
            const { controller } = setup();
            const view = await controller.check({ url }, ip(), undefined);
            expect(view).toMatchObject({ ok: false, failure });
        },
    );

    it("answers a site that never replies as timeout", async () => {
        jest.useFakeTimers();
        try {
            const { controller } = setup();
            const pending = controller.check(
                { url: "slow.example.com" },
                ip(),
                undefined,
            );
            await jest.advanceTimersByTimeAsync(5_001);
            await expect(pending).resolves.toMatchObject({
                ok: false,
                failure: "timeout",
            });
        } finally {
            jest.useRealTimers();
        }
    });

    it("says the status when the site answered with an error", async () => {
        const { controller } = setup();
        const view = await controller.check(
            { url: "gone.example.com" },
            ip(),
            undefined,
        );
        expect(view).toMatchObject({ failure: "unreachable", status: 404 });
    });

    it("answers the same address from the cache within a minute, and fetches again after", async () => {
        const { preview, calls } = setup();
        const t0 = Date.now();
        await preview.check("https://example-bakery.in/", t0);
        const fetched = calls.length;
        await preview.check("EXAMPLE-BAKERY.IN/#top", t0 + 30_000);
        expect(calls.length).toBe(fetched);
        await preview.check("example-bakery.in", t0 + 61_000);
        expect(calls.length).toBe(fetched * 2);
    });

    it("shares one fetch between two checks of the same address at once", async () => {
        const { preview, calls } = setup();
        const [a, b] = await Promise.all([
            preview.check("plain.example.com"),
            preview.check("https://plain.example.com/"),
        ]);
        expect(a).toEqual(b);
        expect(calls).toHaveLength(1);
    });

    it("limits a visitor to 10 checks a minute, counted by the signed relay", async () => {
        const { controller } = setup();
        const visitorIp = "198.51.100.77";
        // Through saroh.in's server: the API sees the server, the relay names the visitor.
        for (let i = 0; i < 10; i += 1) {
            await controller.check(
                { url: "plain.example.com" },
                "10.0.0.1",
                relayFor(visitorIp),
            );
        }
        await expect(
            controller.check(
                { url: "plain.example.com" },
                "10.0.0.1",
                relayFor(visitorIp),
            ),
        ).rejects.toMatchObject({ status: 429 });
        // Another visitor through the same server is not counted with them.
        await expect(
            controller.check(
                { url: "plain.example.com" },
                "10.0.0.1",
                relayFor("198.51.100.78"),
            ),
        ).resolves.toMatchObject({ ok: false });
    });

    it("counts a forged relay as the caller", async () => {
        const { controller } = setup();
        const caller = "198.51.100.99";
        for (let i = 0; i < 10; i += 1) {
            await controller.check(
                { url: "plain.example.com" },
                caller,
                `v1.forged.${i}`,
            );
        }
        await expect(
            controller.check({ url: "plain.example.com" }, caller, "v1.other"),
        ).rejects.toBeInstanceOf(HttpException);
    });

    it("passes a failure through the view unchanged", () => {
        const failure = {
            ok: false as const,
            url: "x",
            checkedAt: "2026-10-05T00:00:00.000Z",
            failure: "no-tags" as const,
        };
        expect(checkView(failure)).toBe(failure);
    });
});

describe("POST /public/tools/link-preview/report", () => {
    it("stores the email with source link-preview, the link and the consent, and sends one email", async () => {
        const { controller } = setup();
        const result = await controller.unlock(
            {
                email: "Owner@Example-Bakery.in",
                url: "example-bakery.in",
                consent: true,
            },
            ip(),
            undefined,
        );
        expect(result).toMatchObject({ unlocked: true, emailed: "sent" });
        if (!result.unlocked) throw new Error("expected an unlock");
        expect(result.fixes.map((f) => f.key)).toEqual([
            "image-small",
            "image-heavy",
            "x-card",
        ]);
        expect(result.suggestedTags).toContain("twitter:card");

        expect(prisma.waitlistSignup.create).toHaveBeenCalledTimes(1);
        expect(
            (prisma.waitlistSignup.create as jest.Mock).mock.calls[0][0].data,
        ).toMatchObject({
            email: "owner@example-bakery.in",
            emailKey: "owner@example-bakery.in",
            businessKey: "",
            source: "link-preview",
            checkedUrl: "https://example-bakery.in/",
            newsConsent: true,
        });
        expect(sendLinkReportEmail).toHaveBeenCalledTimes(1);
        const [to, subject, text] = (sendLinkReportEmail as jest.Mock).mock
            .calls[0] as [string, string, string];
        expect(to).toBe("owner@example-bakery.in");
        expect(subject).toBe("Your link preview report for example-bakery.in");
        expect(text).toContain("1. Use a bigger picture.");
    });

    it("stores no consent when the box wasn't ticked", async () => {
        const { gate } = setup();
        await gate.unlock({
            email: "quiet@example.com",
            url: "example-bakery.in",
            consent: false,
        });
        expect(
            (prisma.waitlistSignup.create as jest.Mock).mock.calls[0][0].data
                .newsConsent,
        ).toBe(false);
    });

    it("updates an existing entry's link without clearing an earlier yes", async () => {
        (prisma.waitlistSignup.findUnique as jest.Mock).mockResolvedValue({
            id: "w1",
        });
        const { gate } = setup();
        await gate.unlock({
            email: "back@example.com",
            url: "plain.example.com",
            consent: false,
        });
        // plain.example.com has no tags: nothing to unlock, nothing stored.
        expect(prisma.waitlistSignup.update).not.toHaveBeenCalled();

        await gate.unlock({
            email: "back@example.com",
            url: "example-bakery.in",
            consent: false,
        });
        const data = (prisma.waitlistSignup.update as jest.Mock).mock
            .calls[0][0].data;
        expect(data.checkedUrl).toBe("https://example-bakery.in/");
        expect(data).not.toHaveProperty("newsConsent");
        expect(prisma.waitlistSignup.create).not.toHaveBeenCalled();
    });

    it("answers a page that can't be checked as a typed state, storing and sending nothing", async () => {
        const { gate } = setup();
        const result = await gate.unlock({
            email: "a@example.com",
            url: "pdf.example.com",
            consent: true,
        });
        expect(result).toEqual({ unlocked: false, failure: "not-html" });
        expect(prisma.waitlistSignup.create).not.toHaveBeenCalled();
        expect(sendLinkReportEmail).not.toHaveBeenCalled();
    });

    it(`emails one address at most ${EMAILS_PER_DAY} times a day, and still unlocks`, async () => {
        const { gate } = setup();
        for (let i = 0; i < EMAILS_PER_DAY; i += 1) {
            await gate.unlock({
                email: "target@example.com",
                url: "example-bakery.in",
                consent: false,
            });
        }
        const fourth = await gate.unlock({
            email: "Target+x@example.com",
            url: "example-bakery.in",
            consent: false,
        });
        expect(fourth).toMatchObject({ unlocked: true, emailed: "limited" });
        expect(sendLinkReportEmail).toHaveBeenCalledTimes(EMAILS_PER_DAY);
    });

    it("says when mail is down, and still unlocks", async () => {
        (sendLinkReportEmail as jest.Mock).mockResolvedValue("not-configured");
        const { gate } = setup();
        await expect(
            gate.unlock({
                email: "down@example.com",
                url: "example-bakery.in",
                consent: false,
            }),
        ).resolves.toMatchObject({ unlocked: true, emailed: "not-sent" });
    });

    it("limits a visitor to 5 unlocks a minute", async () => {
        const { controller } = setup();
        const caller = "198.51.100.150";
        for (let i = 0; i < 5; i += 1) {
            await controller.unlock(
                {
                    email: `v${i}@example.com`,
                    url: "example-bakery.in",
                    consent: false,
                },
                caller,
                undefined,
            );
        }
        await expect(
            controller.unlock(
                {
                    email: "v9@example.com",
                    url: "example-bakery.in",
                    consent: false,
                },
                caller,
                undefined,
            ),
        ).rejects.toMatchObject({ status: 429 });
    });
});
