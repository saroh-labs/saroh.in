// @vitest-environment jsdom
/**
 * What setup's last button does (DEC-130): it makes the business from the
 * answers of all three steps, turns the chosen goal on and lands on the
 * thing itself, with no second sheet. Nothing asks whether it is a
 * registered company. A plan or an invite picked on saroh.in is acted on
 * once the business exists.
 *
 * The steps themselves are `business-setup-form.test.tsx`.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    button,
    choose,
    host,
    labelled,
    mount,
    press,
    stepOnShow,
    text,
    toFirst,
    toName,
    typeInto,
    unmount,
} from "./business-setup-form.test-kit";

const createOrganization = vi.fn();
vi.mock("@/lib/organizations/actions", () => ({
    createOrganization: (...args: unknown[]) =>
        createOrganization(...args) as unknown,
    checkAddress: (asked: string) =>
        Promise.resolve({ address: asked, available: true }),
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

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.sessionStorage.clear();
    for (const fn of [
        createOrganization,
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
    startWithGoalAction.mockResolvedValue({
        href: "/commerce/products/new",
        turnedOn: ["COMMERCE"],
    });
    updateUser.mockResolvedValue({ error: null });
    mount();
});

afterEach(() => unmount());

describe("the business is made from all three steps (DEC-070)", () => {
    it("names a business as today, and sends BUSINESS", async () => {
        await toFirst();
        await press();
        expect(createOrganization).toHaveBeenCalledWith({
            name: "Rye & Co. Bakery",
            kind: "BUSINESS",
            address: "rye-co-bakery",
            goal: "COMMERCE",
            profile: { country: "IN", timezone: "America/Chicago" },
        });
        expect(text()).not.toContain("registered");
    });

    it("asks Just me for a name or brand, and sends SOLO from Set it up", async () => {
        choose("Just me");
        await toFirst("Asha Rao");
        expect(text()).toContain("Set it up");
        await press();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Asha Rao",
                kind: "SOLO",
                goal: "APPOINTMENTS",
            }),
        );
        expect(startWithGoalAction).toHaveBeenCalledWith(
            "APPOINTMENTS",
            "SOLO",
        );
    });

    it("sends no zone when the browser can't say one (UX-008)", async () => {
        browserZone.mockReturnValueOnce(null);
        await toFirst("Asha Rao Studio");
        await press();
        expect(createOrganization).toHaveBeenLastCalledWith(
            expect.objectContaining({ profile: { country: "IN" } }),
        );
    });

    it("makes nothing until the last step's button is pressed", async () => {
        await toFirst();
        expect(createOrganization).not.toHaveBeenCalled();
        expect(startWithGoalAction).not.toHaveBeenCalled();
    });
});

describe("Is someone from Saroh helping you? (DEC-169)", () => {
    const CODE_LABEL = "Code from your Saroh contact";
    const openCode = async () => {
        await act(async () => {
            button("Is someone from Saroh helping you?")?.click();
            await new Promise((r) => setTimeout(r, 20));
        });
    };
    const named = () =>
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");

    it("asks for nothing until it is opened, and sends no code", async () => {
        await toName();
        expect(text()).toContain("Is someone from Saroh helping you?");
        expect(text()).not.toContain(CODE_LABEL);
        named();
        await press();
        await press();
        expect(
            (createOrganization.mock.calls[0] as [Record<string, unknown>])[0],
        ).not.toHaveProperty("managerCode");
    });

    it("sends the code that was typed with the business", async () => {
        await toName();
        named();
        await openCode();
        typeInto(labelled(CODE_LABEL), "abcd-2345");
        await press();
        await press();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({ managerCode: "abcd-2345" }),
        );
    });

    it("says what a code looks like, on its step, when it can't be one", async () => {
        await toName();
        named();
        await openCode();
        typeInto(labelled(CODE_LABEL), "hello");
        await press();
        expect(stepOnShow()).toBe("name");
        expect(text()).toContain("A code is 8 letters and numbers.");
        expect(createOrganization).not.toHaveBeenCalled();
    });
});

describe("What will you do first?", () => {
    it.each([
        ["Sell things", "COMMERCE", "/commerce/products/new"],
        ["Take bookings", "APPOINTMENTS", "/services/new"],
        ["Put up a website", "WEBSITE", "/sites/site_1"],
        ["Keep track of people", "CRM", "/contacts?new=1"],
    ])(
        "%s: Create turns it on and lands on the thing itself",
        async (label, goal, href) => {
            startWithGoalAction.mockResolvedValue({ href, turnedOn: [goal] });
            await toFirst();
            choose(label);
            await press();
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
        await toFirst();
        choose("Decide later");
        await press();
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
        await toFirst();
        await press();
        expect(showInfo).toHaveBeenCalledWith(
            "Bookings isn't on offer for this business yet. Pick what to do first from Home.",
        );
        expect(push).toHaveBeenCalledWith("/");
    });

    it("keeps the button busy until the page goes", async () => {
        await toFirst();
        await press();
        const button = host.querySelector('button[type="submit"]');
        expect(button?.getAttribute("aria-busy")).toBe("true");
        expect(button?.textContent).toContain("Setting up…");
    });
});

describe("Your name, for an account that has none", () => {
    it("is saved to the account first, and then the business is made", async () => {
        mount({ needsName: true });
        await toName();
        typeInto(labelled("Your name"), "Asha Rao");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        // Nothing is saved by a step: only by the last button.
        expect(updateUser).not.toHaveBeenCalled();
        await press();
        expect(updateUser).toHaveBeenCalledWith({ name: "Asha Rao" });
        expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
            createOrganization.mock.invocationCallOrder[0] ?? 0,
        );
    });
});

describe("a paid plan picked on saroh.in (U27)", () => {
    const GROW = { plan: "grow", cycle: "month" as const, name: "Grow" };

    beforeEach(() => mount({ checkout: GROW }));

    it("goes on to its checkout once the business exists, sending only the plan and cycle", async () => {
        startCheckout.mockResolvedValue({ kind: "done" });
        await toFirst();
        await press();
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
        await toFirst();
        await press();
        expect(showError).toHaveBeenCalledWith(
            "Rye & Co. Bakery is set up, but Grow isn't started yet.",
            "The payment page couldn't be opened, so it's on Free for now.",
        );
    });

    it("never starts a checkout when the business wasn't made", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "That didn't go through. Try again.",
        });
        await toFirst();
        await press();
        expect(startCheckout).not.toHaveBeenCalled();
    });

    it("says the plan on every step, where the page passes its line", async () => {
        mount({ checkout: GROW, note: <p>You picked Grow.</p> });
        expect(text()).toContain("You picked Grow.");
        await toFirst();
        expect(text()).toContain("You picked Grow.");
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
        await toName();
        expect(labelled("What is it called?").value).toBe("Asha Salon");
        await press();
        await press();
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
        await toName();
        await press();
        await press();
        expect(showError).toHaveBeenCalledWith(
            "Asha Salon is set up, but the launch offer isn't applied yet.",
            "This invite has already been used. Ask for a new invite.",
        );
    });

    it("never takes the offer when the business wasn't made", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "That didn't go through. Try again.",
        });
        await toName();
        await press();
        await press();
        expect(takeOffer).not.toHaveBeenCalled();
    });
});
