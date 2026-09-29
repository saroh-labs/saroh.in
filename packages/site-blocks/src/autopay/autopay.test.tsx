import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    AccountPlanTab,
    AccountSubscription,
    AccountView,
} from "../account/model";
import type { PlanApi } from "../account/plan-api";
import { PlanTab } from "../account/plan-tab";
import type { OpenCheckout } from "../booking-flow/checkout";
import type { JoinApi, PlanJoinStarted } from "../prices/api";
import { JoinSheet } from "../prices/join-sheet";
import type { AutopayMethod, AutopayOutcome, AutopayStart } from "./api";
import { autopayMethodsOf, autopayOutcomeOf, autopayStartOf } from "./api";
import type { AutopayDoneState } from "./done";
import { AutopayDone, DONE_POLL_MS } from "./done";
import { autopayMethodLabel } from "./words";

/**
 * The customer sets up autopay on the business's site (round-2 D12), in
 * jsdom: the join sheet's "Pay with" (every method the provider offers,
 * "Pay and turn on autopay" first), My plan's "Set up autopay", and the
 * page they land on after, on the business's own site. The look is the
 * browser pass's.
 */

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/plan",
}));

// The provider window, answered by each test.
const pageWindow: { open: OpenCheckout | null } = { open: null };
vi.mock("../booking-flow/checkout", () => ({
    openProviderCheckout: ((request) => {
        if (!pageWindow.open) throw new Error("no window set");
        return pageWindow.open(request);
    }) as OpenCheckout,
}));

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
    assign.mockReset();
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...realLocation, assign },
    });
    pageWindow.open = vi.fn(() => ({
        outcome: Promise.resolve("paid" as const),
        close: vi.fn(),
    }));
});

afterEach(() => {
    Object.defineProperty(window, "location", {
        configurable: true,
        value: realLocation,
    });
    vi.useRealTimers();
});

