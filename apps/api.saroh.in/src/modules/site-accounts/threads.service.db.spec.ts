/**
 * The customer's message thread against a real Postgres (round-2 A13, R14):
 * the customer writes from their account over the real routes, the team
 * reads and answers with `message:read` / `message:write`, unread clears on
 * open, the per-account limit, the plain-text cap, a revoked session, and
 * what a merge (C9) and "This isn't them" (A4) do with the thread.
 *
 * The app is built as main.ts builds it where it matters (the validation
 * pipe, `OrgRlsInterceptor` and the error envelope). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import type { INestApplication } from "@nestjs/common";
import {
    ForbiddenException,
    NotFoundException,
    ValidationPipe,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@saroh/database";

import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import type { OrganizationContext } from "../../common/types/organization-context";
import { validationPipeOptions } from "../../common/validation";
import { env } from "../../env";
import type { MergeContactsDto } from "../customer-workspace/merge.dto";
import { MergeService } from "../customer-workspace/merge.service";
import {
    CUSTOMER_MESSAGE_NOTIFY_TYPE,
    CustomerMessageNotifyHandler,
    MESSAGE_NEW_NOTIFICATION_TYPE,
} from "../notifications/customer-message-notify.handler";
import type { OrgAction } from "../organizations/organization-actions";
import { AccountLinkingService } from "./account-linking.service";
import { AccountUnlinkService } from "./account-unlink.service";
import { SiteCodeAlerts, SiteCodeDelivery } from "./code-delivery";
import { CustomerAccountRepository } from "./customer-account.repository";
import { CUSTOMER_SESSION_HEADER } from "./customer-session.guard";
import { EMAIL_CHANGED_SENDER } from "./email-change.service";
import { SiteAccountsModule } from "./site-accounts.module";
import { signSiteRelay, SITE_RELAY_HEADER } from "./site-relay";
import { siteRelaySecret } from "./site-secrets";
import { appendMessage } from "./thread-store";
import { POSTS_PER_MINUTE, ThreadsService } from "./threads.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;

const sent: { to: string; code: string }[] = [];
let app: INestApplication;
let url: string;
let threads: ThreadsService;
const originalSwitch = env.SITE_ACCOUNT_AREA;
let staffId = "";

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
        .overrideProvider(EMAIL_CHANGED_SENDER)
        .useValue(() => Promise.resolve("sent"))
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    url = await app.getUrl();
    threads = moduleRef.get(ThreadsService);
    staffId = (
        await prisma.user.create({
            data: { email: `a13-staff-${tag}@example.com`, name: "Dr. Rao" },
        })
    ).id;
});

beforeEach(() => {
    env.SITE_ACCOUNT_AREA = "on";
});

afterAll(async () => {
    env.SITE_ACCOUNT_AREA = originalSwitch;
    await app?.close();
});

interface Business {
    ctx: OrganizationContext;
    host: string;
    siteId: string;
}

/** A business with a published site. */
async function business(name = "Kavi Dental"): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: `a13-${next()}` },
    });
    const subdomain = `a13x${seq}x${process.pid}`;
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name,
            slug: `a13-site-${next()}`,
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
    return {
        ctx: { organizationId: org.id, userId: staffId, role: "OWNER" },
        host: `${subdomain}.saroh.app`,
        siteId: site.id,
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
        body: (text ? JSON.parse(text) : null) as Record<string, unknown>,
    };
}

/** Sign in through the real routes: ask for a code, then trade it. */
async function signIn(host: string, who = `person-${next()}@example.in`) {
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
    const account = await prisma.customerAccount.findFirstOrThrow({
        where: { email: who },
    });
    return { email: who, token: verified.body.token as string, account };
}

const ME = "/public/site-accounts/me";
const MESSAGES = `${ME}/messages`;

/** A role holding exactly these actions (a business's own role, F17). */
function withActions(
    ctx: OrganizationContext,
    actions: OrgAction[],
): OrganizationContext {
    return { ...ctx, role: "MEMBER", actions: new Set(actions) };
}

