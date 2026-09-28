import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
    AccountPack,
    AccountPlanTab,
    AccountSubscription,
    AccountView,
} from "./model";
import {
    accountDate,
    packLine,
    pauseEndsOn,
    planClassesLine,
    planLine,
} from "./model";
import type { PlanApi } from "./plan-api";
import { PlanTab } from "./plan-tab";

/**
 * The account's Plan tab in jsdom (round-2 plan A, A8): its words, what a
 * member may press (pause only when the business allows, "Pay now" only
 * when something is overdue), the sheets' calls, and a failed read said as
 * one. The look is the browser pass's.
 */

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/account/plan",
}));

beforeEach(() => {
    router.push.mockReset();
    router.refresh.mockReset();
});

/** Click, and let the action's promise settle. */
async function press(element: Element | undefined) {
    if (!element) throw new Error("nothing to press");
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

const ACCOUNT: AccountView = {
    name: "Farah Khan",
    email: "farah@example.in",
    phone: null,
    businessName: "Pulse Fitness",
    tabs: [
        { key: "home", label: "Home" },
        { key: "plan", label: "Plan" },
        { key: "me", label: "Me" },
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
    // The start of 18 Oct in Kolkata.
    renewsAt: "2026-10-17T18:30:00.000Z",
    pausedUntil: null,
    endsAt: null,
    timezone: "Asia/Kolkata",
    classes: { perMonth: 8, left: 5, resetsAt: "2026-10-31T18:30:00.000Z" },
    payNow: null,
    canPause: true,
    canResume: false,
    canCancel: true,
};

const PACK: AccountPack = {
    name: "5 classes",
    credits: 5,
    left: 3,
    expiresAt: "2026-12-01T00:00:00.000Z",
    live: true,
};

function tabOf(
    subs: AccountSubscription[],
    over: Partial<AccountPlanTab> = {},
): AccountPlanTab {
    return {
        subscriptions: { ok: true, value: subs },
        packs: { ok: true, value: [] },
        pauseWeeks: [2, 4, 8],
        ...over,
    };
}

function api(over: Partial<PlanApi> = {}): PlanApi {
    return {
        pause: vi.fn(),
        resume: vi.fn(),
        cancel: vi.fn(),
        payNow: vi.fn(),
        ...over,
    };
}

describe("the Plan tab's words", () => {
    it("reads a plan's days in its own zone", () => {
        expect(planLine(SUB)).toBe("Next payment 18 Oct 2026");
        expect(
            planLine({
                ...SUB,
                status: "PAUSED",
                renewsAt: null,
                pausedUntil: "2026-10-25T18:30:00.000Z",
            }),
        ).toBe("Paused until 26 Oct 2026 — nothing is charged till then");
        // Without a zone (an API before A8), UTC as before.
        expect(accountDate("2026-10-17T18:30:00.000Z")).toBe("17 Oct 2026");
    });

    it("says classes left, packs, and the day a pause ends", () => {
        expect(planClassesLine(SUB)).toBe("5 of 8 classes left this month");
        expect(planClassesLine({ ...SUB, classes: null })).toBeNull();
        expect(planClassesLine({ ...SUB, status: "PAUSED" })).toBe(
            "8 classes a month · paused",
        );
        expect(packLine(PACK)).toBe("3 of 5 left · use by 1 Dec 2026");
        expect(
            pauseEndsOn(4, "Asia/Kolkata", new Date("2026-09-28T20:00:00Z")),
        ).toBe("27 Oct 2026");
    });
});

describe("PlanTab", () => {
    it("shows the plan with Pause and Cancel, and no Pay now when nothing is overdue", () => {
        render(<PlanTab account={ACCOUNT} tab={tabOf([SUB])} api={api()} />);
        expect(screen.getByText("Monthly 8 · ₹2,500 / month")).toBeTruthy();
        expect(screen.getByText("Next payment 18 Oct 2026")).toBeTruthy();
        expect(screen.getByText("5 of 8 classes left this month")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Pay now" })).toBeNull();
        // No packs: no packs card.
        expect(screen.queryByText("Class packs")).toBeNull();
    });

    it("with pausing off, there is no Pause button and Cancel offers no pause instead", async () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([{ ...SUB, canPause: false }], { pauseWeeks: [] })}
                api={api()}
            />,
        );
        expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        const sheet = await screen.findByRole("dialog");
        expect(within(sheet).queryByText("Pause instead")).toBeNull();
    });

    it("pauses for the weeks chosen and says what happened", async () => {
        const paused: AccountSubscription = {
            ...SUB,
            status: "PAUSED",
            renewsAt: null,
            pausedUntil: "2026-11-07T18:30:00.000Z",
            canPause: false,
            canResume: true,
        };
        const pause = vi.fn().mockResolvedValue({
            ok: true,
            message: "Paused until 8 Nov 2026. Nothing is charged till then.",
            tab: tabOf([paused]),
        });
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([SUB])}
                api={api({ pause })}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Pause" }));
        const sheet = await screen.findByRole("dialog");
        const options = within(sheet).getAllByRole("radio");
        expect(options.map((o) => o.textContent)).toEqual([
            expect.stringMatching(/^2 weeks/),
            expect.stringMatching(/^4 weeks/),
            expect.stringMatching(/^8 weeks/),
        ]);
        // Four weeks is chosen to begin with.
        expect(options.at(1)?.getAttribute("aria-checked")).toBe("true");
        await press(options.at(2));
        await press(
            within(sheet).getByRole("button", { name: "Pause for 8 weeks" }),
        );
        expect(pause).toHaveBeenCalledWith("sub_1", 8);
        await waitFor(() =>
            expect(
                screen.getByText(
                    "Paused until 8 Nov 2026. Nothing is charged till then.",
                ),
            ).toBeTruthy(),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("cancel offers Pause instead first, and a refusal is said in the sheet", async () => {
        const cancel = vi.fn().mockResolvedValue({
            ok: false,
            message: "This plan has already ended.",
        });
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([SUB])}
                api={api({ cancel })}
            />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        let sheet = await screen.findByRole("dialog");
        expect(
            within(sheet).getByText(
                "You keep everything until 18 Oct 2026. Nothing more is charged.",
            ),
        ).toBeTruthy();
        await press(within(sheet).getByRole("button", { name: "Cancel plan" }));
        expect(cancel).toHaveBeenCalledWith("sub_1");
        expect(within(sheet).getByRole("alert").textContent).toBe(
            "This plan has already ended.",
        );
        // Pause instead swaps to the pause sheet.
        fireEvent.click(
            within(sheet).getByRole("button", { name: "Pause instead" }),
        );
        sheet = await screen.findByRole("dialog");
        expect(within(sheet).getByText("Pause your plan")).toBeTruthy();
    });

    it("Pay now shows only for an overdue invoice and goes to the fresh link", async () => {
        const assign = vi.fn();
        const original = window.location;
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...original, assign },
        });
        const payNow = vi
            .fn()
            .mockResolvedValue({ ok: true, url: "https://saroh.app/pay/tok" });
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([
                    {
                        ...SUB,
                        payNow: {
                            total: "2500.00",
                            currency: "INR",
                            dueAt: "2026-09-20T00:00:00.000Z",
                        },
                    },
                ])}
                api={api({ payNow })}
            />,
        );
        expect(
            screen.getByText("₹2,500 is overdue since 20 Sept 2026"),
        ).toBeTruthy();
        expect(screen.getByText("Needs you")).toBeTruthy();
        await press(screen.getByRole("button", { name: "Pay now" }));
        expect(payNow).toHaveBeenCalledWith("sub_1");
        expect(assign).toHaveBeenCalledWith("https://saroh.app/pay/tok");
        Object.defineProperty(window, "location", {
            configurable: true,
            value: original,
        });
    });

    it("a refused Pay now says why and stays on the page", async () => {
        const payNow = vi.fn().mockResolvedValue({
            ok: false,
            message: "Autopay charge in progress",
        });
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([
                    {
                        ...SUB,
                        payNow: {
                            total: "2500.00",
                            currency: "INR",
                            dueAt: null,
                        },
                    },
                ])}
                api={api({ payNow })}
            />,
        );
        await press(screen.getByRole("button", { name: "Pay now" }));
        expect(screen.getByRole("alert").textContent).toBe(
            "Autopay charge in progress",
        );
        expect(
            screen
                .getByRole("button", { name: "Pay now" })
                .hasAttribute("disabled"),
        ).toBe(false);
    });

    it("with no plan, See plans goes to the site's Prices page (G20)", () => {
        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([])}
                api={api()}
                plansHref="/prices"
            />,
        );
        expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute(
            "href",
            "/prices",
        );
    });

    it("lists packs, a used-up one as such, and says when a part couldn't be read", () => {
        const { unmount } = render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([], {
                    packs: {
                        ok: true,
                        value: [PACK, { ...PACK, left: 0, live: false }],
                    },
                })}
                api={api()}
            />,
        );
        expect(screen.getByText("No plan yet")).toBeTruthy();
        expect(
            screen.getByText("You're not on a plan with Pulse Fitness."),
        ).toBeTruthy();
        // No Prices page on the site: nowhere to send them.
        expect(screen.queryByRole("link", { name: "See plans" })).toBeNull();
        expect(screen.getByText("Active")).toBeTruthy();
        expect(screen.getByText("Used up")).toBeTruthy();
        unmount();

        render(
            <PlanTab
                account={ACCOUNT}
                tab={tabOf([], {
                    subscriptions: { ok: false },
                    packs: { ok: false },
                })}
                api={api()}
            />,
        );
        expect(
            screen.getByText(
                "Your plan couldn't be loaded. Refresh the page to try again.",
            ),
        ).toBeTruthy();
        expect(
            screen.getByText(
                "Your packs couldn't be loaded. Refresh the page to try again.",
            ),
        ).toBeTruthy();
        expect(screen.queryByText("No plan yet")).toBeNull();
    });
});
