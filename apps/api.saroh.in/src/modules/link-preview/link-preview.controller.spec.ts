jest.mock("@saroh/database", () => ({
    prisma: {
        waitlistSignup: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            aggregate: jest.fn(),
            updateMany: jest.fn(),
        },
    },
}));
jest.mock("../../common/email", () => ({
    sendLinkReportEmail: jest.fn(),
}));

import type { LookupAddress } from "node:dns";

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { prisma } from "@saroh/database";

import { sendLinkReportEmail } from "../../common/email";
import type { SiteRelay } from "../site-accounts/site-relay";
import { SiteRelayGuard } from "../site-accounts/site-relay";
import { checkView, LinkPreviewController } from "./link-preview.controller";
import { LinkPreviewService } from "./link-preview.service";
import {
    EMAILS_PER_DAY,
    LinkReportGateService,
    REPORT_EMAILS_PER_DAY,
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
 * visitor is rate-limited, both routes need the signed relay, and
 * unlocking stores the email in the waitlist's store with its source and
 * link — never a consent — and sends one email in our own words.
 */

const PUBLIC = "93.184.216.34";

const resolver: Resolver = (host) =>
    host.endsWith(".example.com")
        ? Promise.resolve([{ address: PUBLIC, family: 4 } as LookupAddress])
        : Promise.reject(new Error("ENOTFOUND"));

const GOOD_PAGE = `<!doctype html><html><head>
<title>Example Bakery</title>
<meta name="description" content="Sourdough from Hill Road.">
<meta property="og:title" content="Fresh bread every morning">
<meta property="og:description" content="Sourdough from Hill Road.">
<meta property="og:image" content="/cover.png">
<meta property="og:url" content="https://shop.example.com/">
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
    "https://shop.example.com/": html(GOOD_PAGE),
    "https://shop.example.com/cover.png": {
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

/** The relay the guard checked, as the handler receives it. */
const relayFor = (address: string): SiteRelay => ({
    host: "www.saroh.in",
    address,
    clientHash: `hash-${address}`,
});
/** A different visitor each time, so the limits stay out of the way. */
let visitor = 0;
const anyone = () => relayFor(`203.0.113.${(visitor += 1) % 250}`);

/**
 * The entry's two email counters, as the database would keep them: the
 * gate's conditional `updateMany` calls run against this one row.
 */
let row: { reportEmailDay: Date | null; reportEmailCount: number };
let dayTotal = 0;

beforeEach(() => {
    jest.clearAllMocks();
    row = { reportEmailDay: null, reportEmailCount: 0 };
    dayTotal = 0;
    (sendLinkReportEmail as jest.Mock).mockResolvedValue("sent");
    (prisma.waitlistSignup.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.waitlistSignup.create as jest.Mock).mockResolvedValue({ id: "w1" });
    (prisma.waitlistSignup.update as jest.Mock).mockResolvedValue({ id: "w1" });
    (prisma.waitlistSignup.aggregate as jest.Mock).mockImplementation(() =>
        Promise.resolve({ _sum: { reportEmailCount: dayTotal } }),
    );
    (prisma.waitlistSignup.updateMany as jest.Mock).mockImplementation(
        ({
            where,
            data,
        }: {
            where: { reportEmailDay?: Date };
            data: { reportEmailDay?: Date };
        }) => {
            const held = row.reportEmailDay?.getTime();
            if (where.reportEmailDay) {
                // Same day, under the cap: one more.
                if (
                    held !== where.reportEmailDay.getTime() ||
                    row.reportEmailCount >= EMAILS_PER_DAY
                ) {
                    return Promise.resolve({ count: 0 });
                }
                row.reportEmailCount += 1;
            } else {
                // No day yet, or another day: start today's count.
                const day = data.reportEmailDay as Date;
                if (held === day.getTime())
                    return Promise.resolve({ count: 0 });
                row = { reportEmailDay: day, reportEmailCount: 1 };
            }
            dayTotal += 1;
            return Promise.resolve({ count: 1 });
        },
    );
});

describe("the relay", () => {
    it("guards both routes: only saroh.in's server may call them", () => {
        const guards = Reflect.getMetadata(
            GUARDS_METADATA,
            LinkPreviewController,
        ) as unknown[];
        expect(guards).toContain(SiteRelayGuard);
    });
});

describe("POST /public/tools/link-preview (check)", () => {
    it("answers the facts, the verdicts and the score, and keeps the fixes for the unlock", async () => {
        const { controller } = setup();
        const view = await controller.check(
            { url: "shop.example.com" },
            anyone(),
        );
        if (!view.ok) throw new Error(view.failure);
        expect(view.url).toBe("https://shop.example.com/");
        expect(view.facts).toMatchObject({
            domain: "shop.example.com",
            title: "Fresh bread every morning",
            image: {
                url: "https://shop.example.com/cover.png",
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
        ["ftp://shop.example.com/", "invalid"],
        ["http://169.254.169.254/latest/meta-data/", "blocked"],
        ["localhost", "blocked"],
    ])(
        "answers %s as the typed state %s, never a 500",
        async (url, failure) => {
            const { controller } = setup();
            const view = await controller.check({ url }, anyone());
            expect(view).toMatchObject({ ok: false, failure });
        },
    );

    it("answers a site that never replies as timeout", async () => {
        jest.useFakeTimers();
        try {
            const { controller } = setup();
            const pending = controller.check(
                { url: "slow.example.com" },
                anyone(),
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

    it("answers the sample chip from fixed tags, fetching nothing, through the same report", async () => {
        const { controller, calls } = setup();
        const view = await controller.check(
            { url: "example-bakery.in" },
            anyone(),
        );
        // Nothing is fetched: the sample isn't a real site.
        expect(calls).toHaveLength(0);
        expect(view).toMatchObject({
            ok: true,
            sample: true,
            score: "Looks right on 0 of 6 apps. Fix 3 things to fix all 6.",
        });
    });

    it("says the status when the site answered with an error", async () => {
        const { controller } = setup();
        const view = await controller.check(
            { url: "gone.example.com" },
            anyone(),
        );
        expect(view).toMatchObject({ failure: "unreachable", status: 404 });
    });

    it("answers the same address from the cache within a minute, and fetches again after", async () => {
        const { preview, calls } = setup();
        const t0 = Date.now();
        await preview.check("https://shop.example.com/", { now: t0 });
        const fetched = calls.length;
        await preview.check("EXAMPLE-BAKERY.IN/#top", { now: t0 + 30_000 });
        expect(calls.length).toBe(fetched);
        await preview.check("shop.example.com", { now: t0 + 61_000 });
        expect(calls.length).toBe(fetched * 2);
        // "Check again" goes past the cache.
        await preview.check("shop.example.com", {
            now: t0 + 62_000,
            fresh: true,
        });
        expect(calls.length).toBe(fetched * 3);
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
        const visitorRelay = relayFor("198.51.100.77");
        for (let i = 0; i < 10; i += 1) {
            await controller.check({ url: "plain.example.com" }, visitorRelay);
        }
        await expect(
            controller.check({ url: "plain.example.com" }, visitorRelay),
        ).rejects.toMatchObject({ status: 429 });
        // Another visitor through the same server is not counted with them.
        await expect(
            controller.check(
                { url: "plain.example.com" },
                relayFor("198.51.100.78"),
            ),
        ).resolves.toMatchObject({ ok: false });
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
    it("stores the email with source link-preview and the link, no consent, and sends one email", async () => {
        const { controller } = setup();
        const result = await controller.unlock(
            { email: "Owner@Shop.Example.com", url: "shop.example.com" },
            anyone(),
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
            email: "owner@shop.example.com",
            emailKey: "owner@shop.example.com",
            businessKey: "",
            source: "link-preview",
            checkedUrl: "https://shop.example.com/",
            newsConsent: false,
        });
        expect(sendLinkReportEmail).toHaveBeenCalledTimes(1);
        const [to, subject, text] = (sendLinkReportEmail as jest.Mock).mock
            .calls[0] as [string, string, string];
        expect(to).toBe("owner@shop.example.com");
        expect(subject).toBe("Your link preview report");
        expect(text).toContain("1. Use a bigger picture.");
        // Nothing the page wrote, not even its domain outside our own link.
        expect(text).not.toContain("Fresh bread");
        expect(text).not.toContain("Sourdough");
        expect(text).not.toContain("cover.png");
    });

    it("stores the link without its query string", async () => {
        const { gate } = setup({
            ...SITE,
            "https://shop.example.com/?ref=secret-token": html(GOOD_PAGE),
        });
        await gate.unlock({
            email: "q@example.com",
            url: "https://shop.example.com/?ref=secret-token",
        });
        expect(
            (prisma.waitlistSignup.create as jest.Mock).mock.calls[0][0].data
                .checkedUrl,
        ).toBe("https://shop.example.com/");
        const text = (sendLinkReportEmail as jest.Mock).mock
            .calls[0][2] as string;
        expect(text).not.toContain("secret-token");
    });

    it("updates only an existing entry's link and when, nothing else", async () => {
        (prisma.waitlistSignup.findUnique as jest.Mock).mockResolvedValue({
            id: "w1",
        });
        const { gate } = setup();
        await gate.unlock({
            email: "back@example.com",
            url: "plain.example.com",
        });
        // plain.example.com has no tags: nothing to unlock, nothing stored.
        expect(prisma.waitlistSignup.update).not.toHaveBeenCalled();

        await gate.unlock({
            email: "back@example.com",
            url: "shop.example.com",
        });
        const data = (prisma.waitlistSignup.update as jest.Mock).mock
            .calls[0][0].data as Record<string, unknown>;
        expect(Object.keys(data).sort()).toEqual(["checkedAt", "checkedUrl"]);
        expect(data.checkedUrl).toBe("https://shop.example.com/");
        expect(prisma.waitlistSignup.create).not.toHaveBeenCalled();
    });

    it("answers a page that can't be checked as a typed state, storing and sending nothing", async () => {
        const { gate } = setup();
        const result = await gate.unlock({
            email: "a@example.com",
            url: "pdf.example.com",
        });
        expect(result).toEqual({ unlocked: false, failure: "not-html" });
        expect(prisma.waitlistSignup.create).not.toHaveBeenCalled();
        expect(sendLinkReportEmail).not.toHaveBeenCalled();
    });

    it(`emails one address at most ${EMAILS_PER_DAY} times a UTC day, counted in the database, and still unlocks`, async () => {
        const { gate } = setup();
        const now = new Date("2026-10-05T10:00:00Z");
        for (let i = 0; i < EMAILS_PER_DAY; i += 1) {
            await gate.unlock({
                email: "target@example.com",
                url: "shop.example.com",
                now,
            });
        }
        const fourth = await gate.unlock({
            email: "Target+x@example.com",
            url: "shop.example.com",
            now,
        });
        expect(fourth).toMatchObject({ unlocked: true, emailed: "limited" });
        expect(sendLinkReportEmail).toHaveBeenCalledTimes(EMAILS_PER_DAY);
        // A new UTC day starts the count again.
        const next = await gate.unlock({
            email: "target@example.com",
            url: "shop.example.com",
            now: new Date("2026-10-06T00:00:01Z"),
        });
        expect(next).toMatchObject({ emailed: "sent" });
    });

    it(`sends no copy past ${REPORT_EMAILS_PER_DAY} report emails a day in all, and still unlocks`, async () => {
        dayTotal = REPORT_EMAILS_PER_DAY;
        const { gate } = setup();
        await expect(
            gate.unlock({ email: "late@example.com", url: "shop.example.com" }),
        ).resolves.toMatchObject({ unlocked: true, emailed: "not-sent" });
        expect(sendLinkReportEmail).not.toHaveBeenCalled();
    });

    it("says when mail is down, and still unlocks", async () => {
        (sendLinkReportEmail as jest.Mock).mockResolvedValue("not-configured");
        const { gate } = setup();
        await expect(
            gate.unlock({ email: "down@example.com", url: "shop.example.com" }),
        ).resolves.toMatchObject({ unlocked: true, emailed: "not-sent" });
    });

    it("limits a visitor to 5 unlocks a minute", async () => {
        const { controller } = setup();
        const caller = relayFor("198.51.100.150");
        for (let i = 0; i < 5; i += 1) {
            await controller.unlock(
                { email: `v${i}@example.com`, url: "shop.example.com" },
                caller,
            );
        }
        await expect(
            controller.unlock(
                { email: "v9@example.com", url: "shop.example.com" },
                caller,
            ),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("counts an unlock's check against the check limits too", async () => {
        const { controller } = setup();
        const caller = relayFor("198.51.100.160");
        for (let i = 0; i < 9; i += 1) {
            await controller.check({ url: "plain.example.com" }, caller);
        }
        await controller.unlock(
            { email: "v@example.com", url: "shop.example.com" },
            caller,
        );
        await expect(
            controller.check({ url: "plain.example.com" }, caller),
        ).rejects.toMatchObject({ status: 429 });
    });
});

describe("the concurrency cap", () => {
    it("answers busy, at once, past 8 checks in flight", async () => {
        const replies: Record<string, Reply> = {};
        for (let i = 0; i < 9; i += 1) {
            replies[`https://s${i}.example.com/`] = "hang";
        }
        jest.useFakeTimers();
        try {
            const { preview } = setup(replies);
            const running = Array.from({ length: 8 }, (_, i) =>
                preview.check(`s${i}.example.com`),
            );
            await expect(
                preview.check("s8.example.com"),
            ).resolves.toMatchObject({ ok: false, failure: "busy" });
            await jest.advanceTimersByTimeAsync(5_001);
            await Promise.all(running);
            // The slots are free again.
            await jest.advanceTimersByTimeAsync(0);
            const again = preview.check("s8.example.com", { fresh: true });
            await jest.advanceTimersByTimeAsync(5_001);
            await expect(again).resolves.toMatchObject({ failure: "timeout" });
        } finally {
            jest.useRealTimers();
        }
    });
});