describe("the customer's side", () => {
    it("is a 404 while SITE_ACCOUNT_AREA is off", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        env.SITE_ACCOUNT_AREA = "off";
        const read = await call("GET", MESSAGES, {
            host: biz.host,
            token: farah.token,
        });
        expect(read.status).toBe(404);
        const posted = await call("POST", MESSAGES, {
            host: biz.host,
            token: farah.token,
            body: { text: "Hello" },
        });
        expect(posted.status).toBe(404);
    });

    it("the customer writes, the team reads and replies, and the customer sees the reply", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        const contactId = farah.account.contactId;

        const empty = await call("GET", MESSAGES, {
            host: biz.host,
            token: farah.token,
        });
        expect(empty).toEqual({
            status: 200,
            body: { messages: [], earlier: false },
        });

        const posted = await call("POST", MESSAGES, {
            host: biz.host,
            token: farah.token,
            body: { text: "  Can I move Tuesday to 11?  " },
        });
        expect(posted.status).toBe(201);
        expect(posted.body).toEqual({
            ref: expect.any(String),
            from: "me",
            text: "Can I move Tuesday to 11?",
            sentAt: expect.any(String),
        });

        // The team: one unread from the customer, who signs in.
        const staffView = await threads.forStaff(biz.ctx, contactId);
        expect(staffView).toMatchObject({
            unread: 1,
            signsIn: true,
            canReply: true,
            earlier: false,
        });
        expect(staffView.messages).toEqual([
            expect.objectContaining({
                author: "CUSTOMER",
                body: "Can I move Tuesday to 11?",
                by: null,
                mine: false,
            }),
        ]);
        await threads.markReadByStaff(biz.ctx, contactId);
        expect((await threads.forStaff(biz.ctx, contactId)).unread).toBe(0);

        const reply = await threads.reply(
            biz.ctx,
            contactId,
            "Yes — 11:00 on Tuesday is yours.",
        );
        expect(reply).toMatchObject({
            author: "STAFF",
            by: "Dr. Rao",
            mine: true,
        });

        // The customer's tab has a dot until they open Messages.
        const me = await call("GET", ME, {
            host: biz.host,
            token: farah.token,
        });
        expect(me.body.unreadMessages).toBe(1);

        const read = await call("GET", MESSAGES, {
            host: biz.host,
            token: farah.token,
        });
        expect(read.status).toBe(200);
        const messages = read.body.messages as Record<string, unknown>[];
        expect(messages.map((m) => [m.from, m.text])).toEqual([
            ["me", "Can I move Tuesday to 11?"],
            ["business", "Yes — 11:00 on Tuesday is yours."],
        ]);
        // Never who on the team wrote it, nor any internal id.
        expect(JSON.stringify(read.body)).not.toContain("Dr. Rao");
        expect(JSON.stringify(read.body)).not.toContain(staffId);

        const after = await call("GET", ME, {
            host: biz.host,
            token: farah.token,
        });
        expect(after.body.unreadMessages).toBe(0);
    });

    it("the team hears of a customer's message: one notice per turn that opens their thread (UX-014)", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        const contactId = farah.account.contactId;
        const say = (text: string) =>
            call("POST", MESSAGES, {
                host: biz.host,
                token: farah.token,
                body: { text },
            });
        const queued = () =>
            prisma.job.findMany({
                where: {
                    organizationId: biz.ctx.organizationId,
                    type: CUSTOMER_MESSAGE_NOTIFY_TYPE,
                },
                orderBy: { createdAt: "asc" },
            });

        expect((await say("Any update on Friday?")).status).toBe(201);
        // A follow-up in the same turn adds no second notice.
        expect((await say("Just checking.")).status).toBe(201);
        let jobs = await queued();
        expect(jobs).toHaveLength(1);

        // The job puts it in the inbox, opening on this customer, once.
        const handler = new CustomerMessageNotifyHandler();
        await handler.handle(jobs[0]);
        await handler.handle(jobs[0]);
        const notices = await prisma.notification.findMany({
            where: {
                organizationId: biz.ctx.organizationId,
                type: MESSAGE_NEW_NOTIFICATION_TYPE,
            },
        });
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({
            contactId,
            title: `${farah.email} sent you a message`,
            body: "Any update on Friday?",
        });
        // And the message is on the contact's own thread.
        const staffView = await threads.forStaff(biz.ctx, contactId);
        expect(staffView.messages.map((m) => m.body)).toEqual([
            "Any update on Friday?",
            "Just checking.",
        ]);

        // Once the team has answered, the next message opens a new turn.
        await threads.reply(biz.ctx, contactId, "Friday is fine.");
        expect((await say("Thanks!")).status).toBe(201);
        jobs = await queued();
        expect(jobs).toHaveLength(2);
    });

    it("keeps the words as written: never HTML, capped, never blank, nothing extra", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        const post = (body: unknown) =>
            call("POST", MESSAGES, {
                host: biz.host,
                token: farah.token,
                body,
            });

        const html = await post({ text: "<img src=x onerror=alert(1)>\r\nhi" });
        expect(html.status).toBe(201);
        expect(html.body.text).toBe("<img src=x onerror=alert(1)>\nhi");

        expect((await post({ text: "   " })).status).toBe(400);
        expect((await post({ text: "x".repeat(2_001) })).status).toBe(400);
        expect((await post({ text: "x".repeat(2_000) })).status).toBe(201);
        expect(
            (await post({ text: "hi", organizationId: biz.ctx.organizationId }))
                .status,
        ).toBe(400);
    });

    it("limits how fast one account can write, with a sentence", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        for (let i = 0; i < POSTS_PER_MINUTE; i += 1) {
            const ok = await call("POST", MESSAGES, {
                host: biz.host,
                token: farah.token,
                body: { text: `Message ${i}` },
            });
            expect(ok.status).toBe(201);
        }
        const refused = await call("POST", MESSAGES, {
            host: biz.host,
            token: farah.token,
            body: { text: "One more" },
        });
        expect(refused.status).toBe(429);
        expect(JSON.stringify(refused.body)).toContain(
            "Wait a minute, then try again.",
        );

        // Another customer of the same business is not held back.
        const meera = await signIn(biz.host);
        const theirs = await call("POST", MESSAGES, {
            host: biz.host,
            token: meera.token,
            body: { text: "Hello" },
        });
        expect(theirs.status).toBe(201);
    });

    it("a revoked session can't read or write: 401", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        await prisma.customerSession.updateMany({
            where: { accountId: farah.account.id },
            data: { revokedAt: new Date() },
        });
        const posted = await call("POST", MESSAGES, {
            host: biz.host,
            token: farah.token,
            body: { text: "Hello?" },
        });
        expect(posted.status).toBe(401);
        const read = await call("GET", MESSAGES, {
            host: biz.host,
            token: farah.token,
        });
        expect(read.status).toBe(401);
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: biz.ctx.organizationId },
            }),
        ).toBe(0);
    });

    it("each customer sees only their own thread", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        const meera = await signIn(biz.host);
        await call("POST", MESSAGES, {
            host: biz.host,
            token: farah.token,
            body: { text: "Farah's question" },
        });
        const theirs = await call("GET", MESSAGES, {
            host: biz.host,
            token: meera.token,
        });
        expect(theirs.body).toEqual({ messages: [], earlier: false });
    });
});

