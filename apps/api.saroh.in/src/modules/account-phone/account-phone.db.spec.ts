// jest can't load better-auth's ESM build (as in admin-people.db.spec.ts):
// the session is a plain row and cookie here. Better Auth's own session
// path is tested against the real library in packages/auth/src/phone-sign-in.test.ts.
jest.mock("../../common/auth/auth", () => ({ auth: {} }));
jest.mock("@saroh/auth", () => ({
    startPhoneSession: async (
        _auth: unknown,
        { userId }: { userId: string },
    ) => {
        const { prisma: db } =
            jest.requireActual<typeof import("@saroh/database")>(
                "@saroh/database",
            );
        const { randomUUID } =
            jest.requireActual<typeof import("node:crypto")>("node:crypto");
        const token = randomUUID();
        await db.session.create({
            data: {
                id: randomUUID(),
                token,
                userId,
                expiresAt: new Date(Date.now() + 86_400_000),
            },
        });
        const headers = new Headers();
        headers.append(
            "set-cookie",
            `saroh.session_token=${token}; Path=/; HttpOnly`,
        );
        return headers;
    },
}));

// The notice emails (DEC-198), caught here: nothing is sent.
const mockNotice = jest.fn();
jest.mock("../../common/email", () => ({
    ...jest.requireActual<typeof import("../../common/email")>(
        "../../common/email",
    ),
    sendAccountPhoneNotice: (...args: unknown[]) =>
        mockNotice(...args) as unknown,
}));

import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { numberHash } from "../messaging/messaging-records";
import { MessagingService } from "../messaging/messaging.service";
import { FakeMessagingProvider } from "../messaging/providers/fake-messaging-provider";
import { ChallengeVerifier } from "../site-accounts/challenge";
import { AccountPhoneService, PHONE_STALE } from "./account-phone.service";
import { renewPhoneOnEmailSignIn } from "./phone-freshness";
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
    service = new AccountPhoneService(
        new MessagingService(fake),
        challenge,
        new FeatureFlagService(),
    );
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    mockNotice.mockReset().mockResolvedValue("sent");
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

