/**
 * Settings' Modules, Integrations and Plan and billing read routes
 * (DEC-259). The service and each route answer the same JSON; each goes to
 * whoever may open that tab (Plan and billing to `billing:read`), and to
 * nobody else. Whatever the API sends, no key secret, webhook signing
 * secret, provider credential, token or anything else of a billing profile
 * reaches the route's JSON or the browser's cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = {
    id: string;
    name?: string;
    role?: string;
    actions?: string[];
} | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const fn = () => vi.fn<(...a: unknown[]) => Promise<unknown>>();
const h = vi.hoisted(() => ({
    active: "org_a" as string | null, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    business: null as Business,
    plansOpen: true,
    health: null as unknown as Fn,
    modules: null as unknown as Fn,
    payments: null as unknown as Fn,
    comms: null as unknown as Fn,
    profile: null as unknown as Fn,
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_PLANS: "on" } }));
vi.mock("@/lib/modules/service", () => ({ listModules: () => h.modules() }));
vi.mock("@/lib/modules/guard", () => ({
    modulesOrUnknown: () => Promise.resolve(null),
}));
vi.mock("@/lib/communications/email-setup-service", () => ({
    readMyEmailSetup: () => Promise.resolve(null),
    readEmailSetup: () => Promise.resolve(null),
}));
vi.mock("@/lib/communications/account-updates-service", () => ({
    readAccountUpdates: () => Promise.resolve(null),
}));
vi.mock("@/lib/communications/customer-emails-service", () => ({
    readCustomerEmails: () => Promise.resolve(null),
}));
vi.mock("@/lib/provider-health/service", () => ({
    listProviderHealth: () => h.health(),
}));
vi.mock("@/lib/providers/service", () => ({
    listPaymentProviders: () => h.payments(),
    listCommsProviders: () => h.comms(),
    listPaymentWebhooks: () =>
        Promise.resolve([
            {
                provider: "RAZORPAY",
                url: "https://api.example.com/hooks/rzp",
                events: ["payment.captured"],
                secretRequired: true,
                lastReceivedAt: null,
                signingSecret: "whsec_leak",
            },
        ]),
}));
vi.mock("@/lib/domains/service", () => ({
    listOrgDomains: () => Promise.resolve([]),
}));
vi.mock("@/lib/stores/storefronts", () => ({
    listCheckoutProviders: () => Promise.resolve([]),
}));
vi.mock("@/lib/google-calendar/service", () => ({
    readGoogleCalendar: () => Promise.resolve({ kind: "off" }),
}));
vi.mock("@/lib/ask-ai/ask-ai-switch", () => ({ askAiOn: () => false }));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
    plansOpen: () => Promise.resolve(h.plansOpen),
    getBillingProfileView: () => h.profile(),
    getPlanUsage: () => Promise.resolve({ status: "not-available-yet" }),
    listAddons: () => Promise.resolve({ status: "ok", data: null }),
    listSarohInvoices: () => Promise.resolve({ status: "ok", data: [] }),
}));
vi.mock("@/lib/saroh-billing/plan-reads", () => ({
    readPlanBasics: () =>
        Promise.resolve({
            subscription: null,
            access: null,
            catalog: null,
            liveVersion: null,
            checkouts: null,
            checkoutsRead: true,
        }),
    readPlanCards: () =>
        Promise.resolve({
            rows: null,
            yearly: { on: false },
            cycle: "month",
            currentPlan: "Free",
            waiting: null,
        }),
}));

import { modulesServer } from "@/lib/modules/access";
import { providersServer } from "@/lib/providers/access";
import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    expectReadContract,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";
import { billingServer } from "@/lib/saroh-billing/screen-service";

import * as modulesRoute from "../modules/route";
import * as billingRoute from "../settings/billing/route";
import * as providersRoute from "./route";

const all = (role: string, actions: string[]) => ({
    id: "org_a",
    name: "Rye",
    role,
    actions,
});
const OWNER = all("OWNER", [
    "billing:read",
    "billing:manage",
    "comms:manage",
    "provider:read",
]);
const ADMIN = all("ADMIN", ["billing:read", "comms:manage", "provider:read"]);
const MEMBER = all("MEMBER", ["org:read"]);
const REVIEWER = all("REVIEWER", ["site:review"]);

/** What a row draws of a payment and an email connection. */
const RAZORPAY = {
    id: "pp1",
    provider: "RAZORPAY",
    status: "CONNECTED",
    publicKey: "rzp_live_public",
    webhookSecretMissing: false,
    attention: null,
    activeMemberships: 0,
    checkoutStyle: null,
    updatedAt: "2099-01-01T00:00:00.000Z",
};
const RESEND = {
    id: "cp1",
    channel: "EMAIL",
    provider: "RESEND",
    status: "CONNECTED",
    fromAddress: "hello@rye.example.com",
    attention: null,
    updatedAt: "2099-01-01T00:00:00.000Z",
};
const MINE = {
    id: "bprof_1",
    legalName: "Rye LLP",
    gstin: null,
    gstState: "29",
    addressLine1: "3 Hill Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560038",
    billingEmail: "accounts@rye.example.com",
    phone: null,
    businesses: 1,
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.plansOpen = true;
    h.modules = fn().mockResolvedValue([]);
    h.health = fn().mockResolvedValue(
        who?.actions?.includes("provider:read")
            ? {
                  status: "ok",
                  health: [
                      {
                          key: "PAYMENTS",
                          label: "Payments",
                          status: "OK",
                          message: "",
                          actionHref: "/settings/integrations",
                          apiKey: "sk_health_leak",
                      },
                  ],
              }
            : { status: "denied" },
    );
    h.payments = fn().mockResolvedValue([
        {
            ...RAZORPAY,
            keySecret: "rzp_secret_leak",
            webhookSecret: "whsec_leak",
            attention: null,
        },
    ]);
    h.comms = fn().mockResolvedValue([
        { ...RESEND, credentials: { apiKey: "re_secret_leak" } },
    ]);
    h.profile = fn().mockResolvedValue({
        status: "ok",
        data: {
            current: { ...MINE, mine: true, razorpayCustomerId: "cust_leak" },
            mine: [{ ...MINE, token: "tok_leak" }],
            businessesOnCurrent: 1,
            pendingSwitch: null,
            mandateToken: "tok_leak",
        },
    });
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    "/api/modules": modulesRoute.GET,
    "/api/providers": providersRoute.GET,
    "/api/settings/billing": billingRoute.GET,
} as const;

