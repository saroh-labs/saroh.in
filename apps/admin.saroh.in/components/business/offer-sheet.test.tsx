/** @vitest-environment jsdom */
import type { BoundFunctions, queries } from "@testing-library/react";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SarohSubscriptionDetail } from "@/lib/billing-words";
import type { BusinessModuleState } from "@/lib/businesses";
import type {
    OfferOptions,
    OfferPreview,
    PreviewKind,
} from "@/lib/offer-words";
import type { OverviewPlan } from "@/lib/overview-words";

import { BillingTab } from "./billing/billing-tab";
import { ModuleRows } from "./modules/module-rows";
import { OfferSheet } from "./offer-sheet";
import { TakeAwaySheet } from "./take-away-sheet";

const actions = vi.hoisted(() => ({
    offerOptionsAction: vi.fn(),
    previewOfferAction: vi.fn(),
    planOverrideAction: vi.fn(),
    priceOverrideAction: vi.fn(),
    moduleOverrideAction: vi.fn(),
    raiseLimitAction: vi.fn(),
    trialAction: vi.fn(),
    moduleReleaseAction: vi.fn(),
    switchOnModuleAction: vi.fn(),
    setModuleAction: vi.fn(),
    repairModulesAction: vi.fn(),
}));
vi.mock("@/lib/business-actions", () => actions);
vi.mock("@/lib/billing-actions", () => ({ syncCustomerAction: vi.fn() }));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: Record<string, unknown>) => (
        <a href={href as string} {...rest}>
            {children as React.ReactNode}
        </a>
    ),
}));

// Made-up plans, limits and prices: nothing here is a real one.
const yes = { available: true, why: null };
const kinds = (
    over: Partial<
        Record<PreviewKind, { available: boolean; why: string | null }>
    > = {},
): OfferOptions["kinds"] => ({
    plan: yes,
    price: yes,
    module: yes,
    limit: yes,
    trial: {
        available: false,
        why: "A longer trial is only for a business in a trial.",
    },
    remove: yes,
    ...over,
});

const options = (over: Partial<OfferOptions> = {}): OfferOptions => ({
    organizationId: "org_1",
    planName: "Plan A",
    kinds: kinds(),
    plans: [
        { id: "free", name: "Plan A" },
        { id: "pro", name: "Plan C" },
    ],
    modules: [
        {
            id: "website",
            name: "Site",
            registry: "WEBSITE",
            state: "on",
            paidPlanIncludes: true,
        },
        {
            id: "invoicing",
            name: "Bills",
            registry: null,
            state: "on",
            paidPlanIncludes: false,
        },
        {
            id: "bookings",
            name: "Visits",
            registry: "APPOINTMENTS",
            state: "locked",
            paidPlanIncludes: false,
        },
        {
            id: "products",
            name: "Things",
            registry: "COMMERCE",
            state: "locked",
            paidPlanIncludes: false,
        },
    ],
    limits: [
        { key: "products", label: "Things", limit: 11, planLimit: 11, per: "" },
    ],
    trialEndsAt: null,
    maxEndDays: 1830,
    raiseMaxDays: 365,
    trialMaxDays: 90,
    ...over,
});

const ENDS = "2030-03-31T18:29:59.999Z";

const preview = (over: Partial<OfferPreview>): OfferPreview => ({
    kind: "plan",
    endsAt: ENDS,
    changes: [{ type: "plan", from: "Plan A", to: "Plan C" }],
    then: "Plan A",
    subject: "Plan C",
    days: null,
    ...over,
});

type Scope = BoundFunctions<typeof queries>;

function is<T extends HTMLElement>(el: HTMLElement, kind: new () => T): T {
    if (!(el instanceof kind)) throw new Error(`Not a ${kind.name}`);
    return el;
}

function openSheet(start?: Parameters<typeof OfferSheet>[0]["start"]) {
    const onDone = vi.fn();
    const onOpenChange = vi.fn();
    render(
        <OfferSheet
            organizationId="org_1"
            businessName="Rye & Co."
            start={start}
            onOpenChange={onOpenChange}
            onDone={onDone}
            checkDelayMs={0}
        />,
    );
    return { onDone, onOpenChange };
}

