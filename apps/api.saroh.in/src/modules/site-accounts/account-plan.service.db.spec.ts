/**
 * The account's Plan tab over HTTP against a real Postgres (round-2 plan A,
 * A8; ADR-011): a member's plans and packs, and pause (weeks only), resume,
 * cancel at the period's end and "Pay now" on their own plan — each found by
 * id and the signed-in customer's contact, each recorded in the
 * subscription's log (D9) as the customer.
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { InvoicesService } from "../invoices/invoices.service";
import { listSubscriptionEvents } from "../subscriptions/subscription-events";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { AccountPlanController } from "./account-plan.controller";
import {
    AccountPlanService,
    AUTOPAY_CHARGE_PENDING,
} from "./account-plan.service";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const sent: { to: string; code: string }[] = [];
const subscriptions = new SubscriptionsService(new InvoicesService());
/** Invoices an autopay charge is under way on (D13's check, stubbed). */
const charging = new Set<string>();
let app: INestApplication;
let url: string;
const originalSwitch = env.SITE_ACCOUNT_AREA;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [AccountPlanController],
        providers: [
            AccountPlanService,
            { provide: SubscriptionsService, useValue: subscriptions },
            {
                provide: AUTOPAY_CHARGE_PENDING,
                useValue: (_org: string, invoiceId: string) =>
                    Promise.resolve(charging.has(invoiceId)),
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
    charging.clear();
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Business {
    staff: OrganizationContext;
    host: string;
    planId: string;
}

/** A gym with a published site and a monthly plan of 8 classes. */
async function business(name = "Pulse Fitness"): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: `a8-${next()}` },
    });
    const subdomain = `a8x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `a8-site-${next()}`,
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
    const staff: OrganizationContext = {
        organizationId: org.id,
        userId: "user_owner",
        role: "OWNER",
    };
    const plan = await subscriptions.createPlan(staff, {
        name: "Monthly 8",
        price: "2500",
        currency: "INR",
        interval: "MONTH",
        classesPerMonth: 8,
    });
    return { staff, host: `${subdomain}.saroh.app`, planId: plan.id };
}

async function call(
    method: string,
    path: string,
    input: { host?: string; token?: string; body?: unknown } = {},
) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (input.host) {
        headers[SITE_RELAY_HEADER] = signSiteRelay(
            { address: "203.0.113.9", host: input.host },
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
    return { token: verified.body.token as string, account };
}

/** A signed-in member on the business's plan. */
async function member(biz: Business) {
    const signed = await signIn(biz.host);
    const sub = await subscriptions.subscribe(biz.staff, {
        contactId: signed.account.contactId,
        planId: biz.planId,
    });
    return { ...signed, subscriptionId: sub.id };
}

const PLAN = "/public/site-accounts/me/plan";

function eventsOf(subscriptionId: string) {
    return prisma.subscriptionEvent.findMany({
        where: { subscriptionId, kind: { not: "SUBSCRIBED" } },
        orderBy: { createdAt: "asc" },
    });
}

async function makeOverdue(subscriptionId: string): Promise<string> {
    const invoice = await prisma.invoice.findFirstOrThrow({
        where: { subscriptionId, status: "ISSUED" },
    });
    await prisma.invoice.update({
        where: { id: invoice.id },
        data: { dueAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    return invoice.id;
}

async function connectProvider(organizationId: string): Promise<void> {
    await prisma.merchantPaymentProvider.create({
        data: {
            organizationId,
            provider: "RAZORPAY",
            encryptedCredentials: "x",
            credentialsIv: "x",
            credentialsAuthTag: "x",
        },
    });
}

describe("the Plan tab", () => {
    it("shows the plan, its price, next renewal and classes left, and the Plan tab in the bar", async () => {
        const biz = await business();
        const m = await member(biz);

        const tab = await call("GET", PLAN, { host: biz.host, token: m.token });
        expect(tab.status).toBe(200);
        expect(tab.body.pauseWeeks).toEqual([2, 4, 8]);
        expect(tab.body.subscriptions.ok).toBe(true);
        const [plan] = tab.body.subscriptions.value;
        expect(plan).toMatchObject({
            ref: m.subscriptionId,
            name: "Monthly 8",
            price: "2500.00",
            currency: "INR",
            interval: "MONTH",
            status: "ACTIVE",
            classes: { perMonth: 8, left: 8 },
            payNow: null,
            canPause: true,
            canResume: false,
            canCancel: true,
        });
        expect(plan.renewsAt).toEqual(expect.any(String));
        expect(tab.body.packs).toEqual({ ok: true, value: [] });

        const me = await call("GET", "/public/site-accounts/me", {
            host: biz.host,
            token: m.token,
        });
        expect(me.body.tabs.map((t: { key: string }) => t.key)).toEqual([
            "home",
            "plan",
            "messages",
            "me",
        ]);
    });

    it("lists packs not yet expired, a used-up one marked so, and a draft plan never opens the tab", async () => {
        const biz = await business("Rye Studio");
        // Only a draft plan on offer: no Plan tab for someone with nothing.
        await prisma.subscriptionPlan.updateMany({
            where: { organizationId: biz.staff.organizationId },
            data: { status: "DRAFT" },
        });
        const m = await signIn(biz.host);
        const tabs = async () =>
            (
                await call("GET", "/public/site-accounts/me", {
                    host: biz.host,
                    token: m.token,
                })
            ).body.tabs.map((t: { key: string }) => t.key);
        expect(await tabs()).toEqual(["home", "messages", "me"]);

        const pack = await prisma.classPack.create({
            data: {
                organizationId: biz.staff.organizationId,
                name: "5 classes",
                credits: 5,
                validityDays: 60,
                price: "1500",
                currency: "INR",
            },
        });
        const bought = (days: number, credits: number) =>
            prisma.packPurchase.create({
                data: {
                    organizationId: biz.staff.organizationId,
                    packId: pack.id,
                    contactId: m.account.contactId,
                    credits,
                    price: "1500",
                    currency: "INR",
                    expiresAt: new Date(Date.now() + days * 86_400_000),
                },
            });
        await bought(30, 5);
        await bought(10, 0);
        await bought(-1, 5); // expired: not listed

        // A pack of their own opens the tab.
        expect(await tabs()).toEqual(["home", "plan", "messages", "me"]);
        const tab = await call("GET", PLAN, { host: biz.host, token: m.token });
        expect(tab.body.subscriptions).toEqual({ ok: true, value: [] });
        expect(tab.body.packs.value).toEqual([
            expect.objectContaining({
                name: "5 classes",
                left: 0,
                live: false,
            }),
            expect.objectContaining({ name: "5 classes", left: 5, live: true }),
        ]);
    });

    it("is a 404 while the account area is switched off", async () => {
        const biz = await business();
        const m = await member(biz);
        env.SITE_ACCOUNT_AREA = "off";
        expect(
            (await call("GET", PLAN, { host: biz.host, token: m.token }))
                .status,
        ).toBe(404);
        expect(
            (
                await call("POST", `${PLAN}/${m.subscriptionId}/pause`, {
                    host: biz.host,
                    token: m.token,
                    body: { weeks: 4 },
                })
            ).status,
        ).toBe(404);
    });
});

describe("pause, resume and cancel from the account", () => {
    it("pauses for 4 weeks, recorded as the customer, and Subscription Detail shows it", async () => {
        const biz = await business();
        const m = await member(biz);

        const res = await call("POST", `${PLAN}/${m.subscriptionId}/pause`, {
            host: biz.host,
            token: m.token,
            body: { weeks: 4 },
        });
        expect(res.status).toBe(200);
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: m.subscriptionId },
        });
        const expected = DateTime.now()
            .setZone(row.timezone)
            .startOf("day")
            .plus({ weeks: 4 });
        expect(row.status).toBe("PAUSED");
        expect(row.pausedUntil?.toISOString()).toBe(
            expected.toUTC().toJSDate().toISOString(),
        );
        expect(res.body.message).toBe(
            `Paused until ${expected.toFormat("d LLL yyyy")}. Nothing is charged till then.`,
        );
        expect(res.body.tab.subscriptions.value[0]).toMatchObject({
            status: "PAUSED",
            pausedUntil: row.pausedUntil?.toISOString(),
            canPause: false,
            canResume: true,
        });

        const [paused] = await eventsOf(m.subscriptionId);
        expect(paused).toMatchObject({
            kind: "PAUSED",
            actorKind: "CUSTOMER",
            actorUserId: null,
            customerAccountId: m.account.id,
            data: { until: row.pausedUntil?.toISOString() },
        });
        // The workspace's log reads it as the customer, never a team member.
        const page = await listSubscriptionEvents(
            biz.staff.organizationId,
            m.subscriptionId,
            { showInvoices: false },
        );
        expect(page.events[0]).toMatchObject({
            kind: "PAUSED",
            actor: { kind: "CUSTOMER", userId: null, name: null },
        });
    });

    it("takes weeks only: 2, 4 or 8 — never a date or an open-ended pause", async () => {
        const biz = await business();
        const m = await member(biz);
        const path = `${PLAN}/${m.subscriptionId}/pause`;
        for (const body of [
            { weeks: 3 },
            { weeks: 4, until: "2027-01-01" },
            { until: "2027-01-01" },
            {},
        ]) {
            const res = await call("POST", path, {
                host: biz.host,
                token: m.token,
                body,
            });
            expect(res.status).toBe(400);
        }
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: m.subscriptionId },
        });
        expect(row.status).toBe("ACTIVE");
        expect(await eventsOf(m.subscriptionId)).toEqual([]);
    });

    it("resumes a pause, recorded as the customer", async () => {
        const biz = await business();
        const m = await member(biz);
        const opts = { host: biz.host, token: m.token };
        await call("POST", `${PLAN}/${m.subscriptionId}/pause`, {
            ...opts,
            body: { weeks: 2 },
        });
        const res = await call(
            "POST",
            `${PLAN}/${m.subscriptionId}/resume`,
            opts,
        );
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/^Resumed\. Your next payment is on /);
        expect(res.body.tab.subscriptions.value[0]).toMatchObject({
            status: "ACTIVE",
            pausedUntil: null,
        });
        const kinds = (await eventsOf(m.subscriptionId)).map((e) => [
            e.kind,
            e.actorKind,
        ]);
        expect(kinds).toEqual([
            ["PAUSED", "CUSTOMER"],
            ["RESUMED", "CUSTOMER"],
        ]);
        // Resuming what isn't paused says so.
        const again = await call(
            "POST",
            `${PLAN}/${m.subscriptionId}/resume`,
            opts,
        );
        expect(again.status).toBe(409);
    });

    it("cancels at the period's end; a second cancel is a no-op that says so", async () => {
        const biz = await business();
        const m = await member(biz);
        const opts = { host: biz.host, token: m.token };
        const first = await call(
            "POST",
            `${PLAN}/${m.subscriptionId}/cancel`,
            opts,
        );
        expect(first.status).toBe(200);
        expect(first.body.message).toMatch(/^Cancelled\. You keep it until /);
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: m.subscriptionId },
        });
        expect(row).toMatchObject({
            status: "ACTIVE",
            cancelAtPeriodEnd: true,
        });
        expect(first.body.tab.subscriptions.value[0]).toMatchObject({
            canCancel: false,
            endsAt: row.currentPeriodEnd.toISOString(),
        });

        const second = await call(
            "POST",
            `${PLAN}/${m.subscriptionId}/cancel`,
            opts,
        );
        expect(second.status).toBe(200);
        expect(second.body.message).toMatch(
            /^Your plan is already set to end on .+\. Nothing more is charged\.$/,
        );
        const events = await eventsOf(m.subscriptionId);
        expect(events.map((e) => [e.kind, e.actorKind])).toEqual([
            ["CANCEL_SCHEDULED", "CUSTOMER"],
        ]);
    });

    it("with pausing turned off: no pause offered, and a pause post is a 403", async () => {
        const biz = await business();
        const m = await member(biz);
        await subscriptions.updateSettings(biz.staff, {
            membersCanPause: false,
        });
        const opts = { host: biz.host, token: m.token };
        const tab = await call("GET", PLAN, opts);
        expect(tab.body.pauseWeeks).toEqual([]);
        expect(tab.body.subscriptions.value[0].canPause).toBe(false);

        const res = await call("POST", `${PLAN}/${m.subscriptionId}/pause`, {
            ...opts,
            body: { weeks: 4 },
        });
        expect(res.status).toBe(403);
        expect(res.body.error.message).toBe(
            "Pausing from your account is off. Ask the business to pause your plan.",
        );
        expect(await eventsOf(m.subscriptionId)).toEqual([]);
        // Cancel still works.
        expect(
            (await call("POST", `${PLAN}/${m.subscriptionId}/cancel`, opts))
                .status,
        ).toBe(200);
    });

    it("another customer's subscription in the same business is a 404 for pause, resume, cancel and pay", async () => {
        const biz = await business();
        const owner = await member(biz);
        const other = await signIn(biz.host);
        const opts = { host: biz.host, token: other.token };
        for (const [action, body] of [
            ["pause", { weeks: 4 }],
            ["resume", undefined],
            ["cancel", undefined],
            ["pay", undefined],
        ] as const) {
            const res = await call(
                "POST",
                `${PLAN}/${owner.subscriptionId}/${action}`,
                { ...opts, body },
            );
            expect(res.status).toBe(404);
        }
        // Even with pausing off, it stays a 404, not a 403.
        await subscriptions.updateSettings(biz.staff, {
            membersCanPause: false,
        });
        expect(
            (
                await call("POST", `${PLAN}/${owner.subscriptionId}/pause`, {
                    ...opts,
                    body: { weeks: 4 },
                })
            ).status,
        ).toBe(404);
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: owner.subscriptionId },
        });
        expect(row).toMatchObject({
            status: "ACTIVE",
            cancelAtPeriodEnd: false,
        });
        expect(await eventsOf(owner.subscriptionId)).toEqual([]);
        // And the other customer's tab doesn't list it.
        const tab = await call("GET", PLAN, opts);
        expect(tab.body.subscriptions.value).toEqual([]);
    });

    it("with Payments off, pause and cancel still work and Pay now is hidden", async () => {
        const biz = await business();
        const m = await member(biz);
        await makeOverdue(m.subscriptionId);
        await connectProvider(biz.staff.organizationId);
        await prisma.organizationModule.create({
            data: {
                organizationId: biz.staff.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        const opts = { host: biz.host, token: m.token };
        const tab = await call("GET", PLAN, opts);
        expect(tab.body.subscriptions.value[0].payNow).toBeNull();
        expect(
            (await call("POST", `${PLAN}/${m.subscriptionId}/pay`, opts))
                .status,
        ).toBe(409);
        expect(
            (
                await call("POST", `${PLAN}/${m.subscriptionId}/pause`, {
                    ...opts,
                    body: { weeks: 8 },
                })
            ).status,
        ).toBe(200);
        expect(
            (await call("POST", `${PLAN}/${m.subscriptionId}/cancel`, opts))
                .status,
        ).toBe(200);
        // Paused, a cancel ends it now: nothing is running to let run out.
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: m.subscriptionId },
        });
        expect(row.status).toBe("CANCELLED");
    });

    it("won't restart a plan past its paid period while Payments is off, in the customer's words", async () => {
        const biz = await business();
        const m = await member(biz);
        const past = new Date(Date.now() - 86_400_000);
        await prisma.customerSubscription.update({
            where: { id: m.subscriptionId },
            data: {
                status: "PAUSED",
                pausedAt: new Date(Date.now() - 40 * 86_400_000),
                currentPeriodEnd: past,
            },
        });
        await prisma.organizationModule.create({
            data: {
                organizationId: biz.staff.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        const res = await call("POST", `${PLAN}/${m.subscriptionId}/resume`, {
            host: biz.host,
            token: m.token,
        });
        expect(res.status).toBe(409);
        expect(res.body.error.message).toBe(
            "Your plan can't restart online just now. Ask the business to restart it for you.",
        );
    });
});

describe("Pay now", () => {
    it("an overdue invoice shows Pay now, and pressing it makes a new link, recorded as the customer", async () => {
        const biz = await business();
        const m = await member(biz);
        const invoiceId = await makeOverdue(m.subscriptionId);
        await connectProvider(biz.staff.organizationId);
        const opts = { host: biz.host, token: m.token };

        const tab = await call("GET", PLAN, opts);
        expect(tab.body.subscriptions.value[0].payNow).toEqual({
            total: expect.any(String),
            currency: "INR",
            dueAt: expect.any(String),
        });
        // The invoice's id never reaches the customer.
        expect(JSON.stringify(tab.body)).not.toContain(invoiceId);

        const before = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        const res = await call("POST", `${PLAN}/${m.subscriptionId}/pay`, opts);
        expect(res.status).toBe(200);
        expect(res.body.url).toMatch(/\/pay\/[^/]+$/);
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        expect(after.payTokenHash).not.toBeNull();
        expect(after.payTokenHash).not.toBe(before.payTokenHash);
        // A second press makes another: the customer never sees an old one.
        const again = await call(
            "POST",
            `${PLAN}/${m.subscriptionId}/pay`,
            opts,
        );
        expect(again.body.url).not.toBe(res.body.url);

        const retried = (await eventsOf(m.subscriptionId)).filter(
            (e) => e.kind === "RETRIED",
        );
        expect(retried).toHaveLength(2);
        expect(retried[0]).toMatchObject({
            actorKind: "CUSTOMER",
            customerAccountId: m.account.id,
            invoiceId,
        });
    });

    it("while an autopay charge is under way: no Pay now, and a pay-link request is a 409", async () => {
        const biz = await business();
        const m = await member(biz);
        const invoiceId = await makeOverdue(m.subscriptionId);
        await connectProvider(biz.staff.organizationId);
        charging.add(invoiceId);
        const opts = { host: biz.host, token: m.token };

        const tab = await call("GET", PLAN, opts);
        expect(tab.body.subscriptions.value[0].payNow).toBeNull();
        const res = await call("POST", `${PLAN}/${m.subscriptionId}/pay`, opts);
        expect(res.status).toBe(409);
        expect(res.body.error.message).toBe("Autopay charge in progress");
        const row = await prisma.invoice.findUniqueOrThrow({
            where: { id: invoiceId },
        });
        expect(row.payTokenHash).toBeNull();
    });

    it("nothing overdue, or no provider connected: no Pay now, and a request is a 409", async () => {
        const biz = await business();
        const m = await member(biz);
        const opts = { host: biz.host, token: m.token };
        expect(
            (await call("POST", `${PLAN}/${m.subscriptionId}/pay`, opts))
                .status,
        ).toBe(409);
        await makeOverdue(m.subscriptionId);
        const tab = await call("GET", PLAN, opts);
        expect(tab.body.subscriptions.value[0].payNow).toBeNull();
        expect(
            (await call("POST", `${PLAN}/${m.subscriptionId}/pay`, opts))
                .status,
        ).toBe(409);
    });
});
