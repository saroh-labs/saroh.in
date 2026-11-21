import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import {
    calendarReads,
    takeBusinessChanges,
    takeGoogleChange,
    takeOrRefuse,
} from "./google-changes";

// No REDIS_URL here: the shared windows count in this process.
const ctx = (org: string, user = "u_1") => ({
    organizationId: org,
    userId: user,
});

describe("Google Calendar's change limits", () => {
    it("keys a person's hour per person, so one Member can't use up the Owner's (L9)", async () => {
        const member = new FixedWindowRateLimiter(1, 60_000);
        await takeGoogleChange(ctx("org_l9", "u_member"), member);
        await expect(
            takeGoogleChange(ctx("org_l9", "u_member"), member),
        ).rejects.toMatchObject({ status: 429 });
        await expect(
            takeGoogleChange(ctx("org_l9", "u_owner"), member),
        ).resolves.toBeUndefined();
    });

    it("charges a move one of the business's hour a booking (L1)", async () => {
        await takeBusinessChanges("org_l1", 999);
        await takeBusinessChanges("org_l1", 1);
        await expect(takeBusinessChanges("org_l1", 1)).rejects.toMatchObject({
            status: 429,
        });
        await expect(
            takeBusinessChanges("org_other", 500),
        ).resolves.toBeUndefined();
    });

    it("lets a person list their calendars about 30 times in 10 minutes (L4)", async () => {
        const who = ctx("org_l4");
        for (let i = 0; i < 30; i++) {
            await takeOrRefuse(calendarReads, who, "slow down");
        }
        await expect(
            takeOrRefuse(calendarReads, who, "slow down"),
        ).rejects.toMatchObject({ status: 429, message: "slow down" });
    });
});
