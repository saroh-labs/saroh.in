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
const startCheckout = vi.fn();
vi.mock("@/lib/saroh-billing/checkout-actions", () => ({
    startCheckoutAfterOnboarding: (...args: unknown[]) =>
        startCheckout(...args) as unknown,
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
            profile: { type: "individual", country: "IN" },
        });
    });

    it("never asks a site for my work if it is a company, and sends no type", async () => {
        // A type picked under another answer first is not sent.
        act(() => radio("Just me").click());
        act(() => radio("Not registered").click());
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
            profile: { country: "IN" },
        });
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
});
