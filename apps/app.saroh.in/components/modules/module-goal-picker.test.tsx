// @vitest-environment jsdom
/**
 * `/onboarding/modules` follows what is being set up (DEC-070, K3): a
 * business has Sell suggested and pre-selected, as before; "Just me" has
 * nothing pre-selected; a site for someone's work has the website. The
 * words for its people are the kind's, and every goal stays on offer.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModuleView } from "@/lib/modules/schema";

import { ModuleGoalPicker } from "./module-goal-picker";

vi.mock("@/components/modules/turn-on/turn-on-sheet", () => ({
    TurnOnSheet: ({ picked }: { picked: readonly string[] | null }) =>
        picked ? <div data-sheet={picked.join(",")} /> : null,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/onboarding/modules",
}));

const NEEDS: Record<string, string[]> = {
    WEBSITE: [],
    CRM: [],
    APPOINTMENTS: ["CRM"],
    COURSES: ["APPOINTMENTS"],
    COMMERCE: [],
    PAYMENTS: [],
    COMMUNICATIONS: ["CRM"],
    INSIGHTS: [],
};

function view(key: string, over: Partial<ModuleView> = {}): ModuleView {
    return {
        key,
        label: key,
        lifecycle: "DISABLED",
        readiness: "DISABLED",
        selectedForProject: false,
        canManage: true,
        dependencies: NEEDS[key] ?? [],
        blockers: [],
        ...over,
    };
}
const ALL_OFF = Object.keys(NEEDS).map((k) => view(k));

class NoResize {
    observe() {
        // jsdom has no layout.
    }
    unobserve() {
        // As above.
    }
    disconnect() {
        // As above.
    }
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", NoResize);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

let renders = 0;
/** A fresh picker each time: its picks start from what it was given. */
function render(kind?: string, modules: ModuleView[] = ALL_OFF) {
    renders += 1;
    act(() =>
        root.render(
            <ModuleGoalPicker key={renders} modules={modules} kind={kind} />,
        ),
    );
}

/** Each goal's title, in the order drawn. */
function titles(): string[] {
    return Array.from(document.querySelectorAll('[id$="-label"]')).map(
        (el) => el.textContent,
    );
}

/** The goals ticked, by title. */
function ticked(): string[] {
    return Array.from(
        document.querySelectorAll('[role="checkbox"][aria-checked="true"]'),
    ).map(
        (box) =>
            document.getElementById(box.getAttribute("aria-labelledby") ?? "")
                ?.textContent ?? "",
    );
}

/** The goals that wear "Suggested", by title. */
function suggested(): string[] {
    return Array.from(document.querySelectorAll("label"))
        .filter((l) => l.textContent.includes("Suggested"))
        .map((l) => l.querySelector('[id$="-label"]')?.textContent ?? "");
}

describe("ModuleGoalPicker by kind (DEC-070)", () => {
    it("a business: Sell leads, suggested and ticked (today's behaviour)", () => {
        render("BUSINESS");
        expect(titles()[0]).toBe("Sell products");
        expect(ticked()).toEqual(["Sell products"]);
        expect(suggested()).toEqual(["Sell products"]);
        expect(document.body.textContent).toContain("Manage customers & leads");
    });

    it("no kind (an older API) is a business", () => {
        render(undefined);
        expect(ticked()).toEqual(["Sell products"]);
    });

    it("just me: nothing ticked, nothing suggested, and clients", () => {
        render("SOLO");
        expect(ticked()).toEqual([]);
        expect(suggested()).toEqual([]);
        expect(titles()).toContain("Sell products");
        expect(titles()).toContain("Manage clients & leads");
        expect(titles()).toContain("Message clients");
        expect(document.body.textContent).toContain(
            "let clients book time with you",
        );
        expect(document.body.textContent).toContain(
            "Nothing selected — you can add capabilities later.",
        );
    });

    it("a site for my work: the website leads, suggested and ticked", () => {
        render("WORK");
        expect(titles()[0]).toBe("Show up online");
        expect(ticked()).toEqual(["Show up online"]);
        expect(suggested()).toEqual(["Show up online"]);
        expect(titles()).toContain("Manage readers & leads");
        // Sell is still on offer, just not first.
        expect(titles()).toContain("Sell products");
    });

    it("never ticks a suggestion that is already on, dark, or not theirs to turn on", () => {
        render(
            "WORK",
            ALL_OFF.map((m) =>
                m.key === "WEBSITE" ? { ...m, lifecycle: "ENABLED" } : m,
            ),
        );
        expect(ticked()).toEqual([]);

        render(
            "WORK",
            ALL_OFF.map((m) =>
                m.key === "WEBSITE"
                    ? { ...m, blockers: [{ code: "ROLLOUT_DISABLED" }] }
                    : m,
            ),
        );
        expect(titles()).not.toContain("Show up online");
        expect(ticked()).toEqual([]);

        render(
            "BUSINESS",
            ALL_OFF.map((m) =>
                m.key === "COMMERCE" ? { ...m, canManage: false } : m,
            ),
        );
        expect(ticked()).toEqual([]);
    });

    it("confirming opens the sheet for the picks in the order drawn", () => {
        render("WORK");
        const bookings = Array.from(
            document.querySelectorAll('[role="checkbox"]'),
        ).find((c) =>
            c.closest("label")?.textContent.includes("Take bookings"),
        );
        act(() => (bookings as HTMLElement).click());
        const go = Array.from(document.querySelectorAll("button")).find((b) =>
            b.textContent.includes("Set up my workspace"),
        );
        act(() => go?.click());
        expect(
            document.querySelector("[data-sheet]")?.getAttribute("data-sheet"),
        ).toBe("WEBSITE,APPOINTMENTS");
    });
});
