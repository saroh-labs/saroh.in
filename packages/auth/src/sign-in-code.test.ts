import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    CODE_ALLOWED_ATTEMPTS,
    CODE_LIMIT_MAX,
    CODE_LIMIT_WINDOW_SECONDS,
    CODE_RESEND_SECONDS,
    VERIFICATION_OTP_EXPIRY_SECONDS,
} from "./constants";
import type { CreateAuthOptions } from "./server";
import { authOptions } from "./server";

/**
 * Signing up and signing in with an emailed code (owner, 10 Oct 2026), run
 * on the real library with Saroh's own options and a database in memory.
 *
 * Nothing here is ours to implement: the code, the account it makes and the
 * session are Better Auth's `emailOTP`. What this file holds is the reason
 * it is safe to put on the sign-up page, so an upgrade of the library, or a
 * change to `authOptions`, that takes one of these away fails here and not
 * in production.
 */

const ORIGIN = "https://accounts.saroh.in";
const BASE = "https://api.saroh.in";

type Sent = Parameters<
    NonNullable<CreateAuthOptions["sendVerificationOTP"]>
>[0];

function stack(
    extra: {
        rateLimit?: boolean;
        hooks?: Pick<CreateAuthOptions, "mayStartSession" | "onMailboxProven">;
    } = {},
) {
    const sent: Sent[] = [];
    type Rows = Record<string, unknown>[];
    // Read through `db` each time: the adapter replaces a table's array.
    const db = {
        user: [] as Rows,
        session: [] as Rows,
        account: [] as Rows,
        verification: [] as Rows,
        rateLimit: [] as Rows,
    };
    const auth = betterAuth({
        ...authOptions({
            sendVerificationOTP: (mail) => {
                sent.push(mail);
            },
            ...extra.hooks,
        }),
        baseURL: BASE,
        trustedOrigins: [ORIGIN],
        database: memoryAdapter(db),
        // Off outside production by default, like every local stack, so
        // the tests that are not about the limiter never meet it.
        rateLimit: { enabled: extra.rateLimit ?? false, storage: "memory" },
        logger: { disabled: true },
    });
    async function post(path: string, body: unknown, from = "203.0.113.7") {
        const response = await auth.handler(
            new Request(`${BASE}/api/auth${path}`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    origin: ORIGIN,
                    "x-forwarded-for": from,
                },
                body: JSON.stringify(body),
            }),
        );
        const text = await response.text();
        return {
            status: response.status,
            headers: response.headers,
            body: (text ? JSON.parse(text) : null) as Record<
                string,
                unknown
            > | null,
        };
    }
    return {
        db,
        sent,
        post,
        ask: (email: string, from?: string) =>
            post(
                "/email-otp/send-verification-otp",
                { email, type: "sign-in" },
                from,
            ),
        signIn: (
            email: string,
            otp: string,
            more: object = {},
            from?: string,
        ) => post("/sign-in/email-otp", { email, otp, ...more }, from),
        lastCode: () => sent.at(-1)?.otp ?? "",
        users: () => db.user,
    };
}

