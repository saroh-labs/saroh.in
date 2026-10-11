// @vitest-environment jsdom
/**
 * Business › Hours edits the week with the location's own fields (owner,
 * 12 Oct): days picked and hours chosen, nothing typed, and the same week
 * saved to every location.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    OpeningHoursDay,
    StorefrontHours,
} from "@/lib/stores/storefronts";

import { BusinessHoursSheet } from "./business-hours-sheet";

const update = vi.fn();
vi.mock("@/lib/stores/storefront-actions", () => ({
    updateStorefront: (...args: unknown[]) => update(...args) as unknown,
}));
vi.mock("@/lib/organizations/settings-actions", () => ({
    undoStorefrontHours: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
const week = (closed: readonly string[]): OpeningHoursDay[] =>
    DAYS.map((day) => ({
        day,
        open: "09:00",
        close: "18:00",
        closed: closed.includes(day),
    }));
const store = (
    id: string,
    name: string,
    openingHours: OpeningHoursDay[] | null,
): StorefrontHours => ({ id, name, openingHours });

let host: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onSaved.mockReset();
    onClose.mockReset();
    update.mockReset();
    update.mockImplementation(
        (_id: string, body: { openingHours: OpeningHoursDay[] }) =>
            Promise.resolve({
                ok: true,
                data: { openingHours: body.openingHours },
            }),
    );
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function draw(stores: StorefrontHours[], differ = false) {
    act(() => {
        root.render(
            <BusinessHoursSheet
                stores={stores}
                differ={differ}
                open
                returnTo="hours-row"
                onClose={onClose}
                onStores={vi.fn()}
                onSaved={onSaved}
            />,
        );
    });
}
const named = (role: string, name: RegExp) =>
    Array.from(document.querySelectorAll<HTMLElement>(`[role="${role}"]`)).find(
        (el) => name.test(el.getAttribute("aria-label") ?? el.textContent),
    );
const button = (name: RegExp) =>
    Array.from(document.querySelectorAll("button")).find((b) =>
        name.test(b.textContent),
    );
async function press(el: HTMLElement | undefined) {
    if (!el) throw new Error("nothing to press");
    await act(async () => {
        el.click();
        await Promise.resolve();
    });
}
const sent = () =>
    update.mock.calls.map(
        (c) => (c[1] as { openingHours: OpeningHoursDay[] }).openingHours,
    );

describe("Business › Hours sheet", () => {
    it("is the location's own hours fields: days picked, hours chosen, nothing typed", () => {
        draw([store("s1", "Hill Road", null)]);
        expect(named("radio", /^Mon to Sat$/)).toBeDefined();
        expect(document.querySelector('[aria-label="Opens"]')).not.toBeNull();
        expect(document.querySelector('[aria-label="Closes"]')).not.toBeNull();
        // No free-text day fields, and none of their format errors.
        expect(document.querySelector('input[type="text"]')).toBeNull();
        expect(document.body.textContent).not.toMatch(/or Closed/);
    });

    it("saves the same week to every location", async () => {
        draw([store("s1", "Hill Road", null), store("s2", "Online", null)]);
        await press(named("radio", /^Mon to Fri$/));
        await press(button(/^Save/));
        expect(update).toHaveBeenCalledTimes(2);
        const [first, second] = sent();
        expect(first).toEqual(second);
        expect(first.filter((d) => d.closed).map((d) => d.day)).toEqual([
            "SAT",
            "SUN",
        ]);
        expect(onSaved.mock.calls[0]?.[0]).toBe(
            "Hours saved for all 2 locations.",
        );
        expect(onClose).toHaveBeenCalled();
    });

    it("writes nothing when the week is as it was and the locations agree", async () => {
        draw([store("s1", "Hill Road", week(["SUN"]))]);
        await press(button(/^Save/));
        expect(update).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("says whose hours these are when the locations differ, and saving sets them all", async () => {
        draw(
            [
                store("s1", "Hill Road", week(["SUN"])),
                store("s2", "Online", week([])),
            ],
            true,
        );
        expect(document.body.textContent).toMatch(
            /These are Hill Road's, and saving sets them all/,
        );
        await press(button(/^Save/));
        expect(update).toHaveBeenCalledTimes(2);
        expect(sent()[1]?.find((d) => d.day === "SUN")?.closed).toBe(true);
    });
});
