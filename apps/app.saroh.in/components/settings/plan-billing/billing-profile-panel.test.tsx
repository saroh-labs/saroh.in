// @vitest-environment jsdom
/**
 * "Who Saroh bills" on Plan & billing (DEC-167, R8, R9, U5): the business's
 * billing profile read first, Edit and Change in side sheets. An edit of a
 * profile used by several businesses says how many before Save (AE3);
 * another owner's profile is its legal name only; a business with none
 * reads "Choose who Saroh bills"; a refusal stays in the open sheet, under
 * the field it is about. Made-up profiles. Hidden for an Admin:
 * `plan-owner-only.test.tsx`.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    BusinessBillingProfile,
    OwnBillingProfile,
} from "@/lib/billing-profiles/view";

import { BillingProfilePanel } from "./billing-profile-panel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
    usePathname: () => "/settings/billing",
    useSearchParams: () => new URLSearchParams(),
}));
const chooseBillingProfileAction = vi.fn();
const createBillingProfileAction = vi.fn();
const updateBillingProfileAction = vi.fn();
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    chooseBillingProfileAction: (...a: unknown[]) =>
        chooseBillingProfileAction(...a) as unknown,
    createBillingProfileAction: (...a: unknown[]) =>
        createBillingProfileAction(...a) as unknown,
    updateBillingProfileAction: (...a: unknown[]) =>
        updateBillingProfileAction(...a) as unknown,
}));
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => showError(...a) as unknown,
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
}));

const FOODS: OwnBillingProfile = {
    id: "bprof_ka",
    legalName: "Asha Foods LLP",
    gstin: "29ABCDE1234F1ZW",
    gstState: "29",
    addressLine1: "3 Hill Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560038",
    billingEmail: "accounts@ashafoods.example.com",
    phone: null,
    businesses: 3,
};
const FITNESS: OwnBillingProfile = {
    ...FOODS,
    id: "bprof_mh",
    legalName: "Asha Fitness",
    gstin: null,
    gstState: "27",
    addressLine1: null,
    city: null,
    postalCode: null,
    billingEmail: "fitness@example.com",
    businesses: 1,
};

const mine = (current: OwnBillingProfile): BusinessBillingProfile => ({
    current: { ...current, mine: true },
    mine: [FOODS, FITNESS],
    businessesOnCurrent: current.businesses,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        refresh,
        chooseBillingProfileAction,
        createBillingProfileAction,
        updateBillingProfileAction,
        showError,
    ]) {
        fn.mockReset();
    }
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function draw(view: BusinessBillingProfile | null) {
    act(() => root.render(<BillingProfilePanel view={view} />));
}

const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
function button(name: string, within: ParentNode | null = document.body) {
    const hit = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
}
async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}
async function submit() {
    const form = sheet()?.querySelector("form");
    if (!form) throw new Error("No form");
    await act(async () => {
        form.requestSubmit();
        await new Promise((r) => setTimeout(r, 30));
    });
}
function field(label: string): HTMLInputElement {
    const hit = Array.from(sheet()?.querySelectorAll("label") ?? []).find((l) =>
        l.textContent.trim().startsWith(label),
    );
    const id = hit?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field ${label}`);
    return el as HTMLInputElement;
}
function type(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}
function choice(name: string): HTMLElement {
    const hit = Array.from(
        sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
    ).find((b) => b.textContent.includes(name));
    if (!hit) throw new Error(`No choice ${name}`);
    return hit;
}

describe("Billed to, read first", () => {
    it("shows the profile: legal name, GSTIN, address and billing email, with Edit and Change", () => {
        draw(mine(FOODS));
        const text = host.textContent;
        expect(text).toContain("Billed to");
        expect(text).toContain("Asha Foods LLP");
        expect(text).toContain("GSTIN 29ABCDE1234F1ZW");
        expect(text).toContain("3 Hill Road, Bengaluru 560038, Karnataka");
        expect(text).toContain("accounts@ashafoods.example.com");
        expect(button("Edit", host)).toBeTruthy();
        expect(button("Change", host)).toBeTruthy();
    });

    it("says No GSTIN, and that the address is still to come", () => {
        draw(mine(FITNESS));
        expect(host.textContent).toContain("No GSTIN");
        expect(host.textContent).toContain("No billing address yet");
    });

    it("names another owner's profile by its legal name only, with a way to one of mine", () => {
        draw({
            current: { legalName: "Rao Holdings", mine: false },
            mine: [FOODS],
            businessesOnCurrent: null,
        });
        expect(host.textContent).toContain("Rao Holdings");
        expect(host.textContent).not.toContain("GSTIN");
        expect(() => button("Edit", host)).toThrow();
        expect(button("Bill to one of my profiles", host)).toBeTruthy();
    });

    it("reads Choose who Saroh bills for a business with none, the Change sheet its action", async () => {
        draw({ current: null, mine: [FOODS], businessesOnCurrent: null });
        expect(host.textContent).toContain("Choose who Saroh bills");
        await press(button("Choose", host));
        expect(sheet()?.textContent).toContain("Choose who Saroh bills");
        expect(sheet()?.textContent).toContain("Asha Foods LLP");
        expect(sheet()?.textContent).toContain("New billing profile");
    });

    it("says it couldn't be read, never none", () => {
        draw(null);
        expect(host.textContent).toContain("Couldn't load who Saroh bills");
    });
});

describe("Edit: a profile used by several businesses", () => {
    it("says how many before Save, and the button confirms it (AE3)", async () => {
        draw(mine(FOODS));
        await press(button("Edit", host));
        expect(sheet()?.textContent).toContain(
            "This changes Saroh's invoices for 3 businesses.",
        );
        updateBillingProfileAction.mockResolvedValue({
            ok: true,
            data: { profile: FOODS, businesses: 3 },
        });
        type(field("Billing address"), "4 Lake View");
        await press(button("Save for 3 businesses", sheet()));
        expect(updateBillingProfileAction).toHaveBeenCalledWith("bprof_ka", {
            addressLine1: "4 Lake View",
        });
        expect(refresh).toHaveBeenCalled();
        expect(sheet()).toBeNull();
    });

    it("says nothing of other businesses for a profile that bills one", async () => {
        draw(mine(FITNESS));
        await press(button("Edit", host));
        expect(sheet()?.textContent).not.toContain("businesses.");
        expect(button("Save", sheet())).toBeTruthy();
    });

    it("keeps a billing email the owner uses under its field, the sheet open", async () => {
        draw(mine(FITNESS));
        await press(button("Edit", host));
        type(field("Billing email"), "accounts@ashafoods.example.com");
        await submit();
        expect(updateBillingProfileAction).not.toHaveBeenCalled();
        expect(sheet()?.textContent).toContain(
            "You already have a billing profile with this email.",
        );
    });
});

describe("Change: who Saroh bills", () => {
    it("bills the business to another of my profiles", async () => {
        draw(mine(FOODS));
        chooseBillingProfileAction.mockResolvedValue({
            ok: true,
            data: mine(FITNESS),
        });
        await press(button("Change", host));
        await press(choice("Asha Fitness"));
        await submit();
        expect(chooseBillingProfileAction).toHaveBeenCalledWith("bprof_mh");
        expect(refresh).toHaveBeenCalled();
    });

    it("says a paid plan moves at its renewal under the choices, the sheet open", async () => {
        draw(mine(FOODS));
        const said =
            "You can move a paid plan to another billing profile at its next renewal.";
        chooseBillingProfileAction.mockResolvedValue({
            ok: false,
            error: said,
            field: "billingProfile",
        });
        await press(button("Change", host));
        await press(choice("Asha Fitness"));
        await submit();
        expect(sheet()?.textContent).toContain(said);
        expect(showError).not.toHaveBeenCalled();
    });

    it("makes a new profile in place; a duplicate email from the API stays under the email field", async () => {
        draw({ current: null, mine: [], businessesOnCurrent: null });
        createBillingProfileAction.mockResolvedValue({
            ok: false,
            error: "You already have a billing profile with this email. Use a different billing email for this one.",
            field: "billingEmail",
        });
        await press(button("Choose", host));
        await press(choice("New billing profile"));
        type(field("Legal name"), "Asha Fitness Pvt Ltd");
        type(field("Billing email"), "fitness@example.com");
        await press(button("Add billing profile", sheet()));
        expect(createBillingProfileAction).toHaveBeenCalledWith(
            {
                legalName: "Asha Fitness Pvt Ltd",
                billingEmail: "fitness@example.com",
            },
            true,
        );
        const email = field("Billing email");
        expect(email.getAttribute("aria-invalid")).toBe("true");
        expect(sheet()?.textContent).toContain(
            "You already have a billing profile with this email.",
        );
    });
});
