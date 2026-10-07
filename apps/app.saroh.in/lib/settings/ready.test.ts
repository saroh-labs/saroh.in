import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import { settingsChecklist } from "./nudges";
import type { ReadyStep } from "./ready";
import {
    SETUP_HIDDEN_KEY,
    checklistHeading,
    emailAttention,
    handlesMoney,
    providersTabNote,
    readSetupHidden,
    readyChecklist,
    takeMoneyPlace,
    writeSetupHidden,
} from "./ready";

function mod(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "ENABLED",
        readiness: "ACTIVE",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: [],
        ...over,
    };
}

function comms(
    channel: "EMAIL" | "WHATSAPP",
    status = "CONNECTED",
): ConnectedCommsProvider {
    return {
        id: channel,
        channel,
        provider: "RESEND",
        status,
        fromAddress: null,
        updatedAt: "2026-09-01T00:00:00Z",
    };
}

const settled = {
    tax: {
        registered: true,
        state: "29",
        stateName: "Karnataka",
        invoicePrefix: "RC",
        deliveryRate: "18",
        deliverySac: null,
    },
    profile: {
        legalName: null,
        type: null,
        country: "IN",
        taxId: "29AAGCR4375J1ZU",
        contactEmail: null,
        website: null,
    },
    registeredAddress: {
        line1: "12 Hill Road",
        line2: null,
        city: "Bengaluru",
        postalCode: "560001",
        state: "29",
        stateName: "Karnataka",
    },
};

/** Commerce on with nothing in the catalogue yet. */
const noProduct = mod("COMMERCE", {
    readiness: "SETUP_REQUIRED",
    blockers: [{ code: "COMMERCE_NO_CATALOG", actionHref: "/commerce" }],
});

/** A shop with a website that has done nothing but name itself. */
const fresh = {
    settings: {
        ...settled,
        profile: { ...settled.profile, taxId: null },
        registeredAddress: {
            ...settled.registeredAddress,
            line1: null,
            city: null,
            postalCode: null,
        },
    },
    modules: [
        mod("PAYMENTS", {
            readiness: "SETUP_REQUIRED",
            blockers: [
                {
                    code: "PAYMENTS_NO_PROVIDER",
                    actionHref: "/settings/providers",
                },
            ],
        }),
        noProduct,
        mod("WEBSITE", {
            readiness: "SETUP_REQUIRED",
            blockers: [
                { code: "WEBSITE_NO_PUBLICATION", actionHref: "/sites" },
            ],
        }),
    ],
};

describe("emailAttention", () => {
    const comm = [mod("COMMUNICATIONS")];

    it("says nothing while Communications is off", () => {
        expect(
            emailAttention(
                [mod("COMMUNICATIONS", { lifecycle: "DISABLED" })],
                [],
            ),
        ).toBeNull();
    });

    it("flags a disconnected email provider", () => {
        expect(emailAttention(comm, [comms("EMAIL", "DISABLED")])).toBe(
            "disconnected",
        );
    });

    it("flags nothing connected at all", () => {
        expect(emailAttention(comm, [])).toBe("not-connected");
    });

    it("leaves a WhatsApp-only business alone", () => {
        expect(emailAttention(comm, [comms("WHATSAPP")])).toBeNull();
    });

    it("cannot tell without both lists", () => {
        expect(emailAttention(null, [])).toBeNull();
        expect(emailAttention(comm, null)).toBeNull();
    });

    it("names it on the Providers tab", () => {
        expect(providersTabNote("disconnected")).toBe(
            "Needs you: email is disconnected",
        );
        expect(providersTabNote(null)).toBeNull();
    });

    it("on a plan that can't connect one (DEC-091), says a paid plan brings it, to who may see the plans", () => {
        const free = { connected: false, canConnect: false };
        expect(
            providersTabNote("not-connected", { setup: free, mayPlans: true }),
        ).toBe("Your own email comes with a paid plan");
        expect(
            providersTabNote("not-connected", { setup: free, mayPlans: false }),
        ).toBeNull();
        // Room to connect, or unread: as before.
        expect(
            providersTabNote("not-connected", {
                setup: { connected: false, canConnect: true },
                mayPlans: true,
            }),
        ).toBe("Needs you: no email provider yet");
        expect(providersTabNote("not-connected")).toBe(
            "Needs you: no email provider yet",
        );
        expect(
            providersTabNote("disconnected", { setup: free, mayPlans: false }),
        ).toBe("Needs you: email is disconnected");
    });
});