async function press(element: Element | undefined | null) {
    if (!element) throw new Error("nothing to press");
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

/** Let queued promises and a zero timer run. */
async function settle() {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
}

const METHODS: AutopayMethod[] = ["UPI", "CARD", "EMANDATE"];

const HANDOFF = {
    provider: "RAZORPAY",
    amountCents: 250000,
    currency: "INR",
    providerIntentId: "order_auth_1",
    publicKey: "rzp_test_1",
    clientParams: { razorpayOrderId: "order_auth_1", recurring: true },
};

const START: AutopayStart = {
    ref: "m_1",
    method: "UPI",
    mode: "PAY_AND_AUTHORISE",
    limit: "3800.00",
    currency: "INR",
    handoff: HANDOFF,
    authorisationUrl: null,
    returnUrl: "https://pulse.saroh.app/autopay?join=inv_join",
};

const PLAN = {
    id: "plan_monthly",
    name: "Monthly unlimited",
    description: null,
    price: "2500.00",
    currency: "INR",
    interval: "MONTH",
};

function joinApi(over: Partial<JoinApi> = {}) {
    const started: PlanJoinStarted = {
        ref: "inv_join",
        plan: { name: "Monthly unlimited", interval: "MONTH" },
        total: "2500.00",
        currency: "INR",
        payment: HANDOFF,
        autopay: START,
    };
    return {
        join: vi.fn<JoinApi["join"]>(() =>
            Promise.resolve({ ok: true as const, data: started }),
        ),
        standing: vi.fn<JoinApi["standing"]>(() =>
            Promise.resolve({
                ok: true as const,
                data: {
                    state: "joined" as const,
                    plan: { name: "Monthly unlimited" },
                    subscriptionRef: "sub_new",
                },
            }),
        ),
        ...over,
    };
}

function renderJoin(api: JoinApi, methods: AutopayMethod[] = METHODS) {
    const onJoined = vi.fn();
    render(
        <JoinSheet
            plan={PLAN}
            onClose={vi.fn()}
            businessName="Pulse Fitness"
            customer={{ name: "Asha", email: "asha@example.in" }}
            api={api}
            onJoined={onJoined}
            onSignedOut={vi.fn()}
            autopayMethods={methods}
        />,
    );
    return { onJoined, sheet: screen.getByRole("dialog") };
}

describe("the join sheet's autopay (D12)", () => {
    it("offers every method the provider offers, by its plain name, with Pay and turn on autopay first", () => {
        const { sheet } = renderJoin(joinApi());
        const payWith = within(sheet).getByRole("radiogroup", {
            name: "Pay with",
        });
        const options = within(payWith).getAllByRole("radio");
        expect(options.map((o) => o.textContent)).toEqual([
            expect.stringContaining("Pay ₹2,500 and turn on autopay"),
            expect.stringContaining("Just pay for this month"),
        ]);
        expect(options[0]).toHaveAttribute("aria-checked", "true");
        const how = within(sheet).getByRole("radiogroup", {
            name: "Autopay with",
        });
        // The method list is the provider's list: nothing more, nothing less.
        expect(
            within(how)
                .getAllByRole("radio")
                .map((o) => o.querySelector("span span")?.textContent),
        ).toEqual(METHODS.map(autopayMethodLabel));
        expect(how).toHaveTextContent("UPI Autopay");
        expect(how).toHaveTextContent("Debit or credit card");
        expect(how).toHaveTextContent("Bank account (eMandate)");
    });

    it("offers only what the provider offers", () => {
        const { sheet } = renderJoin(joinApi(), ["CARD"]);
        const how = within(sheet).getByRole("radiogroup", {
            name: "Autopay with",
        });
        expect(within(how).getAllByRole("radio")).toHaveLength(1);
        expect(how).not.toHaveTextContent("UPI");
    });

    it("pays and authorises in one window, then lands on the business's own page", async () => {
        const api = joinApi();
        const { sheet } = renderJoin(api);
        await press(
            within(sheet).getByRole("radio", { name: /Debit or credit card/ }),
        );
        await press(
            within(sheet).getByRole("button", {
                name: "Pay ₹2,500 and turn on autopay",
            }),
        );
        await settle();
        expect(api.join).toHaveBeenCalledWith(
            "plan_monthly",
            expect.stringMatching(/^join-/),
            "CARD",
        );
        expect(pageWindow.open).toHaveBeenCalledWith(
            expect.objectContaining({ handoff: HANDOFF }),
        );
        expect(assign).toHaveBeenCalledWith(
            "https://pulse.saroh.app/autopay?join=inv_join",
        );
        // The server says joined, not the window: nothing polled here.
        expect(api.standing).not.toHaveBeenCalled();
    });

    it("just pays when the customer picks that, with no autopay sent", async () => {
        const api = joinApi({
            join: vi.fn<JoinApi["join"]>(() =>
                Promise.resolve({
                    ok: true as const,
                    data: {
                        ref: "inv_join",
                        plan: { name: "Monthly unlimited", interval: "MONTH" },
                        total: "2500.00",
                        currency: "INR",
                        payment: HANDOFF,
                        autopay: null,
                    },
                }),
            ),
        });
        const { sheet, onJoined } = renderJoin(api);
        await press(
            within(sheet).getByRole("radio", {
                name: /Just pay for this month/,
            }),
        );
        expect(
            within(sheet).queryByRole("radiogroup", { name: "Autopay with" }),
        ).toBeNull();
        await press(
            within(sheet).getByRole("button", {
                name: "Start Monthly unlimited · ₹2,500",
            }),
        );
        await settle();
        expect(api.join).toHaveBeenCalledWith(
            "plan_monthly",
            expect.stringMatching(/^join-/),
        );
        await vi.waitFor(() =>
            expect(onJoined).toHaveBeenCalledWith(
                "You're on Monthly unlimited. Welcome.",
            ),
        );
        expect(assign).not.toHaveBeenCalled();
    });

    it("eMandate: pays the join first, then authorises on the new plan", async () => {
        const startAutopay = vi.fn<NonNullable<JoinApi["startAutopay"]>>(() =>
            Promise.resolve({
                ok: true as const,
                data: {
                    ...START,
                    method: "EMANDATE" as const,
                    mode: "AUTHORISE" as const,
                    handoff: { ...HANDOFF, amountCents: 0 },
                    returnUrl: "https://pulse.saroh.app/autopay?plan=sub_new",
                },
            }),
        );
        const api = joinApi({
            startAutopay,
            // eMandate: the join is a plain payment; autopay comes after.
            join: vi.fn<JoinApi["join"]>(() =>
                Promise.resolve({
                    ok: true as const,
                    data: {
                        ref: "inv_join",
                        plan: { name: "Monthly unlimited", interval: "MONTH" },
                        total: "2500.00",
                        currency: "INR",
                        payment: HANDOFF,
                        autopay: null,
                    },
                }),
            ),
        });
        const { sheet } = renderJoin(api);
        await press(
            within(sheet).getByRole("radio", {
                name: /Bank account \(eMandate\)/,
            }),
        );
        await press(
            within(sheet).getByRole("button", {
                name: "Pay ₹2,500, then set up autopay",
            }),
        );
        await settle();
        await settle();
        expect(api.join).toHaveBeenCalledWith(
            "plan_monthly",
            expect.stringMatching(/^join-/),
            "EMANDATE",
        );
        await vi.waitFor(() =>
            expect(startAutopay).toHaveBeenCalledWith(
                "sub_new",
                "EMANDATE",
                expect.any(String),
            ),
        );
        await vi.waitFor(() =>
            expect(assign).toHaveBeenCalledWith(
                "https://pulse.saroh.app/autopay?plan=sub_new",
            ),
        );
        expect(pageWindow.open).toHaveBeenCalledTimes(2);
    });

    it("offers nothing about autopay when the provider takes none", () => {
        const { sheet } = renderJoin(joinApi(), []);
        expect(sheet.textContent).not.toMatch(/autopay|upi|card/i);
    });
});

// ---- My plan ---------------------------------------------------------------

const ACCOUNT: AccountView = {
    name: "Farah Khan",
    email: "farah@example.in",
    phone: null,
    businessName: "Pulse Fitness",
    tabs: [
        { key: "home", label: "Home" },
        { key: "plan", label: "Plan" },
    ],
    offers: { appointments: true, orders: false, plans: true },
    bookingsLabel: "Bookings",
    healthNotes: false,
};

const SUB: AccountSubscription = {
    ref: "sub_1",
    name: "Monthly 8",
    price: "2500.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    renewsAt: "2026-10-17T18:30:00.000Z",
    pausedUntil: null,
    endsAt: null,
    timezone: "Asia/Kolkata",
    classes: null,
    payNow: null,
    canPause: false,
    canResume: false,
    canCancel: true,
    autopay: null,
    autopayPays: null,
};

function tabOf(
    sub: AccountSubscription,
    methods: AutopayMethod[] = METHODS,
): AccountPlanTab {
    return {
        subscriptions: { ok: true, value: [sub] },
        packs: { ok: true, value: [] },
        pauseWeeks: [],
        autopayMethods: methods,
    };
}

function planApi(start?: PlanApi["startAutopay"]): PlanApi {
    return {
        pause: vi.fn(),
        resume: vi.fn(),
        cancel: vi.fn(),
        payNow: vi.fn(),
        ...(start ? { startAutopay: start } : {}),
    };
}

describe("My plan's autopay (D12)", () => {
    it("sets autopay up with the method picked, paying what is owed, and lands on the business's page", async () => {
        const start = vi.fn<NonNullable<PlanApi["startAutopay"]>>(() =>
            Promise.resolve({
                ok: true as const,
                data: {
                    ...START,
                    returnUrl: "https://pulse.saroh.app/autopay?plan=sub_1",
                },
            }),
        );
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf({
                    ...SUB,
                    autopayPays: { total: "2500.00", currency: "INR" },
                })}
                api={planApi(start)}
            />,
        );
        await press(screen.getByRole("button", { name: "Set up autopay" }));
        const sheet = screen.getByRole("dialog", { name: "Set up autopay" });
        expect(
            within(sheet)
                .getAllByRole("radio")
                .map((r) => r.querySelector("span span")?.textContent),
        ).toEqual(METHODS.map(autopayMethodLabel));
        await press(
            within(sheet).getByRole("button", {
                name: "Pay ₹2,500 and turn on autopay",
            }),
        );
        await settle();
        expect(start).toHaveBeenCalledWith("sub_1", "UPI", expect.any(String));
        expect(assign).toHaveBeenCalledWith(
            "https://pulse.saroh.app/autopay?plan=sub_1",
        );
    });

    it("says autopay is on, and offers to change how it pays", () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf({
                    ...SUB,
                    autopay: {
                        state: "ON",
                        method: "UPI",
                        hint: "mo•••@okicici",
                    },
                })}
                api={planApi(vi.fn())}
            />,
        );
        expect(
            screen.getByText("Autopay is on with UPI (mo•••@okicici)"),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Change how autopay pays" }),
        ).toBeInTheDocument();
    });

    it("says a set-up is being confirmed, and doesn't start another", () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf({
                    ...SUB,
                    autopay: { state: "PENDING", method: "UPI", hint: null },
                })}
                api={planApi(vi.fn())}
            />,
        );
        expect(
            screen.getByText("Autopay is being confirmed"),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /autopay/i })).toBeNull();
    });

    it("offers no autopay when the provider takes none", () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf(SUB, [])}
                api={planApi(vi.fn())}
            />,
        );
        expect(screen.queryByRole("button", { name: /autopay/i })).toBeNull();
    });
});

