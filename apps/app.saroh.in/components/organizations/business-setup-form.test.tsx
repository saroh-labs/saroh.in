// @vitest-environment jsdom
/**
 * Setup asks "What are you setting up?" first (DEC-070, K2): nothing is
 * chosen for them, the form refuses to go on without an answer, and the
 * answer sets the words the rest of the form speaks in. A site for my work
 * is not asked whether it is a registered company, and sends no type.
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
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@saroh/auth/client", () => ({
    authClient: { signOut: vi.fn() },
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
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    createOrganization.mockReset();
    checkAddress.mockReset();
    createOrganization.mockResolvedValue({
        ok: true,
        data: { id: "org_1", slug: "asha-rao" },
    });
    checkAddress.mockImplementation((address: string) =>
        Promise.resolve({ address, available: true }),
    );
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

describe("What are you setting up? (DEC-070)", () => {
    it("offers the three answers with nothing chosen", () => {
        const choices = Array.from(
            host.querySelectorAll(
                '[aria-labelledby="kind-label"] [role="radio"]',
            ),
        );
        expect(choices.map((c) => c.textContent)).toEqual([
            "A businessShop, studio, practice",
            "Just meFreelancer, consultant, creator",
            "A site for my workPortfolio, blog, projects",
        ]);
        expect(
            choices.every((c) => c.getAttribute("aria-checked") === "false"),
        ).toBe(true);
    });

    it("keeps the rest of the form back until it is answered", () => {
        const form = host.querySelector("form");
        expect(form?.className).toContain(
            "[&>*:not([data-setup-kept])]:hidden",
        );
        act(() => radio("Just me").click());
        expect(form?.className).not.toContain("hidden");
    });

    it("refuses to go on without an answer", async () => {
        await submit();
        expect(text()).toContain("Choose what you're setting up");
        expect(createOrganization).not.toHaveBeenCalled();
    });

    it("clears that refusal once they answer", async () => {
        await submit();
        act(() => radio("A business").click());
        expect(text()).not.toContain("Choose what you're setting up");
    });

    it("shows the fields that appear without errors before anything is typed (#874)", async () => {
        await submit();
        act(() => radio("A business").click());
        await settle();
        expect(text()).not.toContain("It needs a name");
        expect(text()).not.toContain("An address needs at least 3 characters");
        // Changing the answer is not typing either.
        act(() => radio("Just me").click());
        await settle();
        expect(text()).not.toContain("It needs a name");
        expect(text()).not.toContain("An address needs at least 3 characters");
    });

    it("still refuses an empty name when they press the button again", async () => {
        await submit();
        act(() => radio("A business").click());
        await submit();
        expect(text()).toContain("It needs a name");
        expect(createOrganization).not.toHaveBeenCalled();
    });

    it("names a business as today, and sends BUSINESS", async () => {
        act(() => radio("A business").click());
        const name = labelled("What is it called?");
        expect(name.placeholder).toBe("Rye & Co. Bakery");
        expect(text()).toContain("Is it registered as a company?");
        expect(text()).toContain("Create the business");

        typeInto(name, "Rye & Co. Bakery");
        await submit();
        expect(createOrganization).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Rye & Co. Bakery",
                kind: "BUSINESS",
            }),
        );
    });

    it("asks Just me for a name or brand, and sends SOLO", async () => {
        act(() => radio("Just me").click());
        const name = labelled("Your name or brand");
        expect(name.placeholder).toBe("Asha Rao");
        expect(text()).toContain("People see this on your site and invoices.");
        expect(text()).toContain("Is it registered as a company?");

        typeInto(name, "Asha Rao");
        act(() => radio("Not registered").click());
        await submit();
        expect(createOrganization).toHaveBeenCalledWith({
            name: "Asha Rao",
            kind: "SOLO",
            address: "asha-rao",
            profile: {
                type: "individual",
                registered: false,
                country: "IN",
                timezone: "America/Chicago",
            },
        });
    });

    it("keeps Registered as said, with no type guessed (prelaunch)", async () => {
        act(() => radio("A business").click());
        typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
        act(() => radio("Registered").click());
        await submit();
        expect(createOrganization).toHaveBeenCalledWith({
            name: "Rye & Co. Bakery",
            kind: "BUSINESS",
            address: "rye-co-bakery",
            profile: {
                registered: true,
                country: "IN",
                timezone: "America/Chicago",
            },
        });
    });

    it("never asks a site for my work if it is a company, and sends no type", async () => {
        // A type picked under another answer first is not sent.
        act(() => radio("Just me").click());
        act(() => radio("Registered").click());
        act(() => radio("A site for my work").click());

        expect(text()).not.toContain("Is it registered as a company?");
        const name = labelled("Your name or brand");
        expect(name.placeholder).toBe("Asha Rao Studio");

        typeInto(name, "Asha Rao Studio");
        await submit();
        expect(createOrganization).toHaveBeenCalledWith({
            name: "Asha Rao Studio",
            kind: "WORK",
            address: "asha-rao-studio",
            profile: { country: "IN", timezone: "America/Chicago" },
        });
    });

    it("sends no zone when the browser can't say one (UX-008)", async () => {
        browserZone.mockReturnValueOnce(null);
        act(() => radio("A site for my work").click());
        typeInto(labelled("Your name or brand"), "Asha Rao Studio");
        await submit();
        expect(createOrganization).toHaveBeenLastCalledWith(
            expect.objectContaining({ profile: { country: "IN" } }),
        );
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

    describe("a paid plan picked on saroh.in (U27)", () => {
        const GROW = { plan: "grow", cycle: "month" as const, name: "Grow" };

        beforeEach(() => {
            startCheckout.mockReset();
            showError.mockReset();
            act(() =>
                root.render(
                    <BusinessSetupForm
                        email="asha@example.com"
                        checkout={GROW}
                    />,
                ),
            );
        });

        it("goes on to its checkout once the business exists, sending only the plan and cycle", async () => {
            startCheckout.mockResolvedValue({ kind: "done" });
            act(() => radio("A business").click());
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
            act(() => radio("A business").click());
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
                error: "Something went wrong.",
            });
            act(() => radio("A business").click());
            typeInto(labelled("What is it called?"), "Rye & Co. Bakery");
            await submit();
            expect(startCheckout).not.toHaveBeenCalled();
        });
    });

    describe("an opening-day invite (U31)", () => {
        const TOKEN = "t".repeat(43);

        beforeEach(() => {
            startCheckout.mockReset();
            takeOffer.mockReset();
            showError.mockReset();
            // A fresh mount: the form reads its starting name once.
            act(() => root.unmount());
            root = createRoot(host);
            act(() =>
                root.render(
                    <BusinessSetupForm
                        email="asha@example.com"
                        checkout={{ plan: "pro", cycle: "month", name: "Pro" }}
                        invite={TOKEN}
                        defaultName="Asha Salon"
                    />,
                ),
            );
        });

        it("starts with the name it was listed under, and takes the offer instead of a checkout", async () => {
            takeOffer.mockResolvedValue({ ok: true, until: "2031-01-01" });
            act(() => radio("A business").click());
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
            act(() => radio("A business").click());
            await submit();
            expect(showError).toHaveBeenCalledWith(
                "Asha Salon is set up, but the launch offer isn't applied yet.",
                "This invite has already been used. Ask for a new invite.",
            );
        });

        it("never takes the offer when the business wasn't made", async () => {
            createOrganization.mockResolvedValue({
                ok: false,
                error: "Something went wrong.",
            });
            act(() => radio("A business").click());
            await submit();
            expect(takeOffer).not.toHaveBeenCalled();
        });
    });
});
