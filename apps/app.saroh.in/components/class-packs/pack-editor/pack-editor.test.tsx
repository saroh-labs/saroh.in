// @vitest-environment jsdom
/**
 * The Pack Editor (E18) on the editor shell, with its Server Actions
 * answered by the test: a new pack saved as a draft and published, a sold
 * pack's kind locked with the reason, validity under 7 days marked with
 * Publish off, and E13's kind refusal at Publish shown in words beside the
 * choice — never as a code.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PackEditorRecord } from "@/lib/class-packs/pack-drafts";
import type {
    PackServiceOption,
    PackValues,
} from "@/lib/class-packs/pack-editor";
import { newPackValues } from "@/lib/class-packs/pack-editor";
import type { EditorResult } from "@/lib/editor-shell/types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh, replace: vi.fn() }),
    usePathname: () => "/class-packs/new",
}));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

type Answer = Promise<EditorResult<PackEditorRecord>>;
const actions = vi.hoisted(() => ({
    createPackDraft: vi.fn<(v: Partial<PackValues>) => Answer>(),
    savePackDraft:
        vi.fn<(id: string, v: Partial<PackValues>, r: number) => Answer>(),
    publishPack: vi.fn<(id: string, r: number) => Answer>(),
    discardPackChanges: vi.fn<(id: string, r: number) => Answer>(),
    deletePackDraft:
        vi.fn<(id: string, r: number) => Promise<EditorResult<null>>>(),
    loadPackDraft: vi.fn<(id: string) => Answer>(),
}));
vi.mock("@/lib/class-packs/draft-actions", () => actions);

import { PackEditor } from "@/components/class-packs/pack-editor/pack-editor";

const SERVICES: PackServiceOption[] = [
    {
        id: "hatha",
        name: "Hatha",
        capacity: 12,
        priceCents: 50_000,
        currency: "INR",
        active: true,
    },
    {
        id: "pt",
        name: "Personal training",
        capacity: 1,
        priceCents: 150_000,
        currency: "INR",
        active: true,
    },
];

const TEN: PackValues = {
    name: "Ten classes",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500",
    currency: "INR",
    serviceIds: ["hatha"],
    kind: "CLASSES",
    firstPackOnly: false,
};

function rec(over: Partial<PackEditorRecord> = {}): PackEditorRecord {
    return {
        id: "pk-1",
        status: "DRAFT",
        hasPendingChanges: false,
        revision: 1,
        values: TEN,
        published: null,
        canDelete: true,
        problems: [],
        pendingChangedAt: null,
        ...over,
    };
}

const LIVE = rec({
    status: "ACTIVE",
    revision: 4,
    published: TEN,
    canDelete: false,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    vi.useFakeTimers();
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of Object.values(actions)) fn.mockReset();
    push.mockReset();
    refresh.mockReset();
    toast.showSuccess.mockReset();
    toast.showError.mockReset();
    window.history.replaceState(null, "", "/class-packs/new");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

function render(
    initial: PackEditorRecord | null,
    sold: number | null = 0,
    empty: PackValues = newPackValues("CLASSES", SERVICES, "INR"),
) {
    act(() => {
        root.render(
            <PackEditor
                initial={initial}
                emptyValues={initial?.values ?? empty}
                services={SERVICES}
                sold={sold}
                canEdit
            />,
        );
    });
}

const text = () => host.textContent;

function input(label: string): HTMLInputElement {
    const el = Array.from(host.querySelectorAll("label")).find((l) =>
        l.textContent.trim().startsWith(label),
    );
    const id = el?.getAttribute("for");
    const hit = id ? document.getElementById(id) : null;
    if (!(hit instanceof HTMLInputElement)) {
        throw new Error(`No field ${label}`);
    }
    return hit;
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

function button(name: string): HTMLButtonElement {
    const hit = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent.trim() === name);
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

function click(el: HTMLElement) {
    act(() => {
        el.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true }),
        );
    });
}

async function wait(ms = 0) {
    await act(async () => {
        vi.advanceTimersByTime(ms);
        for (let i = 0; i < 8; i++) await Promise.resolve();
    });
}

const ok = <T,>(data: T): EditorResult<T> => ({ ok: true, data });

describe("the Pack Editor", () => {
    it("a new pack autosaves as a draft, then Publish puts it on sale", async () => {
        render(null);
        expect(text()).toContain("Not saved yet — start with a name");
        expect(host.querySelector("h1")?.textContent).toBe("New pack");

        type(input("Name"), "Ten classes");
        actions.createPackDraft.mockResolvedValue(
            ok(rec({ values: { ...TEN, price: null, validityDays: 90 } })),
        );
        await wait(900);
        // The design's defaults went with the name: classes, 10, 90 days,
        // good for every class on offer — and no price yet.
        expect(actions.createPackDraft).toHaveBeenCalledWith({
            name: "Ten classes",
            description: null,
            credits: 10,
            validityDays: 90,
            price: null,
            currency: "INR",
            serviceIds: ["hatha"],
            kind: "CLASSES",
            firstPackOnly: false,
        });
        expect(window.location.pathname).toBe("/class-packs/pk-1/edit");
        expect(text()).toContain("Saved as a draft — not on sale");
        expect(button("Publish").disabled).toBe(true);
        expect(text()).toContain(
            "1 thing to fix before publishing — add the price.",
        );
        // A draft isn't on sale, so there is no pack page to view.
        expect(text()).not.toContain("View pack");

        actions.savePackDraft.mockResolvedValue(
            ok(rec({ revision: 2, values: { ...TEN, validityDays: 90 } })),
        );
        type(input("Price"), "4500");
        await wait(900);
        expect(actions.savePackDraft).toHaveBeenLastCalledWith(
            "pk-1",
            expect.objectContaining({ price: "4500" }),
            1,
        );
        expect(button("Publish").disabled).toBe(false);

        actions.publishPack.mockResolvedValue(
            ok(rec({ status: "ACTIVE", revision: 3, published: TEN })),
        );
        click(button("Publish"));
        await wait();
        expect(actions.publishPack).toHaveBeenCalledWith("pk-1", 2);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Ten classes is published — you can sell it now.",
        );
        expect(text()).toContain("On sale");
    });

    it("a sold pack's kind is locked, and says why", () => {
        render(LIVE, 3);
        const other = button("One-to-one sessions");
        expect(other.disabled).toBe(true);
        expect(button("Classes").getAttribute("aria-checked")).toBe("true");
        expect(text()).toContain(
            "Locked — 3 already sold. Class and one-to-one credits never mix.",
        );
        // Live and clean: nothing to publish, and it says so.
        expect(button("Publish changes").disabled).toBe(true);
        expect(text()).toContain("On sale · no changes");
    });

    it("an unsold pack's kind switches, swapping what it is good for", async () => {
        render(rec());
        click(button("One-to-one sessions"));
        expect(button("One-to-one sessions").getAttribute("aria-checked")).toBe(
            "true",
        );
        actions.savePackDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        await wait(900);
        expect(actions.savePackDraft).toHaveBeenCalledWith(
            "pk-1",
            expect.objectContaining({
                kind: "ONE_TO_ONE",
                serviceIds: ["pt"],
            }),
            1,
        );
    });

    it("validity under 7 days is an inline error, Publish is off, and the rest still saves", async () => {
        render(rec());
        click(button("Other…"));
        type(input("Number of days"), "5");
        expect(text()).toContain("Give at least 7 days to use it");
        expect(input("Number of days").getAttribute("aria-invalid")).toBe(
            "true",
        );
        expect(button("Publish").disabled).toBe(true);

        actions.savePackDraft.mockResolvedValue(ok(rec({ revision: 2 })));
        type(input("Name"), "Intro pack");
        await wait(900);
        const sent = actions.savePackDraft.mock.calls.at(-1)?.[1];
        expect(sent).toMatchObject({ name: "Intro pack" });
        expect(sent).not.toHaveProperty("validityDays");
    });

    it("E13's refusal at Publish shows beside the kind, in words", async () => {
        const changed = rec({
            status: "ACTIVE",
            hasPendingChanges: true,
            revision: 4,
            values: { ...TEN, kind: "ONE_TO_ONE", serviceIds: ["pt"] },
            published: TEN,
        });
        // The count said none; the server knows better at Publish.
        render(changed, 0);
        actions.publishPack.mockResolvedValue({
            ok: false,
            error: "This pack has been sold, so it stays the kind it was sold as.",
            field: "kind",
        });
        click(button("Publish changes"));
        await wait();
        expect(toast.showError).toHaveBeenCalledWith(
            "This pack has been sold, so it stays the kind it was sold as.",
        );
        const group = host.querySelector('[role="radiogroup"]');
        const described = (group?.getAttribute("aria-describedby") ?? "")
            .split(" ")
            .map((id) => document.getElementById(id)?.textContent)
            .join(" ");
        expect(described).toContain("it stays the kind it was sold as");
        expect(text()).not.toMatch(/CONFLICT|409/);
    });

    it("says what publishing a live pack's changes will do", () => {
        render(
            rec({
                status: "ACTIVE",
                hasPendingChanges: true,
                revision: 4,
                values: { ...TEN, price: "5200", credits: 12 },
                published: TEN,
            }),
            3,
        );
        expect(text()).toContain(
            "When you publish: Price ₹4,500 → ₹5,200 · 10 → 12 classes. The 3 already sold keep their classes, price and dates.",
        );
        expect(text()).toContain("Changes not live");
        expect(button("Discard changes")).toBeTruthy();
    });
});
