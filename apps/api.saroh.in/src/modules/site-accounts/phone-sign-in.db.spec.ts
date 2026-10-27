// The handlers are called directly; Better Auth's ESM build behind the
// messaging controller's guard is never reached.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

/**
 * Site sign-in by WhatsApp code (DEC-196) through its controller, against a
 * real Postgres: when the way is offered, request → hold → send (fake) →
 * check → session, a phone added to an email account, the challenge and
 * abuse limits, and that nothing crosses businesses or skips the server's
 * check. The price is made up.
 */
import type { HttpException } from "@nestjs/common";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import { hashClientIp } from "../../common/client-ip";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { contactNoticeAddress } from "../communications/contact-address";
import { theirAccounts } from "../customer-workspace/privacy-removal-writes";
import { PublicVerificationsController } from "../messaging/messaging.controller";
import { MessagingService } from "../messaging/messaging.service";
import { FakeMessagingProvider } from "../messaging/providers/fake-messaging-provider";
import { VerificationSendService } from "../messaging/verification-send.service";
import { VerificationService } from "../messaging/verification.service";
import { WalletService } from "../messaging/wallet.service";
import { CatalogueService } from "../pricing/catalogue.service";
import { ImpactService } from "../pricing/impact.service";
import { AccountHomeService } from "./account-home.service";
import { AccountLinkingService, maskSignIn } from "./account-linking.service";
import { toSiteAccountView } from "./account-unlink.service";
import { ChallengeVerifier } from "./challenge";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CustomerAccountRepository } from "./customer-account.repository";
import { EmailChangeService } from "./email-change.service";
import { PhoneSignInService } from "./phone-sign-in.service";
import { hashSessionToken, SessionsService } from "./sessions.service";
import { SignInCodesService } from "./sign-in-codes.service";
import { SignInWaysService } from "./sign-in-ways";
import { SignInController } from "./sign-in.controller";
import { resolveSiteHost } from "./site-host";
import type { SiteRelay } from "./site-relay";

const PRICE = 7;
const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const nextPhone = () => `+9198452${String(10_000 + ++n).slice(-5)}`;
const nextEmail = () => `phone${++n}-${tag}@example.in`;

class FakeChallenge extends ChallengeVerifier {
    override get configured(): boolean {
        return true;
    }
    override get siteKey(): string | null {
        return "site-key";
    }
    override verify(token: string | undefined): Promise<boolean> {
        return Promise.resolve(token === "ok");
    }
}

const transport = new FakeMessagingProvider();
const verification = new VerificationService();
const wallet = new WalletService();
const emails: { to: string; code: string }[] = [];

const send = new VerificationSendService(
    verification,
    wallet,
    new CatalogueService(new ImpactService()),
    new MessagingService(transport),
);
const ways = new SignInWaysService(send, verification);
const linking = new AccountLinkingService(new CustomerAccountRepository());
const alerts = new SiteCodeAlerts();
const codes = new SignInCodesService(
    linking,
    new SessionsService(),
    new SiteCodeDelivery(
        alerts,
        (to, details) => {
            emails.push({ to, code: details.code });
            return Promise.resolve("sent");
        },
        [0, 0],
    ),
    new FakeChallenge(),
    alerts,
    ways,
    new FixedWindowRateLimiter(1_000, 600_000),
    new FixedWindowRateLimiter(1_000, 600_000),
);
const phoneSignIn = new PhoneSignInService(
    codes,
    send,
    verification,
    ways,
    linking,
);
const api = new SignInController(codes, phoneSignIn);

