import {
    PREVIEW_TOKEN_TTL_MS,
    signPreviewToken,
    verifyPreviewToken,
} from "./preview-token";

const SECRET = "a-test-secret-that-is-long-enough-000000";
const now = new Date("2026-10-01T10:00:00Z");
const draft = { revision: 7, draftEpoch: 1_759_000_000_123 };

describe("pricing draft-preview token", () => {
    it("checks with the secret it was signed with, and says what it shows", () => {
        const { token, expiresAt } = signPreviewToken(SECRET, draft, now);
        expect(expiresAt.getTime()).toBeLessThanOrEqual(
            now.getTime() + PREVIEW_TOKEN_TTL_MS,
        );
        expect(verifyPreviewToken(SECRET, token, now)).toEqual({
            revision: 7,
            draftEpoch: draft.draftEpoch,
            expiresAt,
        });
    });

    it("lives at most fifteen minutes", () => {
        const { token } = signPreviewToken(SECRET, draft, now);
        const later = (ms: number) => new Date(now.getTime() + ms);
        expect(
            verifyPreviewToken(SECRET, token, later(14 * 60_000)),
        ).not.toBeNull();
        expect(
            verifyPreviewToken(SECRET, token, later(15 * 60_000)),
        ).toBeNull();
    });

    it("refuses another secret's token", () => {
        const { token } = signPreviewToken(
            "another-secret-that-is-long-enough-11111",
            draft,
            now,
        );
        expect(verifyPreviewToken(SECRET, token, now)).toBeNull();
    });

    it("refuses a token whose revision, epoch or expiry was changed", () => {
        const { token } = signPreviewToken(SECRET, draft, now);
        const [v, exp, rev, epoch, sig] = token.split(".");
        for (const forged of [
            [v, exp, "8", epoch, sig],
            [v, exp, rev, String(Number(epoch) + 1), sig],
            [v, String(Number(exp) + 60), rev, epoch, sig],
        ]) {
            expect(
                verifyPreviewToken(SECRET, forged.join("."), now),
            ).toBeNull();
        }
    });

    it("refuses a correctly signed token that claims a longer life", () => {
        const farFuture = new Date(now.getTime() + 60 * 60_000);
        // Signed "an hour from now", then presented now: 75 minutes of life.
        const { token } = signPreviewToken(SECRET, draft, farFuture);
        expect(verifyPreviewToken(SECRET, token, now)).toBeNull();
    });

    it.each([
        "",
        "v1",
        "v2.1.2.3.abc",
        "v1.x.7.1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        `v1.1.1.1.${"a".repeat(300)}`,
    ])("refuses %j without throwing", (token) => {
        expect(verifyPreviewToken(SECRET, token, now)).toBeNull();
    });
});
