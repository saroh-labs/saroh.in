// @vitest-environment jsdom
/**
 * Setup is a stepper (DEC-130, amended 11 Oct 2026): one question to a
 * screen, Back and Continue, and only the step on show in the page. One
 * form holds every answer, the step is in the address, what was typed
 * survives a reload, and the last step's button creates the business.
 *
 * What the create then does (the goal, a plan, an invite) is
 * `business-setup-create.test.tsx`.
 */
import { act } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SetupStepId } from "@/lib/organizations/setup-steps";
import { SETUP_DRAFT_KEY } from "@/lib/organizations/setup-steps";

import { BusinessSetupForm } from "./business-setup-form";
import { SetupStepProvider } from "./setup-step-context";

import {
    address,
    browser,
    button,
    checked,
    choose,
    eyebrow,
    group,
    heading,
    host,
    labelled,
    mount,
    plan,
    press,
    pressBack,
    primary,
    radio,
    settle,
    stepOnShow,
    text,
    toFirst,
    toName,
    typeInto,
    unmount,
} from "./business-setup-form.test-kit";

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
const signOut = vi.fn();
vi.mock("@saroh/auth/client", () => ({
    authClient: {
        signOut: (...args: unknown[]) => signOut(...args) as unknown,
        updateUser: (...args: unknown[]) => updateUser(...args) as unknown,
    },
}));
vi.mock("@/lib/accounts", () => ({ accountsLoginUrl: "/login" }));
vi.mock("@/lib/organizations/time-zones", () => ({
    browserZone: () => "America/Chicago",
}));
vi.mock("@/lib/saroh-billing/checkout-actions", () => ({
    startCheckoutAfterOnboarding: vi.fn(),
    takeLaunchOfferAfterOnboarding: vi.fn(),
}));
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showInfo: vi.fn(),
}));

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.sessionStorage.clear();
    for (const fn of [
        createOrganization,
        checkAddress,
        startWithGoalAction,
        push,
        updateUser,
        signOut,
        showError,
    ]) {
        fn.mockReset();
    }
    createOrganization.mockResolvedValue({
        ok: true,
        data: { id: "org_1", slug: "asha-rao" },
    });
    checkAddress.mockImplementation((asked: string) =>
        Promise.resolve({ address: asked, available: true }),
    );
    startWithGoalAction.mockResolvedValue({
        href: "/commerce/products/new",
        turnedOn: ["COMMERCE"],
    });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue(undefined);
    mount();
});

afterEach(() => {
    unmount();
    vi.restoreAllMocks();
});