let hosts = 0;
async function business(
    opts: { on?: boolean; balance?: number; approved?: boolean } = {},
) {
    hosts += 1;
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `phone-${tag}-${hosts}` },
    });
    // Approved by the owner in admin's Flags (DEC-196); off for everyone else.
    if (opts.approved !== false) {
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: "CUSTOMER_PHONE_CODES",
                organizationId: org.id,
                enabled: true,
            },
        });
    }
    const subdomain = `kaviph${hosts}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kavi Dental",
            slug: `phone-site-${tag}-${hosts}`,
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: { pages: [{ path: "/", sections: [] }] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    if (opts.on !== false) {
        await verification.setEnabled(org.id, "ACCOUNT", true);
    }
    if (opts.balance !== 0) await wallet.credit(org.id, opts.balance ?? 100);
    return { organizationId: org.id, host: `${subdomain}.saroh.app` };
}

let addresses = 0;
function relay(host: string, address?: string): SiteRelay {
    addresses += 1;
    const a = address ?? `203.0.113.${addresses % 250}`;
    return { host, address: a, clientHash: hashClientIp(a) ?? "" };
}

async function refusal(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        const e = error as HttpException;
        return {
            status: e.getStatus(),
            details: (e.getResponse() as { details?: Record<string, unknown> })
                .details,
        };
    }
    throw new Error("expected a refusal");
}

const lastCode = (phone: string) =>
    transport.sends.filter((s) => s.toE164 === phone).at(-1)?.code ?? "";
const wrong = (code: string) =>
    String((Number(code) + 1) % 1_000_000).padStart(6, "0");

/** A phone already on an email account: the account and how to reach it. */
async function accountWithPhone(host: string) {
    const phone = nextPhone();
    const email = nextEmail();
    await api.requestPhoneCode(relay(host), { phone, challenge: "ok" });
    const first = await api.verifyPhone(relay(host), {
        phone,
        code: lastCode(phone),
    });
    if (!("phoneProof" in first)) throw new Error("expected emailNeeded");
    await api.requestCode(relay(host), { email });
    await api.verify(relay(host), {
        email,
        code: emails.at(-1)?.code ?? "",
        phoneProof: first.phoneProof,
    });
    return { phone, email };
}

// These exercise the hidden paths for sends on a business's behalf (DEC-197).
beforeAll(() => {
    VerificationService.sendsForBusinesses = true;
});
afterAll(() => {
    VerificationService.sendsForBusinesses = false;
});

describe("site sign-in by WhatsApp code (DEC-196)", () => {
    beforeAll(async () => {
        await prisma.featureFlag.create({
            data: { key: "CUSTOMER_PHONE_CODES", enabledByDefault: false },
        });
        const catalog = fakeCatalog((c) => {
            c.messagePrices = { whatsapp: PRICE };
        });
        await writeCatalogueVersion(prisma, {
            version: 1,
            catalog,
            goLiveAt: new Date(Date.now() - 1000),
            policy: "keep",
            planRows: planRows(catalog, 1),
        });
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe("options", () => {
        it("offers WhatsApp only with the ACCOUNT module on and a balance that covers a code", async () => {
            const on = await business();
            const off = await business({ on: false });
            const empty = await business({ balance: 0 });
            const short = await business({ balance: PRICE - 1 });
            expect((await api.options(relay(on.host))).whatsapp).toBe(true);
            expect((await api.options(relay(off.host))).whatsapp).toBe(false);
            expect((await api.options(relay(empty.host))).whatsapp).toBe(false);
            expect((await api.options(relay(short.host))).whatsapp).toBe(false);
        });

        it("never offers or sends for a business the owner hasn't approved", async () => {
            const site = await business({ approved: false, on: false });
            // Its module was on before approval was needed: still nothing.
            await prisma.messagingVerificationSetting.create({
                data: {
                    organizationId: site.organizationId,
                    module: "ACCOUNT",
                    enabled: true,
                },
            });
            expect((await api.options(relay(site.host))).whatsapp).toBe(false);
            const phone = nextPhone();
            expect(
                await refusal(
                    api.requestPhoneCode(relay(site.host), {
                        phone,
                        challenge: "ok",
                    }),
                ),
            ).toMatchObject({
                status: 503,
                details: { reason: "unavailable" },
            });
            expect(lastCode(phone)).toBe("");
            expect(
                await refusal(
                    api.verifyPhone(relay(site.host), {
                        phone,
                        code: "123456",
                    }),
                ),
            ).toMatchObject({
                status: 503,
                details: { reason: "unavailable" },
            });
            // Email codes are not gated.
            await expect(
                api.requestCode(relay(site.host), { email: nextEmail() }),
            ).resolves.toMatchObject({ sent: true });
        });
    });

    it("request → held → sent → check → session, with a phone added to an email account", async () => {
        const { organizationId, host } = await business();
        const phone = nextPhone();
        const email = nextEmail();

        const sent = await api.requestPhoneCode(relay(host), {
            phone,
            challenge: "ok",
        });
        expect(sent).toEqual({
            sent: true,
            expiresInSeconds: 600,
            resendAfterSeconds: 30,
        });
        expect(lastCode(phone)).toMatch(/^\d{6}$/);
        expect(await wallet.get(organizationId)).toMatchObject({
            heldPaise: PRICE,
        });
        const row = await prisma.phoneVerification.findFirstOrThrow({
            where: { organizationId, phoneE164: phone },
        });
        expect(row).toMatchObject({ module: "ACCOUNT", status: "PENDING" });

        // No account holds the phone: the proof, then the email code.
        const first = await api.verifyPhone(relay(host), {
            phone,
            code: lastCode(phone),
        });
        expect(first).toMatchObject({ emailNeeded: true });
        if (!("phoneProof" in first)) throw new Error("expected a proof");
        await api.requestCode(relay(host), { email });
        const session = await api.verify(relay(host), {
            email,
            code: emails.at(-1)?.code ?? "",
            phoneProof: first.phoneProof,
        });
        const account = await prisma.customerAccount.findFirstOrThrow({
            where: { organizationId, email },
        });
        expect(account.phoneE164).toBe(phone);
        expect(account.phoneVerifiedAt).not.toBeNull();
        expect(
            await prisma.customerSession.findFirst({
                where: { tokenHash: hashSessionToken(session.token) },
                select: { accountId: true },
            }),
        ).toEqual({ accountId: account.id });

        // Next time the phone alone signs in to that account.
        await prisma.phoneVerification.updateMany({
            where: { phoneE164: phone },
            data: { createdAt: new Date(Date.now() - 60_000) },
        });
        await api.requestPhoneCode(relay(host), { phone, challenge: "ok" });
        const again = await api.verifyPhone(relay(host), {
            phone,
            code: lastCode(phone),
        });
        expect("token" in again).toBe(true);
        if (!("token" in again)) return;
        expect(
            await prisma.customerSession.findFirst({
                where: { tokenHash: hashSessionToken(again.token) },
                select: { accountId: true },
            }),
        ).toEqual({ accountId: account.id });
    });

    it("answers a request the same whether or not the phone has an account", async () => {
        const { host } = await business();
        const known = await accountWithPhone(host);
        const unknown = nextPhone();
        await prisma.phoneVerification.updateMany({
            where: { phoneE164: known.phone },
            data: { createdAt: new Date(Date.now() - 60_000) },
        });
        expect(
            await api.requestPhoneCode(relay(host), {
                phone: known.phone,
                challenge: "ok",
            }),
        ).toEqual(
            await api.requestPhoneCode(relay(host), {
                phone: unknown,
                challenge: "ok",
            }),
        );
    });

    it("refuses a wrong code with no session, and the right one still works", async () => {
        const { organizationId, host } = await business();
        const phone = nextPhone();
        await api.requestPhoneCode(relay(host), { phone, challenge: "ok" });
        const sessions = await prisma.customerSession.count({
            where: { organizationId },
        });
        expect(
            await refusal(
                api.verifyPhone(relay(host), {
                    phone,
                    code: wrong(lastCode(phone)),
                }),
            ),
        ).toMatchObject({ status: 400, details: { reason: "invalid" } });
        expect(
            await prisma.customerSession.count({ where: { organizationId } }),
        ).toBe(sessions);
        expect(
            await api.verifyPhone(relay(host), {
                phone,
                code: lastCode(phone),
            }),
        ).toMatchObject({ emailNeeded: true });
    });

    it("asks every request for the challenge", async () => {
        const { host } = await business();
        const phone = nextPhone();
        expect(
            await refusal(api.requestPhoneCode(relay(host), { phone })),
        ).toMatchObject({ status: 400, details: { reason: "challenge" } });
        expect(lastCode(phone)).toBe("");
    });

    it("refuses a number that isn't an Indian mobile", async () => {
        const { host } = await business();
        expect(
            await refusal(
                api.requestPhoneCode(relay(host), {
                    phone: "+14155550100",
                    challenge: "ok",
                }),
            ),
        ).toMatchObject({ status: 400, details: { field: "phone" } });
    });

    describe("abuse limits", () => {
        it("one code per number per 30 seconds: 429 limit, nothing sent", async () => {
            const { organizationId, host } = await business();
            const phone = nextPhone();
            await api.requestPhoneCode(relay(host), { phone, challenge: "ok" });
            const sends = transport.sends.length;
            const out = await refusal(
                api.requestPhoneCode(relay(host), { phone, challenge: "ok" }),
            );
            expect(out).toMatchObject({
                status: 429,
                details: { reason: "limit" },
            });
            expect(Number(out.details?.retryAfter)).toBeGreaterThan(0);
            expect(transport.sends.length).toBe(sends);
            expect(await wallet.get(organizationId)).toMatchObject({
                heldPaise: PRICE,
            });
        });

        it("ten codes an hour from one address", async () => {
            const { host } = await business({ balance: 1_000 });
            const address = "198.51.100.77";
            for (let i = 0; i < 10; i += 1) {
                await api.requestPhoneCode(relay(host, address), {
                    phone: nextPhone(),
                    challenge: "ok",
                });
            }
            expect(
                await refusal(
                    api.requestPhoneCode(relay(host, address), {
                        phone: nextPhone(),
                        challenge: "ok",
                    }),
                ),
            ).toMatchObject({ status: 429, details: { reason: "limit" } });
        });

        it("no balance: 503 unavailable, nothing sent", async () => {
            const { host } = await business({ balance: 0 });
            const phone = nextPhone();
            expect(
                await refusal(
                    api.requestPhoneCode(relay(host), {
                        phone,
                        challenge: "ok",
                    }),
                ),
            ).toMatchObject({
                status: 503,
                details: { reason: "unavailable" },
            });
            expect(lastCode(phone)).toBe("");
        });
    });

    it("a code from business A never signs in on business B", async () => {
        const a = await business();
        const b = await business();
        const { phone } = await accountWithPhone(a.host);
        // B has an account on the same phone too.
        await accountWithPhone(b.host).then(async (other) => {
            await prisma.customerAccount.updateMany({
                where: { organizationId: b.organizationId, email: other.email },
                data: { phoneE164: phone },
            });
        });
        await prisma.phoneVerification.updateMany({
            where: { phoneE164: phone },
            data: { createdAt: new Date(Date.now() - 60_000) },
        });
        await api.requestPhoneCode(relay(a.host), { phone, challenge: "ok" });
        const sessions = await prisma.customerSession.count({
            where: { organizationId: b.organizationId },
        });
        expect(
            await refusal(
                api.verifyPhone(relay(b.host), {
                    phone,
                    code: lastCode(phone),
                }),
            ),
        ).toMatchObject({ status: 400 });
        expect(
            await prisma.customerSession.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(sessions);
        // And A's proof adds nothing on B.
        const proofOnA = await (async () => {
            const p = nextPhone();
            await api.requestPhoneCode(relay(a.host), {
                phone: p,
                challenge: "ok",
            });
            const out = await api.verifyPhone(relay(a.host), {
                phone: p,
                code: lastCode(p),
            });
            return { p, proof: "phoneProof" in out ? out.phoneProof : "" };
        })();
        const email = nextEmail();
        await api.requestCode(relay(b.host), { email });
        await api.verify(relay(b.host), {
            email,
            code: emails.at(-1)?.code ?? "",
            phoneProof: proofOnA.proof,
        });
        expect(
            await prisma.customerAccount.findFirstOrThrow({
                where: { organizationId: b.organizationId, email },
                select: { phoneE164: true },
            }),
        ).toEqual({ phoneE164: null });
    });

    describe("no session without the server's check", () => {
        it("no code sent: 400 expired", async () => {
            const { host } = await business();
            expect(
                await refusal(
                    api.verifyPhone(relay(host), {
                        phone: nextPhone(),
                        code: "123456",
                    }),
                ),
            ).toMatchObject({ status: 400, details: { reason: "expired" } });
        });

        it("a code already used cannot be used again", async () => {
            const { host } = await business();
            const { phone } = await accountWithPhone(host);
            const code = lastCode(phone);
            expect(
                await refusal(api.verifyPhone(relay(host), { phone, code })),
            ).toMatchObject({ status: 400, details: { reason: "expired" } });
        });

        it("a forged proof adds no phone", async () => {
            const { organizationId, host } = await business();
            const email = nextEmail();
            const phone = nextPhone();
            await api.requestCode(relay(host), { email });
            await api.verify(relay(host), {
                email,
                code: emails.at(-1)?.code ?? "",
                phoneProof: `${phone}.${Date.now() + 600_000}.${"ab".repeat(32)}`,
            });
            expect(
                await prisma.customerAccount.findFirstOrThrow({
                    where: { organizationId, email },
                    select: { phoneE164: true },
                }),
            ).toEqual({ phoneE164: null });
        });

        it("the open verification endpoint refuses ACCOUNT codes", async () => {
            const { host } = await business();
            const open = new PublicVerificationsController(send, verification);
            expect(
                await refusal(
                    open.start(relay(host), {
                        module: "ACCOUNT",
                        phone: nextPhone(),
                    }),
                ),
            ).toMatchObject({ status: 400, details: { field: "module" } });
        });
    });

    describe("the business's ways and their order (DEC-196, unit 5)", () => {
        async function signInByPhone(host: string, phone: string) {
            await prisma.phoneVerification.updateMany({
                where: { phoneE164: phone },
                data: { createdAt: new Date(Date.now() - 60_000) },
            });
            await api.requestPhoneCode(relay(host), { phone, challenge: "ok" });
            const answer = await api.verifyPhone(relay(host), {
                phone,
                code: lastCode(phone),
            });
            if (!("token" in answer)) throw new Error("expected a session");
            return answer.token;
        }

        async function customerOf(host: string, token: string) {
            const site = await resolveSiteHost(host);
            const customer = await new SessionsService().resolve(token, site);
            if (!customer) throw new Error("expected a customer");
            return customer;
        }

        it("offers the ways in the business's order, WhatsApp first or email first", async () => {
            const site = await business();
            // Never chosen: email, then WhatsApp where it works (unit 3).
            expect(await api.options(relay(site.host))).toMatchObject({
                ways: ["EMAIL", "WHATSAPP"],
                phoneOnlySignUp: false,
                whatsapp: true,
            });
            await ways.set(site.organizationId, ["WHATSAPP", "EMAIL"]);
            expect(await api.options(relay(site.host))).toMatchObject({
                ways: ["WHATSAPP", "EMAIL"],
                phoneOnlySignUp: true,
            });
            await ways.set(site.organizationId, ["EMAIL"]);
            expect(await api.options(relay(site.host))).toMatchObject({
                ways: ["EMAIL"],
                whatsapp: false,
            });
            expect(await ways.view(site.organizationId)).toMatchObject({
                chosen: ["EMAIL"],
                chosenByBusiness: true,
            });
        });

        it("refuses email off while nothing else works, SMS, a repeat, and WhatsApp before approval", async () => {
            const off = await business({ on: false });
            expect(
                await refusal(ways.set(off.organizationId, ["WHATSAPP"])),
            ).toMatchObject({ status: 400, details: { code: "EMAIL_NEEDED" } });
            const broke = await business({ balance: 0 });
            expect(
                await refusal(ways.set(broke.organizationId, ["WHATSAPP"])),
            ).toMatchObject({ status: 400, details: { code: "EMAIL_NEEDED" } });
            // With email kept, WhatsApp can be chosen ahead of its balance.
            await expect(
                ways.set(broke.organizationId, ["WHATSAPP", "EMAIL"]),
            ).resolves.toMatchObject({ effective: ["EMAIL"] });
            expect(
                await refusal(ways.set(broke.organizationId, ["SMS", "EMAIL"])),
            ).toMatchObject({
                status: 400,
                details: { code: "SMS_NOT_AVAILABLE" },
            });
            expect(
                await refusal(
                    ways.set(broke.organizationId, ["EMAIL", "EMAIL"]),
                ),
            ).toMatchObject({ status: 400, details: { code: "REPEATED_WAY" } });
            expect(
                await refusal(ways.set(broke.organizationId, [])),
            ).toMatchObject({ status: 400, details: { code: "NO_WAYS" } });
            const unapproved = await business({ approved: false, on: false });
            expect(
                await refusal(
                    ways.set(unapproved.organizationId, ["EMAIL", "WHATSAPP"]),
                ),
            ).toMatchObject({
                status: 403,
                details: { code: "PHONE_CODES_NOT_APPROVED" },
            });
            // Nothing was saved by a refusal.
            expect(await ways.view(off.organizationId)).toMatchObject({
                chosenByBusiness: false,
            });
        });

        it("comes back to email on its own when approval is taken away", async () => {
            const site = await business();
            await ways.set(site.organizationId, ["WHATSAPP"]);
            expect((await api.options(relay(site.host))).ways).toEqual([
                "WHATSAPP",
            ]);
            // Email off: a new email gets the usual answer, and no code.
            const sentBefore = emails.length;
            await expect(
                api.requestCode(relay(site.host), { email: nextEmail() }),
            ).resolves.toMatchObject({ sent: true });
            expect(emails.length).toBe(sentBefore);

            await prisma.featureFlagOverride.updateMany({
                where: {
                    flagKey: "CUSTOMER_PHONE_CODES",
                    organizationId: site.organizationId,
                },
                data: { enabled: false },
            });
            expect(await api.options(relay(site.host))).toMatchObject({
                ways: ["EMAIL"],
                whatsapp: false,
            });
            await expect(
                api.requestCode(relay(site.host), { email: nextEmail() }),
            ).resolves.toMatchObject({ sent: true });
            // The business's choice is kept for when approval comes back.
            expect(await ways.view(site.organizationId)).toMatchObject({
                chosen: ["WHATSAPP"],
                effective: ["EMAIL"],
                ways: expect.arrayContaining([
                    { way: "WHATSAPP", usable: false, blocked: "NOT_APPROVED" },
                ]),
            });
        });

        it("comes back to email on its own when the balance runs out", async () => {
            const site = await business({ balance: PRICE });
            await ways.set(site.organizationId, ["WHATSAPP"]);
            await wallet.hold(site.organizationId, PRICE);
            expect((await api.options(relay(site.host))).ways).toEqual([
                "EMAIL",
            ]);
            expect(await ways.view(site.organizationId)).toMatchObject({
                ways: expect.arrayContaining([
                    { way: "WHATSAPP", usable: false, blocked: "NO_BALANCE" },
                ]),
            });
            await expect(
                api.requestCode(relay(site.host), { email: nextEmail() }),
            ).resolves.toMatchObject({ sent: true });
        });

        it("refuses a way the business turned off, on the server", async () => {
            const site = await business();
            await ways.set(site.organizationId, ["EMAIL"]);
            const phone = nextPhone();
            for (const call of [
                api.requestPhoneCode(relay(site.host), {
                    phone,
                    challenge: "ok",
                }),
                api.verifyPhone(relay(site.host), { phone, code: "123456" }),
            ]) {
                expect(await refusal(call)).toMatchObject({
                    status: 503,
                    details: { reason: "unavailable" },
                });
            }
            expect(lastCode(phone)).toBe("");
            await ways.set(site.organizationId, ["WHATSAPP"]);
            expect(
                await refusal(
                    api.verify(relay(site.host), {
                        email: nextEmail(),
                        code: "123456",
                    }),
                ),
            ).toMatchObject({ status: 400, details: { reason: "expired" } });
        });

        describe("with email off, an email-only account keeps email (DEC-196, Follow-ups)", () => {
            /** An account made by email while email was on, then email off. */
            async function emailOnlyAccount() {
                const site = await business();
                await ways.set(site.organizationId, ["EMAIL", "WHATSAPP"]);
                const email = nextEmail();
                await api.requestCode(relay(site.host), { email });
                await api.verify(relay(site.host), {
                    email,
                    code: emails.at(-1)?.code ?? "",
                });
                await ways.set(site.organizationId, ["WHATSAPP"]);
                return { site, email };
            }

            it("signs in an email-only account by email", async () => {
                const { site, email } = await emailOnlyAccount();
                const sentBefore = emails.length;
                await expect(
                    api.requestCode(relay(site.host), { email }),
                ).resolves.toMatchObject({ sent: true });
                expect(emails.length).toBe(sentBefore + 1);
                const session = await api.verify(relay(site.host), {
                    email,
                    code: emails.at(-1)?.code ?? "",
                });
                expect(session.token).toBeTruthy();
            });

            it("refuses a new email: the same answer, no code, no account", async () => {
                const { site } = await emailOnlyAccount();
                const email = nextEmail();
                const sentBefore = emails.length;
                await expect(
                    api.requestCode(relay(site.host), { email }),
                ).resolves.toEqual({
                    sent: true,
                    expiresInSeconds: expect.any(Number),
                    resendAfterSeconds: expect.any(Number),
                });
                expect(emails.length).toBe(sentBefore);
                expect(
                    await refusal(
                        api.verify(relay(site.host), {
                            email,
                            code: "123456",
                        }),
                    ),
                ).toMatchObject({
                    status: 400,
                    details: { reason: "expired" },
                });
                expect(
                    await prisma.customerAccount.count({
                        where: { organizationId: site.organizationId, email },
                    }),
                ).toBe(0);
            });

            it("refuses an account that has a phone, even with a code from before", async () => {
                const site = await business();
                // Never chose: a new phone is asked for an email.
                const { email } = await accountWithPhone(site.host);
                // A code asked for while email was still on.
                await api.requestCode(relay(site.host), { email });
                const code = emails.at(-1)?.code ?? "";
                await ways.set(site.organizationId, ["WHATSAPP"]);
                const sentBefore = emails.length;
                await expect(
                    api.requestCode(relay(site.host), { email }),
                ).resolves.toMatchObject({ sent: true });
                expect(emails.length).toBe(sentBefore);
                expect(
                    await refusal(
                        api.verify(relay(site.host), { email, code }),
                    ),
                ).toMatchObject({
                    status: 400,
                    details: { reason: "expired" },
                });
            });
        });

        it("signs up with a phone alone, and signs in to the same account again", async () => {
            const site = await business();
            await ways.set(site.organizationId, ["WHATSAPP", "EMAIL"]);
            const phone = nextPhone();
            const token = await signInByPhone(site.host, phone);
            const account = await prisma.customerAccount.findFirstOrThrow({
                where: {
                    organizationId: site.organizationId,
                    phoneE164: phone,
                },
                include: { contact: { select: { email: true, phone: true } } },
            });
            expect(account).toMatchObject({
                email: null,
                emailVerifiedAt: null,
                status: "ACTIVE",
            });
            expect(account.phoneVerifiedAt).not.toBeNull();
            expect(account.contact.email).toMatch(/@phone\.invalid$/);
            expect(account.contact.phone).toBe(phone);

            const customer = await customerOf(site.host, token);
            expect(customer.accountId).toBe(account.id);
            await expect(
                new SessionsService().describe(customer),
            ).resolves.toMatchObject({ email: null, signInPhone: phone });

            const again = await signInByPhone(site.host, phone);
            expect((await customerOf(site.host, again)).accountId).toBe(
                account.id,
            );
            expect(
                await prisma.customerAccount.count({
                    where: {
                        organizationId: site.organizationId,
                        phoneE164: phone,
                    },
                }),
            ).toBe(1);
        });

        it("lets a phone-only customer add an email with its code", async () => {
            const site = await business();
            await ways.set(site.organizationId, ["WHATSAPP"]);
            const phone = nextPhone();
            const customer = await customerOf(
                site.host,
                await signInByPhone(site.host, phone),
            );
            const told = jest.fn(() => Promise.resolve("sent" as const));
            const change = new EmailChangeService(codes, told);
            const email = nextEmail();
            await change.requestCode(customer, relay(site.host), { email });
            await expect(
                change.confirm(customer, relay(site.host), {
                    email,
                    code: emails.at(-1)?.code ?? "",
                }),
            ).resolves.toEqual({ done: true });
            const account = await prisma.customerAccount.findFirstOrThrow({
                where: { id: customer.accountId },
                include: { contact: { select: { email: true } } },
            });
            expect(account).toMatchObject({ email, phoneE164: phone });
            expect(account.emailVerifiedAt).not.toBeNull();
            // The phone placeholder gives way to the real address.
            expect(account.contact.email).toBe(email);
            // No old address to tell.
            expect(told).not.toHaveBeenCalled();
        });

        it("lets an email customer add a phone with its WhatsApp code", async () => {
            const site = await business();
            await ways.set(site.organizationId, ["EMAIL", "WHATSAPP"]);
            const email = nextEmail();
            await api.requestCode(relay(site.host), { email });
            const session = await api.verify(relay(site.host), {
                email,
                code: emails.at(-1)?.code ?? "",
            });
            const customer = await customerOf(site.host, session.token);
            const phone = nextPhone();
            await phoneSignIn.requestAddCode(customer, relay(site.host), {
                phone,
                challenge: "ok",
            });
            expect(
                await refusal(
                    phoneSignIn.confirmAdd(customer, relay(site.host), {
                        phone,
                        code: wrong(lastCode(phone)),
                    }),
                ),
            ).toMatchObject({ status: 400 });
            await expect(
                phoneSignIn.confirmAdd(customer, relay(site.host), {
                    phone,
                    code: lastCode(phone),
                }),
            ).resolves.toEqual({ done: true });
            expect(
                await prisma.customerAccount.findFirstOrThrow({
                    where: { id: customer.accountId },
                    select: { email: true, phoneE164: true },
                }),
            ).toEqual({ email, phoneE164: phone });
        });

        it("reads a phone-only account safely wherever its email was read", async () => {
            const site = await business();
            await ways.set(site.organizationId, ["WHATSAPP"]);
            const phone = nextPhone();
            const customer = await customerOf(
                site.host,
                await signInByPhone(site.host, phone),
            );
            const { organizationId, contactId } = customer;
            // No notice address: the placeholder is never one.
            await expect(
                contactNoticeAddress(prisma, organizationId, contactId),
            ).resolves.toBeNull();
            // The account's Me.
            await expect(
                new AccountHomeService().me(customer),
            ).resolves.toMatchObject({ email: null, signInPhone: phone });
            // Staff's view of the site account.
            const account = await prisma.customerAccount.findFirstOrThrow({
                where: { id: customer.accountId },
            });
            expect(
                toSiteAccountView(account, {
                    email: "phone+x@phone.invalid",
                    source: "site-account",
                }),
            ).toMatchObject({ email: null, phone, canUnlink: false });
            // A merge's words name the number.
            expect(maskSignIn(account)).toBe(
                `the number ending ${phone.slice(-4)}`,
            );
            // Privacy removal finds and removes it.
            await expect(
                theirAccounts(prisma, organizationId, contactId),
            ).resolves.toEqual([
                { id: account.id, email: null, phoneE164: phone },
            ]);
        });
    });
});
