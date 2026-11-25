/**
 * Subscriptions' read routes (DEC-259): the list, one subscription, the
 * settings for every plan and who can be subscribed. Each has the section's
 * gate (Payments on, `subscription:read`; the picker `subscription:write`),
 * answers what its service gives as JSON, and never passes on a provider's
 * reference: an API answer carrying a mandate, a token or a provider's
 * customer, subscription or payment id reaches neither the route's JSON nor
 * the cache. Another business's subscription is a 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
interface Hoisted {
    active: string | null;
    business: Business;
    module: string;
    sub: unknown;
    subs: unknown[];
    events: unknown;
    plans: unknown[];
    charges: unknown[];
}
const h = vi.hoisted((): Hoisted => ({
    active: "org_a",
    business: null,
    module: "available",
    sub: null,
    subs: [],
    events: null,
    plans: [],
    charges: [],
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve({ state: h.module }),
}));
vi.mock("@/lib/invoices/contacts", () => ({
    contactPickerOptions: () =>
        Promise.resolve([
            { id: "c_1", name: "Asha Rao", email: "asha@example.com" },
        ]),
}));
vi.mock("@/lib/subscriptions/service", () => {
    const ok = <T>(data: T) => Promise.resolve({ state: "ok", data });
    return {
        listSubscriptions: () =>
            Promise.resolve({ rows: h.subs, truncated: false }),
        listPlansOptional: () => ok(h.plans),
        listChargesBySubscription: () => ok({ sub_1: h.charges }),
        getRenewals: () =>
            Promise.resolve({
                lastCheckedAt: "2026-11-25T04:00:00.000Z",
                nextCheckAt: null,
                issuedToday: 0,
            }),
        getSubscription: (id: string) =>
            Promise.resolve(id === "sub_1" ? h.sub : null),
        listPlans: () => Promise.resolve(h.plans),
        listCharges: () => ok(h.charges),
        listSubscriptionEvents: () => ok(h.events),
        getSubscriberCard: () =>
            Promise.resolve({ phone: null, allergens: [] }),
        getSubscriptionSettings: () =>
            Promise.resolve({
                membersCanPause: true,
                accountArea: true,
                autopay: null,
            }),
    };
});

import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    expectReadContract,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";
import {
    subscriptionContactsServer,
    subscriptionServer,
    subscriptionSettingsServer,
    subscriptionsListServer,
} from "@/lib/subscriptions/access-server";

import { GET as ONE } from "./[subscriptionId]/route";
import { GET as CONTACTS } from "./contacts/route";
import { GET, POST } from "./route";
import { GET as SETTINGS } from "./settings/route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["subscription:read", "subscription:write"],
};
const READER = { id: "org_a", role: "MEMBER", actions: ["subscription:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["order:stage"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };
const CALENDAR = { id: "org_a", role: "MEMBER", actions: ["calendar:read"] };

/** What the API may answer, with what it must never send on. */
const LEAKY_SUB = {
    id: "sub_1",
    status: "ACTIVE",
    plan: { id: "pl_1", name: "Loaf plan", providerPlanId: "plan_RZP1" },
    contact: {
        id: "c_1",
        name: "Asha Rao",
        email: "asha@example.com",
        providerCustomerId: "cust_RZP1",
    },
    price: "800.00",
    currency: "INR",
    interval: "MONTH",
    timezone: "Asia/Kolkata",
    providerSubscriptionId: "sub_RZP1",
    paymentToken: "token_RZP1",
    autopay: {
        state: "ON",
        method: "UPI",
        hint: "asha@ok…",
        limit: "1500.00",
        currency: "INR",
        since: "2026-10-01T00:00:00.000Z",
        failure: null,
        mandateId: "mandate_RZP1",
        providerMandateId: "mandate_RZP1",
    },
    autopayCard: {
        offered: true,
        methods: ["UPI"],
        checks: {},
        provider: "Razorpay",
        setUp: { source: "SETUP_LINK", at: "2026-10-01", sentBy: null },
        ended: null,
        limitLow: null,
        emailTo: "asha@example.com",
        providerCustomerId: "cust_RZP1",
        keySecret: "rzp_secret",
    },
    gst: { mode: "INCLUDED", rate: "18", razorpayItemId: "item_RZP1" },
};
const LEAKY_CHARGE = {
    id: "inv_1",
    number: "INV-0001",
    status: "PAID",
    total: "800.00",
    currency: "INR",
    payment: { method: "UPI", providerPaymentId: "pay_RZP1" },
    providerOrderId: "order_RZP1",
};
const LEAKY_EVENTS = {
    events: [
        {
            id: "ev_1",
            kind: "AUTOPAY_SET_UP",
            actor: { kind: "CUSTOMER", userId: null, name: null },
            invoice: null,
            note: null,
            data: {
                method: "UPI",
                limit: "1500.00",
                mandateId: "mandate_RZP1",
            },
            createdAt: "2026-10-01T00:00:00.000Z",
        },
    ],
    nextCursor: null,
    earlierUnrecorded: false,
};
const LEAKY_PLAN = {
    id: "pl_1",
    name: "Loaf plan",
    price: "800.00",
    status: "ACTIVE",
    providerPlanId: "plan_RZP1",
};
const SECRETS = /RZP|rzp_secret/;

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.module = "available";
    h.sub = LEAKY_SUB;
    h.subs = [LEAKY_SUB];
    h.plans = [LEAKY_PLAN];
    h.charges = [LEAKY_CHARGE];
    h.events = LEAKY_EVENTS;
};

