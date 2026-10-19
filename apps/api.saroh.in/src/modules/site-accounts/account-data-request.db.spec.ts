/**
 * "Ask to remove my data" from the customer's account, over HTTP against a
 * real Postgres (DEC-172, #1106; site templates v2 plan, U13): asking,
 * asking again, reading it, no session, another business, the limits on
 * asking again, and the acknowledgement email's job — sent once, retried
 * when it fails. Nothing is deleted when they ask.
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Runs in the
 * integration project (TEST_DATABASE_URL), plain and with `TEST_RLS=on`.
 */
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { AuditAction } from "../audit/audit.service";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import {
    ASKS_PER_WINDOW,
    NEW_REQUESTS_PER_DAY,
} from "./account-data-request.service";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import {
    DATA_REQUEST_EMAIL_TYPE,
    DataRequestEmailHandler,
    dataRequestEventKey,
} from "./data-request-email.handler";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;
const originalSwitch = env.SITE_ACCOUNT_AREA;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
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

/** A business with a published site. */
async function business(name: string) {
    const org = await prisma.organization.create({
        data: { name, slug: `dr-${next()}` },
    });
    const subdomain = `drx${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `dr-site-${next()}`,
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
    return { organizationId: org.id, host: `${subdomain}.saroh.app` };
}

async function call(
    method: string,
    path: string,
    input: { host?: string; token?: string } = {},
) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (input.host) {
        headers[SITE_RELAY_HEADER] = signSiteRelay(
            { address: "203.0.113.9", host: input.host },
            siteRelaySecret(),
        );
    }
    if (input.token) headers[CUSTOMER_SESSION_HEADER] = input.token;
    const res = await fetch(`${url}${path}`, { method, headers });
    const text = await res.text();
    return {
        status: res.status,
        body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
    };
}

async function signIn(
    shop: { organizationId: string; host: string },
    who = `person-${next()}@example.com`,
) {
    const { host } = shop;
    const asked = await fetch(`${url}/public/site-accounts/codes`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            [SITE_RELAY_HEADER]: signSiteRelay(
                { address: "203.0.113.9", host },
                siteRelaySecret(),
            ),
        },
        body: JSON.stringify({ email: who }),
    });
    expect(asked.status).toBe(202);
    const code = sent.filter((s) => s.to === who).at(-1)?.code;
    const verified = await fetch(`${url}/public/site-accounts/sessions`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            [SITE_RELAY_HEADER]: signSiteRelay(
                { address: "203.0.113.9", host },
                siteRelaySecret(),
            ),
        },
        body: JSON.stringify({ email: who, code }),
    });
    expect(verified.status).toBe(201);
    const { token } = (await verified.json()) as { token: string };
    const account = await prisma.customerAccount.findFirstOrThrow({
        where: { email: who, organizationId: shop.organizationId },
    });
    return { email: who, token, account };
}

const PATH = "/public/site-accounts/me/data-request";

type Request = { ref: string; status: string; askedAt: string };

/** Close a request the way the team does, without the route. */
function closeByHand(id: string) {
    return prisma.customerDataRequest.update({
        where: { id },
        data: {
            status: "CLOSED_WITHOUT_REMOVAL",
            reason: "Still has an open warranty claim",
            handledAt: new Date(),
        },
    });
}

function jobsFor(organizationId: string, type: string) {
    return prisma.job.findMany({
        where: { organizationId, type },
        orderBy: { createdAt: "asc" },
    });
}

describe("asking to remove my data", () => {
    it("makes one OPEN request; asking again returns the same one; GET shows it", async () => {
        const shop = await business("Northwind");
        const me = await signIn(shop);

        const none = await call("GET", PATH, shop);
        expect(none.status).toBe(401);
        const before = await call("GET", PATH, { ...shop, token: me.token });
        expect(before).toEqual({ status: 200, body: { request: null } });

        const first = await call("POST", PATH, { ...shop, token: me.token });
        expect(first.status).toBe(201);
        const made = first.body.request as Request;
        expect(made).toMatchObject({ status: "open", handledAt: null });

        const again = await call("POST", PATH, { ...shop, token: me.token });
        expect(again.status).toBe(200);
        expect((again.body.request as Request).ref).toBe(made.ref);

        const read = await call("GET", PATH, { ...shop, token: me.token });
        expect(read.body.request).toEqual(made);

        // One row, about this account and its contact, as they were.
        const rows = await prisma.customerDataRequest.findMany({
            where: { organizationId: shop.organizationId },
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: made.ref,
            customerAccountId: me.account.id,
            contactId: me.account.contactId,
            requesterEmail: me.email,
            kind: "REMOVAL",
            status: "OPEN",
            handledAt: null,
        });
        // Nothing removed: the account and the contact are as they were.
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: me.account.contactId },
        });
        expect(contact.removedAt).toBeNull();
        expect(contact.email).toBe(me.email);
    });

    it("queues one team alert, one acknowledgement and one audit entry, ids only", async () => {
        const shop = await business("Northwind");
        const me = await signIn(shop);
        const first = await call("POST", PATH, { ...shop, token: me.token });
        await call("POST", PATH, { ...shop, token: me.token });
        const ref = (first.body.request as Request).ref;

        const alerts = await jobsFor(shop.organizationId, TEAM_ALERT_TYPE);
        expect(alerts.map((j) => j.payload)).toEqual([
            { event: "request", requestId: ref },
        ]);
        const emails = await jobsFor(
            shop.organizationId,
            DATA_REQUEST_EMAIL_TYPE,
        );
        expect(emails.map((j) => j.payload)).toEqual([
            { requestId: ref, step: "received" },
        ]);
        const audits = await prisma.auditEvent.findMany({
            where: {
                organizationId: shop.organizationId,
                action: AuditAction.CustomerDataRequestCreated,
            },
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
            targetType: "customer_data_request",
            targetId: ref,
            outcome: "SUCCESS",
        });
        expect(JSON.stringify(audits[0].metadata)).not.toContain("@");
    });

    it("refuses without a session, or without the site's relay", async () => {
        const shop = await business("Northwind");
        const me = await signIn(shop);
        expect((await call("POST", PATH, shop)).status).toBe(401);
        expect((await call("POST", PATH, { token: me.token })).status).toBe(
            401,
        );
        expect(
            await prisma.customerDataRequest.count({
                where: { organizationId: shop.organizationId },
            }),
        ).toBe(0);
    });

    it("is a 404 while the account area is off", async () => {
        const shop = await business("Northwind");
        const me = await signIn(shop);
        env.SITE_ACCOUNT_AREA = "off";
        expect(
            (await call("POST", PATH, { ...shop, token: me.token })).status,
        ).toBe(404);
    });

    it("never shows another business's request, and a session carried there is refused", async () => {
        const a = await business("Northwind");
        const b = await business("Rye");
        const email = `both-${next()}@example.com`;
        const atA = await signIn(a, email);
        const atB = await signIn(b, email);
        await call("POST", PATH, { ...a, token: atA.token });

        // A's session on B's site is no session there.
        expect(
            (await call("GET", PATH, { host: b.host, token: atA.token }))
                .status,
        ).toBe(401);
        // The same person at B has asked nothing of B.
        const atBRead = await call("GET", PATH, { ...b, token: atB.token });
        expect(atBRead).toEqual({ status: 200, body: { request: null } });
        expect(
            await prisma.customerDataRequest.count({
                where: { organizationId: b.organizationId },
            }),
        ).toBe(0);
    });

    it("after one is closed, asks again, at most NEW_REQUESTS_PER_DAY new ones a day", async () => {
        const shop = await business("Northwind");
        const me = await signIn(shop);
        for (let i = 0; i < NEW_REQUESTS_PER_DAY; i += 1) {
            const asked = await call("POST", PATH, {
                ...shop,
                token: me.token,
            });
            expect(asked.status).toBe(201);
            await closeByHand((asked.body.request as Request).ref);
        }
        // A closed one reads closed, and they may ask again…
        const closed = await call("GET", PATH, { ...shop, token: me.token });
        expect((closed.body.request as Request).status).toBe("closed");
        // …but not a fourth new one today.
        const refused = await call("POST", PATH, { ...shop, token: me.token });
        expect(refused.status).toBe(429);
        expect(refused.body).toMatchObject({
            error: { details: { reason: "too-many" } },
        });
        expect(
            await prisma.customerDataRequest.count({
                where: { organizationId: shop.organizationId },
            }),
        ).toBe(NEW_REQUESTS_PER_DAY);
    });

    it("limits how often one account may ask, open request or not", async () => {
        const shop = await business("Northwind");
        const me = await signIn(shop);
        for (let i = 0; i < ASKS_PER_WINDOW; i += 1) {
            expect(
                (await call("POST", PATH, { ...shop, token: me.token })).status,
            ).toBeLessThan(300);
        }
        expect(
            (await call("POST", PATH, { ...shop, token: me.token })).status,
        ).toBe(429);
        // Another customer of the same business is not held up.
        const other = await signIn(shop);
        expect(
            (await call("POST", PATH, { ...shop, token: other.token })).status,
        ).toBe(201);
    });
});

describe("the acknowledgement email", () => {
    async function asked() {
        const shop = await business("Northwind & Co");
        const me = await signIn(shop);
        await call("POST", PATH, { ...shop, token: me.token });
        const [job] = await jobsFor(
            shop.organizationId,
            DATA_REQUEST_EMAIL_TYPE,
        );
        return { shop, me, job: job as Job };
    }

    it("goes once to the email they asked from, in the business's name", async () => {
        const { me, job } = await asked();
        const mails: { to: string; businessName: string; subject: string }[] =
            [];
        const handler = new DataRequestEmailHandler((to, details) => {
            mails.push({ to, ...details });
            return Promise.resolve("sent");
        });
        await handler.handle(job);
        await handler.handle(job);
        expect(mails).toHaveLength(1);
        expect(mails[0]).toMatchObject({
            to: me.email,
            businessName: "Northwind & Co",
            subject: "We've sent your request to Northwind & Co",
        });
    });

    it("records nothing and throws when the send fails, so the retry sends it", async () => {
        const { shop, job } = await asked();
        const failing = new DataRequestEmailHandler(() =>
            Promise.resolve("failed"),
        );
        await expect(failing.handle(job)).rejects.toThrow(/not sent/);
        const payload = job.payload as { requestId: string };
        expect(
            await prisma.customerNotice.count({
                where: {
                    organizationId: shop.organizationId,
                    eventKey: dataRequestEventKey(
                        payload.requestId,
                        "received",
                    ),
                },
            }),
        ).toBe(0);

        const mails: string[] = [];
        await new DataRequestEmailHandler((to) => {
            mails.push(to);
            return Promise.resolve("sent");
        }).handle(job);
        expect(mails).toHaveLength(1);
    });
});