async function sheet() {
    const dialog = await screen.findByRole("dialog", {
        name: "Give a custom offer",
    });
    await within(dialog).findByText("What do you want to give them?");
    return within(dialog);
}

function giveReason(s: Scope, text = "Early customer, trying it") {
    fireEvent.change(s.getByLabelText(/Why\?/), { target: { value: text } });
}

function confirmButton(s: Scope) {
    const submit = s
        .getAllByRole("button")
        .find((b) => b.getAttribute("type") === "submit");
    if (!submit) throw new Error("No confirm button");
    return submit as HTMLButtonElement;
}

beforeEach(() => {
    for (const fn of [...Object.values(actions), ...Object.values(toast)]) {
        fn.mockReset();
    }
    actions.offerOptionsAction.mockResolvedValue({ ok: true, data: options() });
    for (const write of [
        actions.planOverrideAction,
        actions.priceOverrideAction,
        actions.moduleOverrideAction,
        actions.raiseLimitAction,
        actions.trialAction,
    ]) {
        write.mockResolvedValue({ ok: true, data: null });
    }
});
afterEach(cleanup);

describe("OfferSheet", () => {
    it("dry-runs a plan until a date, names the action, and confirms it with the reason", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({}),
        });
        const { onDone } = openSheet();
        const s = await sheet();

        expect(
            s
                .getByRole("button", { name: /A plan until a date/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        fireEvent.change(s.getByLabelText("Plan"), {
            target: { value: "pro" },
        });
        fireEvent.change(s.getByLabelText("Until"), {
            target: { value: "2030-03-31" },
        });

        await waitFor(() =>
            expect(actions.previewOfferAction).toHaveBeenCalledWith("org_1", {
                kind: "plan",
                planKey: "pro",
                expiresAt: ENDS,
            }),
        );
        expect(
            await s.findByText("They are on Plan C instead of Plan A."),
        ).toBeTruthy();
        expect(s.getByText(/they go back to Plan A/)).toBeTruthy();

        // The reason comes first: under four characters, no confirm.
        const confirm = confirmButton(s);
        expect(confirm.textContent).toMatch(/^Give Plan C until/);
        giveReason(s, "abc");
        expect(confirm.disabled).toBe(true);
        giveReason(s);
        expect(confirm.disabled).toBe(false);
        fireEvent.click(confirm);

        await waitFor(() =>
            expect(actions.planOverrideAction).toHaveBeenCalledWith("org_1", {
                reason: "Early customer, trying it",
                idempotencyKey: expect.any(String) as unknown,
                planKey: "pro",
                expiresAt: ENDS,
            }),
        );
        expect(onDone).toHaveBeenCalledWith(
            expect.stringMatching(/^Rye & Co\. is on Plan C until/),
        );
    });

    it("dry-runs a custom price and confirms it in paise", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({
                kind: "price",
                endsAt: null,
                changes: [
                    { type: "price", fromPaise: 22_200, toPaise: 12_345 },
                ],
                then: null,
                subject: "Plan A",
            }),
        });
        openSheet();
        const s = await sheet();
        fireEvent.click(s.getByRole("button", { name: /A custom price/ }));
        fireEvent.change(s.getByLabelText(/Their price a month/), {
            target: { value: "123.45" },
        });

        await waitFor(() =>
            expect(actions.previewOfferAction).toHaveBeenCalledWith("org_1", {
                kind: "price",
                pricePaise: 12_345,
                expiresAt: undefined,
            }),
        );
        expect(
            await s.findByText(
                /They pay ₹123.45 a month before GST instead of ₹222.00/,
            ),
        ).toBeTruthy();
        giveReason(s);
        fireEvent.click(confirmButton(s));
        await waitFor(() =>
            expect(actions.priceOverrideAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({ pricePaise: 12_345 }),
            ),
        );
    });

    it("shows a provider-billed price refused with the API's reason, and offers no confirm", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: false,
            error: "This plan is billed through razorpay; change it there so billing stays in step.",
        });
        openSheet({ kind: "price" });
        const s = await sheet();
        fireEvent.change(s.getByLabelText(/Their price a month/), {
            target: { value: "10" },
        });

        expect(await s.findByText(/billed through razorpay/)).toBeTruthy();
        giveReason(s);
        expect(confirmButton(s).disabled).toBe(true);
    });

    it("keeps a custom price from staff without pricing:publish, saying why", async () => {
        actions.offerOptionsAction.mockResolvedValue({
            ok: true,
            data: options({
                kinds: kinds({
                    price: {
                        available: false,
                        why: "A custom price needs pricing:publish as well.",
                    },
                }),
            }),
        });
        openSheet();
        const s = await sheet();
        const price = s.getByRole("button", { name: /A custom price/ });
        expect(price.textContent).toMatch(/needs pricing:publish/);
        fireEvent.click(price);
        expect(s.queryByLabelText(/Their price a month/)).toBeNull();
        giveReason(s);
        expect(confirmButton(s).disabled).toBe(true);
        expect(actions.previewOfferAction).not.toHaveBeenCalled();
    });

    it("refuses a date past the cap with the API's words", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: false,
            error: "The end date must be within five years.",
        });
        openSheet();
        const s = await sheet();
        fireEvent.change(s.getByLabelText("Until"), {
            target: { value: "2040-01-01" },
        });
        expect(
            await s.findByText("The end date must be within five years."),
        ).toBeTruthy();
    });

    it("offers a longer trial only while they are in one, and confirms the days the dry run gave", async () => {
        openSheet();
        let s = await sheet();
        expect(s.queryByRole("button", { name: /A longer trial/ })).toBeNull();
        cleanup();

        actions.offerOptionsAction.mockResolvedValue({
            ok: true,
            data: options({
                trialEndsAt: "2030-01-10T00:00:00.000Z",
                kinds: kinds({ trial: yes }),
            }),
        });
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({
                kind: "trial",
                endsAt: "2030-01-17T00:00:00.000Z",
                changes: [
                    {
                        type: "trial",
                        from: "2030-01-10T00:00:00.000Z",
                        to: "2030-01-17T00:00:00.000Z",
                    },
                ],
                then: null,
                subject: null,
                days: 7,
            }),
        });
        openSheet({ kind: "trial" });
        s = await sheet();
        fireEvent.change(s.getByLabelText("Their trial ends on"), {
            target: { value: "2030-01-17" },
        });
        expect(await s.findByText(/Their trial ends/)).toBeTruthy();
        giveReason(s);
        expect(confirmButton(s).textContent).toMatch(/^Extend their trial to/);
        fireEvent.click(confirmButton(s));
        await waitFor(() =>
            expect(actions.trialAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({ days: 7 }),
            ),
        );
    });

    it("raises a limit for the days the dry run gave", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({
                kind: "limit",
                changes: [
                    {
                        type: "limit",
                        key: "products",
                        name: "Things",
                        from: 11,
                        to: 40,
                        per: "",
                    },
                ],
                then: null,
                subject: "Things",
                days: 30,
            }),
        });
        openSheet({ kind: "limit" });
        const s = await sheet();
        fireEvent.change(s.getByLabelText("New limit"), {
            target: { value: "40" },
        });
        fireEvent.change(s.getByLabelText("Until"), {
            target: { value: "2030-03-31" },
        });
        expect(await s.findByText("Things: 40 instead of 11.")).toBeTruthy();
        giveReason(s);
        expect(confirmButton(s).textContent).toMatch(
            /^Raise Things to 40 until/,
        );
        fireEvent.click(confirmButton(s));
        await waitFor(() =>
            expect(actions.raiseLimitAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({
                    key: "products",
                    value: 40,
                    days: 30,
                }),
            ),
        );
    });

    it("keeps the API's refusal on a failed confirm, with the sheet open", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({}),
        });
        actions.planOverrideAction.mockResolvedValue({
            ok: false,
            error: "This business has been deleted.",
        });
        const { onDone } = openSheet();
        const s = await sheet();
        fireEvent.change(s.getByLabelText("Until"), {
            target: { value: "2030-03-31" },
        });
        await s.findByText("They are on Plan C instead of Plan A.");
        giveReason(s);
        fireEvent.click(confirmButton(s));
        expect(await s.findByRole("alert")).toBeTruthy();
        expect(s.getByText("This business has been deleted.")).toBeTruthy();
        expect(onDone).not.toHaveBeenCalled();
    });
});