describe("sign up and sign in with an emailed code", () => {
    beforeEach(() => {
        vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-the-code-flow-only");
        vi.stubEnv("BETTER_AUTH_URL", BASE);
    });

    it("a new address: the code makes the account, verified, and signs it in", async () => {
        const s = stack();
        const asked = await s.ask("asha@example.com");
        expect(asked).toMatchObject({ status: 200, body: { success: true } });
        expect(s.sent).toHaveLength(1);
        expect(s.sent[0]).toMatchObject({
            to: "asha@example.com",
            type: "sign-in",
        });
        // No account until the code is proven.
        expect(s.users()).toHaveLength(0);

        const done = await s.signIn("asha@example.com", s.lastCode());
        expect(done.status).toBe(200);
        expect(done.body?.token).toEqual(expect.any(String));
        expect(done.headers.get("set-cookie")).toContain("session_token");
        expect(s.users()).toHaveLength(1);
        expect(s.users()[0]).toMatchObject({
            email: "asha@example.com",
            emailVerified: true,
            // The name is asked in setup, not here.
            name: "",
        });
        // No password was made: it is optional and set from the account page.
        expect(s.db.account).toHaveLength(0);
    });

    it("carries a name when the sign-up gave one (someone joining a business)", async () => {
        const s = stack();
        await s.ask("ravi@example.com");
        await s.signIn("ravi@example.com", s.lastCode(), { name: "Ravi K" });
        expect(s.users()[0]).toMatchObject({ name: "Ravi K" });
    });

    it("answers the same, and sends the same email, whether or not the address has an account", async () => {
        const s = stack();
        await s.ask("asha@example.com");
        await s.signIn("asha@example.com", s.lastCode());

        const known = await s.ask("asha@example.com");
        const unknown = await s.ask("nobody@example.com");
        expect(known.status).toBe(unknown.status);
        expect(known.body).toEqual(unknown.body);
        const [, toKnown, toUnknown] = s.sent;
        expect(toKnown.type).toBe("sign-in");
        expect(toUnknown.type).toBe("sign-in");
    });

    it("an existing account: the code signs it in and makes no second account", async () => {
        const s = stack();
        await s.ask("asha@example.com");
        await s.signIn("asha@example.com", s.lastCode(), { name: "Asha" });

        await s.ask("Asha@Example.com");
        const again = await s.signIn("asha@example.com", s.lastCode(), {
            // A name sent with a sign-in never renames an account.
            name: "Someone Else",
        });
        expect(again.status).toBe(200);
        expect(s.users()).toHaveLength(1);
        expect(s.users()[0]).toMatchObject({ name: "Asha" });
    });

    it("a password account keeps its password, and the code is a second way in", async () => {
        const s = stack();
        // A password account whose address is proven, as every one made
        // before 10 Oct is.
        await s.post("/sign-up/email", {
            name: "Priya",
            email: "priya@example.com",
            password: "a-long-password",
        });
        const verify = s.lastCode();
        await s.post("/email-otp/verify-email", {
            email: "priya@example.com",
            otp: verify,
        });
        expect(s.users()[0]).toMatchObject({ emailVerified: true });

        await s.ask("priya@example.com");
        expect((await s.signIn("priya@example.com", s.lastCode())).status).toBe(
            200,
        );
        // The password still signs in afterwards.
        const byPassword = await s.post("/sign-in/email", {
            email: "priya@example.com",
            password: "a-long-password",
        });
        expect(byPassword.status).toBe(200);
        expect(s.db.account).toHaveLength(1);
    });

    it("an account whose address was never proven loses the password it was made with", async () => {
        const s = stack();
        // Someone else signs up with Meera's address and a password of
        // their own, and never sees the code.
        await s.post("/sign-up/email", {
            name: "Not Meera",
            email: "meera@example.com",
            password: "the-squatter's-password",
        });
        expect(s.db.account).toHaveLength(1);

        // Meera arrives and proves the address with a sign-in code.
        await s.ask("meera@example.com");
        expect((await s.signIn("meera@example.com", s.lastCode())).status).toBe(
            200,
        );
        expect(s.users()[0]).toMatchObject({ emailVerified: true });
        expect(s.db.account).toHaveLength(0);
        const squatter = await s.post("/sign-in/email", {
            email: "meera@example.com",
            password: "the-squatter's-password",
        });
        expect(squatter.status).toBe(401);
    });

    it("a wrong code is refused and makes nothing", async () => {
        const s = stack();
        await s.ask("asha@example.com");
        const wrong = await s.signIn("asha@example.com", "000000");
        expect(wrong.status).toBe(400);
        expect(wrong.body?.code).toBe("INVALID_OTP");
        expect(s.users()).toHaveLength(0);
    });

    it("a code works once", async () => {
        const s = stack();
        await s.ask("asha@example.com");
        const code = s.lastCode();
        expect((await s.signIn("asha@example.com", code)).status).toBe(200);
        const replay = await s.signIn("asha@example.com", code);
        expect(replay.status).toBe(400);
        expect(replay.body?.code).toBe("INVALID_OTP");
    });

    it("a new code replaces the one before it", async () => {
        // The library takes the newest code for an address, by when it was
        // made. Two asks are never closer than the Resend wait, so the
        // clock moves on between them here too.
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            const s = stack();
            await s.ask("asha@example.com");
            const first = s.lastCode();
            vi.setSystemTime(Date.now() + CODE_RESEND_SECONDS * 1000);
            await s.ask("asha@example.com");
            const second = s.lastCode();
            if (first !== second) {
                expect((await s.signIn("asha@example.com", first)).status).toBe(
                    400,
                );
            }
            expect((await s.signIn("asha@example.com", second)).status).toBe(
                200,
            );
            // And using the new one spends the old one with it.
            expect((await s.signIn("asha@example.com", first)).status).toBe(
                400,
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it(`spends the code after ${CODE_ALLOWED_ATTEMPTS} wrong tries, so even the right one is refused`, async () => {
        const s = stack();
        await s.ask("asha@example.com");
        const right = s.lastCode();
        const wrong = right === "111111" ? "222222" : "111111";
        for (let i = 0; i < CODE_ALLOWED_ATTEMPTS; i++) {
            const tried = await s.signIn("asha@example.com", wrong);
            expect(tried.body?.code).toBe("INVALID_OTP");
        }
        const locked = await s.signIn("asha@example.com", right);
        expect(locked.status).toBe(403);
        expect(locked.body?.code).toBe("TOO_MANY_ATTEMPTS");
        expect(s.users()).toHaveLength(0);
        // And it stays spent: only a new code gets in.
        expect((await s.signIn("asha@example.com", right)).status).toBe(400);
        await s.ask("asha@example.com");
        expect((await s.signIn("asha@example.com", s.lastCode())).status).toBe(
            200,
        );
    });

    it("refuses a code past its lifetime", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            const s = stack();
            await s.ask("asha@example.com");
            const code = s.lastCode();
            vi.setSystemTime(
                Date.now() + (VERIFICATION_OTP_EXPIRY_SECONDS + 1) * 1000,
            );
            const late = await s.signIn("asha@example.com", code);
            expect(late.status).toBe(400);
            expect(late.body?.code).toBe("OTP_EXPIRED");
            expect(s.users()).toHaveLength(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("keeps the code hashed at rest", async () => {
        const s = stack();
        await s.ask("asha@example.com");
        const stored = JSON.stringify(s.db.verification);
        expect(stored).not.toContain(s.lastCode());
    });

    it("refuses an address that is not one, and sends nothing", async () => {
        const s = stack();
        const bad = await s.ask("not-an-address");
        expect(bad.status).toBe(400);
        expect(bad.body?.code).toBe("INVALID_EMAIL");
        expect(s.sent).toHaveLength(0);
    });

    describe("the limiter (on in production)", () => {
        it(`sends ${CODE_LIMIT_MAX} codes to one caller, then refuses with the wait`, async () => {
            const s = stack({ rateLimit: true });
            const from = "198.51.100.20";
            for (let i = 0; i < CODE_LIMIT_MAX; i++) {
                expect((await s.ask(`a${i}@example.com`, from)).status).toBe(
                    200,
                );
            }
            const refused = await s.ask("one-more@example.com", from);
            expect(refused.status).toBe(429);
            const wait = Number(refused.headers.get("x-retry-after"));
            expect(wait).toBeGreaterThan(0);
            expect(wait).toBeLessThanOrEqual(CODE_LIMIT_WINDOW_SECONDS);
            expect(s.sent).toHaveLength(CODE_LIMIT_MAX);
            // Another caller is not held up by the first.
            expect((await s.ask("b@example.com", "198.51.100.21")).status).toBe(
                200,
            );
        });

        it(`checks ${CODE_LIMIT_MAX} codes from one caller, then refuses`, async () => {
            const s = stack({ rateLimit: true });
            const from = "198.51.100.30";
            await s.ask("asha@example.com", "198.51.100.31");
            for (let i = 0; i < CODE_LIMIT_MAX; i++) {
                const tried = await s.signIn(
                    "asha@example.com",
                    "000000",
                    {},
                    from,
                );
                expect(tried.status).not.toBe(429);
            }
            expect(
                (await s.signIn("asha@example.com", "000000", {}, from)).status,
            ).toBe(429);
        });

        it("the screen's Resend wait lets one resend through", () => {
            // Two sends a `CODE_RESEND_SECONDS` apart are inside what the
            // limiter allows, so pressing Resend the moment it opens works.
            expect(CODE_RESEND_SECONDS).toBe(30);
            expect(CODE_LIMIT_MAX).toBeGreaterThanOrEqual(2);
        });
    });
});

/**
 * The two session hooks the API's sign-in help hangs on (admin console U9):
 * a held person starts no session by any way in, and only a code is the
 * person's own proof of their mailbox.
 */
describe("session hooks: a hold, and the mailbox proven", () => {
    beforeEach(() => {
        vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-the-code-flow-only");
        vi.stubEnv("BETTER_AUTH_URL", BASE);
    });

    async function priya(s: ReturnType<typeof stack>) {
        await s.post("/sign-up/email", {
            name: "Priya",
            email: "priya@example.com",
            password: "a-long-password",
        });
        await s.post("/email-otp/verify-email", {
            email: "priya@example.com",
            otp: s.lastCode(),
        });
    }

    it("refuses a session by code and by password while the host holds the person", async () => {
        let held = false;
        const s = stack({ hooks: { mayStartSession: () => !held } });
        await priya(s);
        held = true;

        await s.ask("priya@example.com");
        const byCode = await s.signIn("priya@example.com", s.lastCode());
        expect(byCode.status).not.toBe(200);
        const byPassword = await s.post("/sign-in/email", {
            email: "priya@example.com",
            password: "a-long-password",
        });
        expect(byPassword.status).not.toBe(200);

        held = false;
        const after = await s.post("/sign-in/email", {
            email: "priya@example.com",
            password: "a-long-password",
        });
        expect(after.status).toBe(200);
    });

    it("refuses when the hold can't be checked", async () => {
        const s = stack({
            hooks: {
                mayStartSession: () => {
                    throw new Error("database away");
                },
            },
        });
        await s.ask("asha@example.com");
        const tried = await s.signIn("asha@example.com", s.lastCode());
        expect(tried.status).not.toBe(200);
    });

    it("tells the host the mailbox was proven by a code, never by a password", async () => {
        const proven: string[] = [];
        const s = stack({
            hooks: { onMailboxProven: ({ id }) => void proven.push(id) },
        });
        await priya(s);
        // Verifying the address with a code is a proof.
        expect(proven).toHaveLength(1);

        await s.post("/sign-in/email", {
            email: "priya@example.com",
            password: "a-long-password",
        });
        expect(proven).toHaveLength(1);

        await s.ask("priya@example.com");
        await s.signIn("priya@example.com", s.lastCode());
        expect(proven).toHaveLength(2);
        expect(new Set(proven).size).toBe(1);
    });
});
