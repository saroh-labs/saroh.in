// @vitest-environment jsdom
/**
 * Every place a module is turned on opens the one "Turn on" sheet
 * (DEC-068) instead of switching it on at once: Settings › Modules (the
 * switch, and "Turn on X and Y"), Home's first run, `/onboarding/modules`
 * (one sheet for every pick) and "Also sell". Turning one off is unchanged.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FirstRunJobs } from "@/components/home/first-run-jobs";
import { AlsoSell } from "@/components/services/also-sell";
import { firstRunJobs } from "@/lib/home/first-run";
import type { ModuleView } from "@/lib/modules/schema";

import { ModuleCatalog } from "../module-catalog";
import { ModuleGoalPicker } from "../module-goal-picker";
import { ModuleList } from "../module-list";

// The sheet itself is `turn-on-sheet.test.tsx`; here, only what opens it.
vi.mock("@/components/modules/turn-on/turn-on-sheet", () => ({
    TurnOnSheet: ({ picked }: { picked: readonly string[] | null }) =>
        picked ? <div data-sheet={picked.join(",")} /> : null,
}));

const setModuleStatusAction = vi.fn();
vi.mock("@/lib/modules/actions", () => ({
    setModuleStatusAction: (...args: unknown[]) =>
        setModuleStatusAction(...args) as unknown,
    readModuleImpactAction: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/",
}));

vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
}));

const NEEDS: Record<string, string[]> = {
    WEBSITE: [],
    CRM: [],
    APPOINTMENTS: ["CRM"],
    COURSES: ["APPOINTMENTS"],
    CLASS_PACKS: ["APPOINTMENTS"],
    COMMERCE: [],
    PAYMENTS: [],
    AUTOMATIONS: ["CRM"],
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

/** jsdom has no layout, so nothing to observe. */
class NoResize {
    observe() {
        // Nothing to measure.
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
    // Radix's checkbox measures itself; jsdom has no ResizeObserver.
    vi.stubGlobal("ResizeObserver", NoResize);
    setModuleStatusAction.mockReset();
    setModuleStatusAction.mockResolvedValue({ ok: true, data: view("X") });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

const opened = () =>
    document.querySelector("[data-sheet]")?.getAttribute("data-sheet") ?? null;

function click(el: Element | null | undefined) {
    if (!el) throw new Error("Nothing to click");
    act(() => (el as HTMLElement).click());
}

function buttonNamed(name: RegExp): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll("button")).find((b) =>
        name.test(`${b.getAttribute("aria-label") ?? ""} ${b.textContent}`),
    );
}

describe("Settings › Modules", () => {
    it("the switch opens the sheet, and nothing is switched on at once", () => {
        act(() => root.render(<ModuleList modules={ALL_OFF} />));
        const sell = Array.from(
            document.querySelectorAll('[role="switch"]'),
        ).find((s) => {
            const [labelId] = (s.getAttribute("aria-labelledby") ?? "").split(
                " ",
            );
            return (
                labelId &&
                document.getElementById(labelId)?.textContent === "Sell"
            );
        });
        click(sell);
        expect(opened()).toBe("COMMERCE");
        expect(setModuleStatusAction).not.toHaveBeenCalled();
    });

    it('"Turn on Contacts and Bookings" opens the sheet for Bookings, which brings Contacts', () => {
        act(() => root.render(<ModuleList modules={ALL_OFF} />));
        click(buttonNamed(/Turn on CRM and APPOINTMENTS|Turn on Contacts and/));
        expect(opened()).toBe("APPOINTMENTS");
        expect(setModuleStatusAction).not.toHaveBeenCalled();
    });

    it("never lists Automations (DEC-068)", () => {
        act(() => root.render(<ModuleCatalog modules={ALL_OFF} />));
        expect(document.body.textContent).toContain("Sell");
        expect(document.body.textContent).not.toContain("AUTOMATIONS");
    });
});

describe("Home's first run", () => {
    it("a card opens the sheet for its module", () => {
        act(() =>
            root.render(
                <FirstRunJobs modules={ALL_OFF} jobs={firstRunJobs(ALL_OFF)} />,
            ),
        );
        click(buttonNamed(/^Take bookings/));
        expect(opened()).toBe("APPOINTMENTS");
        expect(setModuleStatusAction).not.toHaveBeenCalled();
    });
});

describe("/onboarding/modules", () => {
    it("several picks open one sheet for all of them, in the list's order", () => {
        act(() => root.render(<ModuleGoalPicker modules={ALL_OFF} />));
        // Sell is picked to start with; add bookings.
        const bookings = Array.from(
            document.querySelectorAll('[role="checkbox"]'),
        ).find((c) =>
            c.closest("label")?.textContent.includes("Take appointments"),
        );
        click(bookings);
        click(buttonNamed(/Set up my workspace/));
        expect(opened()).toBe("COMMERCE,APPOINTMENTS");
        expect(setModuleStatusAction).not.toHaveBeenCalled();
    });

    it("never offers Automations", () => {
        act(() => root.render(<ModuleGoalPicker modules={ALL_OFF} />));
        expect(document.body.textContent).not.toContain("Automate follow-ups");
    });
});

describe("Also sell", () => {
    it("ticking Class packs opens the sheet; unticking still turns it off at once", async () => {
        const modules = ALL_OFF.map((m) =>
            m.key === "APPOINTMENTS" || m.key === "CRM"
                ? { ...m, lifecycle: "ENABLED" as const }
                : m,
        );
        act(() =>
            root.render(
                <AlsoSell
                    modules={modules}
                    features={[
                        {
                            key: "COURSES",
                            label: "Courses",
                            note: "",
                            on: true,
                        },
                        {
                            key: "CLASS_PACKS",
                            label: "Class packs",
                            note: "",
                            on: false,
                        },
                    ]}
                />,
            ),
        );
        const boxes = document.querySelectorAll('[role="checkbox"]');
        click(boxes[1]);
        expect(opened()).toBe("CLASS_PACKS");
        expect(setModuleStatusAction).not.toHaveBeenCalled();
        await act(async () => {
            (boxes[0] as HTMLElement).click();
            await Promise.resolve();
        });
        expect(setModuleStatusAction).toHaveBeenCalledWith(
            "COURSES",
            "DISABLED",
        );
    });
});