const req = (path: string) => readRequest(path, { orgId: "org_a" });
const list = () => GET(req("/api/subscriptions"));
const one = (id = "sub_1") =>
    ONE(req(`/api/subscriptions/${id}`), {
        params: Promise.resolve({ subscriptionId: id }),
    });
const settings = () => SETTINGS(req("/api/subscriptions/settings"));
const contacts = () => CONTACTS(req("/api/subscriptions/contacts"));

const signedOut = () => {
    as(null)();
    h.active = null;
};
const elsewhere = () => {
    as(OWNER)();
    h.active = "org_b";
};
const paymentsOff = () => {
    as(OWNER)();
    h.module = "hidden";
};
/** The section's gate, as each read route asks it. */
const READ_GATE = {
    owner: { as: as(OWNER), status: 200 },
    "a role given subscription:read": { as: as(READER), status: 200 },
    member: { as: as(MEMBER), status: 403 },
    reviewer: { as: as(REVIEWER), status: 403 },
    "calendar-only": { as: as(CALENDAR), status: 403 },
    "Payments off": { as: paymentsOff, status: 403 },
    "signed out": { as: signedOut, status: 401 },
    "another business open in this tab": { as: elsewhere, status: 409 },
};

beforeEach(() => as(OWNER)());

describe("/api/subscriptions", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(subscriptionsListServer, GET, "org_a", {});
    });

    it("never sends a provider's reference, nor caches one", async () => {
        const body = JSON.stringify(await (await list()).json());
        expect(body).not.toMatch(SECRETS);
        expect(body).toContain("Asha Rao");
        expect(body).toContain('"hint":"asha@ok…"');
        const client = makeTestClient();
        await prefetchRead(client, subscriptionsListServer, "org_a", {});
        expect(
            JSON.stringify(client.getQueryCache().getAll()[0]?.state.data),
        ).not.toMatch(SECRETS);
    });

    it("is the section's gate", async () => {
        await expectAuthzMatrix(READ_GATE, list);
    });

    it("takes no params and no other method", async () => {
        const res = await GET(
            readRequest("/api/subscriptions", {
                orgId: "org_a",
                params: { status: "ACTIVE" },
            }),
        );
        expect(res.status).toBe(400);
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/subscriptions/[subscriptionId]", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(subscriptionServer, () => one(), "org_a", {
            subscriptionId: "sub_1",
        });
    });

    it("never sends a provider's reference: the subscription, its charges, its log", async () => {
        const body = JSON.stringify(await (await one()).json());
        expect(body).not.toMatch(SECRETS);
        expect(body).toContain('"provider":"Razorpay"');
        expect(body).toContain('"method":"UPI"');
    });

    it("another business's (or a missing) subscription is a 404", async () => {
        const res = await one("sub_of_b");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("is the section's gate", async () => {
        await expectAuthzMatrix(READ_GATE, () => one());
    });
});

describe("/api/subscriptions/settings", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(
            subscriptionSettingsServer,
            SETTINGS,
            "org_a",
            {},
        );
    });

    it("is the section's gate", async () => {
        await expectAuthzMatrix(READ_GATE, settings);
    });
});

describe("/api/subscriptions/contacts", () => {
    it("answers what its service gives", async () => {
        await expectReadContract(
            subscriptionContactsServer,
            CONTACTS,
            "org_a",
            {},
        );
    });

    it("is only for someone who may subscribe them", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "a role that only reads": { as: as(READER), status: 403 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "Payments off": { as: paymentsOff, status: 403 },
                "signed out": { as: signedOut, status: 401 },
            },
            contacts,
        );
    });
});
