import { describe, expect, it } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import type { ConnectedCommsProvider } from "@/lib/providers/service";

import {
    SETUP_HIDDEN_KEY,
    emailAttention,
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
        // Not GST-registered, nothing sells, no website: only the address.
        expect(r.steps.map((s) => s.key)).toEqual(["address"]);
        expect([r.done, r.total]).toEqual([1, 1]);
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
