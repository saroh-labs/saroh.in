import type { INestApplication } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createHash } from "node:crypto";

import { trustProxyHops } from "../../common/trust-proxy";
import { BookingsService } from "./bookings.service";
import { PublicBookingsController } from "./public-bookings.controller";

function build() {
    const bookings = {
        publicServices: jest.fn().mockResolvedValue([]),
    } as unknown as BookingsService;
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

describe("PublicBookingsController.book (ADR-007)", () => {
    const row = {
        id: "bk_1",
        organizationId: "org_1",
        contactId: "contact_1",
        ipHash: "hash",
        idempotencyKey: "key_1",
        status: "CONFIRMED",
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
    };
    const dto = {
        startAt: "2026-07-20T09:00:00.000Z",
        bookerEmail: "jane@example.com",
        idempotencyKey: "key_1",
    };

    it("answers with the booker-safe shape, and a replay answers the same", async () => {
        const bookOnline = jest
            .fn()
            .mockResolvedValue({ booking: row, payToken: null });
        const controller = new PublicBookingsController({
            bookOnline,
        } as unknown as BookingsService);

        const first = await controller.book("svc_1", dto, "1.2.3.4");
        // The service replays an existing booking for the same key.
        const replay = await controller.book("svc_1", dto, "1.2.3.4");

        expect(first).toEqual(replay);
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

describe("the caller's address behind a proxy (#508)", () => {
    const sha = (ip: string) => createHash("sha256").update(ip).digest("hex");
    let app: INestApplication | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    /** The controller over HTTP, with `hops` proxies trusted as main.ts does. */
    async function serve(hops: number) {
        const publicHold = jest.fn().mockResolvedValue({
            state: "HELD",
            holdExpiresAt: null,
            booking: {},
        });
        const moduleRef = await Test.createTestingModule({
            controllers: [PublicBookingsController],
            providers: [{ provide: BookingsService, useValue: { publicHold } }],
        }).compile();
        app = moduleRef.createNestApplication({ logger: false });
        trustProxyHops(app, hops);
        await app.listen(0, "127.0.0.1");
        const url = await app.getUrl();
        const poll = (forwardedFor: string) =>
            fetch(`${url}/public/services/holds/tok_1`, {
                headers: { "x-forwarded-for": forwardedFor },
            });
        return { publicHold, poll };
    }

    it("hashes the client the proxy names, not the proxy", async () => {
        const { publicHold, poll } = await serve(1);
        // A client's own claim, then the one the proxy appended.
        const res = await poll("10.9.9.9, 203.0.113.7");
        expect(res.status).toBe(200);
        expect(publicHold).toHaveBeenCalledWith("tok_1", sha("203.0.113.7"));
    });

    it("reads the raw string SKIP_ENV_VALIDATION leaves as a hop count", async () => {
        const { publicHold, poll } = await serve("1" as unknown as number);
        await poll("10.9.9.9, 203.0.113.7");
        expect(publicHold).toHaveBeenCalledWith("tok_1", sha("203.0.113.7"));
    });

    it("believes no forwarded address when no proxy is trusted", async () => {
        const { publicHold, poll } = await serve(0);
        await poll("203.0.113.7");
        const [, ipHash] = publicHold.mock.calls[0] as [string, string];
        expect(ipHash).not.toBe(sha("203.0.113.7"));
        expect([sha("127.0.0.1"), sha("::ffff:127.0.0.1")]).toContain(ipHash);
    });
});
