import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { numberHash } from "../messaging/messaging-records";
import { MessagingService } from "../messaging/messaging.service";
import { FakeMessagingProvider } from "../messaging/providers/fake-messaging-provider";
import { ChallengeVerifier } from "../site-accounts/challenge";
import { AccountPhoneService } from "./account-phone.service";
import {
    FAILS_PER_ADDRESS_PER_DAY,
    FAILS_PER_PHONE_PER_DAY,
    STARTS_PER_PHONE_PER_DAY,
} from "./phone-limits";

/**
 * Phone sign-in for Saroh accounts (DEC-196) against a real database, with
 * the fake messaging provider: the server's check of the widget's token
 * comes before any session or saved phone, and the limits hold.
 */

/** Turnstile, switched on or off per test, with no network. */
class TestChallenge extends ChallengeVerifier {
    on = false;
    pass = true;
    override get configured(): boolean {
        return this.on;
    }
    override get siteKey(): string | null {
        return this.on ? "test-site-key" : null;
    }
    override verify(): Promise<boolean> {
        return Promise.resolve(this.pass);
    }
}

let n = 0;
const phone = () =>
    `+9197${String(process.pid % 1000).padStart(3, "0")}${String(++n).padStart(5, "0")}`;
const IP = "203.0.113.9";

let fake: FakeMessagingProvider;
let challenge: TestChallenge;
let service: AccountPhoneService;
let warn: jest.SpyInstance;

beforeEach(() => {
    fake = new FakeMessagingProvider();
    challenge = new TestChallenge();
    service = new AccountPhoneService(new MessagingService(fake), challenge);
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
});

afterEach(() => warn.mockRestore());

afterAll(async () => {
    await prisma.$disconnect();
});

async function person(phoneE164: string | null = null) {
    return prisma.user.create({
        data: {
            email: `phone-${process.pid}-${++n}@example.com`,
            emailVerified: true,
            phoneE164,
            phoneVerifiedAt: phoneE164 ? new Date() : null,
        },
        select: { id: true },
    });
}

function token(forPhone: string): string {
    const t = `tok-${++n}`;
    fake.issueWidgetToken(t, forPhone);
    return t;
}

function signIn(p: string, accessToken: string) {
    return service.signIn({
        phoneE164: p,
        accessToken,
        ip: IP,
        headers: new Headers({ "user-agent": "jest" }),
    });
}

const sessions = (userId: string) =>
    prisma.session.count({ where: { userId } });
const events = (kind: string, p: string) =>
    prisma.accountPhoneEvent.count({
        where: { kind: kind as never, phoneHash: numberHash(p) },
    });

/** The last warning logged: names the reason, never the number. */
function lastWarning(p: string): string {
    const line = String(warn.mock.calls[warn.mock.calls.length - 1]?.[0] ?? "");
    expect(line).not.toContain(p);
    expect(line).not.toContain(p.slice(1));
    return line;
}

describe("signing in with a phone", () => {
    it("a good token for a verified phone makes Better Auth's session and cookie", async () => {
        const p = phone();
        const user = await person(p);
        const headers = await signIn(p, token(p));
        expect(headers.getSetCookie().join(";")).toMatch(/session_token=/);
        await expect(sessions(user.id)).resolves.toBe(1);
        await expect(events("SIGNED_IN", p)).resolves.toBe(1);
    });

    it("refuses a bad token, with no session and a failure counted", async () => {
        const p = phone();
        const user = await person(p);
        await expect(signIn(p, "made-up")).rejects.toMatchObject({
            response: { details: { code: "NOT_VERIFIED" } },
        });
        await expect(sessions(user.id)).resolves.toBe(0);
        await expect(events("VERIFY_FAILED", p)).resolves.toBe(1);
        expect(lastWarning(p)).toContain("reason=invalid_token");
    });

    it("refuses a token verified for another number", async () => {
        const p = phone();
        const user = await person(p);
        await expect(signIn(p, token(phone()))).rejects.toMatchObject({
            response: { details: { code: "NOT_VERIFIED" } },
        });
        await expect(sessions(user.id)).resolves.toBe(0);
        expect(lastWarning(p)).toContain("reason=mismatch");
    });

    it("answers a phone with no account in one sentence, with no session", async () => {
        const p = phone();
        await expect(signIn(p, token(p))).rejects.toMatchObject({
            response: {
                message:
                    "Use your email to sign in, then add this phone in your account.",
                details: { code: "NO_ACCOUNT" },
            },
        });
        await expect(prisma.session.count()).resolves.toBe(0);
        expect(lastWarning(p)).toContain("reason=unknown_phone");
    });

    it("never signs in to a phone saved without a verify time", async () => {
        const p = phone();
        const user = await prisma.user.create({
            data: { email: `unverified-${++n}@example.com`, phoneE164: p },
        });
        await expect(signIn(p, token(p))).rejects.toMatchObject({
            response: { details: { code: "NO_ACCOUNT" } },
        });
        await expect(sessions(user.id)).resolves.toBe(0);
    });
});

