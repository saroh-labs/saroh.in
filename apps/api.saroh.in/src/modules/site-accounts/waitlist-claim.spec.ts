/**
 * The waitlist offer's claim link (U18, #1149): its signed token, and what
 * the claim page says for each way an offer can stand. Pure; the read
 * against Postgres is `waitlist-claim.db.spec.ts`.
 */
import type { ClaimFacts } from "./waitlist-claim";
import {
    claimState,
    mayRejoin,
    signClaimToken,
    verifyClaimToken,
    waitlistClaimPath,
    waitlistClaimUrl,
} from "./waitlist-claim";

const SECRET = "test-site-code-secret-at-least-32-characters";
const ENTRY = "clwaitlistentry0001";
const UNTIL = new Date("2026-10-21T13:00:00.000Z");

describe("the claim token", () => {
    it("names the entry and the hold it was made for", () => {
        const token = signClaimToken(SECRET, ENTRY, UNTIL);
        expect(token).toMatch(/^v1\.clwaitlistentry0001\.\d+\.[\w-]{43}$/);
        expect(verifyClaimToken(SECRET, token)).toEqual({
            entryId: ENTRY,
            until: UNTIL,
        });
    });

    it("keeps the hold's end to the millisecond", () => {
        const until = new Date("2026-10-21T13:00:00.123Z");
        const token = signClaimToken(SECRET, ENTRY, until);
        expect(verifyClaimToken(SECRET, token)?.until).toEqual(until);
    });

    it("refuses a token signed with another key", () => {
        const token = signClaimToken(
            "another-secret-that-is-at-least-32-chars",
            ENTRY,
            UNTIL,
        );
        expect(verifyClaimToken(SECRET, token)).toBeNull();
    });

    it("refuses a token whose entry or hold was changed", () => {
        const token = signClaimToken(SECRET, ENTRY, UNTIL);
        const [v, , until, sig] = token.split(".");
        expect(
            verifyClaimToken(
                SECRET,
                [v, "clwaitlistentry0002", until, sig].join("."),
            ),
        ).toBeNull();
        expect(
            verifyClaimToken(
                SECRET,
                [v, ENTRY, String(Number(until) + 3_600_000), sig].join("."),
            ),
        ).toBeNull();
    });

    it("refuses anything that isn't a token, without throwing", () => {
        for (const value of [
            undefined,
            null,
            42,
            ["v1.a.b.c"],
            "",
            "v1",
            "v2.clwaitlistentry0001.1.abc",
            `v1.${ENTRY}.1.${"a".repeat(43)}`,
            "x".repeat(500),
        ]) {
            expect(verifyClaimToken(SECRET, value)).toBeNull();
        }
    });

    it("is a path segment as it is", () => {
        const token = signClaimToken(SECRET, ENTRY, UNTIL);
        expect(waitlistClaimPath(token)).toBe(`/book/claim/${token}`);
    });
});

describe("the claim link in the offer's email", () => {
    const db = (siteId: string | null, hostname: string | null = null) => ({
        customerSession: { findFirst: jest.fn().mockResolvedValue(null) },
        site: {
            findFirst: jest
                .fn()
                .mockResolvedValue(
                    siteId ? { id: siteId, subdomain: "pulse" } : null,
                ),
        },
        domain: {
            findFirst: jest
                .fn()
                .mockResolvedValue(hostname ? { hostname } : null),
        },
    });
    const offer = { entryId: ENTRY, contactId: "c_1", offeredUntil: UNTIL };

    it("opens the claim page on the business's own domain", async () => {
        const url = await waitlistClaimUrl(
            db("s_1", "pulse.example.com") as never,
            "org_1",
            offer,
            () => SECRET,
        );
        expect(url).toMatch(
            /^https:\/\/pulse\.example\.com\/book\/claim\/v1\.clwaitlistentry0001\./,
        );
        const token = decodeURIComponent(url!.split("/book/claim/")[1]);
        expect(verifyClaimToken(SECRET, token)?.entryId).toBe(ENTRY);
    });

    it("is nothing with no published site", async () => {
        await expect(
            waitlistClaimUrl(db(null) as never, "org_1", offer, () => SECRET),
        ).resolves.toBeNull();
    });

    it("is nothing, never an error, when the secret can't be read", async () => {
        await expect(
            waitlistClaimUrl(db("s_1") as never, "org_1", offer, () => {
                throw new Error("SITE_ACCOUNTS_CODE_SECRET is not set");
            }),
        ).resolves.toBeNull();
    });
});

describe("where the offer stands", () => {
    const now = new Date("2026-10-21T12:00:00.000Z");
    const held: ClaimFacts = {
        status: "OFFERED",
        offeredUntil: UNTIL,
        tokenUntil: UNTIL,
        startAt: new Date("2026-10-21T15:00:00.000Z"),
        offered: true,
        freeForThem: 1,
    };

    it("is open while the place is held for them", () => {
        expect(claimState(held, now)).toBe("open");
        expect(mayRejoin("open", held)).toBe(false);
    });

    it("is booked once they took it, and offers nothing more", () => {
        const facts = { ...held, status: "ACCEPTED" };
        expect(claimState(facts, now)).toBe("booked");
        expect(mayRejoin("booked", facts)).toBe(false);
    });

    it("has ended at the hold's end, with a way to join again", () => {
        const after = new Date(UNTIL.getTime());
        expect(claimState(held, after)).toBe("ended");
        expect(mayRejoin("ended", held)).toBe(true);
    });

    it("has ended once the next in line was offered it, or they left", () => {
        for (const status of ["EXPIRED", "LEFT", "WAITING"]) {
            expect(claimState({ ...held, status }, now)).toBe("ended");
        }
    });

    it("has ended for a link from an earlier hold", () => {
        const earlier = new Date(UNTIL.getTime() - 60_000);
        expect(claimState({ ...held, tokenUntil: earlier }, now)).toBe("ended");
    });

    it("has gone when someone else took the place while it was held", () => {
        const facts = { ...held, freeForThem: 0 };
        expect(claimState(facts, now)).toBe("gone");
        expect(mayRejoin("gone", facts)).toBe(true);
    });

    it("has gone, with no way back, for a class cancelled or no longer offered", () => {
        const closed = { ...held, status: "CLOSED" };
        expect(claimState(closed, now)).toBe("gone");
        expect(mayRejoin("gone", closed)).toBe(false);
        const off = { ...held, offered: false };
        expect(claimState(off, now)).toBe("gone");
        expect(mayRejoin("gone", off)).toBe(false);
    });

    it("has gone once the class has started", () => {
        expect(claimState(held, new Date("2026-10-21T15:00:00.000Z"))).toBe(
            "gone",
        );
    });
});
