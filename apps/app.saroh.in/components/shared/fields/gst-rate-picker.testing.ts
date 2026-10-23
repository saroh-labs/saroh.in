/**
 * For unit tests of a screen that asks a GST rate (DEC-176): find a
 * `GstRatePicker` by its name, read the rate it shows, and press a rate as
 * a person would, opening Other rate first when the rate is behind it.
 * Test-only; nothing in the app imports it.
 */
import { act } from "react";

const PICKER = '[data-slot="gst-rate-picker"]';

function nameOf(group: Element): string {
    const label = group.getAttribute("aria-label");
    if (label) return label.trim();
    const ids = group.getAttribute("aria-labelledby")?.split(" ") ?? [];
    return ids
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim();
}

/** Every picker in `root`, by the name of its main row. */
export function ratePickers(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(PICKER));
}

/**
 * The picker whose name starts with `name` ("GST rate", "Line 1: GST rate",
 * "GST rate for Hatha"): a label's "(optional)" is ignored.
 */
export function ratePicker(
    name: string,
    root: ParentNode = document,
): HTMLElement {
    const hit = ratePickers(root).find((picker) => {
        const group = picker.querySelector('[role="radiogroup"]');
        return group ? nameOf(group).startsWith(name) : false;
    });
    if (!hit) {
        const names = ratePickers(root).map((p) => {
            const g = p.querySelector('[role="radiogroup"]');
            return g ? nameOf(g) : "?";
        });
        throw new Error(`No GST rate picker "${name}": ${names.join(", ")}`);
    }
    return hit;
}

/** The main row: the radio group that carries the name, error and wiring. */
export function rateGroup(picker: HTMLElement): HTMLElement {
    const group = picker.querySelector<HTMLElement>('[role="radiogroup"]');
    if (!group) throw new Error("A GST rate picker with no rates");
    return group;
}

/** The rate the picker shows chosen ("18", "0.25"), or "" when none is. */
export function rateShown(picker: HTMLElement): string {
    return (
        picker
            .querySelector('[role="radio"][aria-checked="true"]')
            ?.getAttribute("data-rate") ?? ""
    );
}

/** The rates offered, in order, both rows (Other's only when open). */
export function ratesOffered(picker: HTMLElement): string[] {
    return Array.from(picker.querySelectorAll('[role="radio"]')).map(
        (chip) => chip.getAttribute("data-rate") ?? "",
    );
}

/** The Other rate button: a disclosure, `aria-expanded`. */
export function otherRateButton(picker: HTMLElement): HTMLButtonElement {
    const button = picker.querySelector<HTMLButtonElement>(
        '[data-slot="gst-other-rate"]',
    );
    if (!button) throw new Error("A GST rate picker with no Other rate");
    return button;
}

/**
 * Press `rate` ("18", "1.5", or "" for Not set), opening Other rate first
 * when the rate is behind it. Throws when the rate isn't offered.
 */
export function pickRate(picker: HTMLElement, rate: string): void {
    const find = () =>
        picker.querySelector<HTMLButtonElement>(
            `[role="radio"][data-rate="${rate}"]`,
        );
    if (!find()) {
        const other = otherRateButton(picker);
        if (other.getAttribute("aria-expanded") !== "true") {
            act(() => other.click());
        }
    }
    const chip = find();
    if (!chip) {
        throw new Error(
            `No ${rate === "" ? "Not set" : `${rate}%`} in the picker: ${ratesOffered(picker).join(", ")}`,
        );
    }
    act(() => chip.click());
}
