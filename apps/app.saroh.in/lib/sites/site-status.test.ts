import { describe, expect, it } from "vitest";

import { siteStatus } from "./site-status";

const live = { currentPublicationId: "pub_1" };

describe("siteStatus (the Website area's status words)", () => {
    it("says Not live yet before the first publish, whatever waits", () => {
        expect(
            siteStatus({
                currentPublicationId: null,
                pendingSectionChanges: 3,
            }),
        ).toEqual({ label: "Not live yet", tone: "draft", waiting: 0 });
    });

    it("counts sections and site settings as one number", () => {
        expect(
            siteStatus({
                ...live,
                pendingSectionChanges: 1,
                pendingSiteChanges: ["menu"],
            }),
        ).toEqual({
            label: "Live · 2 changes waiting",
            tone: "attention",
            waiting: 2,
        });
        expect(siteStatus({ ...live, pendingSectionChanges: 1 }).label).toBe(
            "Live · 1 change waiting",
        );
    });

    it("never invents a number, and says Live when nothing waits", () => {
        expect(siteStatus({ ...live, hasUnpublishedChanges: true }).label).toBe(
            "Live · changes waiting",
        );
        expect(siteStatus(live)).toEqual({
            label: "Live",
            tone: "live",
            waiting: 0,
        });
    });

    it("tells a reader only whether it is live", () => {
        expect(
            siteStatus({ ...live, pendingSectionChanges: 4 }, { reader: true }),
        ).toEqual({ label: "Live", tone: "live", waiting: 0 });
    });
});