describe("a person's own phone", () => {
    it("adds, changes and removes it, each verified and on the trail", async () => {
        const user = await person();
        const first = phone();
        const added = await service.add({
            userId: user.id,
            phoneE164: first,
            accessToken: token(first),
            ip: IP,
        });
        expect(added.phoneE164).toBe(first);

        const second = phone();
        await service.add({
            userId: user.id,
            phoneE164: second,
            accessToken: token(second),
            ip: IP,
        });
        const row = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { phoneE164: true, phoneVerifiedAt: true },
        });
        expect(row.phoneE164).toBe(second);
        expect(row.phoneVerifiedAt).toBeInstanceOf(Date);

        await service.remove({ userId: user.id, ip: IP });
        await expect(
            prisma.user.findUniqueOrThrow({
                where: { id: user.id },
                select: { phoneE164: true, phoneVerifiedAt: true },
            }),
        ).resolves.toEqual({ phoneE164: null, phoneVerifiedAt: null });

        const trail = await prisma.accountPhoneEvent.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { kind: true, reason: true },
        });
        expect(trail).toEqual([
            { kind: "PHONE_ADDED", reason: "added" },
            { kind: "PHONE_ADDED", reason: "changed" },
            { kind: "PHONE_REMOVED", reason: null },
        ]);
    });

    it("refuses a phone that is on another account, in words", async () => {
        const p = phone();
        await person(p);
        const me = await person();
        await expect(
            service.add({
                userId: me.id,
                phoneE164: p,
                accessToken: token(p),
                ip: IP,
            }),
        ).rejects.toMatchObject({
            status: 409,
            response: {
                message:
                    "That phone is already on another Saroh account. Use a different one.",
            },
        });
    });

    it("never saves a phone without the server's verify", async () => {
        const me = await person();
        const p = phone();
        await expect(
            service.add({
                userId: me.id,
                phoneE164: p,
                accessToken: "client-says-verified",
                ip: IP,
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            prisma.user.findUniqueOrThrow({
                where: { id: me.id },
                select: { phoneE164: true },
            }),
        ).resolves.toEqual({ phoneE164: null });
    });
});

describe("the limits", () => {
    it("hands out the stand-in under the fake, then holds a 30s cooldown per phone", async () => {
        const p = phone();
        const first = await service.start({ phoneE164: p, ip: IP });
        expect(first).toEqual({ standIn: { token: expect.any(String) } });
        await expect(
            service.start({ phoneE164: p, ip: IP }),
        ).rejects.toMatchObject({
            status: 429,
            response: { details: { code: "TOO_MANY" } },
        });
        expect(lastWarning(p)).toContain("reason=phone_cooldown");
        await expect(events("START", p)).resolves.toBe(1);
    });

    it("caps starts per phone per day", async () => {
        const p = phone();
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        await prisma.accountPhoneEvent.createMany({
            data: Array.from({ length: STARTS_PER_PHONE_PER_DAY }, () => ({
                kind: "START" as const,
                phoneHash: numberHash(p),
                createdAt: hourAgo,
            })),
        });
        await expect(
            service.start({ phoneE164: p, ip: IP }),
        ).rejects.toMatchObject({
            status: 429,
        });
        expect(lastWarning(p)).toContain("reason=phone_daily");
    });

    it("asks for Turnstile when it is on, and counts no start without it", async () => {
        challenge.on = true;
        challenge.pass = false;
        const p = phone();
        await expect(
            service.start({ phoneE164: p, ip: IP }),
        ).rejects.toMatchObject({
            response: { details: { code: "CHALLENGE" } },
        });
        await expect(events("START", p)).resolves.toBe(0);
        expect(lastWarning(p)).toContain("reason=challenge");
        challenge.pass = true;
        await expect(
            service.start({ phoneE164: p, ip: IP, turnstileToken: "ok" }),
        ).resolves.toHaveProperty("standIn");
    });

    it("caps failed verifies per phone, before asking the provider", async () => {
        const p = phone();
        await person(p);
        await prisma.accountPhoneEvent.createMany({
            data: Array.from({ length: FAILS_PER_PHONE_PER_DAY }, () => ({
                kind: "VERIFY_FAILED" as const,
                phoneHash: numberHash(p),
            })),
        });
        const asked = jest.spyOn(fake, "verifyOtpWidgetToken");
        await expect(signIn(p, token(p))).rejects.toMatchObject({
            status: 429,
        });
        expect(asked).not.toHaveBeenCalled();
        expect(lastWarning(p)).toContain("reason=phone_failures");
    });

    it("caps failed verifies per address", async () => {
        const p = phone();
        await person(p);
        // Failures for other numbers from the same address.
        for (let i = 0; i < FAILS_PER_ADDRESS_PER_DAY; i++) {
            await expect(signIn(phone(), "bad")).rejects.toMatchObject({
                status: 400,
            });
        }
        await expect(signIn(p, token(p))).rejects.toMatchObject({
            status: 429,
        });
        expect(lastWarning(p)).toContain("reason=address_failures");
    });
});
