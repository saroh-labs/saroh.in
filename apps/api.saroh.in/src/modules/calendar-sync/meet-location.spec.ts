import { BadRequestException } from "@nestjs/common";

import { resolveLocation } from "../bookings/bookings.service";

/** A service's Meet links (#1048, KTD8), as `resolveLocation` checks them. */
describe("a service that makes Google Meet links", () => {
    it("needs no typed link once someone here is connected", () => {
        expect(resolveLocation("ONLINE", null, "GOOGLE_MEET", true)).toEqual({
            locationType: "ONLINE",
            meetingUrl: null,
            meetingLink: "GOOGLE_MEET",
        });
    });

    it("is refused with nobody connected and no typed link to fall back on", () => {
        expect(() =>
            resolveLocation("ONLINE", null, "GOOGLE_MEET", false),
        ).toThrow(BadRequestException);
    });

    it("keeps a typed link as the fallback, still checked", () => {
        expect(
            resolveLocation(
                "EITHER",
                "https://meet.example.com/room",
                "GOOGLE_MEET",
                false,
            ),
        ).toMatchObject({ meetingLink: "GOOGLE_MEET" });
        expect(() =>
            resolveLocation("ONLINE", "http://insecure", "GOOGLE_MEET", true),
        ).toThrow(BadRequestException);
    });

    it("goes back to MANUAL, with no link, in person", () => {
        expect(resolveLocation("IN_PERSON", null, "GOOGLE_MEET", true)).toEqual(
            {
                locationType: "IN_PERSON",
                meetingUrl: null,
                meetingLink: "MANUAL",
            },
        );
    });
});