describe("the team's side", () => {
    it("needs message:read to read and message:write to answer", async () => {
        const biz = await business();
        const farah = await signIn(biz.host);
        const contactId = farah.account.contactId;

        // The shipped Member holds neither (permission matrix).
        const member = { ...biz.ctx, role: "MEMBER" as const };
        await expect(threads.forStaff(member, contactId)).rejects.toThrow(
            ForbiddenException,
        );
        await expect(threads.reply(member, contactId, "Hi")).rejects.toThrow(
            ForbiddenException,
        );

        const reader = withActions(biz.ctx, ["message:read"]);
        expect((await threads.forStaff(reader, contactId)).canReply).toBe(
            false,
        );
        await expect(threads.reply(reader, contactId, "Hi")).rejects.toThrow(
            ForbiddenException,
        );
    });

    it("another business's customer is a 404", async () => {
        const biz = await business();
        const other = await business("Rye & Co.");
        const farah = await signIn(biz.host);
        await expect(
            threads.forStaff(other.ctx, farah.account.contactId),
        ).rejects.toThrow(NotFoundException);
        await expect(
            threads.reply(other.ctx, farah.account.contactId, "Hi"),
        ).rejects.toThrow(NotFoundException);
    });

    it("a reply to someone without a site account waits for them to sign in", async () => {
        const biz = await business();
        const contact = await prisma.contact.create({
            data: {
                organizationId: biz.ctx.organizationId,
                email: `walk-in-${next()}@example.in`,
            },
        });
        await threads.reply(biz.ctx, contact.id, "Your frames are in.");
        const view = await threads.forStaff(biz.ctx, contact.id);
        expect(view.signsIn).toBe(false);
        expect(view.unread).toBe(0);
        expect(view.messages).toHaveLength(1);
    });

    it("deleting the customer takes their thread with it", async () => {
        const biz = await business();
        const contact = await prisma.contact.create({
            data: {
                organizationId: biz.ctx.organizationId,
                email: `gone-${next()}@example.in`,
            },
        });
        await threads.reply(biz.ctx, contact.id, "Hello");
        await prisma.contact.delete({ where: { id: contact.id } });
        expect(
            await prisma.customerThread.count({
                where: { contactId: contact.id },
            }),
        ).toBe(0);
        expect(
            await prisma.customerThreadMessage.count({
                where: { organizationId: biz.ctx.organizationId },
            }),
        ).toBe(0);
    });
});

