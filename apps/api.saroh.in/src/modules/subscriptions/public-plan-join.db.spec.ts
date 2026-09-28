/**
 * Joining a plan online end to end against a real Postgres (round-2 G20;
 * ADR-011), through the HTTP routes with the real session guard and the
 * signed relay: the signed-in start that makes a DRAFT SUBSCRIPTION invoice
 * with the plan's terms and its intent, the success webhook that starts the
 * subscription and numbers the invoice, a webhook delivered twice, the
 * merchant changing the plan while the customer pays, the fourth open join,
 * the draft discarded after a day (and a late payment owed back), the desk
 * putting them on the plan meanwhile, and the refusals — no provider,
 * Payments off or not rolled out, a draft plan, already on it, another
 * customer's payment.
 *
 * The provider and the webhook verifier are the network-free fakes; only
 * the credential key is added to the env. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => {
    const actual = jest.requireActual<typeof import("../../env")>("../../env");
    return {
        ...actual,
        env: {
            ...actual.env,
            PAYMENTS_ENC_KEY:
                "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        },
    };
});

import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { ReleaseHoldsHandler } from "../bookings/release-holds.handler";
import { InvoicesService } from "../invoices/invoices.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import {
    SiteCodeAlerts,
    SiteCodeDelivery,
} from "../site-accounts/code-delivery";
import { CUSTOMER_SESSION_HEADER } from "../site-accounts/customer-session.guard";
import { SiteAccountsModule } from "../site-accounts/site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "../site-accounts/site-relay";
import { siteRelaySecret } from "../site-accounts/site-secrets";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { AccountPlanJoinController } from "./account-plan-join.controller";
import { PLAN_JOIN_DISCARDED_REASON } from "./plan-join";
import {
    alreadyOnPlan,
    ASK_ABOUT_JOINING,
    PublicPlanJoinService,
    TOO_MANY_OPEN_JOINS,
} from "./public-plan-join.service";

const WEBHOOK_SECRET = "whsec_g20_joins";
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const sweep = new ReleaseHoldsHandler();
const OWNER = { userId: "u_owner", role: "OWNER" } as const;

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;
const originalSwitch = env.SITE_ACCOUNT_AREA;

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: "MODULE_PAYMENTS" },
        create: { key: "MODULE_PAYMENTS", enabledByDefault: false },
        update: {},
    });
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [AccountPlanJoinController],
        providers: [
            {
                provide: PublicPlanJoinService,
                // Generous: these tests start many times from one account.
                useValue: new PublicPlanJoinService(
                    payments,
                    new FixedWindowRateLimiter(1_000),
                ),
            },
        ],
    })
        .overrideProvider(SiteCodeDelivery)
        .useFactory({
            factory: (alerts: SiteCodeAlerts) =>
                new SiteCodeDelivery(
                    alerts,
                    (to, details) => {
                        sent.push({ to, code: details.code });
                        return Promise.resolve("sent");
                    },
                    [0, 0],
                ),
            inject: [SiteCodeAlerts],
        })
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
});

beforeEach(() => {
    env.SITE_ACCOUNT_AREA = "on";
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Studio {
    organizationId: string;
    host: string;
    planId: string;
}

/**
 * A studio whose published site sells a monthly plan at 2,500.00 with 8
 * classes a month: Payments rolled out and on, and Razorpay connected —
 * unless asked otherwise.
 */
