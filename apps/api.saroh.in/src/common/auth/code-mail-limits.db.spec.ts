import { prisma } from "@saroh/database";

import { env } from "../../env";
import {
    claimCodeMail,
    CODE_MAIL_COOLDOWN_SECONDS,
    CODE_MAILS_PER_ADDRESS_PER_HOUR,
    emailHash,
    mailsOnPasswordSignIn,
} from "./code-mail-limits";

/** The per-address cap on sign-in codes for Saroh accounts: past it, the bot challenge. */
describe("claimCodeMail", () => {
    const t0 = new Date("2026-10-30T10:00:00.000Z");
    const at = (seconds: number) => new Date(t0.getTime() + seconds * 1000);

    // Turnstile set up, and "good" the one token it accepts.
    const verifier = {
        configured: true,
        failsClosed: false,
        verify: jest.fn(
            (token: string, _ip?: string, _hostnames?: readonly string[]) =>
                Promise.resolve(token === "good"),
        ),
    };
    const claim = (email: string, now: Date, token: string | null = null) =>
        claimCodeMail(email, token, now, verifier);

    beforeEach(async () => {
        verifier.configured = true;
        verifier.failsClosed = false;
        verifier.verify.mockClear();
        await prisma.accountEmailCodeSend.deleteMany();
    });

    it("lets one through, then holds the address for the cooldown", async () => {
        expect(await claim("asha@example.com", t0)).toBeNull();
        expect(await claim("asha@example.com", at(10))).toEqual({
            retryAfterSeconds: CODE_MAIL_COOLDOWN_SECONDS - 10,
        });
        // Another address is not held up, and case doesn't make a new one.
        expect(await claim("ravi@example.com", at(10))).toBeNull();
        expect(await claim("ASHA@example.com ", at(20))).not.toBeNull();
        expect(
            await claim("asha@example.com", at(CODE_MAIL_COOLDOWN_SECONDS)),
        ).toBeNull();
    });

    async function fillTheHour(email: string) {
        for (let i = 0; i < CODE_MAILS_PER_ADDRESS_PER_HOUR; i++) {
            expect(await claim(email, at(i * 60))).toBeNull();
        }
        return at(CODE_MAILS_PER_ADDRESS_PER_HOUR * 60);
    }

    it(`past ${CODE_MAILS_PER_ADDRESS_PER_HOUR} an hour a code needs the challenge, never a lock-out`, async () => {
        const late = await fillTheHour("asha@example.com");
        // No token, or one Turnstile refuses: the challenge, nothing recorded.
        expect(await claim("asha@example.com", late)).toEqual({
            challenge: true,
        });
        expect(await claim("asha@example.com", late, "bad")).toEqual({
            challenge: true,
        });
        expect(await prisma.accountEmailCodeSend.count()).toBe(
            CODE_MAILS_PER_ADDRESS_PER_HOUR,
        );
        // A passing token sends it, and the cooldown still holds after.
        expect(await claim("asha@example.com", late, "good")).toBeNull();
        expect(
            await claim(
                "asha@example.com",
                new Date(late.getTime() + 5_000),
                "good",
            ),
        ).toEqual({ retryAfterSeconds: CODE_MAIL_COOLDOWN_SECONDS - 5 });
        // Once the hour has aged out, no challenge again.
        expect(await claim("asha@example.com", at(3600 + 300))).toBeNull();
    });

    it("under the cap no token is asked for, and the cooldown comes before the challenge", async () => {
        expect(await claim("ravi@example.com", t0)).toBeNull();
        expect(verifier.verify).not.toHaveBeenCalled();
        // The fifth went at 240 s: 10 s on, the wait, not the challenge.
        await fillTheHour("asha@example.com");
        expect(await claim("asha@example.com", at(250))).toEqual({
            retryAfterSeconds: CODE_MAIL_COOLDOWN_SECONDS - 10,
        });
    });

    it("with Turnstile not set up, past the cap the code goes (as phone start does)", async () => {
        verifier.configured = false;
        const late = await fillTheHour("asha@example.com");
        expect(await claim("asha@example.com", late)).toBeNull();
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    // 03-H2: production with Turnstile unset fails closed past the cap.
    it("in production with Turnstile not set up, past the cap it waits for the hour", async () => {
        verifier.configured = false;
        verifier.failsClosed = true;
        const late = await fillTheHour("asha@example.com");
        const verdict = await claim("asha@example.com", late);
        expect(verdict).toEqual({ retryAfterSeconds: 60 * 60 - 5 * 60 });
        expect(verifier.verify).not.toHaveBeenCalled();
    });

    // Owner, 18 Nov: a token solved on a merchant site or saroh.tech
    // (one Turnstile key serves them all) buys no Saroh account code.
    it("asks Turnstile for a token solved on this API's accounts site only", async () => {
        const before = env.ACCOUNTS_URL;
        env.ACCOUNTS_URL = "https://accounts.example.test";
        verifier.verify.mockImplementation(
            (token: string, _ip?: string, hostnames?: readonly string[]) =>
                Promise.resolve(
                    token === "good" &&
                        (hostnames ?? []).includes("accounts.example.test"),
                ),
        );
        try {
            const late = await fillTheHour("asha@example.com");
            expect(
                await claimCodeMail(
                    "asha@example.com",
                    "good",
                    late,
                    verifier,
                    "localhost:3333",
                ),
            ).toBeNull();
            expect(verifier.verify).toHaveBeenLastCalledWith("good", "", [
                "accounts.example.test",
            ]);
            // Elsewhere: the same token solved on another site is refused.
            env.ACCOUNTS_URL = "https://other.example.test";
            expect(
                await claimCodeMail(
                    "asha@example.com",
                    "good",
                    new Date(late.getTime() + 60_000),
                    verifier,
                ),
            ).toEqual({ challenge: true });
        } finally {
            env.ACCOUNTS_URL = before;
            verifier.verify.mockImplementation((token: string) =>
                Promise.resolve(token === "good"),
            );
        }
    });

    it("a burst at once passes one, and keeps only the hash", async () => {
        const verdicts = await Promise.all(
            Array.from({ length: 8 }, () => claim("burst@example.com", t0)),
        );
        expect(verdicts.filter((v) => v === null)).toHaveLength(1);
        const rows = await prisma.accountEmailCodeSend.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.emailHash).toBe(emailHash("burst@example.com"));
        expect(JSON.stringify(rows)).not.toContain("burst@");
    });
});

// 03-M9: a password sign-in mails a code only to an unproven account, so
// only that one counts against the address's cap.
describe("mailsOnPasswordSignIn", () => {
    it("is true only for an account whose address is not proven", async () => {
        const tag = Date.now();
        const unproven = `unproven-${tag}@example.com`;
        const proven = `proven-${tag}@example.com`;
        await prisma.user.create({ data: { email: unproven, name: "A" } });
        await prisma.user.create({
            data: { email: proven, name: "B", emailVerified: true },
        });
        expect(await mailsOnPasswordSignIn(unproven)).toBe(true);
        expect(await mailsOnPasswordSignIn(proven)).toBe(false);
        expect(await mailsOnPasswordSignIn(`nobody-${tag}@example.com`)).toBe(
            false,
        );
    });
});
