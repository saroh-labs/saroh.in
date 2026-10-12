// @vitest-environment jsdom
/**
 * GST rates on membership plans, class packs and courses (12 Oct 2026), in
 * the two places a missing one is chosen.
 *
 * - The notice's list: the count by kind, a row each with its kind's word,
 *   and under a plan with members what the rate does to their next renewal.
 * - The ask in place, at the desk: subscribing someone, selling a pack and
 *   enrolling someone are refused for want of a rate, the sheet opens over
 *   the dialog, the rate is saved on the plan, pack or course, and the same
 *   action runs again. Nobody is sent to another page.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SellablePack } from "@/components/class-packs/sell-pack-dialog";
import { SellPackDialog } from "@/components/class-packs/sell-pack-dialog";
import type { EnrolCourse } from "@/components/courses/enrol-dialog";
import { EnrolDialog } from "@/components/courses/enrol-dialog";
import { SubscribeDialog } from "@/components/subscriptions/subscribe-dialog";
import type { MissingRates } from "@/lib/gst-rates/missing";
import type { Plan } from "@/lib/subscriptions/service";

import { MissingRatesNotice } from "./missing-rates-notice";

const saveGstRates = vi.fn();
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: (...args: unknown[]) => saveGstRates(...args) as unknown,
}));

const desk = vi.hoisted(() => ({
    subscribe: vi.fn(),
    sellPack: vi.fn(),
    enrol: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => ({ subscribe: desk.subscribe }));
vi.mock("@/lib/class-packs/actions", () => ({ sellPack: desk.sellPack }));
vi.mock("@/lib/courses/actions", () => ({ enrol: desk.enrol }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

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
        "aria-label"?: string;
        "aria-invalid"?: boolean;
    }) => (
        <select
            id={id}
            aria-label={aria["aria-label"]}
            aria-invalid={aria["aria-invalid"]}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        saveGstRates,
        refresh,
        toast.showSuccess,
        toast.showError,
        ...Object.values(desk),
    ]) {
        fn.mockReset();
    }
    saveGstRates.mockResolvedValue({ ok: true, data: { saved: 1 } });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

function button(name: string): HTMLButtonElement {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
}

async function press(name: string) {
    await act(async () => {
        button(name).click();
        await Promise.resolve();
    });
    await settle();
}

function choose(name: string, rate: string) {
    const box = document.querySelector<HTMLSelectElement>(
        `select[aria-label="GST rate for ${name}"]`,
    );
    if (!box) throw new Error(`No GST rate box for ${name}`);
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, rate);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

const page = () => document.body.textContent;

/** The sheet the rate is chosen in: the dialog that holds its row. */
function rateSheet(name: string): HTMLElement | null {
    return (
        document
            .querySelector(`select[aria-label="GST rate for ${name}"]`)
            ?.closest<HTMLElement>('[role="dialog"]') ?? null
    );
}

const refusedFor = (
    kind: "PLAN" | "PACK" | "COURSE",
    id: string,
    name: string,
) => ({
    ok: false as const,
    error: `${name} has no GST rate.`,
    rates: [{ kind, id, name }],
});

const ASHA = { id: "c_asha", name: "Asha Rao", email: "asha@example.com" };

/* ── The notice and its list ───────────────────────────────────────── */

const MISSING: MissingRates = {
    registered: true,
    more: false,
    priceMode: "ADDED",
    items: [
        {
            kind: "PLAN",
            id: "pl_gold",
            name: "Gold monthly",
            priceCents: 200_000,
            currency: "INR",
            canSet: true,
            members: [{ count: 12, price: "2000.00", currency: "INR" }],
        },
        {
            kind: "PACK",
            id: "pk_ten",
            name: "10 classes",
            priceCents: 150_000,
            currency: "INR",
            canSet: true,
        },
        {
            kind: "COURSE",
            id: "c_wheel",
            name: "Wheel throwing",
            priceCents: 500_000,
            currency: "INR",
            canSet: true,
        },
    ],
};