describe("Give this module… from a Modules row", () => {
    const locked: BusinessModuleState = {
        moduleKey: "APPOINTMENTS",
        label: "Bookings",
        state: "locked",
        blocker: "ENTITLEMENT_REQUIRED",
        reason: "Not in their plan",
        fix: {
            kind: "plan",
            label: "Change plan or give the module…",
            permission: "pricing:override",
        },
        dependencies: [],
    };

    it("opens the offer sheet on One module with the row's module, and lights the row after", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({
                kind: "module",
                endsAt: null,
                changes: [
                    {
                        type: "module",
                        moduleId: "bookings",
                        name: "Visits",
                        from: "locked",
                        to: "on",
                    },
                ],
                then: null,
                subject: "Visits",
            }),
        });
        render(
            <ModuleRows
                organizationId="org_1"
                businessName="Rye & Co."
                state={{
                    organizationId: "org_1",
                    planLimitsEnforced: true,
                    note: null,
                    modules: [locked],
                }}
                permissions={["pricing:override"]}
            />,
        );
        fireEvent.click(
            screen.getByRole("button", { name: "Give this module…" }),
        );
        const s = await sheet();

        expect(
            s
                .getByRole("button", { name: /One module/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        expect(is(s.getByLabelText("Module"), HTMLSelectElement).value).toBe(
            "bookings",
        );
        await waitFor(() =>
            expect(actions.previewOfferAction).toHaveBeenCalledWith("org_1", {
                kind: "module",
                moduleKey: "bookings",
                expiresAt: undefined,
            }),
        );
        expect(await s.findByText("Visits opens for them.")).toBeTruthy();
        giveReason(s);
        expect(confirmButton(s).textContent).toBe("Give Visits");
        fireEvent.click(confirmButton(s));

        await waitFor(() =>
            expect(actions.moduleOverrideAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({
                    kind: "grant",
                    moduleKey: "bookings",
                }),
            ),
        );
        const row = document.querySelector('[data-module="APPOINTMENTS"]');
        await waitFor(() =>
            expect(row?.hasAttribute("data-just-changed")).toBe(true),
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Visits is on for Rye & Co.",
            expect.any(String),
        );
    });
});