function signIn(p: string, accessToken: string, ip = IP) {
    return service.signIn({
        phoneE164: p,
        proof: { accessToken },
        ip,
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
        const before = await prisma.session.count();
        await expect(signIn(p, token(p))).rejects.toMatchObject({
            response: {
                message:
                    "Use your email to sign in, then add this phone in your account.",
                details: { code: "NO_ACCOUNT" },
            },
        });
        await expect(prisma.session.count()).resolves.toBe(before);
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
            proof: { accessToken: token(first) },
            ip: IP,
        });
        expect(added.phoneE164).toBe(first);

        const second = phone();
        await service.add({
            userId: user.id,
            phoneE164: second,
            proof: { accessToken: token(second) },
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
                proof: { accessToken: token(p) },
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
                proof: { accessToken: "client-says-verified" },
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
    it("never signs in or saves a foreign number, even with a valid widget token (review 28 Oct)", async () => {
        const foreign = "+14155550101";
        const user = await person(phone());
        await expect(
            service.add({
                userId: user.id,
                phoneE164: foreign,
                proof: { accessToken: token(foreign) },
                ip: IP,
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(signIn(foreign, token(foreign))).rejects.toMatchObject({
            status: 400,
        });
        await expect(
            prisma.user.count({ where: { phoneE164: foreign } }),
        ).resolves.toBe(0);
    });

    it("lets one of twenty simultaneous starts through, not nineteen (pentest 28 Oct, H1)", async () => {
        const p = phone();
        const results = await Promise.allSettled(
            Array.from({ length: 20 }, () =>
                service.start({
                    phoneE164: p,
                    ip: IP,
                    channel: "sms",
                    purpose: "sign-in",
                }),
            ),
        );
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        await expect(
            prisma.accountPhoneEvent.count({
                where: { kind: "START", phoneHash: numberHash(p) },
            }),
        ).resolves.toBe(1);
    });

    it("refuses a number outside India before anything is sent or counted (pentest 28 Oct)", async () => {
        for (const channel of ["sms", "whatsapp"] as const) {
            await expect(
                service.start({
                    phoneE164: "+14155550100",
                    ip: IP,
                    channel,
                    purpose: "sign-in",
                }),
            ).rejects.toMatchObject({ status: 400 });
        }
    });

    it("hands out the stand-in under the fake, then holds a 30s cooldown per phone", async () => {
        const p = phone();
        const first = await service.start({
            phoneE164: p,
            ip: IP,
            channel: "sms",
            purpose: "sign-in",
        });
        expect(first).toEqual({ standIn: { token: expect.any(String) } });
        await expect(
            service.start({
                phoneE164: p,
                ip: IP,
                channel: "sms",
                purpose: "sign-in",
            }),
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
            service.start({
                phoneE164: p,
                ip: IP,
                channel: "sms",
                purpose: "sign-in",
            }),
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
            service.start({
                phoneE164: p,
                ip: IP,
                channel: "sms",
                purpose: "sign-in",
            }),
        ).rejects.toMatchObject({
            response: { details: { code: "CHALLENGE" } },
        });
        await expect(events("START", p)).resolves.toBe(0);
        expect(lastWarning(p)).toContain("reason=challenge");
        challenge.pass = true;
        await expect(
            service.start({
                phoneE164: p,
                ip: IP,
                turnstileToken: "ok",
                channel: "sms",
                purpose: "sign-in",
            }),
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
        // An address of its own: earlier tests' failures share IP.
        const ip = "203.0.113.77";
        // Failures for other numbers from the same address.
        for (let i = 0; i < FAILS_PER_ADDRESS_PER_DAY; i++) {
            await expect(signIn(phone(), "bad", ip)).rejects.toMatchObject({
                status: 400,
            });
        }
        await expect(signIn(p, token(p), ip)).rejects.toMatchObject({
            status: 429,
        });
        expect(lastWarning(p)).toContain("reason=address_failures");
    });
});

describe("WhatsApp codes made by the server (owner, 28 Oct)", () => {
    const supportBefore = env.MESSAGING_SUPPORT_PHONE;
    beforeEach(() => {
        env.MESSAGING_SUPPORT_PHONE = "9000000002";
    });
    afterAll(() => {
        env.MESSAGING_SUPPORT_PHONE = supportBefore;
    });

    const startWa = (
        p: string,
        extra: {
            purpose?: "sign-in" | "add";
            userId?: string;
            ip?: string;
            turnstileToken?: string;
        } = {},
    ) =>
        service.start({
            phoneE164: p,
            channel: "whatsapp",
            purpose: extra.purpose ?? "sign-in",
            userId: extra.userId,
            turnstileToken: extra.turnstileToken,
            ip: extra.ip ?? IP,
        });
    const sentCode = (p: string) =>
        fake.sends.filter((x) => x.toE164 === p).at(-1)?.code ?? "";
    const withCode = (p: string, code: string, ip = IP) =>
        service.signIn({
            phoneE164: p,
            proof: { code },
            ip,
            headers: new Headers({ "user-agent": "jest" }),
        });
    const wrong = (code: string) => (code === "000000" ? "111111" : "000000");
    const codes = (p: string) =>
        prisma.accountPhoneCode.findMany({
            where: { phoneHash: numberHash(p) },
            select: { codeHash: true, attempts: true, usedAt: true },
        });

    it("sends the template's four values from Saroh, and keeps only a hash", async () => {
        const p = phone();
        await expect(startWa(p)).resolves.toEqual({
            whatsapp: { resendAfterSeconds: 30 },
        });
        const sent = fake.sends.at(-1);
        expect(sent).toEqual({
            toE164: p,
            code: expect.stringMatching(/^\d{6}$/),
            appName: "Saroh",
            minutes: 10,
            callNumber: "+91 90000 00002",
        });
        const [row] = await codes(p);
        expect(row?.codeHash).not.toContain(sent?.code ?? "x");
        await expect(events("START", p)).resolves.toBe(1);
    });

    it("answers the same whether or not the phone has an account", async () => {
        const known = phone();
        await person(known);
        const unknown = phone();
        await expect(startWa(known)).resolves.toEqual(await startWa(unknown));
    });

    it("signs in with the right code, once", async () => {
        const p = phone();
        const user = await person(p);
        await startWa(p);
        const code = sentCode(p);
        const headers = await withCode(p, code);
        expect(headers.getSetCookie().join(";")).toMatch(/session_token=/);
        await expect(sessions(user.id)).resolves.toBe(1);
        await expect(withCode(p, code)).rejects.toMatchObject({
            response: { details: { code: "OTP_EXPIRED" } },
        });
        await expect(sessions(user.id)).resolves.toBe(1);
    });

    it("counts each wrong code, and the fifth kills it", async () => {
        const p = phone();
        const user = await person(p);
        await startWa(p);
        const code = sentCode(p);
        for (let i = 0; i < 4; i++) {
            await expect(withCode(p, wrong(code))).rejects.toMatchObject({
                status: 400,
                response: { details: { code: "NOT_VERIFIED" } },
            });
        }
        await expect(withCode(p, wrong(code))).rejects.toMatchObject({
            response: { details: { code: "TOO_MANY_ATTEMPTS" } },
        });
        await expect(withCode(p, code)).rejects.toMatchObject({
            response: { details: { code: "TOO_MANY_ATTEMPTS" } },
        });
        await expect(sessions(user.id)).resolves.toBe(0);
        await expect(events("VERIFY_FAILED", p)).resolves.toBe(6);
        expect(lastWarning(p)).toContain("reason=too_many_attempts");
    });

    it("refuses an expired code", async () => {
        const p = phone();
        const user = await person(p);
        await startWa(p);
        await prisma.accountPhoneCode.updateMany({
            where: { phoneHash: numberHash(p) },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await expect(withCode(p, sentCode(p))).rejects.toMatchObject({
            response: { details: { code: "OTP_EXPIRED" } },
        });
        await expect(sessions(user.id)).resolves.toBe(0);
    });

    it("never signs in on a code nobody sent", async () => {
        const p = phone();
        const user = await person(p);
        await expect(withCode(p, "123456")).rejects.toMatchObject({
            status: 400,
        });
        await expect(sessions(user.id)).resolves.toBe(0);
        await expect(events("VERIFY_FAILED", p)).resolves.toBe(1);
    });

    it("adds a phone with a code sent for this person only", async () => {
        const me = await person();
        const other = await person();
        const p = phone();
        await startWa(p, { purpose: "add", userId: me.id });
        const code = sentCode(p);
        // A sign-in code or another person's can't add it.
        await expect(
            service.add({
                userId: other.id,
                phoneE164: p,
                proof: { code },
                ip: IP,
            }),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            service.add({
                userId: me.id,
                phoneE164: p,
                proof: { code },
                ip: IP,
            }),
        ).resolves.toMatchObject({ phoneE164: p });
    });

    it("a failed send says try SMS, doesn't hold the cooldown, and still counts toward the day", async () => {
        const p = phone();
        fake.failNext("template_paused");
        await expect(startWa(p)).rejects.toMatchObject({
            status: 422,
            response: {
                message: "Couldn't send on WhatsApp. Try SMS instead.",
                details: { code: "WHATSAPP_FAILED" },
            },
        });
        expect(lastWarning(p)).toContain("reason=whatsapp_template_paused");
        await expect(codes(p)).resolves.toEqual([]);
        await expect(startWa(p)).resolves.toHaveProperty("whatsapp");
        await expect(events("START", p)).resolves.toBe(2);
    });

    it("holds the 30s cooldown across both channels", async () => {
        const p = phone();
        await startWa(p);
        await expect(
            service.start({
                phoneE164: p,
                channel: "sms",
                purpose: "sign-in",
                ip: IP,
            }),
        ).rejects.toMatchObject({ status: 429 });
        await expect(startWa(p)).rejects.toMatchObject({ status: 429 });
    });

    it("lets a resend skip Turnstile only from the same address that passed it", async () => {
        challenge.on = true;
        const p = phone();
        await expect(startWa(p)).rejects.toMatchObject({
            response: { details: { code: "CHALLENGE" } },
        });
        await startWa(p, { turnstileToken: "ok" });
        // Past the cooldown.
        await prisma.accountPhoneEvent.updateMany({
            where: { phoneHash: numberHash(p) },
            data: { createdAt: new Date(Date.now() - 60_000) },
        });
        await expect(startWa(p, { ip: "198.51.100.4" })).rejects.toMatchObject({
            response: { details: { code: "CHALLENGE" } },
        });
        await expect(startWa(p)).resolves.toHaveProperty("whatsapp");
    });

    it("the SMS widget's token still signs in", async () => {
        const p = phone();
        const user = await person(p);
        await expect(
            service.start({
                phoneE164: p,
                channel: "sms",
                purpose: "sign-in",
                ip: IP,
            }),
        ).resolves.toHaveProperty("standIn");
        await signIn(p, token(p));
        await expect(sessions(user.id)).resolves.toBe(1);
    });
});

describe("phone rules (DEC-198)", () => {
    const notices = () =>
        mockNotice.mock.calls.map(
            ([to, n]) =>
                [
                    to,
                    (n as { kind: string }).kind,
                    (n as { lastFour: string }).lastFour,
                ] as const,
        );

    it("refuses a landline, a 0-5 start or a +91 0 for sign-in, before anything is counted", async () => {
        for (const p of [
            "+91 22 4567 8901",
            "+91 12345 67890",
            "+91 55555 12345",
            "+910987654321",
            "4155550100",
        ]) {
            await expect(
                service.start({
                    phoneE164: p,
                    ip: IP,
                    channel: "sms",
                    purpose: "sign-in",
                }),
            ).rejects.toMatchObject({ status: 400 });
            await expect(signIn(p, token(p))).rejects.toMatchObject({
                status: 400,
            });
        }
        await expect(events("START", "+912245678901")).resolves.toBe(0);
    });

    it("takes a widget token once: the same token again is refused", async () => {
        const p = phone();
        const user = await person(p);
        const t = token(p);
        await signIn(p, t);
        await expect(signIn(p, t)).rejects.toMatchObject({
            response: { details: { code: "NOT_VERIFIED" } },
        });
        await expect(sessions(user.id)).resolves.toBe(1);
        expect(lastWarning(p)).toContain("reason=used");
    });

    it("emails the account on a phone added, changed, removed and signed in with", async () => {
        const user = await person();
        const { email } = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
            select: { email: true },
        });
        const first = phone();
        const second = phone();
        await service.add({
            userId: user.id,
            phoneE164: first,
            proof: { accessToken: token(first) },
            ip: IP,
        });
        await service.add({
            userId: user.id,
            phoneE164: second,
            proof: { accessToken: token(second) },
            ip: IP,
            place: "Bengaluru, IN",
        });
        await signIn(second, token(second));
        await service.remove({ userId: user.id, ip: IP });
        expect(notices()).toEqual([
            [email, "added", first.slice(-4)],
            [email, "changed", second.slice(-4)],
            [email, "signed-in", second.slice(-4)],
            [email, "removed", second.slice(-4)],
        ]);
        expect(mockNotice.mock.calls[1]?.[1]).toMatchObject({
            place: "Bengaluru, IN",
        });
    });

    it("a notice that fails is logged without the address, and the change stands", async () => {
        const error = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => {});
        mockNotice.mockResolvedValue("failed");
        const user = await person();
        const p = phone();
        await service.add({
            userId: user.id,
            phoneE164: p,
            proof: { accessToken: token(p) },
            ip: IP,
        });
        const line = String(error.mock.calls.at(-1)?.[0] ?? "");
        error.mockRestore();
        expect(line).toContain("account_phone_notice_failed kind=added");
        expect(line).not.toContain("@");
        await expect(
            prisma.user.findUniqueOrThrow({
                where: { id: user.id },
                select: { phoneE164: true },
            }),
        ).resolves.toEqual({ phoneE164: p });
    });

    it("Saroh staff never sign in by phone, and hear what a phone with no account hears", async () => {
        const granted = phone();
        const staff = await person(granted);
        await prisma.platformAdmin.create({ data: { userId: staff.id } });
        const listed = phone();
        const breakGlass = await person(listed);
        const allowBefore = env.ADMIN_ALLOWLIST;
        env.ADMIN_ALLOWLIST = (
            await prisma.user.findUniqueOrThrow({
                where: { id: breakGlass.id },
                select: { email: true },
            })
        ).email;
        try {
            for (const p of [granted, listed]) {
                await expect(signIn(p, token(p))).rejects.toMatchObject({
                    response: {
                        message: NO_ACCOUNT_FOR,
                        details: { code: "NO_ACCOUNT" },
                    },
                });
            }
        } finally {
            env.ADMIN_ALLOWLIST = allowBefore;
        }
        await expect(sessions(staff.id)).resolves.toBe(0);
        await expect(sessions(breakGlass.id)).resolves.toBe(0);
        expect(mockNotice).not.toHaveBeenCalled();
        // They can still keep a phone on the account.
        const next = phone();
        await expect(
            service.add({
                userId: staff.id,
                phoneE164: next,
                proof: { accessToken: token(next) },
                ip: IP,
            }),
        ).resolves.toMatchObject({ phoneE164: next });
    });

    it("a phone neither vouched for nor used in 12 months is sent to the email, and an email sign-in renews it", async () => {
        const p = phone();
        const user = await person(p);
        const old = new Date();
        old.setMonth(old.getMonth() - 13);
        await prisma.user.update({
            where: { id: user.id },
            data: { phoneVerifiedAt: old },
        });
        await expect(signIn(p, token(p))).rejects.toMatchObject({
            response: {
                message: PHONE_STALE,
                details: { code: "PHONE_STALE" },
            },
        });
        await expect(sessions(user.id)).resolves.toBe(0);

        await renewPhoneOnEmailSignIn(user.id);
        await signIn(p, token(p));
        await expect(sessions(user.id)).resolves.toBe(1);
    });

    it("a phone verified long ago but signed in with lately still signs in", async () => {
        const p = phone();
        const user = await person(p);
        const old = new Date();
        old.setMonth(old.getMonth() - 13);
        await prisma.user.update({
            where: { id: user.id },
            data: { phoneVerifiedAt: old },
        });
        await prisma.accountPhoneEvent.create({
            data: { kind: "SIGNED_IN", userId: user.id },
        });
        await signIn(p, token(p));
        await expect(sessions(user.id)).resolves.toBe(1);
    });
});

const NO_ACCOUNT_FOR =
    "Use your email to sign in, then add this phone in your account.";