describe("the missing rates notice, with plans, class packs and courses", () => {
    const show = (missing: MissingRates) =>
        act(() => root.render(<MissingRatesNotice missing={missing} />));

    it("counts them by kind", () => {
        show(MISSING);
        expect(host.querySelector('[role="note"]')?.textContent).toContain(
            "1 plan, 1 class pack and 1 course have no GST rate. Until you choose one, their tax invoices show no GST.",
        );
    });

    it("says each row's kind under its name", async () => {
        show(MISSING);
        await press("Choose rates");
        expect(page()).toContain("Plan · ₹2,000");
        expect(page()).toContain("Class pack · ₹1,500");
        expect(page()).toContain("Course · ₹5,000");
    });

    it("says what a plan's rate does to its members' next renewal, once it is chosen", async () => {
        show(MISSING);
        await press("Choose rates");
        // Nothing is said before a rate is chosen.
        expect(page()).not.toContain("next renewal");

        choose("Gold monthly", "18");
        expect(page()).toContain(
            "12 members' next renewal changes from ₹2,000 to ₹2,360.",
        );
        // An exempt plan's amount stays, with no GST inside to show.
        choose("Gold monthly", "0");
        expect(page()).toContain(
            "12 members' next renewal stays the same amount.",
        );
        expect(page()).not.toContain("GST inside it");
        // A pack and a course have no members to tell.
        choose("10 classes", "18");
        choose("Wheel throwing", "18");
        expect(page().match(/next renewal/g)).toHaveLength(1);
    });

    it("says the amount stays the same where prices include GST", async () => {
        show({ ...MISSING, priceMode: "INCLUDED" });
        await press("Choose rates");
        choose("Gold monthly", "18");
        expect(page()).toContain(
            "12 members' next renewal stays the same amount. Their invoice will show the GST inside it.",
        );
    });

    it("follows the plan's own way of carrying GST over the business's", async () => {
        show({
            ...MISSING,
            priceMode: "INCLUDED",
            items: MISSING.items.map((item) =>
                item.kind === "PLAN" ? { ...item, priceMode: "ADDED" } : item,
            ),
        });
        await press("Choose rates");
        choose("Gold monthly", "18");
        expect(page()).toContain(
            "12 members' next renewal changes from ₹2,000 to ₹2,360.",
        );
    });

    it("saves the rates on the plan, the pack and the course", async () => {
        show(MISSING);
        await press("Choose rates");
        choose("Gold monthly", "18");
        choose("10 classes", "5");
        choose("Wheel throwing", "0");
        await press("Save");
        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "PLAN", id: "pl_gold", rate: "18" },
            { kind: "PACK", id: "pk_ten", rate: "5" },
            { kind: "COURSE", id: "c_wheel", rate: "0" },
        ]);
        expect(toast.showSuccess).toHaveBeenCalledWith("3 GST rates saved.");
        expect(refresh).toHaveBeenCalled();
    });
});

/* ── Asked in place, at the desk ───────────────────────────────────── */

const GOLD = {
    id: "pl_gold",
    name: "Gold monthly",
    description: null,
    price: "2000.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    classesPerMonth: null,
    subscriberCount: 12,
    byPrice: [],
    monthly: "2000.00",
    monthlyFromMembers: "24000.00",
    createdAt: "2026-06-01T00:00:00.000Z",
} satisfies Plan;

