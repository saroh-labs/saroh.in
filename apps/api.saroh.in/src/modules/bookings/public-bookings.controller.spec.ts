import type { INestApplication } from "@nestjs/common";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Booking } from "@saroh/database";
import { createHash } from "node:crypto";

import { trustProxy } from "../../common/trust-proxy";
import {
    PublicBookingsController,
    publicBookingResult,
} from "./public-bookings.controller";
import { PublicBookingsService } from "./public-bookings.service";

function build() {
    const bookings = {
        publicServices: jest.fn().mockResolvedValue([]),
    } as unknown as PublicBookingsService;
    return { controller: new PublicBookingsController(bookings), bookings };
}

const idList = (n: number) =>
    Array.from({ length: n }, (_, i) => `svc_${i}`).join(",");

describe("PublicBookingsController.services (#255)", () => {
    it("trims, drops blanks and de-duplicates, keeping first order", async () => {
        const { controller, bookings } = build();
        await controller.services(" a, a ,b");
        expect(bookings.publicServices).toHaveBeenCalledWith(["a", "b"]);
    });

    it.each([
        ["a blank value", ""],
        ["only commas", " , ,"],
        ["no value", undefined],
    ])("asks for no services given %s", async (_label, ids) => {
        const { controller, bookings } = build();
        await controller.services(ids);
        expect(bookings.publicServices).toHaveBeenCalledWith([]);
    });

    it("accepts exactly 24 services", async () => {
        const { controller, bookings } = build();
        await controller.services(idList(24));
        expect(bookings.publicServices).toHaveBeenCalledTimes(1);
    });

    it("refuses 25 services", () => {
        const { controller, bookings } = build();
        expect(() => controller.services(idList(25))).toThrow(
            BadRequestException,
        );
        expect(bookings.publicServices).not.toHaveBeenCalled();
    });

    it("refuses a repeated ids parameter rather than crashing", () => {
        const { controller, bookings } = build();
        expect(() => controller.services(["a", "b"])).toThrow(
            BadRequestException,
        );
        expect(bookings.publicServices).not.toHaveBeenCalled();
    });
});

describe("publicBookingResult (ADR-007)", () => {
    const row = {
        id: "bk_1",
        organizationId: "org_1",
        contactId: "contact_1",
        ipHash: "hash",
        idempotencyKey: "key_1",
        status: "CONFIRMED",
        holdExpiresAt: null,
        startAt: new Date("2026-07-20T09:00:00.000Z"),
        endAt: new Date("2026-07-20T10:00:00.000Z"),
        snapshot: {
            service: {
                name: "Evening yoga",
                locationType: "ONLINE",
                meetingUrl: "https://meet.example.com/yoga",
            },
            booker: { email: "jane@example.com" },
        },
    } as unknown as Booking;

    it("answers with the booker-safe shape, the same for a replay", () => {
        const first = publicBookingResult(row, null);
        expect(first).toEqual(publicBookingResult(row, null));
        expect(Object.keys(first).sort()).toEqual([
            "endAt",
            "holdExpiresAt",
            "meetingUrl",
            "online",
            "payToken",
            "reference",
            "serviceName",
            "startAt",
            "state",
        ]);
        expect(first).toMatchObject({
            state: "CONFIRMED",
            holdExpiresAt: null,
            payToken: null,
        });
        expect(JSON.stringify(first)).not.toMatch(/org_1|contact_1|hash/);
    });
});

