import { describe, expect, it, vi } from "vitest";

import { firstRunJobs } from "@/lib/home/first-run";
import { setupGoals } from "@/lib/organizations/setup-plan";

import type { FirstGoalDeps } from "./first-goal";
import { startWithGoal } from "./first-goal";
import { GOAL_LATER, goalFor, goalHref, GOALS } from "./goals";
import type { ModuleView } from "./schema";
import { decodeSetupDefaults } from "./turn-on-schema";

/**
 * Setup's "Create" (UX audit, 10 Oct): the goal turns on with its defaults,
 * with no second sheet of questions, and lands on the thing itself.
 */

function mod(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: [],
        blockers: [],
        ...over,
    };
}

const ALL = [
    mod("COMMERCE"),
    mod("APPOINTMENTS", { dependencies: ["CRM"] }),
    mod("WEBSITE"),
    mod("CRM"),
];

/** What the API prefills for a business called Rye & Co. */
const DEFAULTS: Record<string, unknown> = {
    COMMERCE: {
        setup: { storefrontName: "Rye & Co.", fulfilment: ["PICKUP"] },
    },
    WEBSITE: { setup: { siteName: "Rye & Co.", address: "rye-co" } },
    APPOINTMENTS: {
        setup: {
            hours: [{ weekday: 1, open: "10:00", close: "19:00" }],
            service: { name: "", durationMinutes: 60, price: "" },
        },
        dependencies: ["CRM"],
    },
    CRM: { setup: {} },
};

function deps<T extends Partial<FirstGoalDeps>>(over?: T) {
    const made = {
        listModules: vi.fn(() => Promise.resolve(ALL)),
        getSetupDefaults: vi.fn((key: string) =>
            Promise.resolve(decodeSetupDefaults(key, DEFAULTS[key] ?? {})),
        ),
        enableModule: vi.fn((key: string) =>
            Promise.resolve({
                ok: true as const,
                module: null,
                alreadyEnabled: false,
                ...(key === "WEBSITE" ? { siteId: "site_9" } : {}),
            }),
        ),
        ...over,
    };
    return made;
}

describe("one set of words, one destination", () => {
    it("words the four starting goals once, in the plainer set", () => {
        expect(GOALS.map((g) => g.verb)).toEqual([
            "Sell things",
            "Take bookings",
            "Put up a website",
            "Keep track of people",
        ]);
    });

    it("gives setup and Home the same words for the same goal", () => {
        const home = firstRunJobs(ALL, "BUSINESS");
        const setup = setupGoals("BUSINESS");
        expect(setup.map((g) => [g.key, g.verb, g.note])).toEqual(
            home.map((j) => [j.key, j.verb, j.note]),
        );
    });

    it("speaks to a kind's own people", () => {
        expect(goalFor("CRM", "SOLO")?.verb).toBe("Keep track of clients");
        expect(goalFor("CRM", "WORK")?.verb).toBe("Hear from readers");
        expect(goalFor("CRM", "BUSINESS")?.verb).toBe("Keep track of people");
    });

    it("lands each goal on the thing itself, never an empty list", () => {
        expect(goalHref("COMMERCE")).toBe("/commerce/products/new");
        expect(goalHref("APPOINTMENTS")).toBe("/services/new");
        expect(goalHref("WEBSITE", { siteId: "s1" })).toBe("/sites/s1");
        expect(goalHref("CRM")).toBe("/contacts?new=1");
        expect(goalHref("INVOICE")).toBe("/billing/invoices/new");
    });
});

