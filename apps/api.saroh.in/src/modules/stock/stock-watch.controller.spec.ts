// "Tell me when it's back" on a business's site (DEC-174 U23, #1154): the
// public routes' limits and when "Tell me" is offered, with the database
// mocked. The real reads and writes are `stock-watch.service.db.spec.ts`.
jest.mock("../../env", () => ({ env: {}, declaredNodeEnv: "test" }));

const site = { findFirst: jest.fn() };
const stockWatch = {
    findFirst: jest.fn(),
    createManyAndReturn: jest.fn(),
};
const contact = { findFirst: jest.fn() };
jest.mock("@saroh/database", () => ({
    prisma: {
        site,
        $transaction: (fn: (tx: unknown) => unknown) =>
            fn({ stockWatch, contact }),
    },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));
const readWatchable = jest.fn();
jest.mock("./watchable", () => ({
    readWatchable: (...args: unknown[]) => readWatchable(...args),
}));
const noticeOn = jest.fn();
jest.mock("../communications/notice-settings", () => ({
    noticeOn: (...args: unknown[]) => noticeOn(...args),
}));
const emailRoute = jest.fn();
jest.mock("../communications/email-route", () => ({
    emailRoute: (...args: unknown[]) => emailRoute(...args),
}));

import { ConflictException, HttpException } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { StockWatchController } from "./stock-watch.controller";
import { StockWatchService } from "./stock-watch.service";

const SOLD_OUT = {
    sellable: false,
    productId: "p_1",
    slug: "neem-soap",
    name: "Neem soap",
    variantTitle: null,
};

function service(limits: {
    writes?: number;
    perEmail?: number;
    reads?: number;
}) {
    return new StockWatchService(
        new FixedWindowRateLimiter(limits.writes ?? 100, 60_000),
        new FixedWindowRateLimiter(limits.perEmail ?? 100, 60_000),
        new FixedWindowRateLimiter(limits.reads ?? 100, 60_000),
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    site.findFirst.mockResolvedValue({ organizationId: "org_1" });
    readWatchable.mockResolvedValue(SOLD_OUT);
    noticeOn.mockResolvedValue(true);
    emailRoute.mockResolvedValue("RESEND");
    stockWatch.findFirst.mockResolvedValue(null);
    stockWatch.createManyAndReturn.mockResolvedValue([
        { id: "clwatch00000001" },
    ]);
    contact.findFirst.mockResolvedValue(null);
});

describe("when Tell me is offered (U23)", () => {
    it("sold out, the switch on and the business's own email: offered", async () => {
        await expect(
            service({}).offer("site_1", "p_1", null, "v"),
        ).resolves.toEqual({ offered: true, why: null });
    });

    it.each([
        [
            "the switch off",
            () => noticeOn.mockResolvedValue(false),
            "SWITCHED_OFF",
        ],
        [
            "no email provider",
            () => emailRoute.mockResolvedValue(null),
            "NO_EMAIL",
        ],
        [
            "in stock",
            () =>
                readWatchable.mockResolvedValue({
                    ...SOLD_OUT,
                    sellable: true,
                }),
            "IN_STOCK",
        ],
    ] as const)(
        "%s: not offered, and a Tell me is refused with the reason",
        async (_what, set, why) => {
            set();
            const s = service({});
            await expect(s.offer("site_1", "p_1", null, "v")).resolves.toEqual({
                offered: false,
                why,
            });
            const refused = s.watch(
                "site_1",
                "p_1",
                { email: "asha@example.com", consent: true },
                "v",
            );
            await expect(refused).rejects.toBeInstanceOf(ConflictException);
            // `details` is what reaches the site through the filter (U24).
            await expect(refused).rejects.toMatchObject({
                response: { reason: why, details: { reason: why } },
            });
            expect(stockWatch.createManyAndReturn).not.toHaveBeenCalled();
        },
    );

    it("a product the site doesn't sell is not found, before any switch is read", async () => {
        readWatchable.mockResolvedValue(null);
        await expect(
            service({}).offer("site_1", "p_x", null, "v"),
        ).rejects.toMatchObject({ status: 404 });
        expect(noticeOn).not.toHaveBeenCalled();
    });
});

describe("the limits (U23)", () => {
    it("a visitor past five a minute is told to wait, before anything is read", async () => {
        const s = service({ writes: 2 });
        const send = (email: string) =>
            s.watch("site_1", "p_1", { email, consent: true }, "visitor-a");
        await send("a@example.com");
        await send("b@example.com");
        site.findFirst.mockClear();
        const refused = send("c@example.com");
        await expect(refused).rejects.toBeInstanceOf(HttpException);
        await expect(refused).rejects.toMatchObject({ status: 429 });
        expect(site.findFirst).not.toHaveBeenCalled();
        // Another visitor is counted on their own.
        await expect(
            s.watch(
                "site_1",
                "p_1",
                { email: "d@example.com", consent: true },
                "visitor-b",
            ),
        ).resolves.toMatchObject({ state: "waiting" });
    });

    it("one address is limited whatever visitor sends it", async () => {
        const s = service({ perEmail: 1 });
        await s.watch(
            "site_1",
            "p_1",
            { email: "asha@example.com", consent: true },
            "v1",
        );
        await expect(
            s.watch(
                "site_1",
                "p_1",
                { email: "ASHA@example.com ", consent: true },
                "v2",
            ),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("reads are limited per visitor too", async () => {
        const s = service({ reads: 1 });
        await s.offer("site_1", "p_1", null, "v");
        await expect(s.offer("site_1", "p_1", null, "v")).rejects.toMatchObject(
            { status: 429 },
        );
    });

    it("a refused address or a missing tick costs no limit and reads nothing", async () => {
        const s = service({ writes: 1 });
        await expect(
            s.watch("site_1", "p_1", { email: "nope", consent: true }, "v"),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            s.watch(
                "site_1",
                "p_1",
                { email: "a@example.com", consent: false },
                "v",
            ),
        ).rejects.toMatchObject({ status: 400 });
        expect(site.findFirst).not.toHaveBeenCalled();
        await expect(
            s.watch(
                "site_1",
                "p_1",
                { email: "a@example.com", consent: true },
                "v",
            ),
        ).resolves.toMatchObject({ state: "waiting" });
    });
});

describe("the routes", () => {
    it("count the relayed visitor, else the caller's own address", async () => {
        const watches = {
            offer: jest.fn().mockResolvedValue({ offered: true, why: null }),
            watch: jest.fn().mockResolvedValue({ state: "waiting" }),
        };
        const controller = new StockWatchController(
            watches as unknown as StockWatchService,
        );
        await controller.offer("site_1", "p_1", {}, "203.0.113.9", undefined);
        await controller.watch(
            "site_1",
            "p_1",
            { email: "asha@example.com", consent: true },
            "203.0.113.9",
            "forged",
        );
        const [, , variant, visitor] = watches.offer.mock.calls[0];
        expect(variant).toBeNull();
        expect(typeof visitor).toBe("string");
        // A forged relay counts the caller, the same key as no relay.
        expect(watches.watch.mock.calls[0][3]).toBe(visitor);
    });
});