describe("readyChecklist", () => {
    it("lists the five steps in order, each going where it is done", () => {
        const r = readyChecklist(fresh);
        expect(r.done).toBe(0);
        expect(r.total).toBe(5);
        expect(r.steps.map((s) => [s.key, s.label, s.href])).toEqual([
            ["payments", "Connect payments", "/settings/providers"],
            [
                "address",
                "Add your registered address",
                "/settings/organization?section=address",
            ],
            ["tax", "Add your GSTIN", "/settings/organization?section=tax"],
            ["catalogue", "Add your first product", "/commerce/products/new"],
            ["site", "Publish your site", "/sites"],
        ]);
        expect(r.left.map((i) => i.key)).toEqual(r.steps.map((s) => s.key));
        for (const step of r.steps) expect(step.why).not.toBe("");
    });

    it("counts 2 of 5 done, and ticks exactly those", () => {
        const r = readyChecklist({
            settings: settled,
            modules: fresh.modules,
        });
        expect([r.done, r.total]).toEqual([2, 5]);
        expect(r.steps.filter((s) => s.done).map((s) => s.key)).toEqual([
            "address",
            "tax",
        ]);
        expect(r.left.map((i) => i.key)).toEqual([
            "payments",
            "catalogue",
            "site",
        ]);
    });

    it("has nothing left when every step is done", () => {
        const r = readyChecklist({
            settings: settled,
            modules: [mod("PAYMENTS"), mod("COMMERCE"), mod("WEBSITE")],
        });
        expect(r.left).toEqual([]);
        expect([r.done, r.total]).toEqual([5, 5]);
        expect(r.steps.every((s) => s.done)).toBe(true);
    });

    it("leaves out a step that does not apply, rather than tick it", () => {
        const r = readyChecklist({
            settings: {
                ...settled,
                tax: { ...settled.tax, registered: false },
                profile: { ...settled.profile, taxId: null },
            },
            modules: [
                mod("PAYMENTS", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
                mod("WEBSITE", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
                mod("COMMERCE", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
            ],
        });
        // Not GST-registered, nothing sells, no website, no invoice: no
        // step at all — not even the address (DEC-070).
        expect(r.steps.map((s) => s.key)).toEqual([]);
        expect([r.done, r.total]).toEqual([0, 0]);
    });

    it("asks for Payments to come on when something sells and it is off", () => {
        const r = readyChecklist({
            settings: settled,
            modules: [
                mod("PAYMENTS", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
                mod("APPOINTMENTS"),
            ],
        });
        const pay = r.left.find((i) => i.key === "payments");
        expect(pay?.href).toBe("/settings/modules");
        expect(pay?.why).toMatch(/Turn on Payments/);
    });

    it("on a plan without online payments, says it beside the steps, outside the count (#835, DEC-092)", () => {
        const facts = {
            products: 0,
            services: 0,
            sites: 0,
            sitesNotLive: 0,
            onlinePaymentsInPlan: false,
        };
        const notConnected = mod("PAYMENTS", {
            readiness: "SETUP_REQUIRED",
            blockers: [
                {
                    code: "PAYMENTS_NO_PROVIDER",
                    actionHref: "/settings/providers",
                },
            ],
        });
        const r = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [notConnected],
        });
        // Not a step: neither counted nor left.
        expect(r.steps.map((s) => s.key)).not.toContain("payments");
        expect(r.left.map((i) => i.key)).not.toContain("payments");
        expect(r.outside).toHaveLength(1);
        expect(r.outside[0]).toMatchObject({
            key: "payments",
            label: "Take payment online",
            comesWith: "Comes with a paid plan",
            cta: "See plans",
            href: "/settings/billing#change-plan",
        });
        expect(r.outside[0]?.why).toMatch(/How to pay us/);
        // The heading stays about money.
        expect(checklistHeading(r, "settings")).toBe("Ready to take payments");

        // The catalogue names the plan that has it: said, and linked to.
        const named = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [notConnected],
            onlineUpgrade: { planId: "plan_b", name: "Plan B", pricePaise: 0 },
        });
        expect(named.outside[0]).toMatchObject({
            comesWith: "Comes with Plan B",
            href: "/settings/billing?plan=plan_b#change-plan",
        });

        // Payments off and something sells: still the plan, not "Turn on".
        const off = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [
                mod("PAYMENTS", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
                mod("APPOINTMENTS"),
            ],
        });
        expect(off.left.map((i) => i.key)).not.toContain("payments");
        expect(off.outside.map((a) => a.key)).toEqual(["payments"]);
        // Off with nothing that sells: no money to take, nothing said.
        const quiet = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [
                mod("PAYMENTS", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
            ],
        });
        expect(quiet.steps.map((s) => s.key)).not.toContain("payments");
        expect(quiet.outside).toEqual([]);

        // A plan with online payments keeps the provider step, counted.
        const paid = readyChecklist({
            settings: {
                ...settled,
                setup: { ...facts, onlinePaymentsInPlan: true },
            },
            modules: [notConnected],
        });
        expect(paid.left.find((i) => i.key === "payments")).toMatchObject({
            label: "Connect payments",
            href: "/settings/providers",
        });
        expect(paid.outside).toEqual([]);
    });

    it("lets a business on a plan without online payments reach all done (DEC-092)", () => {
        const facts = {
            products: 1,
            services: 0,
            sites: 1,
            sitesNotLive: 0,
            onlinePaymentsInPlan: false,
        };
        const modules = [
            mod("PAYMENTS", {
                readiness: "SETUP_REQUIRED",
                blockers: [{ code: "PAYMENTS_NO_PROVIDER" }],
            }),
            mod("COMMERCE"),
            mod("WEBSITE"),
        ];
        const r = readyChecklist({
            settings: { ...settled, setup: facts },
            modules,
        });
        expect(r.total).toBeGreaterThan(0);
        expect(r.done).toBe(r.total);
        expect(r.left).toEqual([]);
        expect(takeMoneyPlace(r, false)).toBeNull();
        expect(r.outside.map((a) => a.key)).toEqual(["payments"]);
        // Settings' card carries the same aside, and the same count.
        const settings = settingsChecklist({
            settings: { ...settled, setup: facts, logo: null },
            modules,
            messaging: null,
        });
        expect(settings.outside).toEqual(r.outside);
        expect(settings.steps.map((s) => s.key)).not.toContain("payments");
    });

    it("says a provider that stopped is broken", () => {
        const r = readyChecklist({
            settings: settled,
            modules: [
                mod("PAYMENTS", {
                    readiness: "ATTENTION_REQUIRED",
                    blockers: [
                        {
                            code: "PAYMENTS_PROVIDER_DISABLED",
                            actionHref: "/settings/providers",
                        },
                    ],
                }),
            ],
        });
        expect(r.left[0]).toMatchObject({
            key: "payments",
            label: "Reconnect payments",
            broken: true,
        });
    });

    it("is not ready while payments can't be confirmed — no webhook secret (DEC-063)", () => {
        const r = readyChecklist({
            settings: settled,
            modules: [
                mod("PAYMENTS", {
                    readiness: "ATTENTION_REQUIRED",
                    blockers: [
                        {
                            code: "PAYMENTS_WEBHOOK_SECRET_MISSING",
                            actionHref: "/settings/providers",
                        },
                    ],
                }),
            ],
        });
        const step = r.steps.find((s) => s.key === "payments");
        expect(step?.done).toBe(false);
        expect(r.left[0]).toMatchObject({
            key: "payments",
            label: "Finish connecting payments",
            cta: "Add webhook secret",
            href: "/settings/providers",
            broken: true,
        });
        // Not "switched off": nobody turned it off.
        expect(r.left[0].why).not.toMatch(/switched off/);
    });

    it("asks for what the business lists: a service, or either", () => {
        const noService = mod("APPOINTMENTS", {
            readiness: "SETUP_REQUIRED",
            blockers: [{ code: "APPOINTMENTS_NO_SERVICE" }],
        });
        const books = readyChecklist({
            settings: settled,
            modules: [noService],
        });
        expect(books.left).toEqual([
            expect.objectContaining({
                key: "catalogue",
                label: "Add your first service",
                href: "/services/new",
            }),
        ]);

        const both = readyChecklist({
            settings: settled,
            modules: [noService, noProduct],
        });
        expect(both.left[0]?.label).toBe("Add your first product or service");

        // A service is enough, even with no product yet.
        const one = readyChecklist({
            settings: settled,
            modules: [mod("APPOINTMENTS"), noProduct],
        });
        expect(one.left).toEqual([]);
    });

    it("sends an unfinished site to be created when there is none", () => {
        const r = readyChecklist({
            settings: settled,
            modules: [
                mod("WEBSITE", {
                    readiness: "SETUP_REQUIRED",
                    blockers: [
                        { code: "WEBSITE_NO_SITE", actionHref: "/sites/new" },
                    ],
                }),
            ],
        });
        expect(r.left).toEqual([
            expect.objectContaining({ key: "site", href: "/sites/new" }),
        ]);
    });

    it("ticks a first product only when there is one, not for a storefront alone (H-5)", () => {
        // Commerce reads ready with a storefront and no products.
        const facts = { products: 0, services: 0, sites: 1, sitesNotLive: 0 };
        const empty = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [mod("COMMERCE")],
        });
        expect(empty.left.map((i) => i.key)).toEqual(["catalogue"]);

        const listed = readyChecklist({
            settings: { ...settled, setup: { ...facts, products: 1 } },
            modules: [mod("COMMERCE")],
        });
        expect(listed.left).toEqual([]);

        // A service is enough when the business books too.
        const booked = readyChecklist({
            settings: { ...settled, setup: { ...facts, services: 1 } },
            modules: [mod("COMMERCE"), mod("APPOINTMENTS")],
        });
        expect(booked.left).toEqual([]);
    });

    it("ticks Publish only while every site is live, as Home says (H-6)", () => {
        // Published once, then taken down: readiness still reads ACTIVE.
        const facts = { products: 1, services: 0, sites: 1, sitesNotLive: 1 };
        const down = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [mod("WEBSITE")],
        });
        expect(down.left).toEqual([
            expect.objectContaining({ key: "site", href: "/sites" }),
        ]);

        const live = readyChecklist({
            settings: { ...settled, setup: { ...facts, sitesNotLive: 0 } },
            modules: [mod("WEBSITE")],
        });
        expect(live.left).toEqual([]);

        const none = readyChecklist({
            settings: {
                ...settled,
                setup: { ...facts, sites: 0, sitesNotLive: 0 },
            },
            modules: [mod("WEBSITE")],
        });
        expect(none.left).toEqual([
            expect.objectContaining({ key: "site", href: "/sites/new" }),
        ]);
    });

    it("asks for the shop's storefront while its shop waits on it (P4)", () => {
        const facts = { products: 1, services: 0, sites: 1, sitesNotLive: 0 };
        const waiting = mod("WEBSITE", {
            readiness: "SETUP_REQUIRED",
            blockers: [
                {
                    code: "WEBSITE_SHOP_NOT_CHOSEN",
                    actionHref: "/sites/site_1/settings#sells-from",
                },
            ],
        });
        const r = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [waiting],
        });
        // The site is live, so Publish is ticked; the storefront is left.
        expect(r.steps.find((s) => s.key === "site")?.done).toBe(true);
        expect(r.left).toEqual([
            expect.objectContaining({
                key: "shop",
                label: "Choose which location your online shop sells from",
                why: "Until then your shop page isn't live.",
                href: "/sites/site_1/settings#sells-from",
            }),
        ]);

        // Answered, or no shop at all: never asked, never ticked.
        const answered = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [mod("WEBSITE")],
        });
        expect(answered.steps.map((s) => s.key)).not.toContain("shop");

        // The website off: nothing about it is asked (DEC-057).
        const off = readyChecklist({
            settings: { ...settled, setup: facts },
            modules: [{ ...waiting, lifecycle: "DISABLED" as const }],
        });
        expect(off.steps.map((s) => s.key)).not.toContain("shop");
    });

    it("leaves out what it could not read, rather than call it done", () => {
        const r = readyChecklist({
            settings: {
                tax: undefined,
                profile: null,
                registeredAddress: {
                    line1: null,
                    line2: null,
                    city: null,
                    postalCode: null,
                    state: null,
                    stateName: null,
                },
            },
            modules: null,
        });
        expect(r.total).toBe(1);
        expect(r.left.map((i) => i.key)).toEqual(["address"]);
    });

    it("keeps the address until its state is in, as the API does before an invoice (DEC-068)", () => {
        const noState = {
            ...settled,
            tax: { ...settled.tax, registered: false },
            registeredAddress: { ...settled.registeredAddress, state: null },
        };
        const left = (country: string | null) =>
            readyChecklist({
                settings: {
                    ...noState,
                    profile: { ...settled.profile, country },
                },
                modules: null,
            }).left.map((i) => i.key);
        expect(left("IN")).toEqual(["address"]);
        expect(left(null)).toEqual(["address"]);
        // An address abroad has no Indian state to add.
        expect(left("GB")).toEqual([]);
    });
});

