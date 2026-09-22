import { BadRequestException } from "@nestjs/common";

import type { BookingsService } from "./bookings.service";
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
        const book = jest.fn().mockResolvedValue(row);
        const controller = new PublicBookingsController({
            book,
        } as unknown as BookingsService);

        const first = await controller.book("svc_1", dto, "1.2.3.4");
        // The service replays an existing booking for the same key.
        const replay = await controller.book("svc_1", dto, "1.2.3.4");

        expect(first).toEqual(replay);
        expect(Object.keys(first).sort()).toEqual([
            "endAt",
            "meetingUrl",
            "online",
            "reference",
            "serviceName",
            "startAt",
        ]);
        expect(JSON.stringify(first)).not.toMatch(/org_1|contact_1|hash/);
    });
});
