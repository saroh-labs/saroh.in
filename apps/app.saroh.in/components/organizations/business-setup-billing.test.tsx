// @vitest-environment jsdom
/**
 * "Who does Saroh bill for this business?" (DEC-167, R7): the setup step
 * an owner who has a billing profile answers before the business exists.
 * Their profiles, then "New billing profile", none chosen for them, and
 * Continue asks until one is. An owner with none is never asked.
 *
 * The rest of the stepper is `business-setup-form.test.tsx`, the create's
 * other work `business-setup-create.test.tsx`.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingProfileOption } from "@/lib/organizations/setup-billing";
import { SETUP_DRAFT_KEY } from "@/lib/organizations/setup-steps";

import {
    address,
    eyebrow,
    group,
    heading,
    host,
    labelled,
    mount,
    press,
    pressBack,
    primary,
    radio,
    settle,
    stepOnShow,
    text,
    toFirst,
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
vi.mock("@saroh/auth/client", () => ({
    authClient: { signOut: vi.fn(), updateUser: vi.fn() },
}));
vi.mock("@/lib/accounts", () => ({ accountsLoginUrl: "/login" }));
vi.mock("@/lib/organizations/time-zones", () => ({
    browserZone: () => "Asia/Kolkata",
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

const PROFILES: BillingProfileOption[] = [
    {
        id: "bprof_ka",
        legalName: "Asha Foods LLP",
        gstin: "29ABCDE1234F1ZW",
        address: "3 Hill Road, Bengaluru 560038, Karnataka",
        billingEmail: "accounts@ashafoods.example.com",
    },
    {
        id: "bprof_hr",
        legalName: "Asha Fitness",
        gstin: null,
        address: null,
        billingEmail: "fitness@example.com",
    },
];

const QUESTION = "Who does Saroh bill for this business?";
const BILLING = "billing-heading";

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.sessionStorage.clear();
    for (const fn of [
        createOrganization,
        startWithGoalAction,
        push,
        showError,
    ]) {
        fn.mockReset();
    }
    createOrganization.mockResolvedValue({
        ok: true,
        data: { id: "org_2", slug: "asha-bakery" },
    });
    startWithGoalAction.mockResolvedValue({ href: "/", turnedOn: [] });
});

afterEach(() => unmount());

/** Setup as an owner with profiles: "Set up another", to the billing step. */
async function toBilling(profiles = PROFILES) {
    mount({ another: true, billingProfiles: profiles });
    await toFirst("Asha's Bakery");
}