describe("TakeAwaySheet", () => {
    it("lists what their paid plan includes as not pickable, and takes away a gift with a reason", async () => {
        actions.previewOfferAction.mockResolvedValue({
            ok: true,
            data: preview({
                kind: "remove",
                endsAt: null,
                changes: [
                    {
                        type: "module",
                        moduleId: "invoicing",
                        name: "Bills",
                        from: "on",
                        to: "hidden",
                    },
                ],
                then: null,
                subject: "Bills",
            }),
        });
        const onDone = vi.fn();
        render(
            <TakeAwaySheet
                organizationId="org_1"
                businessName="Rye & Co."
                onOpenChange={vi.fn()}
                onDone={onDone}
                checkDelayMs={0}
            />,
        );
        const dialog = within(
            await screen.findByRole("dialog", { name: "Take away a module" }),
        );
        const select = is(
            await dialog.findByLabelText("Module"),
            HTMLSelectElement,
        );
        const site = is(
            within(select).getByRole("option", {
                name: "Site (in their paid plan)",
            }),
            HTMLOptionElement,
        );
        expect(site.disabled).toBe(true);
        expect(select.value).toBe("invoicing");

        expect(
            await dialog.findByText(/Bills goes from their workspace/),
        ).toBeTruthy();
        fireEvent.change(dialog.getByLabelText(/Why\?/), {
            target: { value: "Misused, agreed on a call" },
        });
        const confirm = dialog.getByRole("button", { name: "Take away Bills" });
        fireEvent.click(confirm);
        await waitFor(() =>
            expect(actions.moduleOverrideAction).toHaveBeenCalledWith(
                "org_1",
                expect.objectContaining({
                    kind: "remove",
                    moduleKey: "invoicing",
                    reason: "Misused, agreed on a call",
                }),
            ),
        );
        expect(onDone).toHaveBeenCalledWith(
            "Bills is taken away from Rye & Co.",
        );
    });

    it("says why when they can't take anything away", async () => {
        actions.offerOptionsAction.mockResolvedValue({
            ok: true,
            data: options({
                kinds: kinds({
                    remove: {
                        available: false,
                        why: "Only a Platform owner takes a module away.",
                    },
                }),
            }),
        });
        render(
            <TakeAwaySheet
                organizationId="org_1"
                businessName="Rye & Co."
                onOpenChange={vi.fn()}
                checkDelayMs={0}
            />,
        );
        const dialog = within(
            await screen.findByRole("dialog", { name: "Take away a module" }),
        );
        expect(
            await dialog.findByText(
                "Only a Platform owner takes a module away.",
            ),
        ).toBeTruthy();
        expect(dialog.queryByLabelText("Module")).toBeNull();
    });
});