// ---- The page after ---------------------------------------------------------

const OUTCOME: AutopayOutcome = {
    plan: "Monthly unlimited",
    autopay: { state: "ON", method: "UPI", hint: "mo•••@okicici" },
    paid: true,
    nextPaymentAt: "2026-11-01T18:30:00.000Z",
    nextAmount: "2500.00",
    currency: "INR",
    timezone: "Asia/Kolkata",
};

function renderDone(
    initial: AutopayDoneState,
    read: () => Promise<AutopayDoneState> = () => Promise.resolve(initial),
) {
    render(
        <AutopayDone
            businessName="Pulse Fitness"
            initial={initial}
            read={read}
            accountHref="/account/plan"
            retryHref="https://saroh.app/pay/tok"
        />,
    );
}

describe("the page after set-up (D12)", () => {
    it("says the plan, how autopay pays and the next payment, with the way to the account", () => {
        renderDone({ kind: "outcome", outcome: OUTCOME });
        expect(
            screen.getByRole("heading", {
                name: "You're on Monthly unlimited.",
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(
                "Autopay is on with UPI (mo•••@okicici). Next payment ₹2,500 on 2 Nov 2026.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Go to your account" }),
        ).toHaveAttribute("href", "/account/plan");
    });

    it("says Being confirmed, and moves on by itself", async () => {
        vi.useFakeTimers();
        const read = vi.fn(() =>
            Promise.resolve<AutopayDoneState>({
                kind: "outcome",
                outcome: OUTCOME,
            }),
        );
        renderDone(
            {
                kind: "outcome",
                outcome: {
                    ...OUTCOME,
                    autopay: { state: "PENDING", method: "UPI", hint: null },
                },
            },
            read,
        );
        expect(
            screen.getByRole("heading", { name: "Being confirmed" }),
        ).toBeInTheDocument();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(DONE_POLL_MS);
        });
        expect(read).toHaveBeenCalled();
        expect(
            screen.getByRole("heading", {
                name: "You're on Monthly unlimited.",
            }),
        ).toBeInTheDocument();
    });

    it("a set-up that failed says the payment went through, and offers autopay again", () => {
        renderDone({
            kind: "outcome",
            outcome: {
                ...OUTCOME,
                autopay: { state: "FAILED", method: "UPI", hint: null },
            },
        });
        expect(
            screen.getByRole("heading", { name: "Autopay isn't on" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Your payment went through — Monthly unlimited is paid.",
        );
        expect(
            screen.getByRole("link", { name: "Try autopay again" }),
        ).toHaveAttribute("href", "https://saroh.app/pay/tok");
    });

    it("an abandoned one that took nothing says the payment hasn't gone through", () => {
        renderDone({
            kind: "outcome",
            outcome: { ...OUTCOME, autopay: null, paid: false },
        });
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Your payment hasn't gone through, and autopay isn't on for Monthly unlimited.",
        );
    });
});

describe("the shapes (D12)", () => {
    it("keeps only known methods, each once", () => {
        expect(autopayMethodsOf(["UPI", "NACH", "UPI", "CARD"])).toEqual([
            "UPI",
            "CARD",
        ]);
        expect(autopayMethodsOf(null)).toEqual([]);
    });

    it("checks a start and an outcome", () => {
        expect(autopayStartOf(START)).toEqual(START);
        expect(autopayStartOf({ ...START, mode: "CHARGE" })).toBeNull();
        expect(autopayOutcomeOf(OUTCOME)).toEqual(OUTCOME);
        expect(autopayOutcomeOf({ ...OUTCOME, paid: "yes" })).toBeNull();
    });
});
