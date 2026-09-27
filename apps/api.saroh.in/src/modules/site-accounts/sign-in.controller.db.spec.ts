/**
 * Site sign-in by email code through its controller, against a real
 * Postgres (round-2 plan A, A2; ADR-011, DEC-049): requesting and verifying
 * codes, every limit and who can fill it, the challenge, a send that fails,
 * the sender's name, account ↔ contact on a first sign-in, and what the
 * logs never see. The relay header itself is `site-relay.spec.ts`; here the
 * handlers are given the relay the guard would have checked.
 */
import { randomUUID } from "node:crypto";

import type { HttpException } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { hashClientIp } from "../../common/client-ip";
import type { EmailOutcome } from "../../common/email";
import { validationPipeOptions } from "../../common/validation";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { isReservedContactEmail } from "../contacts/contact-email";
import { AccountLinkingService } from "./account-linking.service";
import { ChallengeVerifier } from "./challenge";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { NEW_BUSINESS_CEILINGS } from "./code-limits";
import { CustomerAccountRepository } from "./customer-account.repository";
import { RequestCodeDto, VerifyCodeDto } from "./dto";
import { hashSessionToken, SessionsService } from "./sessions.service";
import {
    destinationHashFor,
    SignInCodesService,
    UNAVAILABLE_MESSAGE,
} from "./sign-in-codes.service";
import { SignInController } from "./sign-in.controller";
import type { SiteRelay } from "./site-relay";

const tag = `${process.pid}-${Date.now()}`;
let hosts = 0;

class FakeChallenge extends ChallengeVerifier {
    isConfigured = true;
    readonly verifyCalls: (string | undefined)[] = [];

    override get configured(): boolean {
        return this.isConfigured;
    }

    override get siteKey(): string | null {
        return this.isConfigured ? "site-key" : null;
    }

    override verify(token: string | undefined): Promise<boolean> {
        this.verifyCalls.push(token);
        return Promise.resolve(token === "ok");
    }
}

type Sent = { to: string; code: string; businessName: string };

function build(options: { addressLimit?: number; verifyLimit?: number } = {}) {
    const sent: Sent[] = [];
    let outcome: EmailOutcome = "sent";
    const sender = jest.fn(
        (to: string, details: { code: string; businessName: string }) => {
            if (outcome === "sent") {
                sent.push({
                    to,
                    code: details.code,
                    businessName: details.businessName,
                });
            }
            return Promise.resolve(outcome);
        },
    );
    const alerts = new SiteCodeAlerts();
    const challenge = new FakeChallenge();
    const service = new SignInCodesService(
        new AccountLinkingService(new CustomerAccountRepository()),
        new SessionsService(),
        new SiteCodeDelivery(alerts, sender, [0, 0]),
        challenge,
        alerts,
        new FixedWindowRateLimiter(options.addressLimit ?? 1_000, 600_000),
        new FixedWindowRateLimiter(options.verifyLimit ?? 1_000, 600_000),
    );
    return {
        api: new SignInController(service),
        sent,
        sender,
        alerts,
        challenge,
        failSends(next: EmailOutcome) {
            outcome = next;
        },
        lastCode: () => sent[sent.length - 1]?.code ?? "",
    };
}

