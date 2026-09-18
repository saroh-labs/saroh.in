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
