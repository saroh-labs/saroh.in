/**
 * Outbound webhooks against a real Postgres (plan 2026-11-10-001, U13):
 * endpoints saved (and refused), the outbox written with the change (and
 * not when it rolls back), and deliveries sent to a receiver running in
 * this process: signed, logged, retried, FAILED, switched off, resent and
 * the test ping. The plan's answer and the kill switch are fixtures (an
 * obviously fake cap); DNS is a stub. Runs in the integration project
 * (TEST_DATABASE_URL).
 */
import { randomBytes } from "node:crypto";
import type { IncomingHttpHeaders, Server } from "node:http";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { appBase } from "../../common/app-url";
import * as email from "../../common/email";
import type { Resolver, Transport } from "../../common/net/ssrf";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { AuditService } from "../audit/audit.service";
import type { CatalogueAccessService } from "../billing/catalogue-access.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrgAction } from "../organizations/organization-actions";
import { ORG_ACTIONS } from "../organizations/organization-actions";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { can } from "../organizations/organization-policy";
import { AUTO_OFF_AFTER, WebhookDeliverHandler } from "./deliver.handler";
import { emitWebhook, WEBHOOK_DELIVER_TYPE } from "./emitter";
import { WebhookEndpointsService } from "./endpoints.service";
import {
    DELIVERY_ID_HEADER,
    SIGNATURE_HEADER,
    verifySignature,
} from "./signing";

const mutableEnv = env as { WEBHOOK_SECRET_KEY?: string; APP_URL?: string };
const keyBefore = mutableEnv.WEBHOOK_SECRET_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

// Fixture cap: an obviously fake number, never a plan's.
const CAP = 2;
const access = {
    resolve: jest.fn().mockResolvedValue({
        source: "catalogue",
        entitlements: { webhooks: CAP },
        modules: [
            {
                moduleId: "webhooks",
                state: "on",
                limit: CAP,
                per: "total",
                name: "Webhooks",
                plan: "Fixture plan",
                planId: "fixture",
                upgradeTo: "",
                upgradePlanId: "",
                upgradePricePaise: 0,
                upgradeUncapped: false,
            },
        ],
    }),
};
const flags = { isEnabled: jest.fn().mockResolvedValue(true) };

/** Every name is public, unless a test says otherwise. */
let resolve: Resolver = () =>
    Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

const service = new WebhookEndpointsService(
    new AuditService(),
    flags as unknown as FeatureFlagService,
    access as unknown as CatalogueAccessService,
);
service.resolver = (host) => resolve(host);

const handler = new WebhookDeliverHandler(
    new AuditService(),
    new OrganizationContextService(),
    flags as unknown as FeatureFlagService,
    access as unknown as CatalogueAccessService,
);

// ── The receiver, in this process ───────────────────────────────────────────

interface Received {
    headers: IncomingHttpHeaders;
    body: string;
}
let server: Server;
let port = 0;
let received: Received[] = [];
let answer = { status: 200, body: "thanks" };

/**
 * The guard's checks run as in production (https on 443, DNS vetted, the
 * socket pinned); only the last hop goes to the local receiver over plain
 * http, since it has no certificate for the endpoint's name.
 */
const toReceiver: Transport = (r) =>
    new Promise((done, fail) => {
        const req = httpRequest(
            {
                host: "127.0.0.1",
                port,
                path: r.url.pathname,
                method: r.method ?? "GET",
                headers: r.headers,
                signal: r.signal,
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (c: Buffer) => chunks.push(c));
                res.on("end", () =>
                    done({
                        status: res.statusCode ?? 0,
                        headers: {},
                        body: Buffer.concat(chunks).subarray(0, r.maxBytes),
                        truncated: false,
                    }),
                );
            },
        );
        req.on("error", fail);
        req.end(r.body);
    });

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.WEBHOOK_SECRET_KEY = randomBytes(32).toString("base64");
    server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
            received.push({
                headers: req.headers,
                body: Buffer.concat(chunks).toString("utf8"),
            });
            res.writeHead(answer.status, { "content-type": "text/plain" });
            res.end(answer.body);
        });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
    handler.net = { resolve: (host) => resolve(host), transport: toReceiver };
});
const appUrlBefore = mutableEnv.APP_URL;
afterEach(() => {
    mutableEnv.APP_URL = appUrlBefore;
});
afterAll(async () => {
    mutableEnv.WEBHOOK_SECRET_KEY = keyBefore;
    await new Promise((r) => server.close(r));
});
beforeEach(() => {
    received = [];
    answer = { status: 200, body: "thanks" };
    resolve = () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]);
    flags.isEnabled.mockResolvedValue(true);
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function business(edition: "INDIA" | "GLOBAL" = "INDIA") {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("u13"), edition },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Meera" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        roleKey: "OWNER",
        actions: new Set(ORG_ACTIONS.filter((a) => can("OWNER", a))),
        edition,
    };
    return { org, owner };
}

