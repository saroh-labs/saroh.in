/**
 * What the setup stepper's tests share: its mocks' handles, a mount with
 * the step provider and the panel beside the form, and the few gestures a
 * person makes (type, choose, Continue, Back).
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 * The mocks themselves are declared in each test file (`vi.mock` is hoisted
 * per file); this only drives what they render.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";

import { stepFromQuery } from "@/lib/organizations/setup-steps";

import { BusinessSetupForm } from "./business-setup-form";
import { SetupPanel } from "./setup-panel";
import { SetupStepProvider } from "./setup-step-context";

export type SetupProps = Partial<Parameters<typeof BusinessSetupForm>[0]>;

let root: Root | null = null;
export let host: HTMLDivElement;

/** Draw setup at an address, as the page does: provider, panel, form. */
export function mount(props: SetupProps = {}, address = "/onboarding") {
    unmount();
    window.history.replaceState(null, "", address);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const initial = stepFromQuery(
        new URLSearchParams(window.location.search).get("step"),
    );
    act(() =>
        root?.render(
            <SetupStepProvider initial={initial}>
                <aside>
                    <SetupPanel />
                </aside>
                <BusinessSetupForm email="asha@example.com" {...props} />
            </SetupStepProvider>,
        ),
    );
}

export function unmount() {
    if (root) act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
}

export async function settle(turns = 6) {
    // Past a frame too: the keyboard is moved a frame after a problem is
    // drawn (`focusFirstError`).
    if (turns > 6) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 60));
        });
    }
    for (let i = 0; i < turns; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

const formEl = () => {
    const form = host.querySelector("form");
    if (!form) throw new Error("No form");
    return form;
};

export const text = () => formEl().textContent;
export const stepOnShow = () => formEl().dataset.step;
export const heading = () => {
    const h1 = host.querySelector("h1");
    if (!h1) throw new Error("No heading");
    return h1;
};
export const eyebrow = () => formEl().querySelector("p.label")?.textContent;
export const primary = () => {
    const button = formEl().querySelector<HTMLButtonElement>(
        'button[type="submit"]',
    );
    if (!button) throw new Error("No main button");
    return button;
};
export const address = () =>
    `${window.location.pathname}${window.location.search}`;

export function button(name: string): HTMLElement | undefined {
    return Array.from(formEl().querySelectorAll<HTMLElement>("button, a")).find(
        (b) => b.textContent.trim() === name,
    );
}

export function labelled(label: string): HTMLInputElement {
    const hit = Array.from(host.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === label,
    );
    const id = hit?.getAttribute("for");
    const el = id ? document.getElementById(id) : null;
    if (!el) throw new Error(`No field labelled ${label}`);
    return el as HTMLInputElement;
}

export function radio(name: string): HTMLButtonElement {
    const hit = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    ).find((b) => b.textContent.includes(name));
    if (!hit) throw new Error(`No choice ${name}`);
    return hit;
}

export const group = (labelledBy: string) =>
    Array.from(
        host.querySelectorAll<HTMLButtonElement>(
            `[aria-labelledby="${labelledBy}"] [role="radio"]`,
        ),
    );

export const checked = (labelledBy: string) =>
    group(labelledBy)
        .filter((b) => b.getAttribute("aria-checked") === "true")
        .map((b) => b.textContent);

export function choose(name: string) {
    act(() => radio(name).click());
}

export function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** Press the step's main button: Continue, or the create on the last. */
export async function press() {
    await act(async () => {
        primary().click();
        await Promise.resolve();
    });
    await settle();
}

export async function pressBack() {
    await act(async () => {
        button("Back")?.click();
        await Promise.resolve();
    });
    await settle();
}

/** The browser's own Back or Forward. */
export async function browser(way: "back" | "forward") {
    await act(async () => {
        window.history[way]();
        await new Promise((r) => setTimeout(r, 20));
    });
    await settle();
}

/** From the first step to the name step. */
export async function toName() {
    await press();
}

/** From the first step to the last, named. */
export async function toFirst(name = "Rye & Co. Bakery", label?: string) {
    await toName();
    typeInto(labelled(label ?? nameLabel()), name);
    await press();
}

function nameLabel() {
    return Array.from(host.querySelectorAll("label"))
        .map((l) => l.textContent.trim())
        .includes("What is it called?")
        ? "What is it called?"
        : "Your name or brand";
}

/** The plan beside the form, as a screen reader hears it. */
export const plan = () =>
    Array.from(host.querySelectorAll("aside li")).map((li) => ({
        text: li.lastElementChild?.textContent,
        current: li.getAttribute("aria-current") === "step",
    }));
