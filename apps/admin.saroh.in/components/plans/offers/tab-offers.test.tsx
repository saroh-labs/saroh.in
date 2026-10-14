/** @vitest-environment jsdom */
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlansData } from "@/components/plans/plans-context";
import type { AdminCoupon } from "@/lib/pricing-types";
import { ASHA, fakePricing } from "@/test/pricing-fixture";

import { AUTOSAVE_MS } from "../draft-store";
import { PlansShell } from "../plans-shell";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
    listCouponsAction: vi.fn(),
    createCouponAction: vi.fn(),
    updateCouponAction: vi.fn(),
    deleteCouponAction: vi.fn(),
    publishPricingAction: vi.fn(),
    cancelPricingVersionAction: vi.fn(),
    rollbackPricingVersionAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

function coupon(over: Partial<AdminCoupon> = {}): AdminCoupon {
    return {
        id: "c1",
        code: "HELLO",
        discountPaise: 1_000,
        months: 1,
        planIds: ["b"],
        razorpayOfferId: null,
        active: true,
        maxRedemptions: 10,
        expiresAt: null,
        uses: 0,
        createdAt: "2026-09-26T00:00:00.000Z",
        updatedAt: "2026-09-26T00:00:00.000Z",
        ...over,
    };
}

function data(over: Partial<PlansData> = {}): PlansData {
    return {
        pricing: fakePricing(),
        coupons: [],
        siteUrl: "https://site.example.test",
        me: ASHA,
        access: { canEdit: true, canPublish: true, canManageCoupons: true },
        ...over,
    };
}

function draw(over: Partial<PlansData> = {}) {
    return render(<PlansShell data={data(over)} impact={null} tab="offers" />);
}

async function confirmWithReason(submit: string) {
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
        target: { value: "Testing this" },
    });
    await act(async () => {
        fireEvent.click(within(dialog).getByRole("button", { name: submit }));
        await Promise.resolve();
    });
}