describe("the first step: What are you setting up?", () => {
    it("asks only that, with A business chosen and Continue", () => {
        expect(stepOnShow()).toBe("kind");
        expect(eyebrow()).toBe("Step 2 of 4");
        expect(heading().textContent).toBe("What are you setting up?");
        expect(group("kind-label").map((c) => c.textContent)).toEqual([
            "A businessShop, studio, practice",
            "Just meFreelancer, consultant, creator",
            "A site for my workPortfolio, blog, projects",
        ]);
        expect(checked("kind-label")).toEqual([
            "A businessShop, studio, practice",
        ]);
        expect(primary().textContent).toBe("Continue");
        // The first step has nothing behind it.
        expect(button("Back")).toBeUndefined();
        // Nothing of the other steps is in the page.
        expect(host.querySelector("form input")).toBeNull();
        expect(text()).not.toContain("Web address");
        expect(text()).not.toContain("What will you do first?");
        expect(text()).not.toContain("Create the business");
    });

    it("stacks the three choices full width, one to a row", () => {
        const cards = host.querySelector('[aria-labelledby="kind-label"]');
        expect(cards?.className).toContain("grid");
        expect(cards?.className).not.toMatch(/grid-cols/);
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

    it("says neither Last step nor Then you are in", () => {
        expect(text()).not.toMatch(/last step/i);
        expect(text()).not.toContain("Then you are in");
    });

    it("another business counts setup's own three steps, and Back is the way to the workspace", () => {
        mount({ another: true, backTo: "/" });
        expect(eyebrow()).toBe("Set up another · Step 1 of 3");
        expect(text()).toContain("It sits beside the ones you have");
        expect(button("Back")?.getAttribute("href")).toBe("/");
    });
});

describe("the name step", () => {
    it("is what Continue opens, in a business's words, with its address", async () => {
        await toName();
        expect(stepOnShow()).toBe("name");
        expect(address()).toBe("/onboarding?step=name");
        expect(eyebrow()).toBe("Step 3 of 4");
        expect(heading().textContent).toBe("Name your business");
        expect(labelled("What is it called?").placeholder).toBe(
            "Rye & Co. Bakery",
        );
        expect(labelled("Web address")).toBeTruthy();
        expect(text()).toContain("Where does it trade?");
        expect(checked("country-label")).toEqual(["INIndia"]);
        expect(primary().textContent).toBe("Continue");
        expect(button("Back")).toBeTruthy();
        // The step before and the step after are out of the page.
        expect(group("kind-label")).toEqual([]);
        expect(group("goal-label")).toEqual([]);
        expect(text()).not.toContain("registered");
        expect(text()).not.toContain("Its address on Saroh");
    });

    it.each([
        ["Just me", "Name it", "Your name or brand", "Asha Rao"],
        [
            "A site for my work",
            "Name your site",
            "Your name or brand",
            "Asha Rao Studio",
        ],
    ])("speaks in %s's words", async (kind, title, label, placeholder) => {
        choose(kind);
        await toName();
        expect(heading().textContent).toBe(title);
        expect(labelled(label).placeholder).toBe(placeholder);
        expect(text()).toContain("Where are you based?");
    });

    it("fills the web address from the name until it is edited", async () => {
        await toName();
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await settle();
        expect(labelled("Web address").value).toBe("rye-co-bakery");
        typeInto(labelled("Web address"), "rye");
        typeInto(labelled("What is it called?"), "Rye Bakery");
        await settle();
        expect(labelled("Web address").value).toBe("rye");
    });

    it("Continue is its gate: an empty name is said under its field, with the keyboard on it", async () => {
        await toName();
        await press();
        expect(stepOnShow()).toBe("name");
        expect(address()).toBe("/onboarding?step=name");
        expect(text()).toContain("It needs a name");
        expect(text()).toContain("A web address needs at least 3 characters");
        const name = labelled("What is it called?");
        expect(name.getAttribute("aria-invalid")).toBe("true");
        await settle(12);
        expect(document.activeElement).toBe(name);
        expect(createOrganization).not.toHaveBeenCalled();

        // Each problem clears as it is fixed, though the field was never
        // left (Enter, not a press on the button).
        typeInto(name, "Rye");
        await settle();
        expect(text()).not.toContain("It needs a name");
        expect(text()).not.toContain("at least 3 characters");
    });

    it("says a problem on leaving the field, before Continue", async () => {
        await toName();
        const name = labelled("What is it called?");
        await act(async () => {
            name.focus();
            name.blur();
            name.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
            await Promise.resolve();
        });
        await settle();
        expect(text()).toContain("It needs a name");
    });

    it("checks only its own step: the last step's answer is never asked for here", async () => {
        await toName();
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        expect(stepOnShow()).toBe("first");
    });

    it("the main button is the form's one submit, so Enter in a field continues", async () => {
        await toName();
        const form = host.querySelector("form");
        expect(form?.querySelectorAll('[type="submit"]')).toHaveLength(1);
        expect(button("Back")?.getAttribute("type")).toBe("button");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await act(async () => {
            form?.requestSubmit();
            await Promise.resolve();
        });
        await settle();
        expect(stepOnShow()).toBe("first");
    });

    describe("Your name, for an account that has none", () => {
        it("is not asked of an account that has one", async () => {
            await toName();
            expect(() => labelled("Your name")).toThrow();
        });

        it("is asked first on this step, and Continue needs it", async () => {
            mount({ needsName: true });
            await toName();
            typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
            await press();
            expect(stepOnShow()).toBe("name");
            expect(text()).toContain("Enter your name");
            await settle(12);
            expect(document.activeElement).toBe(labelled("Your name"));
            typeInto(labelled("Your name"), "Asha Rao");
            await press();
            expect(stepOnShow()).toBe("first");
        });
    });
});

describe("the web address check holds Continue", () => {
    let answer: (value: unknown) => void;

    beforeEach(async () => {
        checkAddress.mockImplementation(
            () =>
                new Promise((resolve) => {
                    answer = resolve;
                }),
        );
        await toName();
        typeInto(labelled("What is it called?"), "Rye");
    });

    it("waits for the answer, saying so, and goes on when it is free", async () => {
        await press();
        // Asked at once, without waiting for the typing pause.
        expect(checkAddress).toHaveBeenCalledWith("rye");
        expect(stepOnShow()).toBe("name");
        expect(primary().getAttribute("aria-busy")).toBe("true");
        expect(primary().textContent).toContain("Checking…");

        await act(async () => {
            answer({ address: "rye", available: true });
            await Promise.resolve();
        });
        await settle();
        expect(stepOnShow()).toBe("first");
        // One question, though typing and Continue both wanted it.
        expect(checkAddress).toHaveBeenCalledTimes(1);
    });

    it("never passes a taken address on: it stays, says why and puts the keyboard there", async () => {
        await press();
        await act(async () => {
            answer({
                address: "rye",
                available: false,
                reason: "rye is taken. Try another.",
            });
            await Promise.resolve();
        });
        await settle(12);
        expect(stepOnShow()).toBe("name");
        expect(address()).toBe("/onboarding?step=name");
        expect(text()).toContain("rye is taken. Try another.");
        const field = labelled("Web address");
        expect(field.getAttribute("aria-invalid")).toBe("true");
        expect(field.getAttribute("aria-describedby")).toBe("address-status");
        expect(document.activeElement).toBe(field);
        expect(primary().getAttribute("aria-busy")).not.toBe("true");
    });

    it("goes on when the check couldn't be asked: the create checks again", async () => {
        await press();
        await act(async () => {
            answer(null);
            await Promise.resolve();
        });
        await settle();
        expect(stepOnShow()).toBe("first");
    });

    it("asks again for an address changed while it waited", async () => {
        await press();
        typeInto(labelled("Web address"), "rye-bakery");
        await act(async () => {
            answer({ address: "rye", available: true });
            await Promise.resolve();
        });
        await settle();
        expect(stepOnShow()).toBe("name");
        expect(checkAddress).toHaveBeenLastCalledWith("rye-bakery");
        await act(async () => {
            answer({ address: "rye-bakery", available: true });
            await Promise.resolve();
        });
        await settle();
        expect(stepOnShow()).toBe("first");
    });
});

describe("the last step: What will you do first?", () => {
    const goals = () => group("goal-label").map((b) => b.dataset.goal);

    it("offers a business the four goals in Home's words, Sell chosen, and a way to decide later", async () => {
        await toFirst();
        expect(address()).toBe("/onboarding?step=first");
        expect(eyebrow()).toBe("Step 4 of 4");
        expect(heading().textContent).toBe("What will you do first?");
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
        expect(text()).toContain("Put up a website");
        expect(text()).toContain("Decide later");
        expect(text()).not.toContain("Sell products");
        expect(checked("goal-label")).toEqual([
            "Sell thingsTake money for products, in person or online. Opens your first product.",
        ]);
        expect(primary().textContent).toBe("Create the business");
        expect(host.querySelector("form input")).toBeNull();
    });

    it("follows the kind until a goal is picked by hand", async () => {
        choose("A site for my work");
        await toFirst("Asha Rao Studio");
        expect(goals()[0]).toBe("WEBSITE");
        expect(checked("goal-label")[0]).toContain("Put up a website");
        expect(text()).toContain("Hear from readers");
        expect(primary().textContent).toBe("Set it up");

        await pressBack();
        await pressBack();
        choose("Just me");
        await press();
        await press();
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
        choose("Put up a website");
        await pressBack();
        await pressBack();
        choose("A business");
        await press();
        await press();
        expect(checked("goal-label")[0]).toContain("Put up a website");
    });
});

describe("Back", () => {
    it("goes to the step before with every answer kept, and asks nothing", async () => {
        choose("Just me");
        await toFirst("Asha Rao");
        choose("Put up a website");

        await pressBack();
        expect(stepOnShow()).toBe("name");
        expect(host.querySelector('[role="dialog"]')).toBeNull();
        expect(host.querySelector('[role="alertdialog"]')).toBeNull();
        expect(labelled("Your name or brand").value).toBe("Asha Rao");
        expect(labelled("Web address").value).toBe("asha-rao");

        await pressBack();
        expect(stepOnShow()).toBe("kind");
        expect(address()).toBe("/onboarding");
        expect(checked("kind-label")[0]).toContain("Just me");

        await press();
        await press();
        expect(checked("goal-label")[0]).toContain("Put up a website");
    });

    it("is the browser's own Back too: each step is a history entry", async () => {
        await toFirst();
        await browser("back");
        expect(stepOnShow()).toBe("name");
        expect(labelled("What is it called?").value).toBe("Rye & Co. Bakery");
        await browser("back");
        expect(stepOnShow()).toBe("kind");
        await browser("forward");
        expect(stepOnShow()).toBe("name");
    });

    it("a Forward into a step whose earlier step is no longer answered opens that step, saying why", async () => {
        await toFirst();
        await browser("back");
        typeInto(labelled("What is it called?"), "");
        typeInto(labelled("Web address"), "");
        await browser("forward");
        expect(stepOnShow()).toBe("name");
        expect(address()).toBe("/onboarding?step=name");
        expect(text()).toContain("It needs a name");
    });
});

describe("the step is in the address", () => {
    it("keeps a plan picked on saroh.in in it through every step", async () => {
        mount({}, "/onboarding?plan=grow&cycle=month");
        await toFirst();
        expect(address()).toBe("/onboarding?plan=grow&cycle=month&step=first");
        await pressBack();
        await pressBack();
        expect(address()).toBe("/onboarding?plan=grow&cycle=month");
    });

    it("an address for the last step with nothing typed opens the first step that isn't answered, calling nothing wrong", async () => {
        mount({}, "/onboarding?step=first");
        await settle();
        expect(stepOnShow()).toBe("name");
        expect(address()).toBe("/onboarding?step=name");
        expect(text()).not.toContain("It needs a name");
        expect(text()).not.toContain("Create the business");
        // Arriving, the keyboard is left where the browser put it.
        expect(document.activeElement).toBe(document.body);
    });

    it("reads an unknown step as the first", async () => {
        mount({}, "/onboarding?step=9");
        await settle();
        expect(stepOnShow()).toBe("kind");
    });

    it("a reload stays on the step, with what was typed", async () => {
        choose("Just me");
        await toFirst("Asha Rao");
        choose("Decide later");

        // The same tab, the same address, a new page.
        mount({}, "/onboarding?step=first");
        await settle();
        expect(stepOnShow()).toBe("first");
        expect(checked("goal-label")[0]).toContain("Decide later");
        expect(primary().textContent).toBe("Set it up");
        await pressBack();
        expect(labelled("Your name or brand").value).toBe("Asha Rao");
        expect(labelled("Web address").value).toBe("asha-rao");
        await pressBack();
        expect(checked("kind-label")[0]).toContain("Just me");
    });

    it("keeps an address typed by hand from following the name after a reload", async () => {
        await toName();
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        typeInto(labelled("Web address"), "rye");
        await settle();
        mount({}, "/onboarding?step=name");
        await settle();
        expect(labelled("Web address").value).toBe("rye");
        typeInto(labelled("What is it called?"), "Rye Bakery");
        await settle();
        expect(labelled("Web address").value).toBe("rye");
    });
});

describe("the draft", () => {
    const draft = () => window.sessionStorage.getItem(SETUP_DRAFT_KEY) ?? "";

    it("holds the answers and nothing secret", async () => {
        mount({ invite: "t".repeat(43), needsName: true });
        await toName();
        typeInto(labelled("Your name"), "Asha Rao");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await settle();
        const kept = JSON.parse(draft()) as { values: Record<string, string> };
        expect(Object.keys(kept.values).sort()).toEqual([
            "address",
            "country",
            "goal",
            "kind",
            // A Saroh teammate's code (DEC-169): an id they were given,
            // not a secret.
            "managerCode",
            "name",
            "yourName",
        ]);
        expect(draft()).not.toContain("t".repeat(43));
    });

    it("is not another account's: a draft left by someone else is ignored", async () => {
        await toName();
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await settle();
        mount({ email: "kiran@example.com" }, "/onboarding?step=name");
        await settle();
        expect(labelled("What is it called?").value).toBe("");
    });

    it("is cleared once the business is made", async () => {
        await toFirst();
        expect(draft()).toContain("Rye & Co. Bakery");
        await press();
        expect(createOrganization).toHaveBeenCalled();
        expect(draft()).toBe("");
    });

    it("goes when the person signs out", async () => {
        // Never answered here: the page would leave for sign-in.
        signOut.mockReturnValue(new Promise(() => undefined));
        await toName();
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await settle();
        await act(async () => {
            button("Sign out")?.click();
            await Promise.resolve();
        });
        expect(draft()).toBe("");
        expect(signOut).toHaveBeenCalled();
    });

    it("setup works where the browser refuses storage", async () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("QuotaExceededError");
        });
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("SecurityError");
        });
        mount();
        await toFirst();
        await press();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Rye & Co. Bakery" }),
        );
    });
});