const URL_ = "https://hooks.example.com/saroh";

/** A customer made with the change's own transaction, as a write path does. */
async function newCustomer(organizationId: string) {
    return prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
            data: {
                organizationId,
                email: `${uniq("asha")}@example.com`,
                firstName: "Asha",
            },
        });
        await emitWebhook(tx, {
            organizationId,
            type: "customer.created",
            id: contact.id,
        });
        return contact;
    });
}

async function jobsOf(organizationId: string): Promise<Job[]> {
    return prisma.job.findMany({
        where: { organizationId, type: WEBHOOK_DELIVER_TYPE },
        orderBy: { createdAt: "asc" },
    });
}

/** Runs one try, as the worker would on try number `attempt` (1-based). */
async function run(job: Job, attempt = 1): Promise<unknown> {
    try {
        await handler.handle({ ...job, attempts: attempt - 1 });
        return null;
    } catch (error) {
        return error;
    }
}

// ── Endpoints ───────────────────────────────────────────────────────────────

describe("webhook endpoints (U13)", () => {
    it("keeps the secret sealed, shows it once, and audits create, update, roll and delete", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        expect(made.secret).toMatch(/^whsec_/);
        const row = await prisma.webhookEndpoint.findUniqueOrThrow({
            where: { id: made.endpoint.id },
        });
        expect(JSON.stringify(row)).not.toContain(made.secret);
        expect(JSON.stringify(await service.list(owner))).not.toContain(
            made.secret,
        );

        await service.update(owner, made.endpoint.id, {
            events: ["customer.created", "booking.created"],
        });
        const rolled = await service.roll(owner, made.endpoint.id);
        expect(rolled.secret).not.toBe(made.secret);
        expect(rolled.endpoint.previousSecretUntil).not.toBeNull();
        await service.remove(owner, made.endpoint.id);

        const audit = await prisma.auditEvent.findMany({
            where: { organizationId: org.id, targetId: made.endpoint.id },
            orderBy: { createdAt: "asc" },
        });
        expect(audit.map((a) => a.action)).toEqual([
            "webhook.created",
            "webhook.updated",
            "webhook.secret_rolled",
            "webhook.deleted",
        ]);
        expect(JSON.stringify(audit)).not.toContain(made.secret);
        expect(JSON.stringify(audit)).not.toContain(rolled.secret);
    });

    it.each([
        ["http://hooks.example.com/x"],
        ["https://localhost/x"],
        ["https://10.0.0.1/x"],
    ])("refuses %s on save", async (url) => {
        const { owner } = await business();
        await expect(
            service.create(owner, { url, events: ["order.paid"] }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses on save a name that resolves to a private address", async () => {
        const { owner } = await business();
        resolve = () => Promise.resolve([{ address: "10.1.2.3", family: 4 }]);
        await expect(
            service.create(owner, { url: URL_, events: ["order.paid"] }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("holds a business to its cap, and 404s with the kill switch off", async () => {
        const { owner } = await business();
        for (let i = 0; i < CAP; i += 1) {
            await service.create(owner, { url: URL_, events: ["order.paid"] });
        }
        await expect(
            service.create(owner, { url: URL_, events: ["order.paid"] }),
        ).rejects.toMatchObject({ status: 403 });
        flags.isEnabled.mockResolvedValue(false);
        await expect(service.list(owner)).rejects.toMatchObject({
            status: 404,
        });
    });

    it("a role with webhook:manage but no customer read can't subscribe to customer.created", async () => {
        const { owner } = await business();
        const developer: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "developer",
            actions: new Set<OrgAction>(["webhook:manage", "order:read"]),
        };
        await expect(
            service.create(developer, {
                url: URL_,
                events: ["customer.created"],
            }),
        ).rejects.toMatchObject({ status: 403 });
        await expect(
            service.create(developer, { url: URL_, events: ["order.paid"] }),
        ).resolves.toBeDefined();
    });
});

// ── The outbox ──────────────────────────────────────────────────────────────

describe("emitting (U13)", () => {
    it("queues one delivery per subscribed endpoint, none for others", async () => {
        const { org, owner } = await business();
        await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await service.create(owner, { url: URL_, events: ["order.paid"] });
        await newCustomer(org.id);
        expect(await jobsOf(org.id)).toHaveLength(1);
    });

    it("a rolled-back change queues nothing", async () => {
        const { org, owner } = await business();
        await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await expect(
            prisma.$transaction(async (tx) => {
                const contact = await tx.contact.create({
                    data: { organizationId: org.id, email: "x@example.com" },
                });
                await emitWebhook(tx, {
                    organizationId: org.id,
                    type: "customer.created",
                    id: contact.id,
                });
                throw new Error("the order failed");
            }),
        ).rejects.toThrow("the order failed");
        expect(await jobsOf(org.id)).toHaveLength(0);
        expect(
            await prisma.webhookDelivery.count({
                where: { organizationId: org.id },
            }),
        ).toBe(0);
    });
});

// ── Delivery ────────────────────────────────────────────────────────────────

describe("delivering (U13)", () => {
    it("sends a signed customer.created with no sensitive fields and an edition link, and logs it", async () => {
        const { org, owner } = await business("GLOBAL");
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        const contact = await newCustomer(org.id);
        await prisma.contactAttention.create({
            data: {
                organizationId: org.id,
                contactId: contact.id,
                kind: "MEDICAL",
                label: "Asthma",
                detail: "Inhaler in the front desk drawer",
                sensitive: true,
            },
        });
        const [job] = await jobsOf(org.id);
        mutableEnv.APP_URL = "https://app.saroh.in";
        expect(await run(job)).toBeNull();

        expect(received).toHaveLength(1);
        const [hit] = received;
        const signature = String(hit.headers[SIGNATURE_HEADER.toLowerCase()]);
        expect(verifySignature(signature, hit.body, made.secret)).toBe(true);
        const delivery = await prisma.webhookDelivery.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        expect(hit.headers[DELIVERY_ID_HEADER.toLowerCase()]).toBe(delivery.id);
        const body = JSON.parse(hit.body) as {
            id: string;
            type: string;
            data: Record<string, unknown>;
            links: { app: string };
        };
        expect(body).toMatchObject({
            id: delivery.id,
            type: "customer.created",
            data: { id: contact.id, firstName: "Asha" },
        });
        expect(hit.body).not.toContain("Asthma");
        expect(hit.body).not.toContain("Inhaler");
        expect(body.data).not.toHaveProperty("notes");
        expect(body.links.app).toBe(
            `${appBase("GLOBAL")}/customers/${contact.id}`,
        );
        // Sent under production's address, where the editions' apps
        // differ: a Global business's link is never India's app.
        expect(appBase("GLOBAL")).not.toBe(appBase("INDIA"));
        expect(body.links.app.startsWith(appBase("INDIA"))).toBe(false);

        expect(delivery).toMatchObject({
            status: "DELIVERED",
            attempts: 1,
            lastStatusCode: 200,
            responseSnippet: "thanks",
        });
    });

    it("throws on a 500 so the worker backs off, and is FAILED when tries run out", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await newCustomer(org.id);
        const [job] = await jobsOf(org.id);
        answer = { status: 500, body: "x".repeat(5000) };

        expect(await run(job, 1)).toBeInstanceOf(Error);
        let delivery = await prisma.webhookDelivery.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        expect(delivery).toMatchObject({
            status: "PENDING",
            attempts: 1,
            lastStatusCode: 500,
        });
        expect(delivery.responseSnippet).toHaveLength(2048);

        expect(await run(job, job.maxAttempts)).toBeInstanceOf(Error);
        delivery = await prisma.webhookDelivery.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        expect(delivery.status).toBe("FAILED");
        const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({
            where: { id: made.endpoint.id },
        });
        expect(endpoint).toMatchObject({ failureStreak: 1, disabledAt: null });
    });

    it(`switches the endpoint off after ${AUTO_OFF_AFTER} failed deliveries in a row and tells the business`, async () => {
        const mail = jest
            .spyOn(email, "sendTeamAlertEmail")
            .mockResolvedValue(undefined);
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await prisma.webhookEndpoint.update({
            where: { id: made.endpoint.id },
            data: { failureStreak: AUTO_OFF_AFTER - 1 },
        });
        await newCustomer(org.id);
        const [job] = await jobsOf(org.id);
        answer = { status: 503, body: "" };
        await run(job, job.maxAttempts);

        const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({
            where: { id: made.endpoint.id },
        });
        expect(endpoint.disabledAt).not.toBeNull();
        expect(
            await prisma.notification.count({
                where: { organizationId: org.id, type: "webhook.disabled" },
            }),
        ).toBe(1);
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: org.id,
                    action: "webhook.auto_disabled",
                },
            }),
        ).toBe(1);
        expect(mail).toHaveBeenCalledTimes(1);
        mail.mockRestore();

        // Off: a new event queues nothing.
        await newCustomer(org.id);
        expect(await jobsOf(org.id)).toHaveLength(1);
    });

    it("refuses at send a name that now resolves to a private address", async () => {
        const { org, owner } = await business();
        await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await newCustomer(org.id);
        const [job] = await jobsOf(org.id);
        resolve = () => Promise.resolve([{ address: "127.0.0.1", family: 4 }]);
        expect(await run(job)).toBeInstanceOf(Error);
        expect(received).toHaveLength(0);
    });

    it("re-checks the creator: one who left fails the delivery without sending", async () => {
        const { org, owner } = await business();
        const other = await prisma.user.create({
            data: { email: `${uniq("dev")}@example.com`, name: "Dev" },
        });
        await prisma.membership.create({
            data: { organizationId: org.id, userId: other.id, role: "ADMIN" },
        });
        const dev: OrganizationContext = {
            ...owner,
            userId: other.id,
            role: "ADMIN",
            roleKey: "ADMIN",
        };
        await service.create(dev, { url: URL_, events: ["customer.created"] });
        await prisma.membership.deleteMany({
            where: { organizationId: org.id, userId: other.id },
        });
        await newCustomer(org.id);
        const [job] = await jobsOf(org.id);
        expect(await run(job)).toBeNull();
        expect(received).toHaveLength(0);
        const delivery = await prisma.webhookDelivery.findFirstOrThrow({
            where: { organizationId: org.id },
        });
        expect(delivery.status).toBe("FAILED");
        expect(delivery.lastError).toMatch(/no longer has access/);
    });

    it("a resend keeps the delivery id and the body, signed anew; a test sends a ping", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await newCustomer(org.id);
        const [first] = await jobsOf(org.id);
        await run(first);
        const delivery = await prisma.webhookDelivery.findFirstOrThrow({
            where: { organizationId: org.id },
        });

        await service.resend(owner, made.endpoint.id, delivery.id);
        const [, again] = await jobsOf(org.id);
        await run(again);
        expect(received).toHaveLength(2);
        expect(received[1].headers[DELIVERY_ID_HEADER.toLowerCase()]).toBe(
            delivery.id,
        );
        expect(received[1].body).toBe(received[0].body);
        expect(
            verifySignature(
                String(received[1].headers[SIGNATURE_HEADER.toLowerCase()]),
                received[1].body,
                made.secret,
            ),
        ).toBe(true);

        const ping = await service.test(owner, made.endpoint.id);
        const jobs = await jobsOf(org.id);
        await run(jobs[jobs.length - 1]);
        expect(JSON.parse(received[2].body)).toMatchObject({
            id: ping.id,
            type: "ping",
        });
    });

    it("keeps an address's name, and lists when it was last sent to and how that went", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            name: "Order sync",
            events: ["customer.created"],
        });
        expect(made.endpoint.name).toBe("Order sync");
        expect(made.endpoint.lastSent).toBeNull();
        const renamed = await service.update(owner, made.endpoint.id, {
            name: null,
        });
        expect(renamed.name).toBeNull();
        await service.update(owner, made.endpoint.id, { name: "Orders" });

        await newCustomer(org.id);
        const [job] = await jobsOf(org.id);
        await run(job);
        const [listed] = (await service.list(owner)).data;
        expect(listed.name).toBe("Orders");
        expect(listed.lastSent?.status).toBe("DELIVERED");
        expect(listed.lastSent?.at).toEqual(expect.any(String));
    });

    it("sends a test to an address that is off: one that gets through turns it back on", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await prisma.webhookEndpoint.update({
            where: { id: made.endpoint.id },
            data: { disabledAt: new Date(), failureStreak: AUTO_OFF_AFTER },
        });

        // A failed test leaves it off, its count as it was.
        answer = { status: 500, body: "" };
        await service.test(owner, made.endpoint.id);
        let jobs = await jobsOf(org.id);
        const failed = jobs[jobs.length - 1];
        expect(await run(failed, failed.maxAttempts)).toBeInstanceOf(Error);
        let endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({
            where: { id: made.endpoint.id },
        });
        expect(endpoint.disabledAt).not.toBeNull();
        expect(endpoint.failureStreak).toBe(AUTO_OFF_AFTER);

        answer = { status: 200, body: "thanks" };
        const ping = await service.test(owner, made.endpoint.id);
        jobs = await jobsOf(org.id);
        expect(await run(jobs[jobs.length - 1])).toBeNull();
        expect(JSON.parse(received[received.length - 1].body)).toMatchObject({
            id: ping.id,
            type: "ping",
        });
        endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({
            where: { id: made.endpoint.id },
        });
        expect(endpoint.disabledAt).toBeNull();
        expect(endpoint.failureStreak).toBe(0);
        const event = await prisma.auditEvent.findFirstOrThrow({
            where: { organizationId: org.id, action: "webhook.on_after_test" },
        });
        expect(event.targetId).toBe(made.endpoint.id);

        // On again: a real event is sent.
        await newCustomer(org.id);
        expect(await jobsOf(org.id)).toHaveLength(3);
    });

    it("refuses a test to a private address even when the address is off", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        await service.update(owner, made.endpoint.id, { enabled: false });
        await service.test(owner, made.endpoint.id);
        const [job] = await jobsOf(org.id);
        resolve = () => Promise.resolve([{ address: "10.0.0.5", family: 4 }]);
        expect(await run(job)).toBeInstanceOf(Error);
        expect(received).toHaveLength(0);
    });

    it("limits how many tests one address gets in a minute", async () => {
        const { owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        for (let i = 0; i < 5; i++) {
            await service.test(owner, made.endpoint.id);
        }
        await expect(
            service.test(owner, made.endpoint.id),
        ).rejects.toMatchObject({ status: 429 });
    });

    it("signs with both secrets for a day after a roll", async () => {
        const { org, owner } = await business();
        const made = await service.create(owner, {
            url: URL_,
            events: ["customer.created"],
        });
        const rolled = await service.roll(owner, made.endpoint.id);
        await newCustomer(org.id);
        const [job] = await jobsOf(org.id);
        await run(job);
        const header = String(
            received[0].headers[SIGNATURE_HEADER.toLowerCase()],
        );
        expect(verifySignature(header, received[0].body, made.secret)).toBe(
            true,
        );
        expect(verifySignature(header, received[0].body, rolled.secret)).toBe(
            true,
        );
    });
});