describe("the anonymous booking route is closed (A9)", () => {
    let app: INestApplication | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it("answers 410 Sign in to book, books nothing, and never reads the body", async () => {
        const bookOnline = jest.fn();
        const moduleRef = await Test.createTestingModule({
            controllers: [PublicBookingsController],
            providers: [
                { provide: PublicBookingsService, useValue: { bookOnline } },
            ],
        }).compile();
        app = moduleRef.createNestApplication({ logger: false });
        // The global pipe as main.ts sets it: a body it would refuse must
        // still answer 410, not 400.
        app.useGlobalPipes(
            new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
        );
        await app.listen(0, "127.0.0.1");
        const url = await app.getUrl();
        for (const body of [
            {
                startAt: "2026-07-20T09:00:00.000Z",
                bookerName: "Asha Rao",
                bookerEmail: "asha@example.in",
                pay: "DESK",
            },
            { anything: "at all" },
        ]) {
            const res = await fetch(`${url}/public/services/svc_1/book`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            expect(res.status).toBe(410);
            expect(res.headers.get("cache-control")).toBe("no-store");
            expect(await res.json()).toMatchObject({
                message: "Sign in to book.",
            });
        }
        expect(bookOnline).not.toHaveBeenCalled();
    });
});

describe("the caller's address behind a proxy (#508)", () => {
    const sha = (ip: string) => createHash("sha256").update(ip).digest("hex");
    let app: INestApplication | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    /**
     * The controller over HTTP, trusting proxies as main.ts does. The test
     * connects from 127.0.0.1, which stands in for Traefik on the private
     * network; `X-Forwarded-For` is the chain Traefik would pass on.
     */
    async function serve(mode: string | undefined) {
        const publicHold = jest.fn().mockResolvedValue({
            state: "HELD",
            holdExpiresAt: null,
            booking: {},
        });
        const moduleRef = await Test.createTestingModule({
            controllers: [PublicBookingsController],
            providers: [
                { provide: PublicBookingsService, useValue: { publicHold } },
            ],
        }).compile();
        app = moduleRef.createNestApplication({ logger: false });
        trustProxy(app, mode);
        await app.listen(0, "127.0.0.1");
        const url = await app.getUrl();
        const seen = async (forwardedFor?: string) => {
            const res = await fetch(`${url}/public/services/holds/tok_1`, {
                headers: forwardedFor
                    ? { "x-forwarded-for": forwardedFor }
                    : {},
            });
            expect(res.status).toBe(200);
            const [, ipHash] = publicHold.mock.calls.at(-1) as [string, string];
            return ipHash;
        };
        return { seen };
    }

    const LOCAL = [sha("127.0.0.1"), sha("::ffff:127.0.0.1")];
    // A Cloudflare edge address (162.158.0.0/15).
    const EDGE = "162.158.12.34";

    it("through Cloudflare, sees the customer, not Cloudflare", async () => {
        const { seen } = await serve("cloudflare");
        expect(await seen(`198.51.100.23, ${EDGE}`)).toBe(sha("198.51.100.23"));
    });

    it("through Cloudflare, ignores what the customer claims before it", async () => {
        const { seen } = await serve("cloudflare");
        // The customer sent "10.9.9.9"; Cloudflare appended who really called.
        expect(await seen(`10.9.9.9, 203.0.113.7, ${EDGE}`)).toBe(
            sha("203.0.113.7"),
        );
    });

    it("straight to Traefik, skipping Cloudflare, a caller cannot pose as anyone", async () => {
        const { seen } = await serve("cloudflare");
        // A forged chain ending in a Cloudflare address, then the caller's
        // real address as Traefik appends it.
        expect(await seen(`6.6.6.6, ${EDGE}, 203.0.113.9`)).toBe(
            sha("203.0.113.9"),
        );
    });

    it("private: trusts the proxy in front, not a CDN", async () => {
        const { seen } = await serve("private");
        expect(await seen("203.0.113.7")).toBe(sha("203.0.113.7"));
        expect(await seen(`198.51.100.23, ${EDGE}`)).toBe(sha(EDGE));
    });

    it("none: believes no forwarded address", async () => {
        const { seen } = await serve("none");
        expect(LOCAL).toContain(await seen("203.0.113.7"));
    });

    it("an unset or unknown mode, as SKIP_ENV_VALIDATION leaves it, trusts nothing", async () => {
        for (const mode of [undefined, "2", "yes"]) {
            const { seen } = await serve(mode);
            expect(LOCAL).toContain(await seen("203.0.113.7"));
            await app?.close();
            app = undefined;
        }
    });
});