describe("a merge (C9) and This isn't them (A4)", () => {
    const merges = new MergeService();
    const at = (iso: string) => new Date(iso);

    async function write(
        biz: Business,
        contactId: string,
        author: "CUSTOMER" | "STAFF",
        body: string,
        now: Date,
    ) {
        await prisma.$transaction((tx) =>
            appendMessage(tx, {
                organizationId: biz.ctx.organizationId,
                contactId,
                author,
                body,
                now,
            }),
        );
    }

    async function person(biz: Business, createdAt: Date) {
        return (
            await prisma.contact.create({
                data: {
                    organizationId: biz.ctx.organizationId,
                    email: `p-${next()}@example.in`,
                    createdAt,
                },
            })
        ).id;
    }

    it("the survivor's thread absorbs the other's, in time order, and the other's thread goes", async () => {
        const biz = await business();
        const survivor = await person(biz, at("2026-01-01T00:00:00Z"));
        const other = await person(biz, at("2026-02-01T00:00:00Z"));
        await write(
            biz,
            survivor,
            "CUSTOMER",
            "one",
            at("2026-09-01T10:00:00Z"),
        );
        await write(biz, other, "CUSTOMER", "two", at("2026-09-02T10:00:00Z"));
        await write(
            biz,
            survivor,
            "STAFF",
            "three",
            at("2026-09-03T10:00:00Z"),
        );

        const preview = await merges.preview(biz.ctx, survivor, other);
        expect(preview.moves).toContainEqual({
            key: "messages",
            count: 1,
            label: "1 message",
        });

        await merges.merge(biz.ctx, survivor, other, {
            survivorId: survivor,
        } as MergeContactsDto);

        const view = await threads.forStaff(biz.ctx, survivor);
        expect(view.messages.map((m) => m.body)).toEqual([
            "one",
            "two",
            "three",
        ]);
        expect(
            await prisma.customerThread.count({ where: { contactId: other } }),
        ).toBe(0);
    });

    it("a survivor with no thread takes the other's whole", async () => {
        const biz = await business();
        const survivor = await person(biz, at("2026-01-01T00:00:00Z"));
        const other = await person(biz, at("2026-02-01T00:00:00Z"));
        await write(
            biz,
            other,
            "CUSTOMER",
            "hello",
            at("2026-09-02T10:00:00Z"),
        );

        await merges.merge(biz.ctx, survivor, other, {
            survivorId: survivor,
        } as MergeContactsDto);

        const view = await threads.forStaff(biz.ctx, survivor);
        expect(view.messages.map((m) => m.body)).toEqual(["hello"]);
        expect(view.unread).toBe(1);
    });

    it("This isn't them: what the account wrote moves with it; the team's replies stay", async () => {
        const biz = await business();
        const who = `farah-${next()}@example.in`;
        const farah = await prisma.contact.create({
            data: {
                organizationId: biz.ctx.organizationId,
                email: who,
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
        const identity = await prisma.$transaction((tx) =>
            new AccountLinkingService(
                new CustomerAccountRepository(),
            ).linkOrCreate(tx, biz.ctx.organizationId, who, new Date()),
        );
        if (identity.kind !== "signed-in") throw new Error(identity.kind);
        const account = identity.account;
        expect(account.contactId).toBe(farah.id);

        await threads.postFromCustomer(
            {
                organizationId: biz.ctx.organizationId,
                contactId: farah.id,
                accountId: account.id,
            },
            "I'm not the Farah you know",
        );
        await threads.reply(biz.ctx, farah.id, "Sorry — which Farah?");

        const unlinking = new AccountUnlinkService();
        const preview = await unlinking.preview(biz.ctx, farah.id);
        expect(preview.moves).toEqual([
            { key: "messages", count: 1, label: "1 message" },
        ]);
        const { contactId: separate } = await unlinking.unlink(
            biz.ctx,
            farah.id,
        );

        const theirs = await threads.forStaff(biz.ctx, separate);
        expect(theirs.messages.map((m) => m.body)).toEqual([
            "I'm not the Farah you know",
        ]);
        const hers = await threads.forStaff(biz.ctx, farah.id);
        expect(hers.messages.map((m) => m.body)).toEqual([
            "Sorry — which Farah?",
        ]);
    });
});