describe("steps only when something invoices or takes money (DEC-070)", () => {
    const facts = (invoices: number) => ({
        products: 0,
        services: 0,
        sites: 1,
        sitesNotLive: 1,
        invoices,
    });
    /** A portfolio: only its website on, nothing on file yet. */
    const portfolio = (
        invoices: number,
        kind?: "BUSINESS" | "SOLO" | "WORK",
    ) => ({
        settings: {
            ...fresh.settings,
            tax: { ...fresh.settings.tax, registered: false },
            profile: { ...fresh.settings.profile, type: null },
            logo: null,
            setup: facts(invoices),
            kind,
        },
        modules: [
            mod("PAYMENTS", { lifecycle: "DISABLED", readiness: "DISABLED" }),
            mod("WEBSITE", {
                readiness: "SETUP_REQUIRED",
                blockers: [
                    { code: "WEBSITE_NO_PUBLICATION", actionHref: "/sites" },
                ],
            }),
        ],
    });

    it("only Website on and no invoice: one step, the site; no address, type or logo", () => {
        const input = { ...portfolio(0, "WORK"), messaging: null };
        expect(readyChecklist(input).steps.map((s) => s.key)).toEqual(["site"]);
        expect(settingsChecklist(input).steps.map((s) => s.key)).toEqual([
            "site",
        ]);
    });

    it("the same with one draft invoice: the address, type and logo are back", () => {
        const input = { ...portfolio(1, "WORK"), messaging: null };
        expect(readyChecklist(input).steps.map((s) => s.key)).toEqual([
            "address",
            "site",
        ]);
        expect(settingsChecklist(input).steps.map((s) => s.key)).toEqual([
            "address",
            "site",
            "businessType",
            "logo",
        ]);
    });

    it("Bookings on: the address applies, as it always did", () => {
        const { settings } = portfolio(0);
        const r = readyChecklist({
            settings,
            modules: [mod("APPOINTMENTS")],
        });
        expect(r.steps.map((s) => s.key)).toContain("address");
    });

    it("asks for the address as before when the modules could not be read", () => {
        const { settings } = portfolio(0);
        expect(
            readyChecklist({ settings, modules: null }).steps.map((s) => s.key),
        ).toEqual(["address"]);
    });

    it("an API older than the invoice count reads the modules alone", () => {
        const { settings, modules } = portfolio(0);
        const { invoices: _invoices, ...older } = settings.setup;
        const r = readyChecklist({
            settings: { ...settings, setup: older },
            modules,
        });
        expect(r.steps.map((s) => s.key)).toEqual(["site"]);
    });

    it("handlesMoney is a fact: selling modules, Payments, or an invoice", () => {
        expect(handlesMoney([mod("WEBSITE")], facts(0))).toBe(false);
        expect(handlesMoney([mod("WEBSITE")], facts(2))).toBe(true);
        expect(handlesMoney([mod("COURSES")], facts(0))).toBe(true);
        expect(handlesMoney([mod("CLASS_PACKS")], undefined)).toBe(true);
        expect(handlesMoney([mod("PAYMENTS")], undefined)).toBe(true);
        expect(handlesMoney(null, facts(1))).toBe(true);
        expect(handlesMoney(null, facts(0))).toBeNull();
    });

    it("speaks in the kind's words: SOLO adds 'your address'", () => {
        const label = (kind?: "BUSINESS" | "SOLO" | "WORK") =>
            readyChecklist(portfolio(1, kind)).steps.find(
                (s) => s.key === "address",
            )?.label;
        expect(label("SOLO")).toBe("Add your address");
        expect(label("WORK")).toBe("Add your address");
        // A business, and an API older than the kind: unchanged.
        expect(label("BUSINESS")).toBe("Add your registered address");
        expect(label(undefined)).toBe("Add your registered address");
    });

    it("the kind never decides whether the address applies", () => {
        for (const kind of ["BUSINESS", "SOLO", "WORK"] as const) {
            expect(
                readyChecklist(portfolio(0, kind)).steps.map((s) => s.key),
            ).toEqual(["site"]);
            expect(
                readyChecklist(portfolio(1, kind)).steps.map((s) => s.key),
            ).toEqual(["address", "site"]);
        }
    });
});

