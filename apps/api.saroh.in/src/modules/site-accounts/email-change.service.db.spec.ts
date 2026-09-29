/**
 * Changing the sign-in email from Me, over HTTP against a real Postgres
 * (round-2 plan A, A5; ADR-011 "Email changes"): the code goes to the new
 * address; the account moves, and the contact with it only when it held the
 * old email and the new one is free; every other session ends; the old
 * address is told. The customer gets the same answer whatever happened.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import { reservedAccountEmail } from "../contacts/contact-email";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import { EMAIL_CHANGED_SENDER } from "./email-change.service";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const codes: { to: string; code: string }[] = [];
const notices: { to: string; businessName: string }[] = [];
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
                        codes.push({ to, code: details.code });
                        return Promise.resolve("sent");
                    },
                    [0, 0],
                ),
            inject: [SiteCodeAlerts],
        })
        .overrideProvider(EMAIL_CHANGED_SENDER)
        .useValue((to: string, details: { businessName: string }) => {
            notices.push({ to, businessName: details.businessName });
            return Promise.resolve("sent");
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

async function business(name = "Kavi Dental") {
    const org = await prisma.organization.create({
        data: { name, slug: `a5e-${next()}` },
    });
    const subdomain = `a5ex${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `a5e-site-${next()}`,
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
    input: {
        host?: string;
        token?: string;
        body?: unknown;
        address?: string;
    } = {},
) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (input.host) {
        headers[SITE_RELAY_HEADER] = signSiteRelay(
            { address: input.address ?? "203.0.113.9", host: input.host },
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
        body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
    };
}

const lastCode = (to: string) => codes.filter((c) => c.to === to).at(-1)?.code;

async function signIn(
    host: string,
    who = `person-${next()}@example.in`,
    address?: string,
) {
    const asked = await call("POST", "/public/site-accounts/codes", {
        host,
        address,
        body: { email: who },
    });
    expect(asked.status).toBe(202);
    const verified = await call("POST", "/public/site-accounts/sessions", {
        host,
        address,
        body: { email: who, code: lastCode(who) },
    });
    expect(verified.status).toBe(201);
    const account = await prisma.customerAccount.findFirstOrThrow({
        where: { email: who },
    });
    return { email: who, token: verified.body.token as string, account };
}

/** Ask for a change code at `to`, then use it. */
async function change(host: string, token: string, to: string) {
    const asked = await call("POST", "/public/site-accounts/me/email/code", {
        host,
        token,
        body: { email: to },
    });
    expect(asked.status).toBe(202);
    return call("POST", "/public/site-accounts/me/email", {
        host,
        token,
        body: { email: to, code: lastCode(to) },
    });
}

const whoAmI = (host: string, token: string) =>
    call("GET", "/public/site-accounts/session", { host, token });

