/**
 * What the Billing profiles component tests share: made-up profiles and
 * businesses, and a way to draw, press and type in jsdom without a
 * testing library (as app.saroh.in's component tests do).
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import type {
    BillingProfile,
    OwnedBusiness,
    ProfileBusiness,
    ProfileDetail,
} from "@/lib/billing-profiles";

export const ROHTAK: ProfileBusiness = {
    id: "org_rohtak",
    name: "Pulse Fitness Rohtak",
    owner: true,
    plan: { name: "Grow", cycle: "month" },
    paid: true,
    nextChargeAt: "2026-11-21T06:00:00.000Z",
    pendingMove: null,
};
export const GURUGRAM: ProfileBusiness = {
    ...ROHTAK,
    id: "org_gurugram",
    name: "Pulse Fitness Gurugram",
    plan: { name: "Pro", cycle: "month" },
    nextChargeAt: "2026-11-03T06:00:00.000Z",
};
export const YOGA: ProfileBusiness = {
    id: "org_yoga",
    name: "Yoga Corner",
    owner: true,
    plan: { name: "Free", cycle: "month" },
    paid: false,
    nextChargeAt: null,
    pendingMove: null,
};

export const PULSE: BillingProfile = {
    id: "bp_pulse",
    legalName: "Pulse Fitness LLP",
    gstin: "06AAAAA0000A1Z5",
    gstState: "06",
    addressLine1: "Plot 14, Sector 3, HSIIDC",
    addressLine2: null,
    city: "Rohtak",
    postalCode: "124001",
    billingEmail: "pulsefitness@example.com",
    phone: null,
    businesses: 2,
    sync: "linked",
    payingFor: [ROHTAK, GURUGRAM],
    movingIn: [],
};
export const RAJA: BillingProfile = {
    ...PULSE,
    id: "bp_raja",
    legalName: "Raja Ji Dhaba Pvt Ltd",
    gstin: "07AAAAA0000A1Z5",
    gstState: "07",
    billingEmail: "rajajidhaba@example.com",
    businesses: 1,
    sync: "linked",
    payingFor: [{ ...YOGA, id: "org_raja", name: "Raja Ji Dhaba" }],
};
export const ASHA: BillingProfile = {
    ...PULSE,
    id: "bp_asha",
    legalName: "Asha Verma",
    gstin: null,
    billingEmail: "asha.verma@example.com",
    businesses: 1,
    payingFor: [YOGA],
};
export const MILL: BillingProfile = {
    ...PULSE,
    id: "bp_mill",
    legalName: "Old Mill Bakery",
    gstin: "06BBBBB0000B1Z5",
    billingEmail: "oldmillbakery@example.com",
    businesses: 0,
    sync: "failed",
    payingFor: [],
};

export const PROFILES = [PULSE, RAJA, ASHA, MILL];

export function detail(
    p: BillingProfile,
    over: Partial<ProfileDetail> = {},
): ProfileDetail {
    return {
        ...p,
        invoices: [],
        invoiceCount: 0,
        removeBlockedBy:
            p.payingFor.length > 1
                ? `Move its ${p.payingFor.length} businesses to another profile first.`
                : p.payingFor.length === 1
                  ? "Move its business to another profile first."
                  : null,
        ...over,
    };
}

export function owned(b: ProfileBusiness, on: string): OwnedBusiness {
    return { ...b, billingProfileId: on };
}

let root: Root | null = null;
export let host: HTMLDivElement;

export function setUp() {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
}

export function tearDown() {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
}

export function draw(node: ReactNode) {
    act(() => root?.render(node));
}

export const dialog = () =>
    document.body.querySelector<HTMLElement>(
        "[role=dialog], [role=alertdialog]",
    );

export function button(
    name: string,
    within: ParentNode | null = document.body,
) {
    const hit = Array.from(
        within?.querySelectorAll<HTMLElement>("button, a") ?? [],
    ).find((b) => b.textContent.trim() === name);
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
}

export async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}

export async function submit() {
    const form = dialog()?.querySelector("form");
    if (!form) throw new Error("No form");
    await act(async () => {
        form.requestSubmit();
        await new Promise((r) => setTimeout(r, 30));
    });
}

export function field(label: string): HTMLInputElement {
    const hit = Array.from(dialog()?.querySelectorAll("label") ?? []).find(
        (l) => l.textContent.trim().startsWith(label),
    );
    const id = hit?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field ${label}`);
    return el as HTMLInputElement;
}

export function type(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

export function text(el: ParentNode | null = document.body): string {
    return el?.textContent?.replace(/\s+/g, " ") ?? "";
}

/** The element, or a failed test that says what was missing. */
export function must<T>(value: T | null | undefined, what = "element"): T {
    if (value === null || value === undefined) throw new Error(`No ${what}`);
    return value;
}

/** The control a label names (`aria-label`). */
export function labelled(label: string): HTMLElement {
    return must(
        document.body.querySelector<HTMLElement>(`[aria-label="${label}"]`),
        label,
    );
}