describe("the real business type, for a business that said Registered (prelaunch)", () => {
    /** Sells, everything else in, and setup's answer to "Is it registered?". */
    const input = (
        registered: boolean | null | undefined,
        type: string | null,
    ) => ({
        settings: {
            ...settled,
            profile: { ...settled.profile, type, registered },
            logo: { url: "https://x/logo.png", mediaId: null },
            setup: {
                products: 1,
                services: 0,
                sites: 0,
                sitesNotLive: 0,
                invoices: 0,
            },
        },
        modules: [mod("PAYMENTS"), mod("COMMERCE")],
        messaging: null,
    });

    it("holds back going live until the type is chosen, and says why", () => {
        const list = readyChecklist(input(true, null));
        const step = list.steps.find((s) => s.key === "businessType");
        expect(step).toMatchObject({
            done: false,
            label: "Choose your business type",
            cta: "Choose type",
            href: "/settings/organization?section=identity#business-type",
        });
        expect(step?.why).toMatch(/You said your business is registered/);
        expect(step?.why).toMatch(/private limited, LLP, partnership/);
        expect(list.left.map((s) => s.key)).toEqual(["businessType"]);
        expect(list.done).toBe(list.total - 1);
    });

    it("is done once a type is chosen", () => {
        const list = readyChecklist(input(true, "llp"));
        expect(list.steps.find((s) => s.key === "businessType")?.done).toBe(
            true,
        );
        expect(list.left).toEqual([]);
    });

    it("comes right after the address", () => {
        const keys = readyChecklist(input(true, null)).steps.map((s) => s.key);
        expect(keys.indexOf("businessType")).toBe(keys.indexOf("address") + 1);
    });

    it.each([
        ["said Not registered", false],
        ["wasn't asked", null],
        ["an older API", undefined],
    ])("never holds back a business that %s", (_, registered) => {
        const list = readyChecklist(input(registered, null));
        expect(list.steps.map((s) => s.key)).not.toContain("businessType");
        expect(list.left).toEqual([]);
    });

    it("is asked once in Settings: the step, not the suggestion as well", () => {
        const keys = settingsChecklist(input(true, null)).steps.map(
            (s) => s.key,
        );
        expect(keys.filter((k) => k === "businessType")).toHaveLength(1);
        // Not registered: only Settings' suggestion, which Home never shows.
        const suggested = settingsChecklist(input(false, null));
        expect(
            suggested.steps.filter((s) => s.key === "businessType"),
        ).toHaveLength(1);
        expect(
            readyChecklist(input(false, null)).steps.map((s) => s.key),
        ).not.toContain("businessType");
    });

    it("isn't asked of a business with nothing that invoices or takes money (DEC-070)", () => {
        const site = {
            ...input(true, null),
            modules: [
                mod("PAYMENTS", {
                    lifecycle: "DISABLED",
                    readiness: "DISABLED",
                }),
                mod("WEBSITE"),
            ],
        };
        expect(readyChecklist(site).steps.map((s) => s.key)).not.toContain(
            "businessType",
        );
    });
});