function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
    }
    return [];
}
const SECRET = /token|secret|hash|password|credential|apikey|customerid/i;
/** Facts about a secret, never one: whether it is missing or asked for. */
const FACTS = new Set(["webhookSecretMissing", "secretRequired"]);
const secretKeys = (v: unknown) =>
    keysOf(v).filter((k) => SECRET.test(k) && !FACTS.has(k));
const LEAK = /leak/;

describe("/api/modules, /api/providers, /api/settings/billing", () => {
    it("answers what its service reads", async () => {
        await expectReadContract(modulesServer, modulesRoute.GET, "org_a", {});
        await expectReadContract(
            providersServer,
            providersRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(billingServer, billingRoute.GET, "org_a", {});
    });

    it("carries connections and who Saroh bills as facts: no key, secret, credential or token in the JSON or the cache", async () => {
        const res = await providersRoute.GET(
            readRequest("/api/providers", { orgId: "org_a" }),
        );
        const body = (await res.json()) as {
            payments: unknown[];
            messaging: unknown[];
            webhooks: { url: string }[];
        };
        expect(body.payments).toEqual([RAZORPAY]);
        expect(body.messaging).toEqual([RESEND]);
        expect(body.webhooks[0]?.url).toBe("https://api.example.com/hooks/rzp");
        expect(JSON.stringify(body)).not.toMatch(LEAK);
        expect(secretKeys(body)).toEqual([]);

        const billing = (await (
            await billingRoute.GET(
                readRequest("/api/settings/billing", { orgId: "org_a" }),
            )
        ).json()) as { billedTo: unknown };
        expect(billing.billedTo).toEqual({
            current: { ...MINE, mine: true },
            mine: [MINE],
            businessesOnCurrent: 1,
            pendingSwitch: null,
        });

        // What a query holds is the service's answer as the wire carries it.
        const client = makeTestClient();
        await prefetchRead(client, providersServer, "org_a", {});
        await prefetchRead(client, billingServer, "org_a", {});
        await prefetchRead(client, modulesServer, "org_a", {});
        const held = client
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data);
        expect(held).toHaveLength(3);
        expect(JSON.stringify(held)).not.toMatch(LEAK);
        expect(secretKeys(held)).toEqual([]);
    });

    it("shows an admin nothing of who Saroh bills, and never asks for it", async () => {
        as(ADMIN)();
        const body = (await (
            await billingRoute.GET(
                readRequest("/api/settings/billing", { orgId: "org_a" }),
            )
        ).json()) as { kind: string; canChange: boolean; billedTo?: unknown };
        expect(body.kind).toBe("plan");
        expect(body.canChange).toBe(false);
        expect("billedTo" in body).toBe(false);
        expect(body).toMatchObject({ plan: { pending: null, cancel: null } });
        expect(h.profile).not.toHaveBeenCalled();
    });

    it("draws only the calendar for someone the API won't show the providers to, and reads none of them", async () => {
        as(MEMBER)();
        const body = (await (
            await providersRoute.GET(
                readRequest("/api/providers", { orgId: "org_a" }),
            )
        ).json()) as { denied: boolean; payments: unknown[] };
        expect(body.denied).toBe(true);
        expect(body.payments).toEqual([]);
        expect(h.payments).not.toHaveBeenCalled();
        expect(h.comms).not.toHaveBeenCalled();
    });

    it("says Free with nothing read where Saroh doesn't bill", async () => {
        h.plansOpen = false;
        expect(await billingServer.service({})).toEqual({ kind: "free" });
        expect(h.profile).not.toHaveBeenCalled();
    });

    it("is each tab's gate: Plan and billing to billing:read, Modules and Integrations to everyone in it", async () => {
        const want = {
            owner: [200, 200, 200],
            admin: [200, 200, 200],
            member: [200, 200, 403],
            reviewer: [200, 200, 403],
        };
        const paths = Object.keys(ROUTES) as (keyof typeof ROUTES)[];
        for (let i = 0; i < paths.length; i += 1) {
            const path = paths[i];
            const GET = ROUTES[path];
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: want.owner[i] },
                    admin: { as: as(ADMIN), status: want.admin[i] },
                    member: { as: as(MEMBER), status: want.member[i] },
                    reviewer: { as: as(REVIEWER), status: want.reviewer[i] },
                    "signed out": {
                        as: () => {
                            as(null)();
                            h.active = null;
                        },
                        status: 401,
                    },
                    "another business open in this tab": {
                        as: () => {
                            as(OWNER)();
                            h.active = "org_b";
                        },
                        status: 409,
                    },
                },
                () => GET(readRequest(path, { orgId: "org_a" })),
            );
        }
    });

    it("takes no params; a failed read is a generic failure; only GET answers", async () => {
        for (const [path, GET] of Object.entries(ROUTES)) {
            const res = await GET(
                readRequest(path, { orgId: "org_a", params: { tab: "x" } }),
            );
            expect(res.status, path).toBe(400);
        }
        expect(h.modules).not.toHaveBeenCalled();
        h.modules.mockRejectedValue(new Error("down: sk_live_123"));
        const failed = await modulesRoute.GET(
            readRequest("/api/modules", { orgId: "org_a" }),
        );
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
        h.health.mockRejectedValue(new Error("down"));
        const health = await providersRoute.GET(
            readRequest("/api/providers", { orgId: "org_a" }),
        );
        expect(health.status).toBe(503);
        expect((await providersRoute.POST()).status).toBe(405);
        expect((await modulesRoute.DELETE()).status).toBe(405);
        expect((await billingRoute.PUT()).status).toBe(405);
    });
});