async function studio(
    over: {
        provider?: boolean;
        paymentsOn?: boolean;
        rolledOut?: boolean;
    } = {},
): Promise<Studio> {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `g20-${next()}` },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "MODULE_PAYMENTS",
            organizationId: org.id,
            enabled: over.rolledOut !== false,
        },
    });
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "PAYMENTS",
            status: over.paymentsOn === false ? "DISABLED" : "ENABLED",
        },
    });
    const plan = await prisma.subscriptionPlan.create({
        data: {
            organizationId: org.id,
            name: "Monthly unlimited",
            price: "2500.00",
            currency: "INR",
            interval: "MONTH",
            classesPerMonth: 8,
            status: "ACTIVE",
        },
    });
    const subdomain = `g20x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Pulse Fitness",
            slug: `g20-site-${next()}`,
            subdomain,
        },
    });
    const publication = await prisma.publication.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            snapshot: { pages: [] },
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });
    if (over.provider !== false) {
        await payments.connectProvider(
            { organizationId: org.id, ...OWNER },
            {
                provider: "RAZORPAY",
                publicKey: "rzp_test_G20",
                keyId: "rzp_test_G20",
                keySecret: "rzp_secret",
                webhookSecret: WEBHOOK_SECRET,
            },
        );
    }
    return {
        organizationId: org.id,
        host: `${subdomain}.saroh.app`,
        planId: plan.id,
    };
}

async function call(
    method: string,
    path: string,
    input: { host?: string; token?: string; body?: unknown } = {},
) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (input.host) {
        headers[SITE_RELAY_HEADER] = signSiteRelay(
            { address: "203.0.113.20", host: input.host },
            siteRelaySecret(),
        );
    }
    if (input.token) headers[CUSTOMER_SESSION_HEADER] = input.token;
    if (input.body) headers["content-type"] = "application/json";
    const res = await fetch(`${url}${path}`, {
        method,
        headers,
        body: input.body ? JSON.stringify(input.body) : undefined,
    });
    const text = await res.text();
    return {
        status: res.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a test reads the answer loosely
        body: (text ? JSON.parse(text) : null) as any,
    };
}

/** Sign in through the real routes: ask for a code, then trade it. */
async function signIn(host: string) {
    const who = `member-${next()}@example.in`;
    await call("POST", "/public/site-accounts/codes", {
        host,
        body: { email: who },
    });
    const code = sent.filter((s) => s.to === who).at(-1)?.code;
    const verified = await call("POST", "/public/site-accounts/sessions", {
        host,
        body: { email: who, code },
    });
    expect(verified.status).toBe(201);
    const account = await prisma.customerAccount.findFirstOrThrow({
        where: { email: who },
    });
    return { token: verified.body.token as string, account, email: who };
}

const PLANS = "/public/site-accounts/me/plans";

function join(s: Studio, token: string, planId = s.planId, key?: string) {
    return call("POST", `${PLANS}/${planId}/join`, {
        host: s.host,
        token,
        body: { idempotencyKey: key ?? `key-${next()}` },
    });
}

let eventSeq = 0;
/** A signed success webhook for the fake verifier; each call is new. */
async function paid(
    organizationId: string,
    providerIntentId: string,
    eventId = `evt_g20_${tag}_${++eventSeq}`,
) {
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: eventId,
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId,
            providerPaymentRef: `pay_${eventId}`,
        }),
    );
    return webhooks.handle("razorpay", organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

describe("joining a plan online", () => {
    it("pays for a draft with no number, and the webhook starts the subscription and numbers it", async () => {
        const s = await studio();
        const { token, account, email } = await signIn(s.host);

        const started = await join(s, token, s.planId, "tab-1");
        expect(started.status).toBe(201);
        expect(started.body).toMatchObject({
            plan: { name: "Monthly unlimited", interval: "MONTH" },
            total: "2500.00",
            currency: "INR",
            payment: {
                provider: "RAZORPAY",
                amountCents: 250000,
                currency: "INR",
                publicKey: "rzp_test_G20",
            },
        });
        const ref = started.body.ref as string;

        const draft = await prisma.invoice.findUniqueOrThrow({
            where: { id: ref },
        });
        expect(draft).toMatchObject({
            status: "DRAFT",
            source: "SUBSCRIPTION",
            number: null,
            subscriptionId: null,
            contactId: account.contactId,
            billToEmail: email,
            planTerms: {
                planId: s.planId,
                name: "Monthly unlimited",
                price: "2500.00",
                currency: "INR",
                interval: "MONTH",
                classesPerMonth: 8,
                accountId: account.id,
            },
        });
        // Nobody is on the plan until they pay.
        expect(
            await prisma.customerSubscription.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
        // Not the business's paper yet: the invoice list leaves it out.
        const list = await new InvoicesService().list(
            { organizationId: s.organizationId, ...OWNER },
            {},
        );
        expect(list.map((i) => i.id)).not.toContain(ref);

        // The same key replays the same intent.
        const again = await join(s, token, s.planId, "tab-1");
        expect(again.body.ref).toBe(ref);
        expect(again.body.payment.paymentIntentId).toBe(
            started.body.payment.paymentIntentId,
        );
        const waiting = await call("GET", `${PLANS}/joins/${ref}`, {
            host: s.host,
            token,
        });
        expect(waiting.body).toEqual({
            state: "paying",
            plan: { name: "Monthly unlimited" },
        });

        expect(
            await paid(s.organizationId, started.body.payment.providerIntentId),
        ).toEqual({ status: "processed", changed: true });

        const invoice = await prisma.invoice.findUniqueOrThrow({
            where: { id: ref },
            include: { lines: true },
        });
        expect(invoice).toMatchObject({
            status: "PAID",
            number: expect.stringMatching(/\S/),
            paymentMethod: "ONLINE",
            subscriptionId: expect.any(String),
        });
        expect(invoice.lines.map((l) => l.description)).toEqual([
            expect.stringMatching(/^Monthly unlimited · \d+ \w+/),
        ]);
        const sub = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: invoice.subscriptionId ?? "" },
            include: { events: true },
        });
        expect(sub).toMatchObject({
            planId: s.planId,
            contactId: account.contactId,
            status: "ACTIVE",
            currency: "INR",
            interval: "MONTH",
            timezone: "Asia/Kolkata",
            classesPerPeriod: 8,
            createdByUserId: null,
        });
        expect(sub.price.toString()).toBe("2500");
        expect(invoice.periodStart).toEqual(sub.currentPeriodStart);
        expect(invoice.periodEnd).toEqual(sub.currentPeriodEnd);
        expect(sub.events).toEqual([
            expect.objectContaining({
                kind: "SUBSCRIBED",
                actorKind: "CUSTOMER",
                customerAccountId: account.id,
                invoiceId: ref,
            }),
        ]);

        const joined = await call("GET", `${PLANS}/joins/${ref}`, {
            host: s.host,
            token,
        });
        expect(joined.body).toEqual({
            state: "joined",
            plan: { name: "Monthly unlimited" },
        });
        // On it now: joining again is refused, in words.
        const twice = await join(s, token);
        expect(twice.status).toBe(409);
        expect(twice.body.error).toMatchObject({
            message: alreadyOnPlan("Monthly unlimited"),
            details: { reason: "already-on" },
        });
    });

    it("a webhook delivered twice starts one subscription", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await join(s, token);
        const eventId = `evt_twice_${next()}`;
        await paid(
            s.organizationId,
            started.body.payment.providerIntentId,
            eventId,
        );
        expect(
            await paid(
                s.organizationId,
                started.body.payment.providerIntentId,
                eventId,
            ),
        ).toEqual({ status: "duplicate", changed: false });
        await paid(s.organizationId, started.body.payment.providerIntentId);
        expect(
            await prisma.customerSubscription.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(1);
    });

    it("joins on the terms shown when paying started, though the merchant changed the plan", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await join(s, token);

        await prisma.subscriptionPlan.update({
            where: { id: s.planId },
            data: { price: "3000.00", classesPerMonth: 4, status: "ARCHIVED" },
        });
        await paid(s.organizationId, started.body.payment.providerIntentId);

        const sub = await prisma.customerSubscription.findFirstOrThrow({
            where: { organizationId: s.organizationId },
        });
        expect(sub.price.toString()).toBe("2500");
        expect(sub.classesPerPeriod).toBe(8);
    });

    it("starts again on the new terms when the plan changed before paying", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const first = await join(s, token);
        await prisma.subscriptionPlan.update({
            where: { id: s.planId },
            data: { price: "2800.00" },
        });

        const second = await join(s, token);

        expect(second.body.ref).not.toBe(first.body.ref);
        expect(second.body.total).toBe("2800.00");
        const old = await prisma.invoice.findUniqueOrThrow({
            where: { id: first.body.ref },
        });
        expect(old.status).toBe("VOID");
        expect(old.number).toBeNull();
    });

    it("reuses a waiting join for the same plan, and refuses a fourth plan", async () => {
        const s = await studio();
        const others = await Promise.all(
            ["Weekly", "Quarterly", "Yearly"].map((name, i) =>
                prisma.subscriptionPlan.create({
                    data: {
                        organizationId: s.organizationId,
                        name,
                        price: `${1000 + i}.00`,
                        currency: "INR",
                        interval: "MONTH",
                        status: "ACTIVE",
                    },
                }),
            ),
        );
        const { token } = await signIn(s.host);

        const a = await join(s, token);
        expect((await join(s, token)).body.ref).toBe(a.body.ref);
        expect((await join(s, token, others[0].id)).status).toBe(201);
        expect((await join(s, token, others[1].id)).status).toBe(201);

        const fourth = await join(s, token, others[2].id);
        expect(fourth.status).toBe(409);
        expect(fourth.body.error).toMatchObject({
            message: TOO_MANY_OPEN_JOINS,
            details: { reason: "too-many" },
        });
        expect(
            await prisma.invoice.count({
                where: {
                    organizationId: s.organizationId,
                    source: "SUBSCRIPTION",
                },
            }),
        ).toBe(3);
    });

    it("the desk putting them on the plan meanwhile: nobody joins twice, and the payment is owed back", async () => {
        const s = await studio();
        const { token, account } = await signIn(s.host);
        const started = await join(s, token);
        await prisma.customerSubscription.create({
            data: {
                organizationId: s.organizationId,
                contactId: account.contactId as string,
                planId: s.planId,
                price: "2500.00",
                currency: "INR",
                interval: "MONTH",
                timezone: "Asia/Kolkata",
                anchorAt: new Date(),
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
            },
        });

        await paid(s.organizationId, started.body.payment.providerIntentId);

        expect(
            await prisma.customerSubscription.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(1);
        const draft = await prisma.invoice.findUniqueOrThrow({
            where: { id: started.body.ref as string },
        });
        expect(draft.status).toBe("DRAFT");
        const attempt = await prisma.paymentAttempt.findFirstOrThrow({
            where: {
                organizationId: s.organizationId,
                status: "CAPTURED_NEEDS_REFUND",
            },
        });
        expect(attempt.status).toBe("CAPTURED_NEEDS_REFUND");
        expect(attempt.rawResponse).toEqual({
            invoiceStatus: "PLAN_NOT_JOINED",
        });
    });

    it("discards a join nobody paid within a day, and owes back a payment that lands after", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        const started = await join(s, token);
        const ref = started.body.ref as string;

        // Not yet a day: kept.
        await sweep.discardPlanJoins(new Date(Date.now() + 23 * 3_600_000));
        expect(
            (await prisma.invoice.findUniqueOrThrow({ where: { id: ref } }))
                .status,
        ).toBe("DRAFT");

        await sweep.discardPlanJoins(new Date(Date.now() + 25 * 3_600_000));
        const voided = await prisma.invoice.findUniqueOrThrow({
            where: { id: ref },
        });
        expect(voided).toMatchObject({
            status: "VOID",
            number: null,
            voidReason: PLAN_JOIN_DISCARDED_REASON,
        });
        const closed = await call("GET", `${PLANS}/joins/${ref}`, {
            host: s.host,
            token,
        });
        expect(closed.body.state).toBe("closed");

        await paid(s.organizationId, started.body.payment.providerIntentId);
        expect(
            await prisma.customerSubscription.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
        const attempt = await prisma.paymentAttempt.findFirstOrThrow({
            where: {
                organizationId: s.organizationId,
                status: "CAPTURED_NEEDS_REFUND",
            },
        });
        expect(attempt.status).toBe("CAPTURED_NEEDS_REFUND");
    });
});

describe("what joining refuses", () => {
    it("asks about joining, and starts nothing, with no provider", async () => {
        const s = await studio({ provider: false });
        const { token } = await signIn(s.host);
        const refused = await join(s, token);
        expect(refused.status).toBe(409);
        expect(refused.body.error).toMatchObject({
            message: ASK_ABOUT_JOINING,
            details: { reason: "ask" },
        });
        expect(
            await prisma.invoice.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
    });

    it("is a plan that isn't there while Payments is off or not rolled out (DEC-057)", async () => {
        for (const over of [{ paymentsOn: false }, { rolledOut: false }]) {
            const s = await studio(over);
            const { token } = await signIn(s.host);
            expect((await join(s, token)).status).toBe(404);
        }
    });

    it("refuses a draft plan, an archived plan and another business's plan as not found", async () => {
        const s = await studio();
        const elsewhere = await studio();
        const [draft, archived] = await Promise.all(
            ["DRAFT", "ARCHIVED"].map((status) =>
                prisma.subscriptionPlan.create({
                    data: {
                        organizationId: s.organizationId,
                        name: status,
                        price: "100.00",
                        currency: "INR",
                        interval: "MONTH",
                        status,
                    },
                }),
            ),
        );
        const { token } = await signIn(s.host);
        for (const id of [draft.id, archived.id, elsewhere.planId]) {
            expect((await join(s, token, id)).status).toBe(404);
        }
        expect(
            await prisma.invoice.count({
                where: { organizationId: s.organizationId },
            }),
        ).toBe(0);
    });

    it("takes no amount and no way to pay from the request", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        for (const extra of [{ amount: 1 }, { autopay: true }]) {
            const tampered = await call("POST", `${PLANS}/${s.planId}/join`, {
                host: s.host,
                token,
                body: { idempotencyKey: "k", ...extra },
            });
            expect(tampered.status).toBe(400);
        }
    });

    it("is behind the account area's switch and the session", async () => {
        const s = await studio();
        const { token } = await signIn(s.host);
        expect(
            (
                await call("POST", `${PLANS}/${s.planId}/join`, {
                    host: s.host,
                    body: { idempotencyKey: "k" },
                })
            ).status,
        ).toBe(401);
        env.SITE_ACCOUNT_AREA = "off";
        expect((await join(s, token)).status).toBe(404);
    });

    it("never shows another customer's join", async () => {
        const s = await studio();
        const asha = await signIn(s.host);
        const ravi = await signIn(s.host);
        const started = await join(s, asha.token);
        const peek = await call("GET", `${PLANS}/joins/${started.body.ref}`, {
            host: s.host,
            token: ravi.token,
        });
        expect(peek.status).toBe(404);
    });
});
