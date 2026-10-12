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

import { PlanEditor } from "./plan-editor";

const values = {
    name: "Monthly",
    description: "Gym floor and classes",
    price: "1200.00",
    currency: "INR",
    interval: "MONTH" as const,
    classesPerMonth: 8,
    gstRate: null,
    sacCode: null,
    gstPriceMode: null,
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
    over: {
        withClasses?: boolean;
        takenNames?: string[];
        autopayOffered?: boolean;
        gst?: { asked: boolean; priceMode: "INCLUDED" | "ADDED" | null };
    } = {},
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
                autopayOffered={over.autopayOffered}
                gst={over.gst}
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
            // Nothing is asked of a business that isn't registered: its
            // GST goes as it stands, not set.
            gstRate: null,
            sacCode: null,
            gstPriceMode: null,
        });
        expect(text()).toContain("Saved as a draft. Nobody can join it yet");
        expect(button("Publish").disabled).toBe(true);
        expect(text()).toContain(
            "1 thing to fix before publishing: add the price.",
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
            "1 thing to fix before publishing: there's already a plan called Drop-in.",
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

    it("mentions autopay only when the business offers it (D14)", () => {
        render(record(), { autopayOffered: true });
        expect(text()).toContain(
            "Invoiced each month with a pay link, or by autopay for members who set it up.",
        );
    });
});

describe("the price and members' autopay (D13)", () => {
    it("warns as a price above switchers' autopay is typed, and clears below it", () => {
        render(
            record({
                autopayLimits: [{ limit: "1500.00", members: 2 }],
            }),
        );
        const price = field("Price");
        expect(text()).not.toContain("will need to authorise again");

        type(price, "1800");
        expect(text()).toContain(
            "Autopay covers up to ₹1,500, so 2 members will need to authorise again",
        );
        const warning = Array.from(host.querySelectorAll("p")).find((p) =>
            p.textContent.startsWith("Autopay covers up to"),
        );
        expect(price.getAttribute("aria-describedby")).toContain(warning?.id);

        type(price, "1500");
        expect(text()).not.toContain("will need to authorise again");
    });

    it("never warns without the API's limits (an older API)", () => {
        render(record());
        type(field("Price"), "99999");
        expect(text()).not.toContain("authorise again");
    });
});

