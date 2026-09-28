// @vitest-environment jsdom
/**
 * The Plan Editor (D7) on the editor shell, with D5's Server Actions
 * answered by the test: a new plan autosaves as a Draft and Publish opens
 * it; a live plan's classes change shows "Changes not live" and Publish
 * changes; a duplicate name stops Publish with the reason; and a business
 * without Appointments has no Classes section.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanEditorRecord } from "@/lib/subscriptions/plan-drafts";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh, replace: vi.fn() }),
    usePathname: () => "/billing/plans/new",
}));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

const actions = vi.hoisted(() => ({
    createPlanDraft: vi.fn(),
    savePlanDraft: vi.fn(),
    publishPlan: vi.fn(),
    discardPlanChanges: vi.fn(),
    deletePlanDraft: vi.fn(),
    loadPlanDraft: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);

import { PlanEditor } from "./plan-editor";

const values = {
    name: "Monthly",
    description: "Gym floor and classes",
    price: "1200.00",
    currency: "INR",
    interval: "MONTH" as const,
    classesPerMonth: 8,
};

function record(over: Partial<PlanEditorRecord> = {}): PlanEditorRecord {
    return {
        id: "plan_1",
        status: "ACTIVE",
        hasPendingChanges: false,
        revision: 4,
        values,
        published: values,
        canDelete: false,
        problems: [],
        pendingChangedAt: null,
        ...over,
    };
}

const figures = {
    subscriberCount: 12,
    monthlyFromMembers: "14400.00",
    currency: "INR",
    byPrice: [
        {
            price: "1200.00",
            currency: "INR",
            interval: "MONTH" as const,
            count: 12,
            current: true,
        },
    ],
};

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
    window.history.replaceState(null, "", "/billing/plans/new");
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

function render(
    initial: PlanEditorRecord | null,
    over: { withClasses?: boolean; takenNames?: string[] } = {},
) {
    act(() => {
        root.render(
            <PlanEditor
                initial={initial}
                figures={initial ? figures : null}
                takenNames={over.takenNames ?? []}
                withClasses={over.withClasses ?? true}
                currency="INR"
                canEdit
            />,
        );
    });
}

function field(label: string): HTMLInputElement {
    const l = Array.from(host.querySelectorAll("label")).find((x) =>
        x.textContent.startsWith(label),
    );
    const el = l && document.getElementById(l.htmlFor);
    if (!(el instanceof HTMLInputElement)) throw new Error(`No field ${label}`);
    return el;
}

function type(input: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
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

const text = () => host.textContent;

describe("the Plan Editor", () => {
    it("a new plan autosaves as a Draft, and Publish opens it", async () => {
        const draft = record({
            status: "DRAFT",
            revision: 1,
            values: { ...values, price: null, description: null },
            published: null,
            canDelete: true,
            problems: [{ field: "price", message: "Set a price" }],
        });
        actions.createPlanDraft.mockResolvedValue({ ok: true, data: draft });
        render(null);
        expect(host.querySelector("h1")?.textContent).toBe("New plan");

        type(field("Name"), "Monthly");
        await wait(800);
        expect(actions.createPlanDraft).toHaveBeenCalledWith({
            name: "Monthly",
            description: null,
            price: null,
            interval: "MONTH",
            classesPerMonth: null,
        });
        expect(text()).toContain("Saved as a draft — nobody can join it yet");
        expect(button("Publish").disabled).toBe(true);
        expect(text()).toContain(
            "1 thing to fix before publishing — add the price.",
        );

        actions.savePlanDraft.mockResolvedValue({
            ok: true,
            data: {
                ...draft,
                revision: 2,
                values: { ...draft.values, price: "1200.00" },
            },
        });
        type(field("Price"), "1200");
        await wait(800);
        expect(actions.savePlanDraft).toHaveBeenCalledWith(
            "plan_1",
            expect.objectContaining({ price: "1200" }),
            1,
        );

        actions.publishPlan.mockResolvedValue({
            ok: true,
            data: record({
                revision: 3,
                values: { ...values, description: null },
            }),
        });
        click(button("Publish"));
        await wait();
        expect(actions.publishPlan).toHaveBeenCalledWith("plan_1", 2);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Monthly is open for sign-ups.",
        );
    });

    it("a live plan's classes from 8 to 12 read as Changes not live, then Publish changes", async () => {
        render(record());
        expect(text()).toContain("Open to new sign-ups · no changes");
        expect(button("Publish changes").disabled).toBe(true);

        actions.savePlanDraft.mockResolvedValue({
            ok: true,
            data: record({
                revision: 5,
                hasPendingChanges: true,
                values: { ...values, classesPerMonth: 12 },
            }),
        });
        click(button("12"));
        await wait(800);
        expect(actions.savePlanDraft).toHaveBeenCalledWith(
            "plan_1",
            expect.objectContaining({ classesPerMonth: 12 }),
            4,
        );
        expect(text()).toContain("Changes not live");
        expect(text()).toContain(
            "When you publish: 8 classes a month → 12 classes a month.",
        );
        expect(text()).toContain(
            "Their classes change from their next renewal.",
        );

        actions.publishPlan.mockResolvedValue({
            ok: true,
            data: record({
                revision: 6,
                values: { ...values, classesPerMonth: 12 },
                published: { ...values, classesPerMonth: 12 },
            }),
        });
        click(button("Publish changes"));
        await wait();
        expect(actions.publishPlan).toHaveBeenCalledWith("plan_1", 5);
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Changes published. The 12 already on it keep what they pay now.",
        );
    });

    it("a duplicate name shows beside the field and stops Publish, with the reason", async () => {
        actions.savePlanDraft.mockResolvedValue({
            ok: true,
            data: record({
                revision: 5,
                hasPendingChanges: true,
                values: { ...values, name: "Drop-in" },
            }),
        });
        render(record(), { takenNames: ["Drop-in"] });
        type(field("Name"), "Drop-in");
        await wait(800);
        const alert = host.querySelector("[role=alert]");
        expect(alert?.textContent).toBe(
            "There's already a plan called Drop-in",
        );
        expect(field("Name").getAttribute("aria-invalid")).toBe("true");
        expect(button("Publish changes").disabled).toBe(true);
        expect(text()).toContain(
            "1 thing to fix before publishing — there's already a plan called Drop-in.",
        );
    });

    it("a business without Appointments sees no Classes section", () => {
        render(record(), { withClasses: false });
        expect(text()).not.toContain("Classes included");
        expect(text()).toContain("Price and billing");
    });

    it("keeps week and quarter under More, and opens it for a weekly plan", () => {
        render(record());
        expect(() => button("Every week")).toThrow();
        click(button("More…"));
        expect(button("Every quarter")).toBeTruthy();

        act(() => root.unmount());
        root = createRoot(host);
        render(record({ values: { ...values, interval: "WEEK" } }));
        expect(button("Every week").getAttribute("aria-checked")).toBe("true");
    });

    it("Discard changes asks first, then drops the pending set", async () => {
        const pending = record({
            revision: 7,
            hasPendingChanges: true,
            values: { ...values, price: "1500.00" },
        });
        render(pending);
        expect(text()).toContain(
            "When you publish: price ₹1,200 → ₹1,500 for new sign-ups.",
        );
        click(button("Discard changes"));
        actions.discardPlanChanges.mockResolvedValue({
            ok: true,
            data: record({ revision: 8 }),
        });
        const dialog = document.querySelector("[role=alertdialog]");
        const confirm = Array.from(
            dialog?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent.trim() === "Discard changes");
        if (!confirm) throw new Error("No confirm");
        click(confirm);
        await wait();
        expect(actions.discardPlanChanges).toHaveBeenCalledWith("plan_1", 7);
        expect(field("Price").value).toBe("1200");
    });

    it("says how it's paid without promising autopay", () => {
        render(record());
        expect(text()).toContain("Invoiced each month with a pay link.");
        expect(text()).not.toMatch(/autopay/i);
    });
});
