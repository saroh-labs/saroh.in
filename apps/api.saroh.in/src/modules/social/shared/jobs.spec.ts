import { refreshAt } from "./jobs";
import { settledStatus } from "./status";

const day = 86_400_000;
const now = new Date("2026-11-18T10:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * day);

describe("when a token is refreshed", () => {
    it("is 7 days before it ends", () => {
        expect(
            refreshAt(
                {
                    tokenIssuedAt: now,
                    tokenExpiresAt: at(60),
                    grantExpiresAt: null,
                },
                now,
            ),
        ).toEqual(at(53));
    });

    it("is 7 days before a Threads grant ends when that comes first", () => {
        expect(
            refreshAt(
                {
                    tokenIssuedAt: at(-80),
                    tokenExpiresAt: at(40),
                    grantExpiresAt: at(10),
                },
                now,
            ),
        ).toEqual(at(3));
    });

    it("is never before the token is a day old, nor in the past", () => {
        expect(
            refreshAt(
                {
                    tokenIssuedAt: now,
                    tokenExpiresAt: at(2),
                    grantExpiresAt: null,
                },
                now,
            ),
        ).toEqual(at(1));
        expect(
            refreshAt(
                {
                    tokenIssuedAt: at(-30),
                    tokenExpiresAt: at(3),
                    grantExpiresAt: null,
                },
                now,
            ),
        ).toEqual(now);
    });

    it("isn't, for a Page token that never ends", () => {
        expect(
            refreshAt(
                {
                    tokenIssuedAt: now,
                    tokenExpiresAt: null,
                    grantExpiresAt: null,
                },
                now,
            ),
        ).toBeNull();
    });
});

describe("a post's status from its channels", () => {
    it.each([
        [["POSTED", "POSTED"], "DONE"],
        [["POSTED", "FAILED"], "PARTLY_DONE"],
        [["FAILED", "FAILED"], "FAILED"],
        [["POSTED", "WAITING"], "PUBLISHING"],
        [["UNKNOWN", "FAILED"], "PUBLISHING"],
    ] as const)("%j is %s", (statuses, expected) => {
        expect(settledStatus(statuses.map((status) => ({ status })))).toBe(
            expected,
        );
    });
});