describe("a plan's GST (12 Oct 2026)", () => {
    const ASKED = { asked: true, priceMode: "INCLUDED" as const };

    it("shows a business that isn't registered none of it, and never holds it up", () => {
        render(record());
        expect(text()).not.toContain("GST");
        expect(text()).not.toContain("SAC code");
        expect(text()).not.toContain("to fix before publishing");
    });

    it("asks a registered business for the rate beside the price, with the quiet select and the SAC code", () => {
        render(record({ gst: ASKED }));
        const rate = select("GST rate");
        expect(rate.value).toBe("");
        expect(Array.from(rate.options).map((o) => o.textContent)).toEqual([
            "Choose a rate",
            "0%, nil-rated or exempt",
            "0.25%",
            "3%",
            "5%",
            "12%",
            "18%",
            "28%",
            "40%",
        ]);
        expect(
            Array.from(select("GST on this price").options).map(
                (o) => o.textContent,
            ),
        ).toEqual([
            "Same as the business (includes GST)",
            "Includes GST",
            "GST is added",
        ]);
        expect(field("SAC code").value).toBe("");
        expect(text()).toContain("SAC code (optional)");
    });

    it("stops Publish for a priced plan with no rate, beside the field, until one is chosen", async () => {
        render(
            record({
                gst: ASKED,
                hasPendingChanges: true,
                values: { ...values, price: "1500.00" },
                problems: [
                    {
                        field: "gstRate",
                        message:
                            "Choose a GST rate. Exempt (0%) is one of the choices.",
                    },
                ],
            }),
        );
        expect(button("Publish changes").disabled).toBe(true);
        expect(select("GST rate").getAttribute("aria-invalid")).toBe("true");
        expect(text()).toContain(
            "1 thing to fix before publishing: choose a GST rate. Pick 0% if it's exempt or nil-rated.",
        );
        expect(text()).not.toContain("nil-rated..");

        actions.savePlanDraft.mockResolvedValue({
            ok: true,
            data: record({
                gst: ASKED,
                revision: 5,
                hasPendingChanges: true,
                values: { ...values, price: "1500.00", gstRate: "18" },
            }),
        });
        pick(select("GST rate"), "18");
        await wait(800);
        expect(actions.savePlanDraft).toHaveBeenCalledWith(
            "plan_1",
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

    it("takes exempt (0%) as an answer, and autosaves the way and the SAC code as the API takes them", async () => {
        render(record({ gst: ASKED }));
        actions.savePlanDraft.mockResolvedValue({
            ok: true,
            data: record({
                gst: ASKED,
                revision: 5,
                hasPendingChanges: true,
                values: {
                    ...values,
                    gstRate: "0",
                    sacCode: "999723",
                    gstPriceMode: "ADDED",
                },
            }),
        });
        pick(select("GST rate"), "0");
        pick(select("GST on this price"), "ADDED");
        type(field("SAC code"), "9997 23");
        await wait(800);
        expect(actions.savePlanDraft).toHaveBeenLastCalledWith(
            "plan_1",
            expect.objectContaining({
                gstRate: "0",
                sacCode: "999723",
                gstPriceMode: "ADDED",
            }),
            4,
        );
        expect(text()).not.toContain("Choose a GST rate");
    });

    it("asks on a new plan when the page says the business is registered", () => {
        render(null, { gst: { asked: true, priceMode: "ADDED" } });
        expect(select("GST rate")).toBeTruthy();
        expect(select("GST on this price").options[0].textContent).toBe(
            "Same as the business (GST is added)",
        );
    });

    it("tells the business before it publishes what the GST does to members' next renewal", () => {
        render(
            record({
                gst: { asked: true, priceMode: "ADDED" },
                hasPendingChanges: true,
                values: { ...values, gstRate: "18" },
                renewalChange: {
                    members: 12,
                    groups: [
                        {
                            members: 12,
                            currency: "INR",
                            from: "1200.00",
                            to: "1416.00",
                        },
                    ],
                    changed: 12,
                    aboveAutopayLimit: 3,
                },
            }),
        );
        expect(text()).toContain("Members already on this plan");
        expect(text()).toContain(
            "12 members' next renewal changes from ₹1,200 to ₹1,416.",
        );
        expect(text()).toContain(
            "3 of them pay by autopay with a limit below the new amount. Their renewal goes out as an invoice with a pay link.",
        );
        // The note after "When you publish" no longer says nobody's price
        // changes.
        expect(text()).toContain(
            "The 12 already on it keep the price they joined at. The GST changes what they pay from their next renewal.",
        );
        expect(text()).not.toContain("Nobody's price changes under them");
    });

    it("says the amount stays the same, with the GST inside, where the price includes it", () => {
        render(
            record({
                gst: ASKED,
                hasPendingChanges: true,
                values: { ...values, gstRate: "18" },
                renewalChange: {
                    members: 12,
                    groups: [
                        {
                            members: 12,
                            currency: "INR",
                            from: "1200.00",
                            to: "1200.00",
                        },
                    ],
                    changed: 0,
                    aboveAutopayLimit: 0,
                },
            }),
        );
        expect(text()).toContain(
            "12 members' next renewal stays the same amount.",
        );
        expect(text()).toContain("Their invoice will show the GST inside it.");
    });

    it("says what the publish did to members, not that they keep what they pay", async () => {
        const change = {
            members: 12,
            groups: [
                {
                    members: 12,
                    currency: "INR",
                    from: "1200.00",
                    to: "1416.00",
                },
            ],
            changed: 12,
            aboveAutopayLimit: 0,
        };
        const rated = { ...values, gstRate: "18" };
        render(
            record({
                gst: { asked: true, priceMode: "ADDED" },
                hasPendingChanges: true,
                values: rated,
                renewalChange: change,
            }),
        );
        actions.publishPlan.mockResolvedValue({
            ok: true,
            data: record({
                gst: { asked: true, priceMode: "ADDED" },
                revision: 5,
                values: rated,
                published: rated,
                renewalChange: null,
            }),
        });
        click(button("Publish changes"));
        await wait();
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Changes published. The 12 already on it pay the new amount from their next renewal.",
        );
        // Once published there is nothing left to tell.
        expect(text()).not.toContain("Members already on this plan");
    });

    it("says nothing of members when the GST is as published", () => {
        render(record({ gst: ASKED, renewalChange: null }));
        expect(text()).not.toContain("Members already on this plan");
    });
});