describe("a create that fails keeps every answer", () => {
    it("a problem with a field is said under that field, on its own step", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "rye is taken",
            field: "address",
        });
        choose("Just me");
        await toFirst("Rye");
        choose("Put up a website");
        await press();
        await settle(12);

        expect(startWithGoalAction).not.toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
        expect(stepOnShow()).toBe("name");
        expect(text()).toContain("rye is taken");
        const field = labelled("Web address");
        expect(document.activeElement).toBe(field);
        expect(labelled("Your name or brand").value).toBe("Rye");
        expect(field.value).toBe("rye");
        await pressBack();
        expect(checked("kind-label")[0]).toContain("Just me");
        await press();
        typeInto(labelled("Web address"), "rye-bakery");
        await press();
        expect(checked("goal-label")[0]).toContain("Put up a website");
    });

    it("any other failure is said where it is today, and the last step stays as it was", async () => {
        createOrganization.mockResolvedValue({
            ok: false,
            error: "That didn't go through. Try again.",
        });
        await toFirst();
        choose("Take bookings");
        await press();
        expect(showError).toHaveBeenCalledWith(
            "That didn't go through. Try again.",
        );
        expect(stepOnShow()).toBe("first");
        expect(checked("goal-label")[0]).toContain("Take bookings");
        expect(primary().getAttribute("aria-busy")).not.toBe("true");
        await pressBack();
        expect(labelled("What is it called?").value).toBe("Rye & Co. Bakery");
    });

    it("a name that can't be saved to the account is said under Your name", async () => {
        updateUser.mockResolvedValue({ error: { code: "NOPE" } });
        mount({ needsName: true });
        await toName();
        typeInto(labelled("Your name"), "Asha Rao");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        await press();
        await settle(12);
        expect(stepOnShow()).toBe("name");
        expect(text()).toContain("Couldn't save your name. Try again.");
        expect(createOrganization).not.toHaveBeenCalled();
    });
});

