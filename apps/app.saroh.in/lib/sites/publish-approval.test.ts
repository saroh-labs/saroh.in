import { describe, expect, it } from "vitest";

import { publishApprovalLine, publishApprovalOf } from "./publish-approval";

/** When the settings show "Publishing needs approval" (DEC-071, T13). */
describe("publishApprovalOf", () => {
    it("hides the setting while test releases are off and it is off", () => {
        expect(publishApprovalOf({ publishNeedsApproval: false }, false)).toBe(
            null,
        );
        // An older API that doesn't send it reads as off.
        expect(publishApprovalOf({}, false)).toBe(null);
    });

    it("shows a setting that is on whatever the flag says, so it can be turned off", () => {
        expect(
            publishApprovalOf(
                { publishNeedsApproval: true, canOverride: true },
                false,
            ),
        ).toEqual({ on: true, canChange: true });
    });

    it("lets only an owner change it (the API's canOverride)", () => {
        expect(
            publishApprovalOf(
                { publishNeedsApproval: false, canOverride: false },
                true,
            ),
        ).toEqual({ on: false, canChange: false });
        expect(
            publishApprovalOf({ publishNeedsApproval: false }, true),
        ).toEqual({ on: false, canChange: false });
    });

    it("says who can change it", () => {
        expect(publishApprovalLine(true)).toBe(
            "On · only the owner can change this",
        );
        expect(publishApprovalLine(false)).toBe(
            "Off · only the owner can change this",
        );
    });
});