describe("subscribing someone to a plan with no GST rate", () => {
    const open = () =>
        act(() =>
            root.render(
                <SubscribeDialog
                    open
                    onOpenChange={vi.fn()}
                    contacts={[ASHA]}
                    plans={[GOLD]}
                    initialContactId={ASHA.id}
                    initialPlanId={GOLD.id}
                />,
            ),
        );

    it("asks for the rate in place, saves it on the plan, and subscribes them", async () => {
        desk.subscribe
            .mockResolvedValueOnce(refusedFor("PLAN", GOLD.id, GOLD.name))
            .mockResolvedValueOnce({ ok: true, data: { startsAt: null } });
        open();
        await press("Subscribe and invoice");

        const sheet = rateSheet("Gold monthly");
        expect(sheet?.textContent).toContain("Choose a GST rate");
        expect(sheet?.textContent).toContain(
            "Gold monthly has no GST rate. Choose one to subscribe them.",
        );
        // The members already on it are told of here, since a refusal
        // doesn't say who they are.
        expect(sheet?.textContent).toContain(
            "The rate is saved on the plan, so you're asked once. Members already on this plan carry its rate from their next renewal. Invoices already issued don't change.",
        );
        // Nothing failed: no red toast for a rate that is being asked for.
        expect(toast.showError).not.toHaveBeenCalled();

        choose("Gold monthly", "18");
        await press("Save and subscribe");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "PLAN", id: "pl_gold", rate: "18" },
        ]);
        expect(desk.subscribe).toHaveBeenCalledTimes(2);
        expect(desk.subscribe.mock.calls[1]).toEqual(
            desk.subscribe.mock.calls[0],
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Asha Rao subscribed to Gold monthly.",
            "The first invoice is issued.",
        );
    });

    it("subscribes nobody and says nothing when the rate sheet is closed", async () => {
        desk.subscribe.mockResolvedValue(
            refusedFor("PLAN", GOLD.id, GOLD.name),
        );
        open();
        await press("Subscribe and invoice");
        const cancel = Array.from(
            rateSheet("Gold monthly")?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent.trim() === "Cancel");
        if (!cancel) throw new Error("No Cancel in the rate sheet");
        await act(async () => {
            cancel.click();
            await Promise.resolve();
        });
        await settle();

        expect(desk.subscribe).toHaveBeenCalledTimes(1);
        expect(saveGstRates).not.toHaveBeenCalled();
        expect(toast.showSuccess).not.toHaveBeenCalled();
        expect(toast.showError).not.toHaveBeenCalled();
        // The dialog is still there, with who and which plan.
        expect(button("Subscribe and invoice")).toBeTruthy();
    });
});

const TEN: SellablePack = {
    id: "pk_ten",
    name: "10 classes",
    credits: 10,
    validityDays: 90,
    price: "1500.00",
    currency: "INR",
    kind: "CLASSES",
    status: "ACTIVE",
    services: [{ name: "Vinyasa" }],
};

describe("selling a pack", () => {
    const open = (
        pack: SellablePack,
        gst?: { asked: boolean; priceMode: "INCLUDED" | "ADDED" | null },
    ) =>
        act(() =>
            root.render(
                <SellPackDialog
                    open
                    onOpenChange={vi.fn()}
                    contacts={[ASHA]}
                    packs={[pack]}
                    initialPackId={pack.id}
                    initialContactId={ASHA.id}
                    invoicesOnSale
                    gst={gst}
                />,
            ),
        );

    it("asks for a missing rate in place, saves it on the pack, and sells it", async () => {
        desk.sellPack
            .mockResolvedValueOnce(refusedFor("PACK", TEN.id, TEN.name))
            .mockResolvedValueOnce({ ok: true, data: { invoiceId: "inv_1" } });
        open(TEN);
        await press("UPI");
        await press("Take ₹1,500");

        const sheet = rateSheet("10 classes");
        expect(sheet?.textContent).toContain(
            "10 classes has no GST rate. Choose one to sell this pack.",
        );
        expect(sheet?.textContent).toContain(
            "The rate is saved on the class pack, so you're asked once.",
        );
        expect(toast.showError).not.toHaveBeenCalled();

        choose("10 classes", "18");
        await press("Save and sell");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "PACK", id: "pk_ten", rate: "18" },
        ]);
        expect(desk.sellPack).toHaveBeenCalledTimes(2);
        expect(desk.sellPack).toHaveBeenLastCalledWith(
            "pk_ten",
            "c_asha",
            "UPI",
        );
        expect(toast.showSuccess).toHaveBeenCalled();
    });

    it("says the amount to pay where GST is added to the pack's price", async () => {
        open({ ...TEN, gstRate: "18" }, { asked: true, priceMode: "ADDED" });
        expect(page()).toContain("₹1,500 + ₹270 GST (18%) = ₹1,770 to pay");
        expect(page()).toContain("Books nothing · invoice ₹1,770.");
        await press("UPI");
        expect(button("Take ₹1,770")).toBeTruthy();
    });

    it("says nothing extra where the price includes GST, or the business isn't registered", async () => {
        open({ ...TEN, gstRate: "18" }, { asked: true, priceMode: "INCLUDED" });
        expect(page()).not.toContain("to pay");
        expect(page()).toContain("Books nothing · invoice ₹1,500.");
        await press("UPI");
        expect(button("Take ₹1,500")).toBeTruthy();

        act(() => root.unmount());
        root = createRoot(host);
        open({ ...TEN, gstRate: "18" });
        expect(page()).not.toContain("to pay");
        expect(page()).not.toContain("GST");
    });
});

