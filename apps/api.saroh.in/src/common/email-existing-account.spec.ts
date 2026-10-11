import {
    accountsBase,
    EXISTING_ACCOUNT_SUBJECT,
    existingAccountEmail,
} from "./email";

/**
 * The email a sign-up for an address that already has an account sends (UX
 * audit, 10 Oct). The screen answers "Check your email" either way, so this
 * is the only thing that tells the mailbox's owner how to get in.
 */
describe("accountsBase", () => {
    it("is ACCOUNTS_URL when it is set, without a trailing slash", () => {
        expect(
            accountsBase(
                { ACCOUNTS_URL: "https://accounts.example.test/" },
                "https://other.example.test",
            ),
        ).toBe("https://accounts.example.test");
    });

    it("is the sign-up page's origin when ACCOUNTS_URL is unset", () => {
        expect(
            accountsBase(
                { NODE_ENV: "production" },
                "https://accounts.example.test",
            ),
        ).toBe("https://accounts.example.test");
    });

    it("is the local accounts app in development and nothing anywhere else", () => {
        expect(accountsBase({ NODE_ENV: "development" })).toBe(
            "https://accounts.saroh.localhost",
        );
        expect(accountsBase({ NODE_ENV: "production" })).toBeNull();
        expect(accountsBase({ NODE_ENV: "test" })).toBeNull();
        expect(accountsBase({})).toBeNull();
    });
});

describe("existingAccountEmail", () => {
    const html = existingAccountEmail(
        "asha+shop@example.com",
        "https://accounts.example.test",
    );

    it("says an account exists, in the subject and the heading", () => {
        expect(EXISTING_ACCOUNT_SUBJECT).toBe(
            "You already have a Saroh account",
        );
        expect(html).toContain("<h2>You already have a Saroh account</h2>");
    });

    it("offers Sign in with the address filled in, and Reset password", () => {
        expect(html).toContain(
            'href="https://accounts.example.test/login?email=asha%2Bshop%40example.com"',
        );
        expect(html).toContain(">Sign in</a>");
        expect(html).toContain(
            'href="https://accounts.example.test/forgot-password"',
        );
        expect(html).toContain(">Reset password</a>");
    });

    it("tells someone who didn't ask that nothing happened", () => {
        expect(html).toContain(
            "If this wasn't you, you can ignore this email. Nobody got into your account.",
        );
    });

    it("says Sign in, never Log in, and has no em dash", () => {
        expect(html).not.toMatch(/log ?in\b(?!\?)/i);
        expect(html).not.toContain("—");
    });

    it("still says what to do when this instance has no accounts address", () => {
        const plain = existingAccountEmail("asha@example.com", null);
        expect(plain).not.toContain("<a ");
        expect(plain).toContain("Open Saroh and choose Sign in.");
    });
});