beforeEach(() => {
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    actions.savePricingDraftAction.mockResolvedValue({
        ok: true,
        data: { revision: 1, valid: true, errors: [], changes: [] },
    });
    window.history.replaceState(null, "", "/plans?tab=offers");
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("the Offers tab", () => {
    it("turns yearly billing on as a draft change, and autosaves it", async () => {
        vi.useFakeTimers();
        draw();
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Yearly billing" }),
        );
        expect(screen.getByText("Draft · 1 change")).toBeTruthy();
        expect(
            screen.getByText(/Yearly billing on: pay for 10 months, get 12/),
        ).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        const sent = actions.savePricingDraftAction.mock.calls[0]?.[0] as {
            catalog: { yearly: unknown };
        };
        expect(sent.catalog.yearly).toEqual({ on: true, paid: 10 });
    });

    it("sets how many charges one autopay covers as a draft change (DEC-161)", async () => {
        vi.useFakeTimers();
        draw();
        const card = screen.getByRole("region", { name: "Autopay" });
        const field = within(card).getByLabelText(
            "Monthly charges one autopay covers",
        ) as HTMLInputElement;
        expect(field.value).toBe("12");
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "60" } });
        fireEvent.blur(field);
        expect(
            screen.getByText("One autopay covers 12 → 60 monthly charges"),
        ).toBeTruthy();
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        const sent = actions.savePricingDraftAction.mock.calls[0]?.[0] as {
            catalog: { autopay: unknown };
        };
        expect(sent.catalog.autopay).toEqual({ charges: 60 });
    });

    it("keeps the autopay count within what Razorpay takes", () => {
        draw();
        const field = screen.getByLabelText(
            "Monthly charges one autopay covers",
        ) as HTMLInputElement;
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "5000" } });
        fireEvent.blur(field);
        expect(field.value).toBe("1200");
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "1" } });
        fireEvent.blur(field);
        expect(field.value).toBe("2");
    });

    it("puts a yearly count over 12 back to 12 on leaving the field", () => {
        draw();
        const field = screen.getByLabelText("Months paid");
        fireEvent.focus(field);
        fireEvent.change(field, { target: { value: "13" } });
        // Not taken while it's out of range…
        expect(screen.queryByText(/^Draft ·/)).toBeNull();
        fireEvent.blur(field);
        // …and clamped when the operator moves on.
        expect((field as HTMLInputElement).value).toBe("12");
        expect(
            screen.getByText(/Yearly billing: pay for 10 → 12 months|Draft ·/),
        ).toBeTruthy();
    });

    it("offers trials only on plans that cost something", () => {
        draw();
        const trials = screen.getByRole("region", { name: "Free trials" });
        expect(within(trials).queryByText("Plan A")).toBeNull();
        expect(within(trials).getByText("Plan B")).toBeTruthy();
        expect(
            within(trials).getByLabelText("Plan B trial days"),
        ).toHaveProperty("disabled", true);
    });

    it("sets the plans an add-on is offered on and the most a business can hold (DEC-157)", async () => {
        vi.useFakeTimers();
        draw();
        const panel = screen.getByRole("region", { name: "Add-ons" });
        fireEvent.click(
            within(panel).getByRole("button", { name: /Add products/ }),
        );
        const plans = within(panel).getByRole("group", {
            name: "Plans Extra products is offered on",
        });
        const chip = (name: string) =>
            within(plans).getByRole("button", { name });
        expect(chip("Every plan").getAttribute("aria-pressed")).toBe("true");
        expect(within(panel).getByText("On every plan, up to 99 a business"));

        fireEvent.click(chip("Plan C"));
        fireEvent.click(chip("Plan B"));
        expect(chip("Every plan").getAttribute("aria-pressed")).toBe("false");
        expect(chip("Plan B").getAttribute("aria-pressed")).toBe("true");
        const most = within(panel).getByLabelText("At most");
        fireEvent.focus(most);
        fireEvent.change(most, { target: { value: "4" } });
        fireEvent.blur(most);
        expect(
            within(panel).getByText("On Plan B and Plan C, up to 4 a business"),
        ).toBeTruthy();
        expect(
            screen.getByText(/New add-on: Extra products on Plan B and Plan C/),
        ).toBeTruthy();

        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        const sent = () =>
            (
                actions.savePricingDraftAction.mock.calls.at(-1)?.[0] as {
                    catalog: { addons: Record<string, unknown>[] };
                }
            ).catalog.addons[0];
        // In catalogue order, whatever order they were ticked in.
        expect(sent()).toMatchObject({ plans: ["b", "c"], max: 4 });

        // Every plan and the ceiling are said by leaving them out.
        fireEvent.click(chip("Every plan"));
        fireEvent.focus(most);
        fireEvent.change(most, { target: { value: "99" } });
        fireEvent.blur(most);
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(sent()).not.toHaveProperty("plans");
        expect(sent()).not.toHaveProperty("max");
    });

    it("warns where two add-ons for the same thing share a plan", () => {
        draw();
        const panel = screen.getByRole("region", { name: "Add-ons" });
        const add = () =>
            fireEvent.click(
                within(panel).getByRole("button", { name: /Add products/ }),
            );
        add();
        // Every plan is taken, so a second one clashes until one is narrowed.
        add();
        expect(
            within(panel).getAllByText(
                "Plan A already has Extra products. A plan takes one of them.",
            ),
        ).toHaveLength(2);
        const first = within(panel)
            .getAllByRole("group", {
                name: "Plans Extra products is offered on",
            })
            .at(0);
        if (!first) throw new Error("expected an add-on row");
        fireEvent.click(within(first).getByRole("button", { name: "Plan A" }));
        expect(
            within(panel).queryAllByText(/A plan takes one of them/),
        ).toHaveLength(2);
        const rows = within(panel).getAllByRole("group", {
            name: "Plans Extra products is offered on",
        });
        const second = rows.at(1);
        if (!second) throw new Error("expected a second add-on row");
        fireEvent.click(within(second).getByRole("button", { name: "Plan B" }));
        expect(
            within(panel).queryByText(/A plan takes one of them/),
        ).toBeNull();
    });

    it("draws read-only without pricing:edit", () => {
        draw({
            access: {
                canEdit: false,
                canPublish: false,
                canManageCoupons: false,
            },
        });
        expect(
            screen.getByRole("checkbox", { name: "Yearly billing" }),
        ).toHaveProperty("disabled", true);
        expect(
            screen.queryByRole("button", { name: /\+ Products/ }),
        ).toBeNull();
        expect(screen.queryByRole("button", { name: "New coupon" })).toBeNull();
        expect(
            screen.getByText("You can see coupons but not change them."),
        ).toBeTruthy();
    });
});