describe("changing the sign-in email", () => {
    it("moves the account and its contact, tells the old address, and signs out the other browser", async () => {
        const biz = await business();
        const first = await signIn(biz.host);
        // The same person, signed in on a second browser.
        const second = await signIn(biz.host, first.email, "198.51.100.7");
        const to = `new-${next()}@example.in`;

        const res = await change(biz.host, first.token, to);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ done: true });

        const account = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: first.account.id },
        });
        expect(account.email).toBe(to);
        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: first.account.contactId },
        });
        expect(contact).toMatchObject({
            email: to,
            emailVerifiedVia: "SIGN_IN_CODE",
        });
        expect(contact.emailVerifiedAt).not.toBeNull();

        expect(notices).toContainEqual({
            to: first.email,
            businessName: "Kavi Dental",
        });
        expect(notices.some((n) => n.to === to)).toBe(false);

        // This browser stays signed in, as the new email; the other is out.
        expect((await whoAmI(biz.host, first.token)).body).toMatchObject({
            email: to,
        });
        expect((await whoAmI(biz.host, second.token)).status).toBe(401);

        // The new email signs in to the same account; the old one no longer
        // reaches it (it would make a new customer).
        const again = await signIn(biz.host, to, "198.51.100.8");
        expect(again.account.id).toBe(first.account.id);
    });

    it("a new email another contact holds: the account changes, the contact keeps its own, and the answer is the same", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const to = `farah-${next()}@example.in`;
        // Staff typed this email on another contact.
        const holder = await prisma.contact.create({
            data: {
                organizationId: biz.organizationId,
                email: to,
                firstName: "Farah",
            },
        });

        const res = await change(biz.host, me.token, to);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ done: true });

        expect(
            (
                await prisma.customerAccount.findUniqueOrThrow({
                    where: { id: me.account.id },
                })
            ).email,
        ).toBe(to);
        expect(
            (
                await prisma.contact.findUniqueOrThrow({
                    where: { id: me.account.contactId },
                })
            ).email,
        ).toBe(me.email);
        // The staff-typed contact is untouched and unverified.
        const untouched = await prisma.contact.findUniqueOrThrow({
            where: { id: holder.id },
        });
        expect(untouched.emailVerifiedAt).toBeNull();
    });

    it("a contact on a placeholder email keeps it; the account carries the new one", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const placeholder = reservedAccountEmail(me.account.contactId);
        await prisma.contact.update({
            where: { id: me.account.contactId },
            data: { email: placeholder, emailVerifiedAt: null },
        });
        const to = `moved-${next()}@example.in`;

        expect((await change(biz.host, me.token, to)).body).toEqual({
            done: true,
        });
        expect(
            (
                await prisma.contact.findUniqueOrThrow({
                    where: { id: me.account.contactId },
                })
            ).email,
        ).toBe(placeholder);
        expect(
            (
                await prisma.customerAccount.findUniqueOrThrow({
                    where: { id: me.account.id },
                })
            ).email,
        ).toBe(to);
    });

    it("a new email another account holds: the same answer, and nothing changes", async () => {
        const biz = await business();
        const other = await signIn(biz.host);
        const me = await signIn(biz.host);
        const noticesBefore = notices.length;

        const res = await change(biz.host, me.token, other.email);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ done: true });

        expect(
            (
                await prisma.customerAccount.findUniqueOrThrow({
                    where: { id: me.account.id },
                })
            ).email,
        ).toBe(me.email);
        expect(notices.length).toBe(noticesBefore);
        expect((await whoAmI(biz.host, me.token)).status).toBe(200);
    });

    it("the current email: the same answer, and nothing is sent", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const noticesBefore = notices.length;
        const res = await change(biz.host, me.token, me.email);
        expect(res.body).toEqual({ done: true });
        expect(notices.length).toBe(noticesBefore);
    });

    it("a wrong code changes nothing", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const to = `new-${next()}@example.in`;
        await call("POST", "/public/site-accounts/me/email/code", {
            host: biz.host,
            token: me.token,
            body: { email: to },
        });
        const wrong = lastCode(to) === "000000" ? "111111" : "000000";
        const res = await call("POST", "/public/site-accounts/me/email", {
            host: biz.host,
            token: me.token,
            body: { email: to, code: wrong },
        });
        expect(res.status).toBe(400);
        expect(
            (
                await prisma.customerAccount.findUniqueOrThrow({
                    where: { id: me.account.id },
                })
            ).email,
        ).toBe(me.email);
    });

    it("a sign-in code can't change an email, and a change code can't sign anyone in", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const to = `new-${next()}@example.in`;

        // A sign-in code for the new address, used to change the email.
        await call("POST", "/public/site-accounts/codes", {
            host: biz.host,
            body: { email: to },
        });
        const bySignIn = await call("POST", "/public/site-accounts/me/email", {
            host: biz.host,
            token: me.token,
            body: { email: to, code: lastCode(to) },
        });
        expect(bySignIn.status).toBe(400);

        // A change code for another address, used to sign in.
        const other = `other-${next()}@example.in`;
        await call("POST", "/public/site-accounts/me/email/code", {
            host: biz.host,
            token: me.token,
            body: { email: other },
        });
        const bySession = await call("POST", "/public/site-accounts/sessions", {
            host: biz.host,
            body: { email: other, code: lastCode(other) },
        });
        expect(bySession.status).toBe(400);
        expect(
            await prisma.customerAccount.count({ where: { email: other } }),
        ).toBe(0);
    });

    it("sends change codes to at most five new addresses a day", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const ask = (to: string, i: number) =>
            call("POST", "/public/site-accounts/me/email/code", {
                host: biz.host,
                token: me.token,
                // A different visitor address each time, so only the
                // per-account cap can refuse.
                address: `203.0.113.${20 + i}`,
                body: { email: to },
            });
        for (let i = 0; i < 5; i++) {
            expect((await ask(`try-${i}-${next()}@example.in`, i)).status).toBe(
                202,
            );
        }
        const sixth = await ask(`try-6-${next()}@example.in`, 6);
        expect(sixth.status).toBe(429);
        expect(sixth.body.error.details).toMatchObject({ reason: "limit" });
    });

    it("needs the account area switched on and a session", async () => {
        const biz = await business();
        const me = await signIn(biz.host);
        const body = { email: `x-${next()}@example.in` };
        expect(
            (
                await call("POST", "/public/site-accounts/me/email/code", {
                    host: biz.host,
                    body,
                })
            ).status,
        ).toBe(401);
        env.SITE_ACCOUNT_AREA = "off";
        expect(
            (
                await call("POST", "/public/site-accounts/me/email/code", {
                    host: biz.host,
                    token: me.token,
                    body,
                })
            ).status,
        ).toBe(404);
    });
});