const WHEEL: EnrolCourse = {
    id: "c_wheel",
    name: "Wheel throwing",
    price: "5000.00",
    currency: "INR",
    seats: 8,
    enrolled: 2,
    seatsLeft: 6,
    sessions: [],
    sessionsLeft: 6,
};

describe("enrolling someone on a course", () => {
    const open = (
        course: EnrolCourse,
        gst?: { asked: boolean; priceMode: "INCLUDED" | "ADDED" | null },
    ) =>
        act(() =>
            root.render(
                <EnrolDialog
                    open
                    onOpenChange={vi.fn()}
                    courses={[course]}
                    contacts={[ASHA]}
                    initialContactId={ASHA.id}
                    invoicesOnEnrol
                    gst={gst}
                />,
            ),
        );

    it("asks for a missing rate in place, saves it on the course, and enrols them", async () => {
        desk.enrol
            .mockResolvedValueOnce(refusedFor("COURSE", WHEEL.id, WHEEL.name))
            .mockResolvedValueOnce({ ok: true, data: { id: "enr_1" } });
        open(WHEEL);
        await press("Enrol and book");

        const sheet = rateSheet("Wheel throwing");
        expect(sheet?.textContent).toContain(
            "Wheel throwing has no GST rate. Choose one to enrol them.",
        );
        expect(sheet?.textContent).toContain(
            "The rate is saved on the course, so you're asked once.",
        );
        expect(toast.showError).not.toHaveBeenCalled();

        choose("Wheel throwing", "18");
        await press("Save and enrol");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "COURSE", id: "c_wheel", rate: "18" },
        ]);
        expect(desk.enrol).toHaveBeenCalledTimes(2);
        expect(desk.enrol).toHaveBeenLastCalledWith("c_wheel", {
            contactId: "c_asha",
        });
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Asha Rao enrolled.",
            "6 sessions booked.",
        );
    });

    it("says the amount to pay where GST is added to the course's price", () => {
        open({ ...WHEEL, gstRate: "18" }, { asked: true, priceMode: "ADDED" });
        expect(page()).toContain("₹5,000 + ₹900 GST (18%) = ₹5,900 to pay");
        expect(page()).toContain("invoice ₹5,900.00.");
    });

    it("says nothing extra where the price includes GST, or the business isn't registered", () => {
        open(
            { ...WHEEL, gstRate: "18" },
            { asked: true, priceMode: "INCLUDED" },
        );
        expect(page()).not.toContain("to pay");
        expect(page()).toContain("invoice ₹5,000.00.");

        act(() => root.unmount());
        root = createRoot(host);
        open({ ...WHEEL, gstRate: "18" });
        expect(page()).not.toContain("to pay");
        expect(page()).not.toContain("GST");
    });
});