describe("checklistHeading (DEC-070)", () => {
    const steps = (...keys: string[]) => ({
        steps: keys.map((key) => ({ key }) as ReadyStep),
    });

    it("says money while a money step is in the list, done or not", () => {
        expect(checklistHeading(steps("address", "site"), "home")).toBe(
            "Get ready to take money",
        );
        expect(checklistHeading(steps("payments"), "settings")).toBe(
            "Ready to take payments",
        );
        expect(checklistHeading(steps("site", "logo"), "settings")).toBe(
            "Ready to take payments",
        );
    });

    it("says the site when publishing it is all there is", () => {
        expect(checklistHeading(steps("site"), "home")).toBe(
            "Get your site live",
        );
        expect(checklistHeading(steps("site", "pipeline"), "settings")).toBe(
            "Get your site live",
        );
    });

    it("says setting up for Settings' other asks alone", () => {
        expect(checklistHeading(steps("email", "pipeline"), "settings")).toBe(
            "Finish setting up",
        );
    });
});

describe("takeMoneyPlace", () => {
    it("leads Home while fewer than half the steps are done", () => {
        expect(takeMoneyPlace({ done: 0, total: 5 }, false)).toBe("first");
        expect(takeMoneyPlace({ done: 2, total: 5 }, false)).toBe("first");
    });

    it("sits lower once half or more are done", () => {
        expect(takeMoneyPlace({ done: 3, total: 5 }, false)).toBe("late");
        expect(takeMoneyPlace({ done: 2, total: 4 }, false)).toBe("late");
    });

    it("is only a Show link while hidden", () => {
        expect(takeMoneyPlace({ done: 1, total: 5 }, true)).toBe("hidden");
    });

    it("is gone when every step is done, hidden or not", () => {
        expect(takeMoneyPlace({ done: 5, total: 5 }, false)).toBeNull();
        expect(takeMoneyPlace({ done: 5, total: 5 }, true)).toBeNull();
    });

    it("is gone when no step could be checked", () => {
        expect(takeMoneyPlace({ done: 0, total: 0 }, false)).toBeNull();
    });

    it("places the same list the same way Settings counts it", () => {
        const r = readyChecklist({ settings: settled, modules: fresh.modules });
        expect(`${r.done} of ${r.total} done`).toBe("2 of 5 done");
        expect(takeMoneyPlace(r, false)).toBe("first");
    });
});

