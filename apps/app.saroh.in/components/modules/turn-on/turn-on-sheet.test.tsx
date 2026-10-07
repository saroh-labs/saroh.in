// @vitest-environment jsdom
/**
 * The "Turn on" sheet (DEC-068): each module's minimum, filled in from
 * `setup-defaults`; what comes with it; field errors from the sheet's own
 * check and from the API's 400, beside their fields; and on success the
 * module's first screen with what is left to finish.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";
import type { SetupDefaults } from "@/lib/modules/turn-on-schema";
import type { EnableResult } from "@/lib/modules/turn-on-service";
import type { ConnectLocks } from "@/lib/providers/connect-lock";

import { TurnOnSheet } from "./turn-on-sheet";

const readSetupDefaultsAction =
    vi.fn<(keys: string[]) => Promise<SetupDefaults[]>>();
const enableModuleAction =
    vi.fn<(key: string, setup: object) => Promise<EnableResult>>();
/** What the plan won't let the business connect (UX-006); none by default. */
let locks: ConnectLocks = { payments: null, messaging: null };
vi.mock("@/lib/modules/turn-on-actions", () => ({
    readConnectLocksAction: () => Promise.resolve(locks),
    readSetupDefaultsAction: (keys: string[]) => readSetupDefaultsAction(keys),
    enableModuleAction: (key: string, setup: object) =>
        enableModuleAction(key, setup),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh }),
}));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

/*
 * Each open day's two times are a Radix Select of 48 options, and Radix
 * builds every option's node even while it is closed: Bookings' twelve of
 * them made each render take a quarter of a second in jsdom, and under a
 * loaded prepush the file ran past its timeout. The times are the time
 * select's own tests' (`@saroh/ui`); here a plain select stands in, so the
 * sheet's tests measure the sheet.
 */
vi.mock("@saroh/ui/time-select", () => ({
    TimeSelect: ({
        value,
        onValueChange,
        id,
        disabled,
        "aria-label": label,
    }: {
        value?: string;
        onValueChange?: (v: string) => void;
        id?: string;
        disabled?: boolean;
        "aria-label"?: string;
    }) => (
        <select
            id={id}
            aria-label={label}
            value={value ?? ""}
            disabled={disabled}
            onChange={(e) => onValueChange?.(e.target.value)}
        >
            <option value={value ?? ""}>{value ?? "Time"}</option>
        </select>
    ),
}));

// A loaded machine is slower, never stuck: no test here waits on a timer.
vi.setConfig({ testTimeout: 15_000 });

const NEEDS: Record<string, string[]> = {
    WEBSITE: [],
    CRM: [],
    APPOINTMENTS: ["CRM"],
    CLASS_PACKS: ["APPOINTMENTS"],
    COMMERCE: [],
    PAYMENTS: [],
    COMMUNICATIONS: ["CRM"],
    INSIGHTS: [],
};

function view(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: NEEDS[key] ?? [],
        blockers: [],
        ...over,
    };
}
const ALL_OFF = Object.keys(NEEDS).map((k) => view(k));

const DEFAULTS: Record<string, SetupDefaults["defaults"]> = {
    COMMERCE: { storefrontName: "Northwind", fulfilment: ["PICKUP"] },
    APPOINTMENTS: {
        hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            open: "10:00",
            close: "19:00",
        })),
        service: {
            name: "Consultation",
            durationMinutes: 30,
            price: "500.00",
        },
    },
    WEBSITE: { siteName: "Northwind", address: "northwind" },
};

let hiddenKeys: string[] = [];
/** The template the API says a new site starts from (K15); null says none. */
let websiteTemplate: { id: string; name: string } | null = null;

