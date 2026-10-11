// @vitest-environment jsdom
/**
 * The one setup checklist (UX audit, 10 Oct): its count, the order of its
 * rows, one button a row, what it says and draws when the last step is
 * done, the fold on the next visit, and Hide for now with Undo.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChecklistRow } from "@/lib/setup-checklist";
import { FOLD_KEY } from "@/lib/setup-checklist";

import { FACT_DOT } from "@/lib/format/join";
import { SetupChecklist } from "./setup-checklist";

const showUndo = vi.fn<(message: string, undo: () => unknown) => void>();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (message: string, undo: () => unknown) => showUndo(message, undo),
}));

let root: Root;
let host: HTMLDivElement;

const ROWS: ChecklistRow[] = [
    {
        key: "address",
        label: "Add your registered address",
        why: "It's printed on every invoice you send.",
        done: false,
        action: {
            label: "Add address",
            href: "/settings/organization?edit=address",
        },
    },
    { key: "site", label: "Publish your site", done: true, note: "live" },
    {
        key: "tax",
        label: "Add your GSTIN",
        done: false,
        broken: true,
        action: { label: "Add GSTIN", onPress: vi.fn() },
    },
    { key: "catalogue", label: "Add a product", done: true },
];

const allDone = ROWS.map((r) => ({ ...r, done: true }));

type Props = Partial<Parameters<typeof SetupChecklist>[0]>;

function draw(props: Props = {}) {
    act(() =>
        root.render(
            <SetupChecklist
                name="test"
                title="Finish setup"
                doneTitle="You're ready to take money."
                rows={ROWS}
                {...props}
            />,
        ),
    );
}

function remount(props: Props = {}) {
    act(() => root.unmount());
    root = createRoot(host);
    draw(props);
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    window.localStorage.clear();
    showUndo.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const card = () => host.querySelector<HTMLElement>("[data-setup-checklist]");
const state = () => card()?.dataset.state;
const text = () => host.textContent;
const stored = () =>
    JSON.parse(window.localStorage.getItem(FOLD_KEY) ?? "{}") as Record<
        string,
        unknown
    >;

describe("while steps are left", () => {
    it("has a title, the count in one wording, and a bar that says the same", () => {
        draw();
        expect(state()).toBe("open");
        expect(host.querySelector("h2")?.textContent).toBe("Finish setup");
        expect(text()).toContain("2 of 4 done");
        const bar = host.querySelector('[role="progressbar"]');
        expect(bar?.getAttribute("aria-valuenow")).toBe("2");
        expect(bar?.getAttribute("aria-valuemax")).toBe("4");
        expect(bar?.getAttribute("aria-label")).toBe("2 of 4 done");
        // The card is named by its heading.
        const section = host.querySelector("section");
        expect(
            document.getElementById(
                section?.getAttribute("aria-labelledby") ?? "",
            )?.textContent,
        ).toBe("Finish setup");
    });

    it("lists done steps first, ticked, then what is left", () => {
        draw();
        const rows = Array.from(host.querySelectorAll("li[data-step]"));
        expect(rows.map((r) => r.getAttribute("data-step"))).toEqual([
            "site",
            "catalogue",
            "address",
            "tax",
        ]);
        expect(rows.map((r) => r.hasAttribute("data-done"))).toEqual([
            true,
            true,
            false,
            false,
        ]);
        // Said in words, not by the tick alone.
        // The note's dot is held to the words either side of it, so a
        // row that wraps never starts or ends a line with the dot.
        expect(rows[0]?.textContent).toBe(
            `Done: Publish your site${FACT_DOT}live`,
        );
        expect(rows[2]?.textContent).toContain(
            "To do: Add your registered address",
        );
        expect(rows[3]?.textContent).toContain("Needs fixing: Add your GSTIN");
        // Nothing is struck through.
        expect(host.innerHTML).not.toContain("line-through");
    });

    it("gives each step left ONE button, and a done step none", () => {
        draw();
        const controls = (key: string) =>
            host.querySelectorAll(
                `li[data-step="${key}"] a, li[data-step="${key}"] button`,
            );
        expect(controls("address")).toHaveLength(1);
        expect(controls("tax")).toHaveLength(1);
        expect(controls("site")).toHaveLength(0);
        expect(controls("catalogue")).toHaveLength(0);
    });

    it("opens a step by its link, or in place by a press", () => {
        draw();
        const link = host.querySelector<HTMLAnchorElement>(
            'li[data-step="address"] a',
        );
        expect(link?.getAttribute("href")).toBe(
            "/settings/organization?edit=address",
        );
        // Named for what it does, described by the step it is for.
        expect(link?.textContent).toBe("Add address");
        expect(
            document.getElementById(
                link?.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("To do: Add your registered address");
        const press = host.querySelector<HTMLButtonElement>(
            'li[data-step="tax"] button',
        );
        act(() => press?.click());
        expect(ROWS[2]?.action?.onPress).toHaveBeenCalledTimes(1);
    });

    it("says why a step matters, and what it is all for", () => {
        draw({ lead: "What is left before you take money." });
        expect(text()).toContain("It's printed on every invoice you send.");
        expect(text()).toContain("What is left before you take money.");
    });

    it("draws nothing for a checklist with no steps", () => {
        draw({ rows: [] });
        expect(host.innerHTML).toBe("");
    });

    it("draws what is listed beside the steps, never counted", () => {
        draw({ children: <p data-aside>Take payment online</p> });
        expect(host.querySelector("[data-aside]")).not.toBeNull();
        expect(text()).toContain("2 of 4 done");
    });
});

describe("finishing", () => {
    it("the last tick fills the bar and the heading says the true thing", () => {
        draw({ foldKey: "k" });
        draw({ foldKey: "k", rows: allDone });
        expect(state()).toBe("finished");
        expect(host.querySelector("h2")?.textContent).toBe(
            "You're ready to take money.",
        );
        expect(text()).toContain("4 of 4 done");
        const bar = host.querySelector('[role="progressbar"]');
        expect(bar?.getAttribute("aria-valuenow")).toBe("4");
        // Every row is there, ticked: nothing vanished in this render.
        expect(host.querySelectorAll("li[data-done]")).toHaveLength(4);
        expect(host.querySelectorAll("li[data-step] a")).toHaveLength(0);
        // Announced without moving the keyboard.
        expect(host.querySelector("h2")?.getAttribute("aria-live")).toBe(
            "polite",
        );
    });

    it("stays the whole card for the rest of that visit", () => {
        draw({ foldKey: "k" });
        draw({ foldKey: "k", rows: allDone });
        draw({ foldKey: "k", rows: allDone });
        expect(state()).toBe("finished");
    });

    it("folds to one quiet line on the next visit", () => {
        draw({ foldKey: "k" });
        draw({ foldKey: "k", rows: allDone });
        remount({ foldKey: "k", rows: allDone });
        expect(state()).toBe("folded");
        expect(card()?.tagName).toBe("P");
        expect(card()?.textContent).toBe("You're ready to take money.");
        expect(host.querySelector('[role="progressbar"]')).toBeNull();
        expect(host.querySelectorAll("li")).toHaveLength(0);
    });

    it("shows the card to a visit that finds it done elsewhere", () => {
        // Seen with steps left, then the last step is done on another page.
        draw({ foldKey: "k" });
        expect(stored()).toEqual({ k: "open" });
        remount({ foldKey: "k", rows: allDone });
        expect(state()).toBe("finished");
        remount({ foldKey: "k", rows: allDone });
        expect(state()).toBe("folded");
    });

    it("keeps the line for good where it belongs", () => {
        draw({ foldKey: "k" });
        remount({ foldKey: "k", rows: allDone });
        remount({ foldKey: "k", rows: allDone });
        remount({ foldKey: "k", rows: allDone });
        remount({ foldKey: "k", rows: allDone });
        expect(state()).toBe("folded");
    });

    it("lets the line go after one visit on Home", () => {
        draw({ foldKey: "k", fold: "once" });
        remount({ foldKey: "k", fold: "once", rows: allDone });
        expect(state()).toBe("finished");
        remount({ foldKey: "k", fold: "once", rows: allDone });
        expect(state()).toBe("folded");
        remount({ foldKey: "k", fold: "once", rows: allDone });
        expect(card()).toBeNull();
    });

    it("announces nothing to a browser that never saw steps left", () => {
        remount({ foldKey: "old", rows: allDone });
        expect(state()).toBe("folded");
        remount({ foldKey: "old-home", fold: "once", rows: allDone });
        expect(card()).toBeNull();
    });

    it("is seen again when a step comes undone and is finished again", () => {
        draw({ foldKey: "k" });
        remount({ foldKey: "k", rows: allDone });
        remount({ foldKey: "k", rows: allDone });
        expect(state()).toBe("folded");
        // A provider stops working: a step is left again.
        remount({ foldKey: "k" });
        expect(state()).toBe("open");
        remount({ foldKey: "k", rows: allDone });
        expect(state()).toBe("finished");
    });

    it("with nothing to remember it by, folds unless it finished on this visit", () => {
        draw({ rows: allDone });
        expect(state()).toBe("folded");
        remount();
        draw({ rows: allDone });
        expect(state()).toBe("finished");
    });

    it("keeps a done step's link on the quiet line", () => {
        draw({
            rows: allDone,
            note: "Sells in person only",
            doneView: { label: "Your online shop", href: "https://rye.test" },
        });
        const link = host.querySelector<HTMLAnchorElement>("p a");
        expect(link?.getAttribute("href")).toBe("https://rye.test");
        expect(link?.getAttribute("target")).toBe("_blank");
        expect(link?.textContent).toContain("(opens in a new tab)");
        expect(text()).toContain("Sells in person only");
    });

    it("keeps what is listed beside the steps when the card folds or goes", () => {
        remount({
            rows: allDone,
            children: <p data-aside>Make it yours</p>,
        });
        expect(state()).toBe("folded");
        expect(host.querySelector("[data-aside]")).not.toBeNull();
        remount({
            rows: allDone,
            fold: "once",
            foldKey: "gone",
            children: <p data-aside>Make it yours</p>,
        });
        expect(card()).toBeNull();
        expect(host.querySelector("[data-aside]")).not.toBeNull();
    });
});

describe("Hide for now", () => {
    function hide(hidden: boolean) {
        return {
            hidden,
            onHide: vi.fn(),
            onShow: vi.fn(),
            said: "Setup hidden. Show it again from the bottom of Home.",
        };
    }
    const button = (name: string) =>
        Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === name,
        );

    it("is offered only where the screen keeps it", () => {
        draw();
        expect(button("Hide for now")).toBeUndefined();
        draw({ hide: hide(false) });
        expect(button("Hide for now")).toBeDefined();
    });

    it("hides, and says where to find it again with Undo", () => {
        const h = hide(false);
        draw({ hide: h });
        act(() => button("Hide for now")?.click());
        expect(h.onHide).toHaveBeenCalledTimes(1);
        expect(showUndo).toHaveBeenCalledTimes(1);
        const call = showUndo.mock.calls.at(0);
        const message = call?.[0];
        expect(message).toBe(
            "Setup hidden. Show it again from the bottom of Home.",
        );
        // Undo shows it again.
        call?.[1]();
        expect(h.onShow).toHaveBeenCalledTimes(1);
    });

    it("hidden, it is one link that shows it again, with the count", () => {
        const h = hide(true);
        draw({ hide: h });
        expect(state()).toBe("hidden");
        expect(host.querySelector('[role="progressbar"]')).toBeNull();
        const show = button("Show setup (2 of 4 done)");
        expect(show).toBeDefined();
        act(() => show?.click());
        expect(h.onShow).toHaveBeenCalledTimes(1);
    });

    it("a finished checklist has nothing to hide", () => {
        draw({ hide: hide(false) });
        draw({ hide: hide(false), rows: allDone });
        expect(button("Hide for now")).toBeUndefined();
    });
});