describe("startWithGoal: destinations per goal", () => {
    it("Sell: the location named after the business, then a new product", async () => {
        const d = deps();
        expect(await startWithGoal(d, "COMMERCE", "BUSINESS")).toEqual({
            href: "/commerce/products/new",
            turnedOn: ["COMMERCE"],
        });
        expect(vi.mocked(d.enableModule).mock.calls).toEqual([
            [
                "COMMERCE",
                { storefrontName: "Rye & Co.", fulfilment: ["PICKUP"] },
            ],
        ]);
    });

    it("Website: the web address already chosen, then the site with Publish", async () => {
        const d = deps();
        expect(await startWithGoal(d, "WEBSITE", "WORK")).toEqual({
            href: "/sites/site_9",
            turnedOn: ["WEBSITE"],
        });
        expect(vi.mocked(d.enableModule).mock.calls).toEqual([
            ["WEBSITE", { siteName: "Rye & Co.", address: "rye-co" }],
        ]);
    });

    it("Website with no id in the answer: the Website row finds the site", async () => {
        const d = deps({
            enableModule: vi.fn(() =>
                Promise.resolve({
                    ok: true as const,
                    module: null,
                    alreadyEnabled: false,
                }),
            ),
        });
        expect((await startWithGoal(d, "WEBSITE")).href).toBe("/sites");
    });

    it("Bookings: Contacts first, nothing made, then a new service", async () => {
        const d = deps();
        expect(await startWithGoal(d, "APPOINTMENTS", "BUSINESS")).toEqual({
            href: "/services/new",
            turnedOn: ["CRM", "APPOINTMENTS"],
        });
        // Contacts with its empty setup. Bookings with none at all: the
        // first service is made on the page they land on.
        expect(vi.mocked(d.enableModule).mock.calls).toEqual([
            ["CRM", {}],
            ["APPOINTMENTS", undefined],
        ]);
    });

    it("People: Contacts, then New contact open", async () => {
        const d = deps();
        expect(await startWithGoal(d, "CRM", "BUSINESS")).toEqual({
            href: "/contacts?new=1",
            turnedOn: ["CRM"],
        });
    });

    it("Invoice a client: nothing to turn on, straight to a new invoice", async () => {
        const d = deps();
        expect(await startWithGoal(d, "INVOICE", "SOLO")).toEqual({
            href: "/billing/invoices/new",
            turnedOn: [],
        });
        expect(d.listModules).not.toHaveBeenCalled();
        expect(d.enableModule).not.toHaveBeenCalled();
    });

    it("Decide later: Home, and nothing is turned on", async () => {
        const d = deps();
        expect(await startWithGoal(d, GOAL_LATER)).toEqual({
            href: "/",
            turnedOn: [],
        });
        expect(await startWithGoal(d, "NOT_A_GOAL")).toEqual({
            href: "/",
            turnedOn: [],
        });
        expect(d.enableModule).not.toHaveBeenCalled();
    });
});

describe("startWithGoal: when the goal can't be turned on", () => {
    it("not rolled out to this business: Home, and it says so", async () => {
        const d = deps({
            listModules: vi.fn(() =>
                Promise.resolve(
                    ALL.map((m) =>
                        m.key === "APPOINTMENTS"
                            ? {
                                  ...m,
                                  label: "Bookings",
                                  blockers: [{ code: "ROLLOUT_DISABLED" }],
                              }
                            : m,
                    ),
                ),
            ),
        });
        const outcome = await startWithGoal(d, "APPOINTMENTS", "BUSINESS");
        expect(outcome.href).toBe("/");
        expect(outcome.said).toBe(
            "Bookings isn't on offer for this business yet. Pick what to do first from Home.",
        );
        expect(d.enableModule).not.toHaveBeenCalled();
    });

    it("the module list couldn't be read: Home, nothing guessed", async () => {
        const d = deps({
            listModules: vi.fn(() => Promise.reject(new Error("down"))),
        });
        const outcome = await startWithGoal(d, "COMMERCE");
        expect(outcome.href).toBe("/");
        expect(outcome.said).toContain("Pick what to do first from Home.");
        expect(d.enableModule).not.toHaveBeenCalled();
    });

    it("a default the API couldn't give is asked in the sheet, never invented", async () => {
        const d = deps({
            getSetupDefaults: vi.fn((key: string) =>
                Promise.resolve(decodeSetupDefaults(key, null)),
            ),
        });
        const outcome = await startWithGoal(d, "COMMERCE");
        expect(outcome).toEqual({
            href: "/",
            said: "Sell needs a couple of answers first. Pick it from Home to give them.",
            turnedOn: [],
        });
        expect(d.enableModule).not.toHaveBeenCalled();
    });

    it("the API refuses: Home, with its reason, and what did turn on is kept", async () => {
        const d = deps({
            enableModule: vi.fn((key: string) =>
                Promise.resolve(
                    key === "CRM"
                        ? {
                              ok: true as const,
                              module: null,
                              alreadyEnabled: false,
                          }
                        : {
                              ok: false as const,
                              error: "Your plan doesn't include Bookings.",
                              fields: {},
                          },
                ),
            ),
        });
        expect(await startWithGoal(d, "APPOINTMENTS")).toEqual({
            href: "/",
            said: "Bookings isn't on yet. Your plan doesn't include Bookings. Pick it from Home to try again.",
            turnedOn: ["CRM"],
        });
    });

    it("an address taken since setup is said in the API's words", async () => {
        const d = deps({
            enableModule: vi.fn(() =>
                Promise.resolve({
                    ok: false as const,
                    error: "Validation failed",
                    fields: { address: "rye-co is taken. Try another." },
                }),
            ),
        });
        const outcome = await startWithGoal(d, "WEBSITE");
        expect(outcome.href).toBe("/");
        expect(outcome.said).toContain("rye-co is taken. Try another.");
    });

    it("a call that never returns an answer is a refusal, not a crash", async () => {
        const d = deps({
            enableModule: vi.fn(() => Promise.reject(new Error("offline"))),
        });
        const outcome = await startWithGoal(d, "CRM");
        expect(outcome.href).toBe("/");
        expect(outcome.said).toContain("Saroh couldn't be reached.");
    });
});
