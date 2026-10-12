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

// The product's select opens a portal jsdom can't press: a native select
// stands in, with the same options, placeholder and wiring.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        id,
        value,
        onValueChange,
        options,
        placeholder,
        disabled,
        ...aria
    }: {
        id?: string;
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        placeholder?: string;
        disabled?: boolean;
        "aria-invalid"?: boolean;
        "aria-describedby"?: string;
    }) => (
        <select
            id={id}
            aria-invalid={aria["aria-invalid"]}
            aria-describedby={aria["aria-describedby"]}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

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
    gstRate: null,
    sacCode: null,
    gstPriceMode: null,
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
    gst?: { asked: boolean; priceMode: "INCLUDED" | "ADDED" | null },
) {
    act(() => {
        root.render(
            <PackEditor
                initial={initial}
                emptyValues={initial?.values ?? empty}
                services={SERVICES}
                sold={sold}
                gst={gst}
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

/** A select by its label, as the GST fields draw them. */
function select(label: string): HTMLSelectElement {
    const l = Array.from(host.querySelectorAll("label")).find((x) =>
        x.textContent.trim().startsWith(label),
    );
    const el = l && document.getElementById(l.htmlFor);
    if (!(el instanceof HTMLSelectElement)) {
        throw new Error(`No select ${label}`);
    }
    return el;
}

function pick(box: HTMLSelectElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, value);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
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
        expect(text()).toContain("Not saved yet. Start with a name");
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
            // Nothing is asked of a business that isn't registered: its
            // GST goes as it stands, not set.
            gstRate: null,
            sacCode: null,
            gstPriceMode: null,
        });
        expect(window.location.pathname).toBe("/class-packs/pk-1/edit");
        expect(text()).toContain("Saved as a draft. Not on sale");
        expect(button("Publish").disabled).toBe(true);
        expect(text()).toContain(
            "1 thing to fix before publishing: add the price.",
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
            "Ten classes is published. You can sell it now.",
        );
        expect(text()).toContain("On sale");
        // Live now, it has a page of its own (E16).
        const view = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent.trim() === "View pack",
        );
        expect(view?.getAttribute("href")).toBe("/class-packs/pk-1");
    });

    it("a sold pack's kind is locked, and says why", () => {
        render(LIVE, 3);
        const other = button("One-to-one sessions");
        expect(other.disabled).toBe(true);
        expect(button("Classes").getAttribute("aria-checked")).toBe("true");
        expect(text()).toContain(
            "Locked. 3 already sold. Class and one-to-one credits never mix.",
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

describe("a pack's GST (12 Oct 2026)", () => {
    const ASKED = { asked: true, priceMode: "ADDED" as const };

    it("shows a business that isn't registered none of it, and never holds it up", () => {
        render(LIVE);
        expect(text()).not.toContain("GST");
        expect(text()).not.toContain("SAC code");
        expect(text()).not.toContain("to fix before publishing");
    });

    it("asks a registered business for the rate with the price, with the quiet select and the SAC code", () => {
        render(LIVE, 0, undefined, ASKED);
        expect(select("GST rate").value).toBe("");
        expect(select("GST rate").options[0].textContent).toBe("Choose a rate");
        expect(
            Array.from(select("GST on this price").options).map(
                (o) => o.textContent,
            ),
        ).toEqual([
            "Same as the business (GST is added)",
            "Includes GST",
            "GST is added",
        ]);
        expect(text()).toContain("SAC code (optional)");
        expect(text()).toContain(
            "Only if this one is priced differently from the rest.",
        );
    });

    it("says what the rate does to the price, by the business's way", () => {
        render(
            rec({
                status: "ACTIVE",
                revision: 4,
                canDelete: false,
                values: { ...TEN, gstRate: "18" },
                published: { ...TEN, gstRate: "18" },
            }),
            0,
            undefined,
            ASKED,
        );
        expect(text()).toContain("The rate added on top of the price.");
    });

    it("stops Publish for a priced pack with no rate, beside the field, until one is chosen", async () => {
        render(LIVE, 0, undefined, ASKED);
        expect(select("GST rate").getAttribute("aria-invalid")).toBe("true");
        expect(button("Publish changes").disabled).toBe(true);
        expect(text()).toContain(
            "1 thing to fix before publishing: choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        );
        expect(text()).not.toContain("nil-rated..");

        actions.savePackDraft.mockResolvedValue(
            ok(
                rec({
                    status: "ACTIVE",
                    revision: 5,
                    hasPendingChanges: true,
                    published: TEN,
                    canDelete: false,
                    values: { ...TEN, gstRate: "18" },
                }),
            ),
        );
        pick(select("GST rate"), "18");
        await wait(900);
        expect(actions.savePackDraft).toHaveBeenCalledWith(
            "pk-1",
            expect.objectContaining({
                gstRate: "18",
                sacCode: null,
                gstPriceMode: null,
            }),
            4,
        );
        expect(select("GST rate").getAttribute("aria-invalid")).not.toBe(
            "true",
        );
        expect(button("Publish changes").disabled).toBe(false);
        expect(text()).toContain("GST rate not set → 18%");
    });

    it("autosaves exempt, the way and the SAC code as the API takes them", async () => {
        render(LIVE, 0, undefined, ASKED);
        actions.savePackDraft.mockResolvedValue(
            ok(
                rec({
                    status: "ACTIVE",
                    revision: 5,
                    hasPendingChanges: true,
                    published: TEN,
                    canDelete: false,
                    values: {
                        ...TEN,
                        gstRate: "0",
                        sacCode: "999723",
                        gstPriceMode: "INCLUDED",
                    },
                }),
            ),
        );
        pick(select("GST rate"), "0");
        pick(select("GST on this price"), "INCLUDED");
        type(input("SAC code"), "9997 23");
        await wait(900);
        expect(actions.savePackDraft).toHaveBeenLastCalledWith(
            "pk-1",
            expect.objectContaining({
                gstRate: "0",
                sacCode: "999723",
                gstPriceMode: "INCLUDED",
            }),
            4,
        );
        expect(text()).not.toContain("Choose a GST rate");
    });

    it("reads a saved pack's rate back into the box", () => {
        render(
            rec({
                status: "ACTIVE",
                revision: 4,
                canDelete: false,
                values: { ...TEN, gstRate: "18", gstPriceMode: "INCLUDED" },
                published: { ...TEN, gstRate: "18", gstPriceMode: "INCLUDED" },
            }),
            0,
            undefined,
            ASKED,
        );
        expect(select("GST rate").value).toBe("18");
        expect(select("GST on this price").value).toBe("INCLUDED");
        expect(text()).toContain(
            "The rate the price includes. It isn't added on top.",
        );
    });
});