describe("where the person is", () => {
    it("the heading takes the keyboard when the step changes, and not on arrival", async () => {
        expect(document.activeElement).toBe(document.body);
        await toName();
        expect(heading().tabIndex).toBe(-1);
        expect(document.activeElement).toBe(heading());
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        expect(document.activeElement).toBe(heading());
        expect(heading().textContent).toBe("What will you do first?");
        await pressBack();
        expect(document.activeElement).toBe(heading());
    });

    it("the heading names the choices it asks about", async () => {
        const kinds = host.querySelector('[role="radiogroup"]');
        expect(kinds?.getAttribute("aria-labelledby")).toBe(heading().id);
        await toFirst();
        const goals = host.querySelector('[role="radiogroup"]');
        expect(goals?.getAttribute("aria-labelledby")).toBe(heading().id);
        expect(goals?.getAttribute("aria-describedby")).toBe("step-lead");
    });

    it("the progress bar sits at the foot of every step, right above Back and the main button", async () => {
        const bar = () => {
            const el = host.querySelector('[role="progressbar"]');
            const foot = el?.nextElementSibling;
            return {
                label: el?.getAttribute("aria-label"),
                now: el?.getAttribute("aria-valuenow"),
                max: el?.getAttribute("aria-valuemax"),
                aboveFoot: foot?.contains(primary()) ?? false,
                afterStep:
                    el?.previousElementSibling?.hasAttribute(
                        "data-setup-step",
                    ) ?? false,
            };
        };
        expect(bar()).toEqual({
            label: "Step 2 of 4",
            now: "2",
            max: "4",
            aboveFoot: true,
            afterStep: true,
        });
        await toName();
        expect(bar()).toMatchObject({ label: "Step 3 of 4", now: "3" });
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        expect(bar()).toMatchObject({
            label: "Step 4 of 4",
            now: "4",
            aboveFoot: true,
            afterStep: true,
        });
    });

    it("Back is before the main button, which is on top on a phone", async () => {
        await toName();
        const foot = primary().parentElement;
        expect(foot?.className).toContain("flex-col-reverse");
        expect(foot?.className).toContain("sm:flex-row");
        expect(foot?.firstElementChild).toBe(button("Back"));
        expect(foot?.lastElementChild).toBe(primary());
    });

    it("the panel marks the same step as the form, from the one list", async () => {
        expect(plan()).toEqual([
            { text: "Done: Make your account", current: false },
            { text: "Now: Say what you are setting up", current: true },
            { text: "Next: Give it a name and a web address", current: false },
            { text: "Next: Pick what to do first", current: false },
        ]);
        await toName();
        expect(plan().map((p) => p.current)).toEqual([
            false,
            false,
            true,
            false,
        ]);
        expect(plan()[1]?.text).toBe("Done: Say what you are setting up");
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        expect(plan()[3]).toEqual({
            text: "Now: Pick what to do first",
            current: true,
        });
        await browser("back");
        expect(plan()[2]?.current).toBe(true);
        expect(host.querySelector("aside")?.textContent).not.toMatch(
            /one screen|Steps 2 and 3/,
        );
    });

    it("Signed in as and Sign out are on every step", async () => {
        const way = () =>
            text().includes("Signed in as asha@example.com") &&
            Boolean(button("Sign out"));
        expect(way()).toBe(true);
        await toName();
        expect(way()).toBe(true);
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        await press();
        expect(way()).toBe(true);
    });

    it("a new step may fade in, and never where motion is turned down", async () => {
        const block = () => host.querySelector("[data-setup-step]");
        // Arriving, nothing moves.
        expect(block()?.className).not.toContain("animate-in");
        await toName();
        expect(block()?.className).toContain("animate-in");
        expect(block()?.className).toContain("fade-in-0");
        expect(block()?.className).toContain("motion-reduce:animate-none");
    });

    it("what the person typed is not readable in a recording, and Saroh's words are", async () => {
        await toName();
        const email = Array.from(host.querySelectorAll("span")).find(
            (s) => s.textContent === "asha@example.com",
        );
        expect(email?.hasAttribute("data-ph-mask")).toBe(true);
        expect(heading().closest("[data-ph-unmask]")).not.toBeNull();
        for (const input of Array.from(host.querySelectorAll("form input"))) {
            expect(input.closest("[data-ph-unmask]")).toBeNull();
        }
        expect(
            document
                .getElementById("address-status")
                ?.closest("[data-ph-unmask]"),
        ).toBeNull();
    });
});

describe("the page as the server sends it, before the tab's draft can be read", () => {
    const sent = (step: SetupStepId) =>
        renderToString(
            <SetupStepProvider initial={step}>
                <BusinessSetupForm email="asha@example.com" />
            </SetupStepProvider>,
        );

    it("draws the first step as it is", () => {
        const html = sent("kind");
        expect(html).toContain("What are you setting up?");
        expect(html).toContain('data-setup-step="kind" class=""');
    });

    it("holds a later step back until the draft is read, so Create never shows over an empty name", () => {
        expect(sent("first")).toMatch(
            /data-setup-step="first" class="invisible"/,
        );
        expect(sent("name")).toMatch(
            /data-setup-step="name" class="invisible"/,
        );
    });
});
