/**
 * A customer's session on a business's site, over HTTP against a real
 * Postgres (round-2 plan A, A3; ADR-011): signing in through the relay,
 * staying signed in, signing out, a token carried to another site, a
 * revoked, expired or blocked one, the slide, and — the point of the unit —
 * that a customer route runs in its business's row-level security context.
 *
 * The app is built as main.ts builds it where it matters here (the
 * validation pipe and `OrgRlsInterceptor`; the Origin guard exempts
 * `/public/*`), plus one test-only route behind the customer guard that
 * queries with no organization filter at all.
 */
import type { INestApplication } from "@nestjs/common";
import { Controller, Get, UseGuards, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import { validationPipeOptions } from "../../common/validation";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import type { CustomerContext } from "./customer-context.decorator";
import { CurrentCustomer } from "./customer-context.decorator";
import {
    CUSTOMER_SESSION_HEADER,
    CustomerSessionGuard,
} from "./customer-session.guard";
import {
    hashSessionToken,
    SESSION_MAX_AGE_MS,
    SESSION_TTL_MS,
} from "./sessions.service";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";

const PROBE_ROLE = "saroh_customer_rls_probe";
const tag = `${process.pid}-${Date.now()}`;
let sites = 0;
let people = 0;

/** A route that reads with no organization filter, as a probe role. */
@Controller("test-only/customer-rls")
@UseGuards(CustomerSessionGuard)
class RlsProbeController {
    @Get()
    seen(@CurrentCustomer() customer: CustomerContext) {
        return prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE ${PROBE_ROLE}`);
            const accounts = await tx.customerAccount.findMany({
                select: { organizationId: true },
            });
            const contacts = await tx.contact.findMany({
                select: { organizationId: true },
            });
            const [guc] = await tx.$queryRaw<{ org: string | null }[]>`
                SELECT current_setting('app.current_organization_id', true) AS org`;
            return {
                customer: customer.organizationId,
                context: guc?.org ?? null,
                accountOrgs: accounts.map((a) => a.organizationId),
                contactOrgs: contacts.map((c) => c.organizationId),
            };
        });
    }
}

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;

beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
        imports: [SiteAccountsModule],
        controllers: [RlsProbeController],
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
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
});

afterAll(async () => {
    await app?.close();
});

async function business(name: string, count = 1) {
    const org = await prisma.organization.create({
        data: { name, slug: `${name.toLowerCase()}-${tag}-${sites}` },
    });
    const made: { siteId: string; host: string }[] = [];
    for (let i = 0; i < count; i += 1) {
        sites += 1;
        const subdomain = `site${sites}x${process.pid}`;
        const site = await prisma.site.create({
            data: {
                organizationId: org.id,
                name,
                slug: `site-${tag}-${sites}`,
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
        made.push({ siteId: site.id, host: `${subdomain}.saroh.app` });
    }
    return { organizationId: org.id, sites: made, host: made[0]!.host };
}

function relay(host: string) {
    return signSiteRelay({ address: "203.0.113.9", host }, siteRelaySecret());
}

async function call(
    method: string,
    path: string,
    input: { host: string; token?: string; body?: unknown; cookie?: string },
) {
    const headers: Record<string, string> = {
        [SITE_RELAY_HEADER]: relay(input.host),
        accept: "application/json",
    };
    if (input.token) headers[CUSTOMER_SESSION_HEADER] = input.token;
    if (input.cookie) headers.cookie = input.cookie;
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

/** Sign in through the real routes: ask for a code, then trade it. */
async function signIn(host: string, email?: string) {
    people += 1;
    const who = email ?? `person${people}-${tag}@example.in`;
    const asked = await call("POST", "/public/site-accounts/codes", {
        host,
        body: { email: who },
    });
    expect(asked.status).toBe(202);
    const code = sent.filter((s) => s.to === who).at(-1)?.code;
    const verified = await call("POST", "/public/site-accounts/sessions", {
        host,
        body: { email: who, code },
    });
    expect(verified.status).toBe(201);
    return { email: who, token: verified.body.token as string };
}

const me = (host: string, token?: string) =>
    call("GET", "/public/site-accounts/session", { host, token });

describe("the customer session on a site", () => {
    it("signs in, stays signed in on the next visit, and signs out", async () => {
        const kavi = await business("Kavi");
        const { email, token } = await signIn(kavi.host);

        const first = await me(kavi.host, token);
        expect(first.status).toBe(200);
        expect(first.body).toEqual({ email, name: null });
        // A reload is the same token again.
        expect((await me(kavi.host, token)).status).toBe(200);

        const out = await call("DELETE", "/public/site-accounts/session", {
            host: kavi.host,
            token,
        });
        expect(out.status).toBe(204);
        expect((await me(kavi.host, token)).status).toBe(401);
        const row = await prisma.customerSession.findUniqueOrThrow({
            where: { tokenHash: hashSessionToken(token) },
        });
        expect(row.revokedAt).not.toBeNull();
    });

    it("shows the contact's name once there is one, and nothing else", async () => {
        const kavi = await business("Kavi");
        const { email, token } = await signIn(kavi.host);
        const account = await prisma.customerAccount.findFirstOrThrow({
            where: { organizationId: kavi.organizationId, email },
        });
        await prisma.contact.update({
            where: { id: account.contactId },
            data: { firstName: "Farah", lastName: "Khan", phone: "999" },
        });
        const seen = await me(kavi.host, token);
        expect(seen.body).toEqual({ email, name: "Farah Khan" });
    });

    it("refuses a token carried to another business's site", async () => {
        const kavi = await business("Kavi");
        const pulse = await business("Pulse");
        const { token } = await signIn(kavi.host);
        const elsewhere = await me(pulse.host, token);
        expect(elsewhere.status).toBe(401);
        expect((await me(kavi.host, token)).status).toBe(200);
    });

    it("refuses a token carried to another site of the same business", async () => {
        const two = await business("Rye", 2);
        const { token } = await signIn(two.sites[0]!.host);
        expect((await me(two.sites[1]!.host, token)).status).toBe(401);
    });

    it("signs out everywhere: every session of the account", async () => {
        const kavi = await business("Kavi");
        const phone = await signIn(kavi.host);
        // The second code for one email waits out the 30-second resend.
        await prisma.customerSignInCode.updateMany({
            where: { organizationId: kavi.organizationId },
            data: { createdAt: new Date(Date.now() - 60_000) },
        });
        const laptop = await signIn(kavi.host, phone.email);
        const other = await signIn(kavi.host);

        const out = await call("DELETE", "/public/site-accounts/sessions", {
            host: kavi.host,
            token: laptop.token,
        });
        expect(out.status).toBe(200);
        expect(out.body).toEqual({ revoked: 2 });
        expect((await me(kavi.host, phone.token)).status).toBe(401);
        expect((await me(kavi.host, laptop.token)).status).toBe(401);
        // Someone else's session is untouched.
        expect((await me(kavi.host, other.token)).status).toBe(200);
    });

    it("refuses an expired session, a revoked one and a blocked account", async () => {
        const kavi = await business("Kavi");
        const expired = await signIn(kavi.host);
        await prisma.customerSession.update({
            where: { tokenHash: hashSessionToken(expired.token) },
            data: { expiresAt: new Date(Date.now() - 1_000) },
        });
        expect((await me(kavi.host, expired.token)).status).toBe(401);

        const revoked = await signIn(kavi.host);
        await prisma.customerSession.update({
            where: { tokenHash: hashSessionToken(revoked.token) },
            data: { revokedAt: new Date() },
        });
        expect((await me(kavi.host, revoked.token)).status).toBe(401);

        const blocked = await signIn(kavi.host);
        await prisma.customerAccount.updateMany({
            where: {
                organizationId: kavi.organizationId,
                email: blocked.email,
            },
            data: { status: "BLOCKED" },
        });
        expect((await me(kavi.host, blocked.token)).status).toBe(401);
    });

    it("refuses a request without the relay, and one with only a workspace cookie", async () => {
        const kavi = await business("Kavi");
        const { token } = await signIn(kavi.host);
        const bare = await fetch(`${url}/public/site-accounts/session`, {
            headers: { [CUSTOMER_SESSION_HEADER]: token },
        });
        expect(bare.status).toBe(401);
        const cookieOnly = await call("GET", "/public/site-accounts/session", {
            host: kavi.host,
            cookie: `__Secure-better-auth.session_token=x; __Host-saroh_session=${token}`,
        });
        expect(cookieOnly.status).toBe(401);
    });

    it("slides a session at most hourly, never past 90 days from sign-in", async () => {
        const kavi = await business("Kavi");
        const { token } = await signIn(kavi.host);
        const where = { tokenHash: hashSessionToken(token) };

        // Seen ten minutes ago: nothing is written.
        const recent = new Date(Date.now() - 10 * 60_000);
        await prisma.customerSession.update({
            where,
            data: { lastSeenAt: recent },
        });
        await me(kavi.host, token);
        expect(
            (await prisma.customerSession.findUniqueOrThrow({ where }))
                .lastSeenAt,
        ).toEqual(recent);

        // Seen two hours ago: the end moves out 30 days.
        await prisma.customerSession.update({
            where,
            data: {
                lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000),
                expiresAt: new Date(Date.now() + 60_000),
            },
        });
        const before = Date.now();
        await me(kavi.host, token);
        const slid = await prisma.customerSession.findUniqueOrThrow({ where });
        expect(slid.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(slid.expiresAt.getTime()).toBeGreaterThanOrEqual(
            before + SESSION_TTL_MS,
        );

        // Signed in 89 days ago: the slide stops at 90.
        const createdAt = new Date(Date.now() - 89 * 24 * 60 * 60_000);
        await prisma.customerSession.update({
            where,
            data: {
                createdAt,
                lastSeenAt: new Date(Date.now() - 2 * 60 * 60_000),
            },
        });
        await me(kavi.host, token);
        expect(
            (await prisma.customerSession.findUniqueOrThrow({ where }))
                .expiresAt,
        ).toEqual(new Date(createdAt.getTime() + SESSION_MAX_AGE_MS));
    });
});

// Installs the migrations' policies and a probe role itself, which needs
// a superuser. In RLS mode (TEST_RLS=on) the whole suite already runs as
// the NOBYPASSRLS role on a schema built from the migrations, so this
// group is what every spec there checks, and it could not set itself up.
(isRlsTestMode() ? describe.skip : describe)(
    "row-level security on a customer route",
    () => {
        const TABLES = ["Contact", "CustomerAccount"];

        beforeAll(async () => {
            await prisma.$executeRawUnsafe(`DO $$ BEGIN
            CREATE ROLE ${PROBE_ROLE} NOLOGIN NOBYPASSRLS;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
            await prisma.$executeRawUnsafe(
                `GRANT USAGE ON SCHEMA public TO ${PROBE_ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${PROBE_ROLE}`,
            );
            for (const table of TABLES) {
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
                );
                await prisma.$executeRawUnsafe(
                    `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                );
                await prisma.$executeRawUnsafe(`CREATE POLICY "org_isolation" ON "${table}"
                USING (NULLIF(current_setting('app.current_organization_id', true), '') IS NULL
                       OR "organizationId" = current_setting('app.current_organization_id', true))`);
            }
        });

        afterAll(async () => {
            for (const table of TABLES) {
                await prisma.$executeRawUnsafe(
                    `DROP POLICY IF EXISTS "org_isolation" ON "${table}"`,
                );
                await prisma.$executeRawUnsafe(
                    `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
                );
            }
            await prisma.$executeRawUnsafe(
                `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${PROBE_ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                `REVOKE USAGE ON SCHEMA public FROM ${PROBE_ROLE}`,
            );
            await prisma.$executeRawUnsafe(
                // A role is cluster-wide: another test database still granting
                // to it (a parallel run, or one cut short) keeps it; that is fine.
                `DO $$ BEGIN DROP ROLE IF EXISTS ${PROBE_ROLE};
                EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$`,
            );
        });

        it("runs in the session's business, and sees none of another business's customers", async () => {
            const kavi = await business("Kavi");
            const pulse = await business("Pulse");
            const { token } = await signIn(kavi.host);
            await signIn(pulse.host);

            const before = process.env.RLS_ENFORCEMENT;
            // eslint-disable-next-line no-restricted-properties -- the proxy reads this live
            process.env.RLS_ENFORCEMENT = "on";
            try {
                const res = await call("GET", "/test-only/customer-rls", {
                    host: kavi.host,
                    token,
                });
                expect(res.status).toBe(200);
                const seen = res.body as {
                    customer: string;
                    context: string | null;
                    accountOrgs: string[];
                    contactOrgs: string[];
                };
                expect(seen.customer).toBe(kavi.organizationId);
                expect(seen.context).toBe(kavi.organizationId);
                expect(seen.accountOrgs.length).toBeGreaterThan(0);
                expect(seen.contactOrgs.length).toBeGreaterThan(0);
                expect(
                    seen.accountOrgs.every(
                        (org) => org === kavi.organizationId,
                    ),
                ).toBe(true);
                expect(
                    seen.contactOrgs.every(
                        (org) => org === kavi.organizationId,
                    ),
                ).toBe(true);
            } finally {
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                if (before === undefined) delete process.env.RLS_ENFORCEMENT;
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                else process.env.RLS_ENFORCEMENT = before;
            }

            // Pulse's customers are really there: only RLS kept them out.
            const all = await prisma.customerAccount.findMany({
                where: {
                    organizationId: {
                        in: [kavi.organizationId, pulse.organizationId],
                    },
                },
            });
            expect(new Set(all.map((a) => a.organizationId)).size).toBe(2);
        });
    },
);