describe("coupons", () => {
    it("shows a taken code beside the code field", async () => {
        actions.createCouponAction.mockResolvedValue({
            ok: false,
            error: "There's already a coupon HELLO.",
            status: 409,
            details: { field: "code" },
        });
        draw();
        fireEvent.click(screen.getByRole("button", { name: "New coupon" }));
        fireEvent.change(screen.getByLabelText("Code"), {
            target: { value: "hello" },
        });
        fireEvent.change(screen.getByLabelText("₹ off a month"), {
            target: { value: "10" },
        });
        fireEvent.change(screen.getByLabelText("Max uses"), {
            target: { value: "5" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create coupon" }));
        await confirmWithReason("Create coupon");

        expect(actions.createCouponAction).toHaveBeenCalledWith(
            expect.objectContaining({
                code: "HELLO",
                discountPaise: 1_000,
                maxRedemptions: 5,
                planIds: ["b", "c"],
                reason: "Testing this",
            }),
        );
        // A new coupon starts paused: `active` isn't sent.
        expect(
            actions.createCouponAction.mock.calls[0]?.[0],
        ).not.toHaveProperty("active");
        const code = screen.getByLabelText("Code");
        expect(code.getAttribute("aria-invalid")).toBe("true");
        const describedBy = code.getAttribute("aria-describedby") ?? "";
        expect(document.getElementById(describedBy)?.textContent).toBe(
            "There's already a coupon HELLO.",
        );
    });

    it("asks before deleting one that has been used, and says it was archived", async () => {
        actions.deleteCouponAction.mockResolvedValue({
            ok: true,
            data: { id: "c1", code: "HELLO", outcome: "archived" },
        });
        draw({ coupons: [coupon({ uses: 2 })] });
        expect(screen.getByText(/Used 2 times/)).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = screen.getByRole("dialog");
        expect(
            within(dialog).getByText(/archived rather than deleted/),
        ).toBeTruthy();
        expect(actions.deleteCouponAction).not.toHaveBeenCalled();
        await confirmWithReason("Delete coupon");

        expect(actions.deleteCouponAction).toHaveBeenCalledWith(
            "c1",
            expect.objectContaining({ reason: "Testing this" }),
        );
        await waitFor(() =>
            expect(
                screen.getByText(
                    "Coupon HELLO archived. Its uses stay on record.",
                ),
            ).toBeTruthy(),
        );
    });

    it("saves the shared draft before a coupon write refreshes the page", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        actions.updateCouponAction.mockResolvedValue({
            ok: true,
            data: coupon({ active: false }),
        });
        draw({ coupons: [coupon()] });
        // An edit still waiting for its autosave…
        fireEvent.click(
            screen.getByRole("checkbox", { name: "Yearly billing" }),
        );
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        await confirmWithReason("Pause");

        // …is saved before the coupon write.
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        expect(
            actions.savePricingDraftAction.mock.invocationCallOrder[0],
        ).toBeLessThan(actions.updateCouponAction.mock.invocationCallOrder[0]);
        expect(actions.updateCouponAction).toHaveBeenCalledWith(
            "c1",
            expect.objectContaining({ active: false }),
        );
    });

    it("checks a Razorpay offer id beside the field, then saves it through the reason dialog", async () => {
        actions.updateCouponAction.mockResolvedValue({
            ok: true,
            data: coupon({
                razorpayOfferId: "offer_ABCDEFGHIJKLMN",
                updatedAt: "2026-09-27T00:00:00.000Z",
            }),
        });
        draw({ coupons: [coupon()] });
        const field = screen.getByLabelText("Razorpay offer ID");
        const hint = document.getElementById(
            (field.getAttribute("aria-describedby") ?? "").split(" ")[0] ?? "",
        );
        expect(hint?.textContent).toBe(
            "Make the offer in your Razorpay Dashboard, then paste its ID here.",
        );

        fireEvent.change(field, { target: { value: "offer_short" } });
        expect(field.getAttribute("aria-invalid")).toBe("true");
        expect(
            screen.getByText(/offer_ and 14 letters or digits/),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Save changes" }),
        ).toHaveProperty("disabled", true);

        fireEvent.change(field, {
            target: { value: " offer_ABCDEFGHIJKLMN" },
        });
        expect(field.getAttribute("aria-invalid")).toBe("false");
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await confirmWithReason("Save changes");

        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();
        expect(actions.updateCouponAction).toHaveBeenCalledWith(
            "c1",
            expect.objectContaining({
                razorpayOfferId: "offer_ABCDEFGHIJKLMN",
                reason: "Testing this",
            }),
        );
    });

    it("clears a Razorpay offer id, and shows the API's refusal beside the field", async () => {
        actions.updateCouponAction.mockResolvedValue({
            ok: false,
            error: "A Razorpay offer ID is offer_ and 14 letters or digits.",
            status: 400,
            details: { field: "razorpayOfferId" },
        });
        draw({
            coupons: [coupon({ razorpayOfferId: "offer_ABCDEFGHIJKLMN" })],
        });
        const field = screen.getByLabelText("Razorpay offer ID");
        expect((field as HTMLInputElement).value).toBe("offer_ABCDEFGHIJKLMN");
        fireEvent.change(field, { target: { value: "" } });
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
        await confirmWithReason("Save changes");

        expect(actions.updateCouponAction).toHaveBeenCalledWith(
            "c1",
            expect.objectContaining({ razorpayOfferId: null }),
        );
        await waitFor(() =>
            expect(field.getAttribute("aria-invalid")).toBe("true"),
        );
        const ids = (field.getAttribute("aria-describedby") ?? "").split(" ");
        expect(document.getElementById(ids[1] ?? "")?.textContent).toBe(
            "A Razorpay offer ID is offer_ and 14 letters or digits.",
        );
    });

    it("says coupons failed to load instead of showing none", () => {
        draw({ coupons: null });
        expect(screen.getByText(/Coupons could not be loaded/)).toBeTruthy();
        expect(screen.queryByText("No coupons yet.")).toBeNull();
        expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });
});