async function business(
    input: { name?: string; phone?: string; published?: boolean } = {},
) {
    hosts += 1;
    const org = await prisma.organization.create({
        data: {
            name: input.name ?? "Kavi Dental",
            slug: `kavi-${tag}-${hosts}`,
        },
    });
    const subdomain = `kavi${hosts}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kavi Dental",
            slug: `site-${tag}-${hosts}`,
            subdomain,
        },
    });
    if (input.published !== false) {
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: org.id,
                snapshot: {
                    pages: [
                        {
                            path: "/",
                            sections: [
                                { type: "hero", content: {} },
                                {
                                    type: "contact",
                                    content: input.phone
                                        ? { phone: input.phone }
                                        : {},
                                },
                            ],
                        },
                    ],
                },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
    }
    return {
        organizationId: org.id,
        siteId: site.id,
        host: `${subdomain}.saroh.app`,
    };
}

function relay(host: string, address = "203.0.113.7"): SiteRelay {
    return { host, address, clientHash: hashClientIp(address) ?? "" };
}

let people = 0;
function email(): string {
    people += 1;
    return `person${people}-${tag}@example.in`;
}

async function refusal(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        const e = error as HttpException;
        return {
            status: e.getStatus(),
            body: e.getResponse() as {
                message: string;
                details?: Record<string, unknown>;
            },
        };
    }
    throw new Error("expected a refusal");
}

/** Put every code of this business `ms` further in the past. */
async function age(organizationId: string, ms: number) {
    const rows = await prisma.customerSignInCode.findMany({
        where: { organizationId },
        select: { id: true, createdAt: true, expiresAt: true },
    });
    for (const row of rows) {
        await prisma.customerSignInCode.update({
            where: { id: row.id },
            data: {
                createdAt: new Date(row.createdAt.getTime() - ms),
                expiresAt: new Date(row.expiresAt.getTime() - ms),
            },
        });
    }
}

/** Rows as if earlier requests had made them. */
async function pastCodes(
    organizationId: string,
    rows: {
        email?: string;
        address?: string;
        agoMs: number;
        newDestination?: boolean;
    }[],
) {
    await prisma.customerSignInCode.createMany({
        data: rows.map((row) => {
            const createdAt = new Date(Date.now() - row.agoMs);
            return {
                organizationId,
                destinationHash: destinationHashFor(
                    organizationId,
                    row.email ?? `other-${randomUUID()}@example.in`,
                ),
                codeHash: "0".repeat(64),
                clientHash: hashClientIp(row.address ?? "198.51.100.1"),
                newDestination: row.newDestination ?? false,
                createdAt,
                expiresAt: new Date(createdAt.getTime() + 600_000),
            };
        }),
    });
}

describe("site sign-in: request, then verify", () => {
    it("sends a code and trades it for a session; a new email gets an account", async () => {
        const t = build();
        const site = await business();
        const who = email();

        const asked = await t.api.requestCode(relay(site.host), { email: who });
        expect(asked).toEqual({
            sent: true,
            expiresInSeconds: 600,
            resendAfterSeconds: 30,
        });
        expect(t.sent).toHaveLength(1);
        expect(t.sent[0]?.to).toBe(who);
        expect(t.lastCode()).toMatch(/^\d{6}$/);

        const row = await prisma.customerSignInCode.findFirstOrThrow({
            where: { organizationId: site.organizationId },
        });
        expect(row.codeHash).not.toContain(t.lastCode());
        expect(row.destinationHash).not.toContain(who);
        expect(row.clientHash).toBe(hashClientIp("203.0.113.7"));
        expect(row.newDestination).toBe(true);

        const session = await t.api.verify(relay(site.host), {
            email: who.toUpperCase(),
            code: t.lastCode(),
        });
        expect(session.token.length).toBeGreaterThanOrEqual(43);
        const stored = await prisma.customerSession.findUniqueOrThrow({
            where: { tokenHash: hashSessionToken(session.token) },
            include: { account: { include: { contact: true } } },
        });
        expect(stored.siteId).toBe(site.siteId);
        expect(stored.organizationId).toBe(site.organizationId);
        expect(stored.expiresAt.toISOString()).toBe(session.expiresAt);
        expect(stored.account.email).toBe(who);
        expect(stored.account.contact.email).toBe(who);
        expect(stored.account.contact.emailVerifiedVia).toBe("SIGN_IN_CODE");
        expect(stored.account.contact.source).toBe("site-account");

        // The code is used up.
        expect(
            (
                await refusal(
                    t.api.verify(relay(site.host), {
                        email: who,
                        code: t.lastCode(),
                    }),
                )
            ).status,
        ).toBe(400);
    });

    it("signs a returning customer back in to the same account", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        await t.api.verify(relay(site.host), {
            email: who,
            code: t.lastCode(),
        });
        await age(site.organizationId, 60_000);
        await t.api.requestCode(relay(site.host), { email: who });
        await t.api.verify(relay(site.host), {
            email: who,
            code: t.lastCode(),
        });

        expect(
            await prisma.customerAccount.count({
                where: { organizationId: site.organizationId },
            }),
        ).toBe(1);
        expect(
            await prisma.customerSession.count({
                where: { organizationId: site.organizationId },
            }),
        ).toBe(2);
        const rows = await prisma.customerSignInCode.findMany({
            where: { organizationId: site.organizationId },
            orderBy: { createdAt: "asc" },
        });
        expect(rows.map((r) => r.newDestination)).toEqual([true, false]);
    });

    it("answers a known email exactly as it answers an unknown one", async () => {
        const t = build();
        const site = await business();
        const known = email();
        await t.api.requestCode(relay(site.host), { email: known });
        await t.api.verify(relay(site.host), {
            email: known,
            code: t.lastCode(),
        });
        await age(site.organizationId, 60_000);

        const forKnown = await t.api.requestCode(relay(site.host), {
            email: known,
        });
        const forUnknown = await t.api.requestCode(relay(site.host), {
            email: email(),
        });
        expect(forKnown).toEqual(forUnknown);
    });

    it("resolves a verified custom domain to its site", async () => {
        const t = build();
        const site = await business();
        const hostname = `book-${tag}.kavi-dental.in`;
        await prisma.domain.create({
            data: {
                organizationId: site.organizationId,
                hostname,
                siteId: site.siteId,
                status: "VERIFIED",
                verificationToken: "t",
            },
        });
        const who = email();
        await t.api.requestCode(relay(hostname), { email: who });
        const session = await t.api.verify(relay(hostname), {
            email: who,
            code: t.lastCode(),
        });
        const stored = await prisma.customerSession.findUniqueOrThrow({
            where: { tokenHash: hashSessionToken(session.token) },
        });
        expect(stored.siteId).toBe(site.siteId);
    });
});

describe("site sign-in: the visitor's own limits", () => {
    it("refuses a resend inside 30 seconds and says when", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        const again = await refusal(
            t.api.requestCode(relay(site.host), { email: who }),
        );
        expect(again.status).toBe(429);
        expect(again.body.details).toMatchObject({ reason: "limit" });
        expect(again.body.details?.retryAfter).toBeGreaterThan(0);
        expect(again.body.details?.retryAfter).toBeLessThanOrEqual(30);
        expect(again.body.message).toMatch(/^Try again in \d+ seconds$/);
        expect(t.sent).toHaveLength(1);
    });

    it("refuses the 6th code in an hour from one address", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await pastCodes(
            site.organizationId,
            [50, 40, 30, 20, 10].map((m) => ({
                email: who,
                address: "203.0.113.7",
                agoMs: m * 60_000,
            })),
        );
        const sixth = await refusal(
            t.api.requestCode(relay(site.host), { email: who }),
        );
        expect(sixth.status).toBe(429);
        expect(sixth.body.details).toMatchObject({
            reason: "limit",
            retryAfter: 10 * 60,
        });
        expect(sixth.body.message).toBe("Try again in 10 minutes");
    });

    it("counts the relayed address, not the caller: another visitor is not held up", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host, "203.0.113.7"), {
            email: who,
        });
        await expect(
            t.api.requestCode(relay(site.host, "198.51.100.44"), {
                email: who,
            }),
        ).resolves.toMatchObject({ sent: true });
    });

    it("meets a busy address with the challenge, never a refusal, and counts it per business (review A-2)", async () => {
        const t = build({ addressLimit: 2 });
        const site = await business();
        const other = await business();
        await t.api.requestCode(relay(site.host), { email: email() });
        await t.api.requestCode(relay(site.host), { email: email() });
        const third = await refusal(
            t.api.requestCode(relay(site.host), { email: email() }),
        );
        expect(third.status).toBe(400);
        expect(third.body.details).toMatchObject({ reason: "challenge" });
        await expect(
            t.api.requestCode(relay(site.host), {
                email: email(),
                challenge: "ok",
            }),
        ).resolves.toMatchObject({ sent: true });
        // Someone on another address is untouched.
        await expect(
            t.api.requestCode(relay(site.host, "198.51.100.9"), {
                email: email(),
            }),
        ).resolves.toMatchObject({ sent: true });
        // The same address on another business's site is untouched too.
        await expect(
            t.api.requestCode(relay(other.host), { email: email() }),
        ).resolves.toMatchObject({ sent: true });
    });

    it("counts verify tries per email: another customer on the same address can still sign in (review A-2)", async () => {
        const t = build({ verifyLimit: 3 });
        const site = await business();
        const guessed = email();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: guessed });
        await t.api.requestCode(relay(site.host), { email: who });
        const code = t.lastCode();
        for (let i = 0; i < 3; i += 1) {
            await refusal(
                t.api.verify(relay(site.host), {
                    email: guessed,
                    code: "000000",
                }),
            );
        }
        const fourth = await refusal(
            t.api.verify(relay(site.host), { email: guessed, code: "000000" }),
        );
        expect(fourth.status).toBe(429);
        await expect(
            t.api.verify(relay(site.host), { email: who, code }),
        ).resolves.toHaveProperty("token");
    });

    it("kills the old code when a new one is sent", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        const first = t.lastCode();
        await age(site.organizationId, 31_000);
        await t.api.requestCode(relay(site.host), { email: who });
        const second = t.lastCode();
        const retired = await prisma.customerSignInCode.count({
            where: {
                organizationId: site.organizationId,
                retiredAt: { not: null },
            },
        });
        expect(retired).toBe(1);
        if (first !== second) {
            expect(
                (
                    await refusal(
                        t.api.verify(relay(site.host), {
                            email: who,
                            code: first,
                        }),
                    )
                ).status,
            ).toBe(400);
        }
        await expect(
            t.api.verify(relay(site.host), { email: who, code: second }),
        ).resolves.toHaveProperty("token");
    });
});

describe("site sign-in: limits someone else can fill never refuse", () => {
    it("asks a returning customer for the challenge exactly as a new email, so it never tells who has an account (review A-1)", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        await t.api.verify(relay(site.host), {
            email: who,
            code: t.lastCode(),
        });
        await age(site.organizationId, 60_000);
        await pastCodes(
            site.organizationId,
            Array.from(
                { length: NEW_BUSINESS_CEILINGS.newDestinationsPerHour / 2 },
                () => ({ agoMs: 60_000, newDestination: true }),
            ),
        );

        const known = await refusal(
            t.api.requestCode(relay(site.host), { email: who }),
        );
        const unknown = await refusal(
            t.api.requestCode(relay(site.host), { email: email() }),
        );
        expect(known).toEqual(unknown);
        expect(known.body.details).toMatchObject({ reason: "challenge" });
        await expect(
            t.api.requestCode(relay(site.host), {
                email: who,
                challenge: "ok",
            }),
        ).resolves.toMatchObject({ sent: true });
    });

    it("asks a new email for the challenge past half the ceiling; still sends past all of it, and alerts", async () => {
        const t = build();
        const site = await business();
        const half = NEW_BUSINESS_CEILINGS.newDestinationsPerHour / 2;
        await pastCodes(
            site.organizationId,
            Array.from({ length: half }, () => ({
                agoMs: 60_000,
                newDestination: true,
            })),
        );

        const missing = await refusal(
            t.api.requestCode(relay(site.host), { email: email() }),
        );
        expect(missing.status).toBe(400);
        expect(missing.body.details).toMatchObject({
            reason: "challenge",
            siteKey: "site-key",
        });
        const failed = await refusal(
            t.api.requestCode(relay(site.host), {
                email: email(),
                challenge: "bad",
            }),
        );
        expect(failed.status).toBe(400);
        await expect(
            t.api.requestCode(relay(site.host), {
                email: email(),
                challenge: "ok",
            }),
        ).resolves.toMatchObject({ sent: true });

        await pastCodes(
            site.organizationId,
            Array.from({ length: half }, () => ({
                agoMs: 60_000,
                newDestination: true,
            })),
        );
        const errors = jest.spyOn(process.stderr, "write");
        try {
            await expect(
                t.api.requestCode(relay(site.host, "198.51.100.3"), {
                    email: email(),
                    challenge: "ok",
                }),
            ).resolves.toMatchObject({ sent: true });
            const lines = errors.mock.calls.map((c) => String(c[0]));
            expect(
                lines.some((l) => l.includes("site_codes_ceiling_passed")),
            ).toBe(true);
        } finally {
            errors.mockRestore();
        }
    });

    it("never strands a customer when no challenge is configured", async () => {
        const t = build();
        t.challenge.isConfigured = false;
        const site = await business();
        await pastCodes(
            site.organizationId,
            Array.from(
                { length: NEW_BUSINESS_CEILINGS.newDestinationsPerHour },
                () => ({ agoMs: 60_000, newDestination: true }),
            ),
        );
        await expect(
            t.api.requestCode(relay(site.host), { email: email() }),
        ).resolves.toMatchObject({ sent: true });
    });

    it("the 21st code for one email in a day, over many addresses, waits and needs the challenge — never refused", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await pastCodes(
            site.organizationId,
            Array.from({ length: 20 }, (_, i) => ({
                email: who,
                address: `198.51.100.${i + 10}`,
                agoMs: (i + 3) * 60_000,
            })),
        );

        // The real customer, on a fresh address: a wait, never a refusal.
        const early = await refusal(
            t.api.requestCode(relay(site.host, "203.0.113.200"), {
                email: who,
            }),
        );
        expect(early.status).toBe(429);
        expect(early.body.details).toMatchObject({ reason: "wait" });
        expect(early.body.details?.retryAfter).toBeLessThanOrEqual(600);

        // Ten minutes after the last code: it goes, with the challenge.
        await age(site.organizationId, 7 * 60_000);
        const unchallenged = await refusal(
            t.api.requestCode(relay(site.host, "203.0.113.200"), {
                email: who,
            }),
        );
        expect(unchallenged.body.details).toMatchObject({
            reason: "challenge",
        });
        await expect(
            t.api.requestCode(relay(site.host, "203.0.113.200"), {
                email: who,
                challenge: "ok",
            }),
        ).resolves.toMatchObject({ sent: true });
        expect(t.sent.map((s) => s.to)).toEqual([who]);
    });
});

describe("site sign-in: when the code can't be sent", () => {
    it("tries three times, answers 503 unavailable, alerts, and leaves no live code", async () => {
        const t = build();
        const site = await business();
        t.failSends("failed");
        const before = t.alerts.failuresInWindow();
        const errors = jest.spyOn(process.stderr, "write");
        let answer: Awaited<ReturnType<typeof refusal>>;
        try {
            answer = await refusal(
                t.api.requestCode(relay(site.host), { email: email() }),
            );
            expect(
                errors.mock.calls.some((c) =>
                    String(c[0]).includes("site_code_send_failed"),
                ),
            ).toBe(true);
        } finally {
            errors.mockRestore();
        }
        expect(answer.status).toBe(503);
        expect(answer.body).toEqual({
            message: UNAVAILABLE_MESSAGE,
            details: { reason: "unavailable" },
        });
        expect(t.sender).toHaveBeenCalledTimes(3);
        expect(t.alerts.failuresInWindow()).toBe(before + 1);
        expect(
            await prisma.customerSignInCode.count({
                where: { organizationId: site.organizationId },
            }),
        ).toBe(0);
    });

    it("keeps the customer's last good code when a resend can't be sent", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        const good = t.lastCode();
        await age(site.organizationId, 31_000);
        t.failSends("failed");
        expect(
            (await refusal(t.api.requestCode(relay(site.host), { email: who })))
                .status,
        ).toBe(503);
        await expect(
            t.api.verify(relay(site.host), { email: who, code: good }),
        ).resolves.toHaveProperty("token");
    });

    it("has no public phone to give yet, so the sheet shows the try-again line alone", async () => {
        const t = build();
        // A phone in the site's Contact block is not the business's public
        // phone field, which doesn't exist yet (businessPublicPhone).
        const site = await business({ phone: "+91 98200 12345" });
        await expect(t.api.options(relay(site.host))).resolves.toEqual({
            businessName: "Kavi Dental",
            phone: null,
            challenge: { required: false, siteKey: "site-key" },
        });
    });

    it("tells the sheet up front when the challenge is likely", async () => {
        const t = build();
        const site = await business();
        await pastCodes(
            site.organizationId,
            Array.from(
                { length: NEW_BUSINESS_CEILINGS.newDestinationsPerHour / 2 },
                () => ({ agoMs: 60_000, newDestination: true }),
            ),
        );
        await expect(t.api.options(relay(site.host))).resolves.toMatchObject({
            challenge: { required: true, siteKey: "site-key" },
        });
    });
});

describe("site sign-in: the sender", () => {
    it("cleans the business's name before it names the email", async () => {
        const t = build();
        const site = await business({ name: "Bank Alert www.example.com\n" });
        await t.api.requestCode(relay(site.host), { email: email() });
        const name = t.sent[0]?.businessName ?? "";
        expect(name).toBe("Bank Alert");
        expect(name).not.toMatch(/[\r\n]|www|example/);
        expect(name.length).toBeLessThanOrEqual(40);
    });
});

describe("site sign-in: wrong, old and refused", () => {
    it("kills a code after 5 wrong tries, even for the right code after", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        const right = t.lastCode();
        const wrong = right === "000000" ? "111111" : "000000";
        const reasons: unknown[] = [];
        for (let i = 0; i < 5; i += 1) {
            const r = await refusal(
                t.api.verify(relay(site.host), { email: who, code: wrong }),
            );
            expect(r.status).toBe(400);
            reasons.push(r.body.details?.reason);
        }
        expect(reasons).toEqual([
            "invalid",
            "invalid",
            "invalid",
            "invalid",
            "expired",
        ]);
        const after = await refusal(
            t.api.verify(relay(site.host), { email: who, code: right }),
        );
        expect(after.body.details).toEqual({ reason: "expired" });
    });

    it("needs the challenge for an email's next code once its codes were guessed at 25 times today, and alerts (review A-3)", async () => {
        const t = build();
        const site = await business();
        const who = email();
        // Five codes, each tried five times and never used: 25 wrong tries.
        await pastCodes(
            site.organizationId,
            Array.from({ length: 5 }, (_, i) => ({
                email: who,
                address: `198.51.100.${i + 20}`,
                agoMs: (i + 2) * 60 * 60_000,
            })),
        );
        await prisma.customerSignInCode.updateMany({
            where: {
                organizationId: site.organizationId,
                destinationHash: destinationHashFor(site.organizationId, who),
            },
            data: { attempts: 5 },
        });

        const errors = jest.spyOn(process.stderr, "write");
        try {
            const r = await refusal(
                t.api.requestCode(relay(site.host), { email: who }),
            );
            expect(r.status).toBe(400);
            expect(r.body.details).toMatchObject({ reason: "challenge" });
            const lines = errors.mock.calls.map((c) => String(c[0]));
            expect(lines.some((l) => l.includes("failed-tries"))).toBe(true);
        } finally {
            errors.mockRestore();
        }
        await expect(
            t.api.requestCode(relay(site.host), {
                email: who,
                challenge: "ok",
            }),
        ).resolves.toMatchObject({ sent: true });
        // Another email at the same business is untouched.
        await expect(
            t.api.requestCode(relay(site.host), { email: email() }),
        ).resolves.toMatchObject({ sent: true });
    });

    it("does not count a used code's right try as a wrong one (review A-3)", async () => {
        const t = build();
        const site = await business();
        const who = email();
        // Six codes, each used on its fifth try: 24 wrong tries, 30 in all.
        await pastCodes(
            site.organizationId,
            Array.from({ length: 6 }, (_, i) => ({
                email: who,
                address: `198.51.100.${i + 40}`,
                agoMs: (i + 2) * 60 * 60_000,
            })),
        );
        await prisma.customerSignInCode.updateMany({
            where: {
                organizationId: site.organizationId,
                destinationHash: destinationHashFor(site.organizationId, who),
            },
            data: { attempts: 5, consumedAt: new Date() },
        });
        await expect(
            t.api.requestCode(relay(site.host), { email: who }),
        ).resolves.toMatchObject({ sent: true });
    });

    it("refuses an expired code", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host), { email: who });
        await age(site.organizationId, 11 * 60_000);
        const r = await refusal(
            t.api.verify(relay(site.host), { email: who, code: t.lastCode() }),
        );
        expect(r.status).toBe(400);
        expect(r.body.details).toEqual({ reason: "expired" });
    });

    it("sends nothing for a suspended business (403)", async () => {
        const t = build();
        const site = await business();
        await prisma.organization.update({
            where: { id: site.organizationId },
            data: { lifecycleStatus: "SUSPENDED" },
        });
        expect(
            (
                await refusal(
                    t.api.requestCode(relay(site.host), { email: email() }),
                )
            ).status,
        ).toBe(403);
        expect(t.sender).not.toHaveBeenCalled();
    });

    it("answers 404 for an unknown or unpublished host", async () => {
        const t = build();
        const draft = await business({ published: false });
        for (const host of ["nobody-here.saroh.app", draft.host, "localhost"]) {
            expect(
                (
                    await refusal(
                        t.api.requestCode(relay(host), { email: email() }),
                    )
                ).status,
            ).toBe(404);
        }
        expect(t.sender).not.toHaveBeenCalled();
    });

    it("refuses a body with a phone, a channel, a host or a business (400)", async () => {
        const pipe = new ValidationPipe(validationPipeOptions);
        const who = email();
        for (const extra of [
            { phone: "+919820012345" },
            { channel: "sms" },
            { host: "pulse.saroh.app" },
            { organizationId: "org_1" },
        ]) {
            await expect(
                pipe.transform(
                    { email: who, ...extra },
                    { type: "body", metatype: RequestCodeDto },
                ),
            ).rejects.toMatchObject({ status: 400 });
        }
        await expect(
            pipe.transform(
                { email: who, code: "123456", phone: "+91" },
                { type: "body", metatype: VerifyCodeDto },
            ),
        ).rejects.toMatchObject({ status: 400 });
        await expect(
            pipe.transform(
                { email: ` ${who.toUpperCase()} ` },
                { type: "body", metatype: RequestCodeDto },
            ),
        ).resolves.toMatchObject({ email: who });
    });
});

describe("site sign-in: who a first sign-in is (DEC-049)", () => {
    it("links to a contact whose email is verified", async () => {
        const t = build();
        const site = await business();
        const who = email();
        const farah = await prisma.contact.create({
            data: {
                organizationId: site.organizationId,
                email: who,
                firstName: "Farah",
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
        await t.api.requestCode(relay(site.host), { email: who });
        await t.api.verify(relay(site.host), {
            email: who,
            code: t.lastCode(),
        });
        const account = await prisma.customerAccount.findFirstOrThrow({
            where: { organizationId: site.organizationId, email: who },
        });
        expect(account.contactId).toBe(farah.id);
    });

    it("makes a separate contact when the one holding the email is unverified", async () => {
        const t = build();
        const site = await business();
        const who = email();
        const typed = await prisma.contact.create({
            data: { organizationId: site.organizationId, email: who },
        });
        await t.api.requestCode(relay(site.host), { email: who });
        await t.api.verify(relay(site.host), {
            email: who,
            code: t.lastCode(),
        });
        const account = await prisma.customerAccount.findFirstOrThrow({
            where: { organizationId: site.organizationId, email: who },
            include: { contact: true },
        });
        expect(account.contactId).not.toBe(typed.id);
        expect(isReservedContactEmail(account.contact.email)).toBe(true);
        expect(account.contact.email).toBe(
            `account+${account.contactId}@account.invalid`,
        );
        const unchanged = await prisma.contact.findUniqueOrThrow({
            where: { id: typed.id },
        });
        expect(unchanged.emailVerifiedAt).toBeNull();
        expect(unchanged.email).toBe(who);
    });

    it("opens no session for an email a merge retired, and names the survivor masked", async () => {
        const t = build();
        const site = await business();
        const survivorEmail = `farah-${tag}@example.in`;
        const retiredEmail = email();
        const repo = new CustomerAccountRepository();
        const survivorContact = await prisma.contact.create({
            data: { organizationId: site.organizationId, email: survivorEmail },
        });
        const retiredContact = await prisma.contact.create({
            data: { organizationId: site.organizationId, email: retiredEmail },
        });
        const survivor = await repo.create({
            organizationId: site.organizationId,
            contactId: survivorContact.id,
            email: survivorEmail,
            verifiedAt: new Date(),
        });
        const retired = await repo.create({
            organizationId: site.organizationId,
            contactId: retiredContact.id,
            email: retiredEmail,
            verifiedAt: new Date(),
        });
        await prisma.customerAccount.update({
            where: { id: retired.id },
            data: { status: "MERGED", mergedIntoId: survivor.id },
        });

        await t.api.requestCode(relay(site.host), { email: retiredEmail });
        const r = await refusal(
            t.api.verify(relay(site.host), {
                email: retiredEmail,
                code: t.lastCode(),
            }),
        );
        expect(r.status).toBe(409);
        expect(r.body.details).toEqual({
            reason: "merged",
            signsInAs: "f…@example.in",
        });
        expect(
            await prisma.customerSession.count({
                where: { organizationId: site.organizationId },
            }),
        ).toBe(0);
    });

    it("makes one contact and one account for two first sign-ins at once", async () => {
        const t = build();
        const site = await business();
        const who = email();
        await t.api.requestCode(relay(site.host, "203.0.113.1"), {
            email: who,
        });
        const a = t.lastCode();
        await age(site.organizationId, 31_000);
        // Two live codes: make the first live again beside the second.
        await t.api.requestCode(relay(site.host, "203.0.113.2"), {
            email: who,
        });
        const b = t.lastCode();
        await prisma.customerSignInCode.updateMany({
            where: { organizationId: site.organizationId },
            data: { retiredAt: null },
        });
        await Promise.allSettled([
            t.api.verify(relay(site.host), { email: who, code: b }),
            t.api.verify(relay(site.host), { email: who, code: a }),
        ]);
        expect(
            await prisma.contact.count({
                where: { organizationId: site.organizationId },
            }),
        ).toBe(1);
        expect(
            await prisma.customerAccount.count({
                where: { organizationId: site.organizationId },
            }),
        ).toBe(1);
    });
});

describe("site sign-in: what the logs never see", () => {
    it("logs neither the code, the email nor the visitor's address", async () => {
        const t = build();
        const site = await business();
        const who = email();
        const address = "203.0.113.99";
        const lines: string[] = [];
        const out = jest
            .spyOn(process.stdout, "write")
            .mockImplementation((chunk) => {
                lines.push(String(chunk));
                return true;
            });
        const err = jest
            .spyOn(process.stderr, "write")
            .mockImplementation((chunk) => {
                lines.push(String(chunk));
                return true;
            });
        try {
            await t.api.requestCode(relay(site.host, address), { email: who });
            const code = t.lastCode();
            await t.api.verify(relay(site.host, address), { email: who, code });
            await age(site.organizationId, 31_000);
            t.failSends("failed");
            await refusal(
                t.api.requestCode(relay(site.host, address), { email: who }),
            );
            expect(lines.some((l) => l.includes("site_code_send_failed"))).toBe(
                true,
            );
            for (const line of lines) {
                expect(line).not.toContain(who);
                expect(line).not.toContain(code);
                expect(line).not.toContain(address);
            }
        } finally {
            out.mockRestore();
            err.mockRestore();
        }
    });
});