describe("an owner with billing profiles is asked who Saroh bills", () => {
    it("comes after the name, as its own step, counted", async () => {
        await toBilling();
        expect(stepOnShow()).toBe("billing");
        expect(address()).toBe("/onboarding?step=billing");
        expect(heading().textContent).toBe(QUESTION);
        expect(eyebrow()).toBe("Set up another · Step 3 of 4");
        expect(primary().textContent).toBe("Continue");
    });

    it("lists each profile with its legal name, GSTIN, address and billing email, then a new one, none chosen", async () => {
        await toBilling();
        const choices = group(BILLING);
        expect(choices.map((c) => c.textContent)).toEqual([
            "Asha Foods LLPGSTIN 29ABCDE1234F1ZW3 Hill Road, Bengaluru 560038, Karnataka" +
                "accounts@ashafoods.example.com",
            "Asha FitnessNo GSTINfitness@example.com",
            "New billing profileAnother legal name, GSTIN or billing email.",
        ]);
        expect(
            choices.filter((c) => c.getAttribute("aria-checked") === "true"),
        ).toHaveLength(0);
        // No new profile's fields until it is chosen.
        expect(text()).not.toContain("Legal name");
    });

    it("Continue asks until one is chosen, with the keyboard on the first", async () => {
        await toBilling();
        await press();
        expect(stepOnShow()).toBe("billing");
        expect(text()).toContain("Choose who Saroh bills for this business.");
        expect(
            host
                .querySelector('[role="radiogroup"]')
                ?.getAttribute("aria-invalid"),
        ).toBe("true");
        expect(document.activeElement).toBe(group(BILLING)[0]);

        act(() => radio("Asha Fitness").click());
        expect(text()).not.toContain("Choose who Saroh bills");
        await press();
        expect(stepOnShow()).toBe("first");
        expect(eyebrow()).toBe("Set up another · Step 4 of 4");
    });

    it("creates the business on the profile chosen", async () => {
        await toBilling();
        act(() => radio("Asha Foods LLP").click());
        await press();
        await press();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Asha's Bakery",
                billingProfileId: "bprof_ka",
            }),
        );
        expect(
            (createOrganization.mock.calls[0] as [Record<string, unknown>])[0],
        ).not.toHaveProperty("newBillingProfile");
    });

    it("a new profile asks for its legal name and billing email, and refuses an email the owner uses (AE7)", async () => {
        await toBilling();
        act(() => radio("New billing profile").click());
        expect(text()).toContain("Legal name");
        await press();
        expect(stepOnShow()).toBe("billing");
        expect(text()).toContain("Add the legal name Saroh's invoices go to.");
        expect(text()).toContain(
            "Add an email for Saroh's invoices and payment receipts.",
        );

        typeInto(labelled("Legal name"), "Asha Bakes LLP");
        typeInto(labelled("Billing email"), "Fitness@Example.com");
        await press();
        expect(stepOnShow()).toBe("billing");
        expect(text()).toContain(
            "You already have a billing profile with this email.",
        );
        expect(createOrganization).not.toHaveBeenCalled();
    });

    it("creates the business with the new profile as typed, only what was given", async () => {
        await toBilling();
        act(() => radio("New billing profile").click());
        typeInto(labelled("Legal name"), " Asha Bakes LLP ");
        typeInto(labelled("Billing email"), "bakes@example.com");
        typeInto(labelled("GSTIN (optional)"), "29abcde1234f1zw");
        typeInto(labelled("PIN code (optional)"), "560 038");
        await press();
        expect(stepOnShow()).toBe("first");
        await press();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({
                newBillingProfile: {
                    legalName: "Asha Bakes LLP",
                    billingEmail: "bakes@example.com",
                    gstin: "29ABCDE1234F1ZW",
                    postalCode: "560038",
                },
            }),
        );
    });

    it("the API's refusal of the email is said under it, back on its step, with every answer kept", async () => {
        createOrganization.mockResolvedValueOnce({
            ok: false,
            error: "You already have a billing profile with this email. Use a different billing email for this one.",
            field: "billingEmail",
        });
        await toBilling();
        act(() => radio("New billing profile").click());
        typeInto(labelled("Legal name"), "Asha Bakes LLP");
        typeInto(labelled("Billing email"), "bakes@example.com");
        await press();
        await press();
        await settle(8);
        expect(stepOnShow()).toBe("billing");
        expect(text()).toContain(
            "You already have a billing profile with this email.",
        );
        expect(labelled("Legal name").value).toBe("Asha Bakes LLP");
        expect(push).not.toHaveBeenCalled();
        expect(showError).not.toHaveBeenCalled();
    });

    it("the API's refusal of the choice itself is said on the choices", async () => {
        createOrganization.mockResolvedValueOnce({
            ok: false,
            error: "That billing profile isn't one of yours. Choose another.",
            field: "billingProfile",
        });
        await toBilling();
        act(() => radio("Asha Fitness").click());
        await press();
        await press();
        await settle(8);
        expect(stepOnShow()).toBe("billing");
        expect(text()).toContain("That billing profile isn't one of yours.");
    });

    it("Back from what to do first returns to it with the choice kept", async () => {
        await toBilling();
        act(() => radio("Asha Fitness").click());
        await press();
        await pressBack();
        expect(stepOnShow()).toBe("billing");
        expect(radio("Asha Fitness").getAttribute("aria-checked")).toBe("true");
        await pressBack();
        expect(stepOnShow()).toBe("name");
    });

    it("keeps who Saroh bills out of the tab's draft", async () => {
        await toBilling();
        act(() => radio("New billing profile").click());
        typeInto(labelled("Billing email"), "bakes@example.com");
        await settle();
        const kept = window.sessionStorage.getItem(SETUP_DRAFT_KEY) ?? "";
        expect(kept).toContain("Asha's Bakery");
        expect(kept).not.toContain("bakes@example.com");
        expect(kept).not.toContain("billingChoice");
    });
});

describe("an owner with no billing profile is not asked", () => {
    it("goes from the name to what to do first, and sends no choice", async () => {
        mount({ another: true, billingProfiles: [] });
        await toFirst("Asha's Bakery");
        expect(stepOnShow()).toBe("first");
        expect(eyebrow()).toBe("Set up another · Step 3 of 3");
        expect(text()).not.toContain(QUESTION);
        await press();
        const sent = (
            createOrganization.mock.calls[0] as [Record<string, unknown>]
        )[0];
        expect(sent).not.toHaveProperty("billingProfileId");
        expect(sent).not.toHaveProperty("newBillingProfile");
    });

    it("an address for the billing step, which isn't asked, opens the first step that isn't answered", async () => {
        mount({ billingProfiles: [] }, "/onboarding?step=billing");
        await settle();
        // Nothing typed: the first step that isn't answered.
        expect(stepOnShow()).toBe("name");
    });
});
