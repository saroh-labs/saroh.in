import { describe, expect, it } from "vitest";

import { joinLink } from "./meeting-link";

const online = (meetingUrl: unknown) => ({
    service: { locationType: "ONLINE", meetingUrl },
});

describe("joinLink", () => {
    it("reads an online booking's link from its snapshot", () => {
        expect(
            joinLink({
                snapshot: online("https://meet.example.com/abc"),
                status: "CONFIRMED",
            }),
        ).toBe("https://meet.example.com/abc");
    });

    it("has none in person, or for a booking made before links", () => {
        expect(
            joinLink({
                snapshot: {
                    service: { locationType: "IN_PERSON", meetingUrl: null },
                },
                status: "CONFIRMED",
            }),
        ).toBeNull();
        expect(
            joinLink({ snapshot: { service: {} }, status: "CONFIRMED" }),
        ).toBeNull();
        expect(joinLink({ snapshot: null, status: "CONFIRMED" })).toBeNull();
    });

    it("has none once cancelled", () => {
        expect(
            joinLink({
                snapshot: online("https://meet.example.com/abc"),
                status: "CANCELLED",
            }),
        ).toBeNull();
    });

    it("never hands back a link that is not https", () => {
        expect(
            joinLink({
                snapshot: online("javascript:alert(1)"),
                status: "CONFIRMED",
            }),
        ).toBeNull();
    });
});
