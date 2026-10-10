// @vitest-environment jsdom
/**
 * Setup is one screen that ends in the product (UX audit, 10 Oct): "A
 * business" is chosen and every field is there from the start, the goal is
 * picked on the same screen, nothing asks whether it is a registered
 * company, and Create turns the goal on and lands on the thing itself.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessSetupForm } from "./business-setup-form";

const createOrganization = vi.fn();
const checkAddress = vi.fn();
vi.mock("@/lib/organizations/actions", () => ({
    createOrganization: (...args: unknown[]) =>
        createOrganization(...args) as unknown,
    checkAddress: (...args: unknown[]) => checkAddress(...args) as unknown,
}));
const startWithGoalAction = vi.fn();
vi.mock("@/lib/modules/first-goal-actions", () => ({
    startWithGoalAction: (...args: unknown[]) =>
        startWithGoalAction(...args) as unknown,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn() }),
}));
const updateUser = vi.fn();
vi.mock("@saroh/auth/client", () => ({
    authClient: {
        signOut: vi.fn(),
        updateUser: (...args: unknown[]) => updateUser(...args) as unknown,
    },
}));
vi.mock("@/lib/accounts", () => ({ accountsLoginUrl: "/login" }));
// The browser's zone, sent with the business (UX-008).
const browserZone = vi.fn<() => string | null>(() => "America/Chicago");
vi.mock("@/lib/organizations/time-zones", () => ({
    browserZone: () => browserZone(),
}));
const startCheckout = vi.fn();
const takeOffer = vi.fn();
vi.mock("@/lib/saroh-billing/checkout-actions", () => ({
    startCheckoutAfterOnboarding: (...args: unknown[]) =>
        startCheckout(...args) as unknown,
    takeLaunchOfferAfterOnboarding: (...args: unknown[]) =>
        takeOffer(...args) as unknown,
}));
const showError = vi.fn();
const showInfo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showInfo: (...args: unknown[]) => showInfo(...args) as unknown,
}));

let root: Root;
let host: HTMLDivElement;

function mount(props: Partial<Parameters<typeof BusinessSetupForm>[0]> = {}) {
    act(() => root.unmount());
    root = createRoot(host);
    act(() =>
        root.render(<BusinessSetupForm email="asha@example.com" {...props} />),
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        createOrganization,
        checkAddress,
        startWithGoalAction,
        push,
        updateUser,
        startCheckout,
        takeOffer,
        showError,
        showInfo,
    ]) {
        fn.mockReset();
    }
    createOrganization.mockResolvedValue({
        ok: true,
        data: { id: "org_1", slug: "asha-rao" },
    });
    checkAddress.mockImplementation((address: string) =>
        Promise.resolve({ address, available: true }),
    );
    startWithGoalAction.mockResolvedValue({
        href: "/commerce/products/new",
        turnedOn: ["COMMERCE"],
    });
    updateUser.mockResolvedValue({ error: null });
    act(() => root.render(<BusinessSetupForm email="asha@example.com" />));
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

function labelled(text: string): HTMLInputElement {
    const label = Array.from(host.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === text,
    );
    const id = label?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field labelled ${text}`);
    return el as HTMLInputElement;
}

function radio(name: string): HTMLButtonElement {
    const hit = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent.includes(name));
    if (!hit) throw new Error(`No choice ${name}`);
    return hit;
}

const group = (labelledBy: string) =>
    Array.from(
        host.querySelectorAll<HTMLButtonElement>(
            `[aria-labelledby="${labelledBy}"] [role="radio"]`,
        ),
    );

const checked = (labelledBy: string) =>
    group(labelledBy)
        .filter((b) => b.getAttribute("aria-checked") === "true")
        .map((b) => b.textContent);

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function submit() {
    await act(async () => {
        host.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
        await Promise.resolve();
    });
    await settle();
}

const text = () => host.textContent;

describe("one screen, open from the start", () => {
    it("starts on A business, with nothing kept back", () => {
        expect(group("kind-label").map((c) => c.textContent)).toEqual([
            "A businessShop, studio, practice",
            "Just meFreelancer, consultant, creator",
            "A site for my workPortfolio, blog, projects",
        ]);
        expect(checked("kind-label")).toEqual([
            "A businessShop, studio, practice",
        ]);
        // Every field is on screen before anything is pressed.
        const form = host.querySelector("form");
        expect(form?.className).not.toContain("hidden");
        expect(labelled("What is it called?").placeholder).toBe(
            "Rye & Co. Bakery",
        );
        expect(labelled("Web address")).toBeTruthy();
        expect(text()).toContain("Where does it trade?");
        expect(text()).toContain("What will you do first?");
        expect(text()).toContain("Create the business");
    });

    it("calls the web address a web address, never an address on Saroh", () => {
        expect(text()).not.toContain("Its address on Saroh");
        expect(
            Array.from(host.querySelectorAll("label")).map((l) =>
                l.textContent.trim(),
            ),
        ).toContain("Web address");
    });

    it("never asks whether it is a registered company", async () => {
        for (const kind of ["A business", "Just me", "A site for my work"]) {
            act(() => radio(kind).click());
            expect(text()).not.toContain("registered");
        }
        act(() => radio("A business").click());
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        const sent = createOrganization.mock.calls[0]?.[0] as {
            profile: Record<string, unknown>;
        };
        expect(sent.profile).toEqual({
            country: "IN",
            timezone: "America/Chicago",
        });
    });

    it("says neither Last step nor Then you are in", () => {
        expect(text()).not.toMatch(/last step/i);
        expect(text()).not.toContain("Then you are in");
    });

    it("defaults the country to India", () => {
        expect(checked("country-label")).toEqual(["INIndia"]);
    });

    it("fills the web address from the name until it is edited", async () => {
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await settle();
        expect(labelled("Web address").value).toBe("rye-co-bakery");
        typeInto(labelled("Web address"), "rye");
        typeInto(labelled("What is it called?"), "Rye Bakery");
        await settle();
        expect(labelled("Web address").value).toBe("rye");
    });

    it("refuses an empty name, and makes nothing", async () => {
        await submit();
        expect(text()).toContain("It needs a name");
        expect(createOrganization).not.toHaveBeenCalled();
        expect(startWithGoalAction).not.toHaveBeenCalled();
    });

    it("moves the choice with the arrow keys, as a radio group does", () => {
        const business = radio("A business");
        expect(business.tabIndex).toBe(0);
        act(() => {
            business.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowDown",
                    bubbles: true,
                }),
            );
        });
        expect(radio("Just me").getAttribute("aria-checked")).toBe("true");
        expect(radio("Just me").tabIndex).toBe(0);
        expect(business.tabIndex).toBe(-1);
    });
});

describe("What are you setting up? changes words and defaults only (DEC-070)", () => {
    it("names a business as today, and sends BUSINESS", async () => {
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(createOrganization).toHaveBeenCalledWith({
            name: "Rye & Co. Bakery",
            kind: "BUSINESS",
            address: "rye-co-bakery",
            goal: "COMMERCE",
            profile: { country: "IN", timezone: "America/Chicago" },
        });
    });

    it("asks Just me for a name or brand, and sends SOLO", async () => {
        act(() => radio("Just me").click());
        const name = labelled("Your name or brand");
        expect(name.placeholder).toBe("Asha Rao");
        expect(text()).toContain("Where are you based?");
        expect(text()).toContain("Set it up");
        typeInto(name, "Asha Rao");
        await submit();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Asha Rao", kind: "SOLO" }),
        );
    });

    it("keeps what was typed when the answer changes", () => {
        typeInto(labelled("What is it called?"), "Asha Rao Studio");
        act(() => radio("A site for my work").click());
        expect(labelled("Your name or brand").value).toBe("Asha Rao Studio");
    });

    it("sends no zone when the browser can't say one (UX-008)", async () => {
        browserZone.mockReturnValueOnce(null);
        typeInto(labelled("What is it called?"), "Asha Rao Studio");
        await submit();
        expect(createOrganization).toHaveBeenLastCalledWith(
            expect.objectContaining({ profile: { country: "IN" } }),
        );
    });
});

describe("What will you do first?", () => {
    const goals = () => group("goal-label").map((b) => b.dataset.goal);

    it("offers a business the four goals in Home's words, Sell chosen, and a way to decide later", () => {
        expect(goals()).toEqual([
            "COMMERCE",
            "APPOINTMENTS",
            "WEBSITE",
            "CRM",
            "LATER",
        ]);
        expect(text()).toContain("Sell things");
        expect(text()).toContain("Take bookings");
        expect(text()).toContain("Put up a website");
        expect(text()).toContain("Keep track of people");
        expect(text()).not.toContain("Sell products");
        expect(text()).not.toContain("Show up online");
        expect(checked("goal-label")).toEqual([
            "Sell thingsTake money for products, in person or online. Opens your first product.",
        ]);
    });

    it("follows the kind until a goal is picked by hand", () => {
        act(() => radio("A site for my work").click());
        expect(goals()[0]).toBe("WEBSITE");
        expect(checked("goal-label")[0]).toContain("Put up a website");
        expect(text()).toContain("Hear from readers");

        act(() => radio("Just me").click());
        expect(goals()).toEqual([
            "APPOINTMENTS",
            "INVOICE",
            "CRM",
            "WEBSITE",
            "COMMERCE",
            "LATER",
        ]);
        expect(checked("goal-label")[0]).toContain("Take bookings");

        // Picked by hand: a change of kind leaves it alone.
        act(() => radio("Put up a website").click());
        act(() => radio("A business").click());
        expect(checked("goal-label")[0]).toContain("Put up a website");
    });

    it.each([
        ["Sell things", "COMMERCE", "/commerce/products/new"],
        ["Take bookings", "APPOINTMENTS", "/services/new"],
        ["Put up a website", "WEBSITE", "/sites/site_1"],
        ["Keep track of people", "CRM", "/contacts?new=1"],
    ])(
        "%s: Create turns it on and lands on the thing itself",
        async (label, goal, href) => {
            startWithGoalAction.mockResolvedValue({ href, turnedOn: [goal] });
            typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
            act(() => radio(label).click());
            await submit();
            expect(createOrganization).toHaveBeenCalledWith(
                expect.objectContaining({ goal }),
            );
            // After the business exists, with no second sheet in between.
            expect(startWithGoalAction).toHaveBeenCalledWith(goal, "BUSINESS");
            expect(
                startWithGoalAction.mock.invocationCallOrder[0],
            ).toBeGreaterThan(
                createOrganization.mock.invocationCallOrder[0] ?? Infinity,
            );
            expect(push).toHaveBeenCalledWith(href);
            expect(host.querySelector('[role="dialog"]')).toBeNull();
        },
    );

    it("Decide later sends no goal and lands on Home", async () => {
        startWithGoalAction.mockResolvedValue({ href: "/", turnedOn: [] });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        act(() => radio("Decide later").click());
        await submit();
        expect(createOrganization.mock.calls[0]?.[0]).not.toHaveProperty(
            "goal",
        );
        expect(push).toHaveBeenCalledWith("/");
    });

    it("says why when the goal couldn't be turned on, and still goes in", async () => {
        startWithGoalAction.mockResolvedValue({
            href: "/",
            said: "Bookings isn't on offer for this business yet. Pick what to do first from Home.",
            turnedOn: [],
        });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(showInfo).toHaveBeenCalledWith(
            "Bookings isn't on offer for this business yet. Pick what to do first from Home.",
        );
        expect(push).toHaveBeenCalledWith("/");
    });

    it("turns nothing on when the business wasn't made", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "rye is taken",
            field: "address",
        });
        typeInto(labelled("What is it called?"), "Rye");
        await submit();
        expect(startWithGoalAction).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
        expect(text()).toContain("rye is taken");
    });
});

describe("Your name, for an account that has none", () => {
    it("is not asked of an account that has one", () => {
        expect(() => labelled("Your name")).toThrow();
    });

    it("is asked first, saved to the account, and then the business is made", async () => {
        mount({ needsName: true });
        typeInto(labelled("Your name"), "Asha Rao");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(updateUser).toHaveBeenCalledWith({ name: "Asha Rao" });
        expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
            createOrganization.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it("is required, and nothing is made without it", async () => {
        mount({ needsName: true });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(text()).toContain("Enter your name");
        expect(updateUser).not.toHaveBeenCalled();
        expect(createOrganization).not.toHaveBeenCalled();
    });

    it("stops when the name can't be saved", async () => {
        updateUser.mockResolvedValue({ error: { code: "NOPE" } });
        mount({ needsName: true });
        typeInto(labelled("Your name"), "Asha Rao");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(text()).toContain("Couldn't save your name. Try again.");
        expect(createOrganization).not.toHaveBeenCalled();
    });
});

describe("a paid plan picked on saroh.in (U27)", () => {
    const GROW = { plan: "grow", cycle: "month" as const, name: "Grow" };

    beforeEach(() => mount({ checkout: GROW }));

    it("goes on to its checkout once the business exists, sending only the plan and cycle", async () => {
        startCheckout.mockResolvedValue({ kind: "done" });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(createOrganization).toHaveBeenCalled();
        expect(startCheckout).toHaveBeenCalledWith({
            plan: "grow",
            cycle: "month",
        });
        expect(showError).not.toHaveBeenCalled();
    });

    it("says so when the checkout can't start, and the business stays", async () => {
        startCheckout.mockResolvedValue({
            kind: "failed",
            error: "The payment page couldn't be opened, so it's on Free for now.",
        });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(showError).toHaveBeenCalledWith(
            "Rye & Co. Bakery is set up, but Grow isn't started yet.",
            "The payment page couldn't be opened, so it's on Free for now.",
        );
    });

    it("never starts a checkout when the business wasn't made", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "That didn't go through. Try again..",
        });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await submit();
        expect(startCheckout).not.toHaveBeenCalled();
    });
});

describe("an opening-day invite (U31)", () => {
    const TOKEN = "t".repeat(43);

    beforeEach(() =>
        mount({
            checkout: { plan: "pro", cycle: "month", name: "Pro" },
            invite: TOKEN,
            defaultName: "Asha Salon",
        }),
    );

    it("starts with the name it was listed under, and takes the offer instead of a checkout", async () => {
        takeOffer.mockResolvedValue({ ok: true, until: "2031-01-01" });
        expect(labelled("What is it called?").value).toBe("Asha Salon");
        await submit();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Asha Salon" }),
        );
        expect(takeOffer).toHaveBeenCalledWith(TOKEN);
        expect(startCheckout).not.toHaveBeenCalled();
        expect(showError).not.toHaveBeenCalled();
    });

    it("says so when the offer can't be applied, and the business stays", async () => {
        takeOffer.mockResolvedValue({
            ok: false,
            error: "This invite has already been used. Ask for a new invite.",
        });
        await submit();
        expect(showError).toHaveBeenCalledWith(
            "Asha Salon is set up, but the launch offer isn't applied yet.",
            "This invite has already been used. Ask for a new invite.",
        );
    });

    it("never takes the offer when the business wasn't made", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "That didn't go through. Try again..",
        });
        await submit();
        expect(takeOffer).not.toHaveBeenCalled();
    });
});