describe("BillingTab", () => {
    const plan: OverviewPlan = {
        subscriptionId: "sub_row",
        effective: null,
        name: "Plan B",
        basePlanName: "Plan B",
        overrideEndsAt: null,
        status: "ACTIVE",
        pricePaise: 22_200,
        planPricePaise: 22_200,
        customPrice: null,
        nextCharge: {
            at: "2030-01-05T00:00:00.000Z",
            how: "AUTOPAY",
            autopayRunsOutSoon: false,
        },
        offers: [],
        livePlans: [{ id: "grow", name: "Plan B" }],
    };
    const detail = {
        subscription: {
            lastInvoice: {
                id: "inv_1",
                number: "SA/00-01/0001",
                issuedAt: "2030-01-05T00:00:00.000Z",
                totalPaise: 26_196,
            },
        },
        billingProfile: {
            id: "bp_1",
            legalName: "Rye Pvt Ltd",
            billingEmail: "accounts@example.com",
            gstin: "27AAAAA0000A1Z5",
            provider: "razorpay",
            providerCustomerId: "cust_123",
            syncedAt: "2030-01-05T00:00:00.000Z",
            lastError: null,
            contactWithheld: false,
            otherBusinesses: [{ id: "org_2", name: "Rye Two" }],
        },
    } as unknown as SarohSubscriptionDetail;

    it("shows this business's billing profile, Sync with Razorpay… and the subscription sheet's links", () => {
        render(
            <BillingTab
                organizationId="org_1"
                businessName="Rye & Co."
                plan={plan}
                usage={[]}
                billedTo={{ name: "Rye Pvt Ltd" }}
                side={{ status: "ok", detail }}
                canOffer
                canSync
            />,
        );
        const billed = within(
            is(
                screen.getByText("Billed to").parentElement ?? document.body,
                HTMLElement,
            ),
        );
        expect(
            billed.getByText(
                /Rye Pvt Ltd · GSTIN on file · accounts@example.com/,
            ),
        ).toBeTruthy();
        expect(
            billed.getByText(/also pays for 1 other business: Rye Two/),
        ).toBeTruthy();
        expect(
            billed.getByRole("button", { name: "Sync with Razorpay…" }),
        ).toBeTruthy();
        expect(
            screen
                .getByRole("link", { name: "Open the subscription" })
                .getAttribute("href"),
        ).toBe("/billing/subscriptions?open=sub_row");
        expect(
            screen
                .getByRole("link", { name: "All invoices" })
                .getAttribute("href"),
        ).toBe("/billing/subscriptions?open=sub_row&sheet=invoices");
        expect(screen.getByText(/SA\/00-01\/0001/)).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Give a custom offer…" }),
        ).toBeTruthy();
    });

    it("leaves who pays out for staff without Saroh billing access, and Sync for those who can't act", () => {
        render(
            <BillingTab
                organizationId="org_1"
                businessName="Rye & Co."
                plan={plan}
                usage={[]}
                billedTo={null}
                side={{ status: "hidden" }}
                canOffer={false}
                canSync={false}
            />,
        );
        expect(screen.getByText(/need Saroh billing access/)).toBeTruthy();
        expect(
            screen.queryByRole("button", { name: "Sync with Razorpay…" }),
        ).toBeNull();
        expect(
            screen.queryByRole("button", { name: "Give a custom offer…" }),
        ).toBeNull();
        expect(screen.queryByText("Last invoice")).toBeNull();
    });
});