/** jsdom has no layout, so nothing to observe. */
class NoResize {
    observe() {
        // Nothing to measure.
    }
    unobserve() {
        // As above.
    }
    disconnect() {
        // As above.
    }
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    hiddenKeys = [];
    websiteTemplate = null;
    locks = { payments: null, messaging: null };
    // Radix's checkbox measures itself; jsdom has no ResizeObserver.
    vi.stubGlobal("ResizeObserver", NoResize);
    readSetupDefaultsAction.mockReset();
    readSetupDefaultsAction.mockImplementation((keys) =>
        Promise.resolve(
            keys.map((key) => ({
                key,
                defaults: DEFAULTS[key] ?? null,
                dependencies: NEEDS[key] ?? [],
                hidden: hiddenKeys.includes(key),
                read: true,
                template: key === "WEBSITE" ? websiteTemplate : null,
            })),
        ),
    );
    enableModuleAction.mockReset();
    enableModuleAction.mockImplementation((key) =>
        Promise.resolve({
            ok: true,
            module: view(key, { lifecycle: "ENABLED", readiness: "ACTIVE" }),
            alreadyEnabled: false,
        }),
    );
    for (const fn of [push, refresh, showSuccess, showError, onOpenChange]) {
        fn.mockClear();
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

const onOpenChange = vi.fn();

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

async function open(picked: string[], modules: ModuleView[] = ALL_OFF) {
    act(() => {
        root.render(
            <TurnOnSheet
                picked={picked}
                modules={modules}
                onOpenChange={onOpenChange}
            />,
        );
    });
    await settle();
}

const sheet = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("The sheet is not open");
    return el as HTMLElement;
};
const text = () => sheet().textContent;

function byLabel(label: string): HTMLInputElement {
    const lab = Array.from(sheet().querySelectorAll("label")).find(
        (l) => l.textContent.trim() === label,
    );
    const id = lab?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field labelled ${label}`);
    return el as HTMLInputElement;
}

function button(name: RegExp): HTMLButtonElement {
    const hit = Array.from(sheet().querySelectorAll("button")).find((b) =>
        name.test(
            `${b.getAttribute("aria-label") ?? ""} ${b.textContent}`.trim(),
        ),
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function press(b: HTMLButtonElement) {
    act(() => b.click());
    await settle();
}

describe("Bookings", () => {
    it("names it, says Contacts comes with it, and fills in the defaults", async () => {
        await open(["APPOINTMENTS"]);
        expect(text()).toContain("Turn on Bookings");
        expect(text()).toContain("What comes with it");
        expect(text()).toContain(
            "Bookings need someone to book, so Contacts comes with it.",
        );
        expect(byLabel("First service").value).toBe("Consultation");
        expect(byLabel("Takes (minutes)").value).toBe("30");
        expect(byLabel("Price (₹)").value).toBe("500.00");
        // Mon–Sat open, Sunday closed.
        const days = Array.from(
            sheet().querySelectorAll<HTMLButtonElement>('[role="checkbox"]'),
        ).map((c) => [c.getAttribute("aria-label"), c.dataset.state]);
        expect(days).toEqual([
            ["Open on Monday", "checked"],
            ["Open on Tuesday", "checked"],
            ["Open on Wednesday", "checked"],
            ["Open on Thursday", "checked"],
            ["Open on Friday", "checked"],
            ["Open on Saturday", "checked"],
            ["Open on Sunday", "unchecked"],
        ]);
        expect(text()).toContain("Closed");
    });

    it("turns Contacts on first, then Bookings with its setup, and lands on the calendar", async () => {
        await open(["APPOINTMENTS"]);
        await press(button(/^Turn on$/));
        expect(enableModuleAction.mock.calls.map((c) => c[0])).toEqual([
            "CRM",
            "APPOINTMENTS",
        ]);
        expect(enableModuleAction.mock.calls[0]?.[1]).toEqual({});
        expect(enableModuleAction.mock.calls[1]?.[1]).toMatchObject({
            service: {
                name: "Consultation",
                durationMinutes: 30,
                price: "500.00",
            },
        });
        expect(push).toHaveBeenCalledWith("/bookings");
        expect(showSuccess).toHaveBeenCalledWith(
            "Contacts and Bookings are on.",
        );
    });

    it("keeps a missing service name on its field and sends nothing", async () => {
        await open(["APPOINTMENTS"]);
        typeInto(byLabel("First service"), " ");
        await press(button(/^Turn on$/));
        expect(text()).toContain("Name your first service.");
        expect(enableModuleAction).not.toHaveBeenCalled();
    });

    it("lists what is left to finish in the toast, in the app's words", async () => {
        enableModuleAction.mockImplementation((key) =>
            Promise.resolve({
                ok: true,
                module: view(key, {
                    lifecycle: "ENABLED",
                    readiness:
                        key === "APPOINTMENTS" ? "SETUP_REQUIRED" : "ACTIVE",
                    blockers:
                        key === "APPOINTMENTS"
                            ? [{ code: "APPOINTMENTS_NO_AVAILABILITY" }]
                            : [],
                }),
                alreadyEnabled: false,
            }),
        );
        await open(["APPOINTMENTS"]);
        await press(button(/^Turn on$/));
        expect(showSuccess).toHaveBeenCalledWith(
            "Contacts and Bookings are on. Finish setup: Set your availability so customers can book.",
        );
    });
});

describe("Sell", () => {
    it("asks the location's name and how orders leave", async () => {
        await open(["COMMERCE"]);
        expect(text()).toContain("Turn on Sell");
        expect(byLabel("Location name").value).toBe("Northwind");
        expect(text()).toContain("How orders leave");
        expect(text()).toContain("Pick-up");
        expect(text()).toContain("Delivery");
        expect(text()).toContain("Shipping");
        // Pick-up only: no website yet.
        expect(text()).not.toContain("online shop");
    });

    it("selling online brings the website, with its address, and turns it on after Sell", async () => {
        await open(["COMMERCE"]);
        const delivery = Array.from(
            sheet().querySelectorAll<HTMLButtonElement>('[role="checkbox"]'),
        ).at(1);
        if (!delivery) throw new Error("No Delivery box");
        act(() => delivery.click());
        expect(text()).toContain(
            "Your online shop goes on your website at northwind.saroh.app/shop — we'll set up the website for you.",
        );
        expect(byLabel("Web address").value).toBe("northwind");
        // With the web address cleared, the note still names /shop, and
        // never reads "your address.saroh.app" (DEC-069, L12).
        typeInto(byLabel("Web address"), "");
        expect(text()).toContain(
            "Your online shop goes on your website at /shop on your web address — we'll set up the website for you.",
        );
        typeInto(byLabel("Web address"), "northwind");
        await press(button(/^Turn on$/));
        expect(enableModuleAction.mock.calls.map((c) => c[0])).toEqual([
            "COMMERCE",
            "WEBSITE",
        ]);
        expect(enableModuleAction.mock.calls[0]?.[1]).toEqual({
            storefrontName: "Northwind",
            fulfilment: ["PICKUP", "LOCAL_DELIVERY"],
        });
        expect(enableModuleAction.mock.calls[1]?.[1]).toEqual({
            siteName: "Northwind",
            address: "northwind",
        });
        expect(push).toHaveBeenCalledWith("/commerce/products");
    });
});

describe("Website", () => {
    it("offers the free address the API suggests for a taken one", async () => {
        enableModuleAction.mockResolvedValueOnce({
            ok: false,
            error: "northwind.saroh.app belongs to another business",
            fields: {
                address: "northwind.saroh.app belongs to another business",
            },
            suggestion: "northwind-2",
        });
        await open(["WEBSITE"]);
        await press(button(/^Turn on$/));
        expect(text()).toContain(
            "northwind.saroh.app belongs to another business",
        );
        act(() => button(/^Use northwind-2\.saroh\.app$/).click());
        expect(byLabel("Web address").value).toBe("northwind-2");
        await press(button(/^Turn on$/));
        expect(enableModuleAction).toHaveBeenLastCalledWith("WEBSITE", {
            siteName: "Northwind",
            address: "northwind-2",
        });
    });

    it("shows the address with its .saroh.app, and a taken one from the API beside it", async () => {
        enableModuleAction.mockResolvedValueOnce({
            ok: false,
            error: "Validation failed",
            fields: { address: "northwind is taken. Try another." },
        });
        await open(["WEBSITE"]);
        expect(text()).toContain(".saroh.app");
        expect(text()).toContain("Customers find you at northwind.saroh.app");
        await press(button(/^Turn on$/));
        const field = byLabel("Web address");
        expect(field.getAttribute("aria-invalid")).toBe("true");
        expect(text()).toContain("northwind is taken. Try another.");
        // On the field, not a toast; the sheet stays open.
        expect(showError).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it("says which template the new site starts from, when the API names one (K15)", async () => {
        await open(["WEBSITE"]);
        expect(text()).not.toContain("Starts from");

        act(() => root.unmount());
        root = createRoot(host);
        websiteTemplate = { id: "portfolio", name: "Portfolio" };
        await open(["WEBSITE"]);
        expect(text()).toContain(
            "Starts from the Portfolio template. Change its pages any time.",
        );
        // Said, not asked: nothing about it is sent.
        await press(button(/^Turn on$/));
        expect(enableModuleAction).toHaveBeenLastCalledWith("WEBSITE", {
            siteName: "Northwind",
            address: "northwind",
        });
    });

    it("says a refusal it can't place at the top of the sheet", async () => {
        enableModuleAction.mockResolvedValueOnce({
            ok: false,
            error: "Your plan doesn't include this.",
            fields: {},
        });
        await open(["WEBSITE"]);
        await press(button(/^Turn on$/));
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Your plan doesn't include this.",
        );
    });
});

describe("Payments and Communications", () => {
    it("Connect now turns it on and goes to Providers", async () => {
        await open(["PAYMENTS"]);
        expect(text()).toContain(
            "Online payment stays off until you connect a provider.",
        );
        await press(button(/^Connect now$/));
        expect(enableModuleAction).toHaveBeenCalledWith("PAYMENTS", {});
        expect(push).toHaveBeenCalledWith("/settings/providers");
    });

    it("Later turns it on with nothing connected", async () => {
        await open(["PAYMENTS"]);
        await press(button(/^Later$/));
        expect(enableModuleAction).toHaveBeenCalledWith("PAYMENTS", {});
        expect(push).toHaveBeenCalledWith("/billing");
    });

    it("Communications brings Contacts, and Later stays where it is", async () => {
        await open(["COMMUNICATIONS"]);
        expect(text()).toContain(
            "Messages go to your contacts, so Contacts comes with it.",
        );
        await press(button(/^Later$/));
        expect(enableModuleAction.mock.calls.map((c) => c[0])).toEqual([
            "CRM",
            "COMMUNICATIONS",
        ]);
        expect(push).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });
});

describe("on a plan that won't let the business connect (Free, UX-006)", () => {
    const lock = {
        comesWith: "Comes with Grow",
        cta: "See Grow",
        href: "/settings/billing?plan=grow#change-plan",
        upgrade: "Grow",
        full: false,
    };

    it("Payments: no Connect now, the plan and How to pay us instead, and Turn on", async () => {
        locks = { payments: lock, messaging: lock };
        await open(["PAYMENTS"]);
        expect(text()).toContain(
            "Taking payment online comes with Grow. Until then, customers pay you the ways you set in How to pay us.",
        );
        expect(text()).toContain(
            "How to pay us for customers who pay you directly.",
        );
        expect(text()).not.toContain("Connect now");
        expect(text()).not.toContain("Razorpay or Cashfree");
        expect(
            sheet().querySelector(
                'a[href="/settings/billing?plan=grow#change-plan"]',
            ),
        ).not.toBeNull();
        await press(button(/^Turn on$/));
        expect(enableModuleAction).toHaveBeenCalledWith("PAYMENTS", {});
        // Never sent to Providers to type keys the API refuses.
        expect(push).toHaveBeenCalledWith("/billing");
        expect(push).not.toHaveBeenCalledWith("/settings/providers");
    });

    it("the toast never asks to connect a locked provider", async () => {
        locks = { payments: lock, messaging: lock };
        enableModuleAction.mockImplementation((key) =>
            Promise.resolve({
                ok: true,
                module: view(key, {
                    lifecycle: "ENABLED",
                    readiness:
                        key === "COMMUNICATIONS" ? "SETUP_REQUIRED" : "ACTIVE",
                    blockers:
                        key === "COMMUNICATIONS"
                            ? [{ code: "COMMUNICATIONS_NO_PROVIDER" }]
                            : [],
                }),
                alreadyEnabled: false,
            }),
        );
        await open(["COMMUNICATIONS"]);
        expect(text()).toContain("Connecting your own email comes with Grow.");
        await press(button(/^Turn on$/));
        expect(showSuccess).toHaveBeenCalledWith(
            "Contacts and Communications are on.",
        );
    });

    it("Grow: Connect now is offered as before", async () => {
        await open(["PAYMENTS"]);
        expect(text()).toContain("Connect now");
        expect(text()).not.toContain("comes with Grow");
    });
});

describe("Contacts and Insights", () => {
    it("asks nothing, just Turn on", async () => {
        await open(["CRM"]);
        expect(text()).toContain("Turn on Contacts");
        expect(text()).toContain("Nothing to fill in.");
        expect(sheet().querySelectorAll("input")).toHaveLength(0);
        await press(button(/^Turn on$/));
        expect(enableModuleAction).toHaveBeenCalledWith("CRM", {});
        expect(push).toHaveBeenCalledWith("/contacts");
        expect(showSuccess).toHaveBeenCalledWith("Contacts is on.");
    });

    it("Insights lands on its figures", async () => {
        await open(["INSIGHTS"]);
        await press(button(/^Turn on$/));
        expect(push).toHaveBeenCalledWith("/analytics");
    });
});

describe("several picks, one sheet", () => {
    it("draws a section per module that asks for something, and turns them on in order", async () => {
        await open(["COMMERCE", "APPOINTMENTS"]);
        expect(text()).toContain("Turn on Sell and Bookings");
        const headings = Array.from(sheet().querySelectorAll("h3")).map(
            (h) => h.textContent,
        );
        expect(headings).toEqual(["What comes with it", "Sell", "Bookings"]);
        await press(button(/^Turn on$/));
        expect(enableModuleAction.mock.calls.map((c) => c[0])).toEqual([
            "COMMERCE",
            "CRM",
            "APPOINTMENTS",
        ]);
        // The first pick's screen.
        expect(push).toHaveBeenCalledWith("/commerce/products");
    });

    it("a refusal part-way says what did turn on, and a retry doesn't send it again", async () => {
        enableModuleAction.mockImplementation((key) =>
            Promise.resolve(
                key === "APPOINTMENTS"
                    ? {
                          ok: false as const,
                          error: "Validation failed",
                          fields: { "service.price": "Write a price." },
                      }
                    : {
                          ok: true as const,
                          module: null,
                          alreadyEnabled: false,
                      },
            ),
        );
        await open(["COMMERCE", "APPOINTMENTS"]);
        await press(button(/^Turn on$/));
        expect(text()).toContain("Write a price.");
        expect(text()).toContain(
            "Sell and Contacts are on, but Bookings isn't yet.",
        );
        expect(refresh).toHaveBeenCalled();
        enableModuleAction.mockClear();
        await press(button(/^Turn on$/));
        expect(enableModuleAction.mock.calls.map((c) => c[0])).toEqual([
            "APPOINTMENTS",
        ]);
    });
});

describe("a module Saroh doesn't offer", () => {
    it("says so and offers no Turn on", async () => {
        hiddenKeys = ["INSIGHTS"];
        await open(["INSIGHTS"]);
        expect(text()).toContain("This isn't available for your business yet.");
        expect(button(/^Turn on$/).disabled).toBe(true);
    });
});
