// "Tell me when it's back" (DEC-174 U23): the stop link's signature, the
// address a watch keeps and where a watch stands.
import {
    productPath,
    signWatchToken,
    stopWaitingPath,
    verifyWatchToken,
    watchEmail,
    watchState,
} from "./stock-watch-rules";

const SECRET = "test-secret";
const WATCH = "clwatch0000000000001";

describe("the stop link (U23)", () => {
    it("names the watch it was signed for", () => {
        const token = signWatchToken(SECRET, WATCH);
        expect(token).toMatch(/^v1\.clwatch0000000000001\.[A-Za-z0-9_-]{43}$/);
        expect(verifyWatchToken(SECRET, token)).toBe(WATCH);
    });

    it("refuses a forged, swapped, foreign-keyed or malformed one", () => {
        const token = signWatchToken(SECRET, WATCH);
        const other = signWatchToken(SECRET, "clwatch0000000000002");
        const swapped = `v1.clwatch0000000000002.${token.split(".")[2]}`;
        expect(verifyWatchToken(SECRET, swapped)).toBeNull();
        expect(verifyWatchToken("another", token)).toBeNull();
        expect(verifyWatchToken(SECRET, `${token}x`)).toBeNull();
        expect(verifyWatchToken(SECRET, token.replace("v1", "v2"))).toBeNull();
        expect(verifyWatchToken(SECRET, "")).toBeNull();
        expect(verifyWatchToken(SECRET, 42)).toBeNull();
        expect(verifyWatchToken(SECRET, "x".repeat(500))).toBeNull();
        expect(verifyWatchToken(SECRET, other)).toBe("clwatch0000000000002");
    });

    it("is kept apart from the waitlist claim's signature under the same key", () => {
        // Same key, another purpose: a claim token never verifies here.
        const claimLike = `v1.${WATCH}.1700000000000.${"A".repeat(43)}`;
        expect(verifyWatchToken(SECRET, claimLike)).toBeNull();
    });

    it("opens a page on the site, never a link that stops by being opened", () => {
        expect(stopWaitingPath("v1.a.b")).toBe("/shop/stop-waiting/v1.a.b");
        expect(productPath("linen shirt")).toBe("/shop/linen%20shirt");
    });
});

describe("the address a watch keeps", () => {
    it.each([
        ["  Asha@Example.COM ", "asha@example.com"],
        ["first.last+shop@mail.example.in", "first.last+shop@mail.example.in"],
    ])("%s → %s", (given, kept) => {
        expect(watchEmail(given)).toBe(kept);
    });

    it.each([["not-an-email"], [""], ["a@b"], ["a b@example.com"], [7]])(
        "refuses %p",
        (given) => {
            expect(watchEmail(given)).toBeNull();
        },
    );

    it("refuses one longer than a mail path", () => {
        expect(watchEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
    });
});

describe("where a watch stands", () => {
    const at = new Date();
    it.each([
        [{ toldAt: null, cancelledAt: null }, "waiting"],
        [{ toldAt: at, cancelledAt: null }, "told"],
        [{ toldAt: null, cancelledAt: at }, "stopped"],
    ] as const)("%p → %s", (watch, state) => {
        expect(watchState(watch)).toBe(state);
    });
});