describe("setup hidden, per business in this browser", () => {
    function memory(): Storage {
        const data = new Map<string, string>();
        return {
            getItem: (k) => data.get(k) ?? null,
            setItem: (k, v) => void data.set(k, v),
            removeItem: (k) => void data.delete(k),
            clear: () => data.clear(),
            key: () => null,
            get length() {
                return data.size;
            },
        };
    }

    it("remembers hiding for one business and not another", () => {
        const store = memory();
        expect(writeSetupHidden(() => store, "org-a", true)).toBe(true);
        expect(readSetupHidden(() => store, "org-a")).toBe(true);
        expect(readSetupHidden(() => store, "org-b")).toBe(false);

        writeSetupHidden(() => store, "org-a", false);
        expect(readSetupHidden(() => store, "org-a")).toBe(false);
    });

    it("reads not hidden, and says so, when storage throws", () => {
        const throws = () => {
            throw new Error("SecurityError: storage is disabled");
        };
        expect(readSetupHidden(throws, "org-a")).toBe(false);
        expect(writeSetupHidden(throws, "org-a", true)).toBe(false);
        // …and the card still has its place.
        expect(takeMoneyPlace({ done: 2, total: 5 }, false)).toBe("first");
    });

    it("shrugs off a value it didn't write", () => {
        const store = memory();
        store.setItem(SETUP_HIDDEN_KEY, "not json");
        expect(readSetupHidden(() => store, "org-a")).toBe(false);
        store.setItem(SETUP_HIDDEN_KEY, "[true]");
        expect(readSetupHidden(() => store, "0")).toBe(false);
        // Writing over it starts afresh rather than failing.
        expect(writeSetupHidden(() => store, "org-a", true)).toBe(true);
        expect(readSetupHidden(() => store, "org-a")).toBe(true);
    });
});
