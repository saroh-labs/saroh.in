import type { RenderedPacks, RenderedPlans } from "@saroh/block-contract";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CodeRequestResult,
    SignInApi,
    SignInOptions,
} from "../account/api";
import type { PacksApi } from "../account/packs-api";
import type { PacksFeed, PublicPack } from "../blocks/packs";
import PacksSection, { packEyebrow, packPerClass } from "../blocks/packs";
import type { PlansFeed, PublicPlan } from "../blocks/plans";
import PlansSection from "../blocks/plans";
import type { OpenCheckout } from "../booking-flow/checkout";
import type {
    JoinApi,
    JoinResult,
    PlanJoinAttempt,
    PlanJoinStarted,
    PricesActions,
} from "./api";

/**
 * Join and Buy on the site's Prices page in jsdom (round-2 G20): the Plans
 * block's Join and the Class packs block's Buy, signing in first (always on,
 * no guest path), the join sheet's words (no autopay where the provider
 * takes none; D12's is `autopay/autopay.test.tsx`), the
 * provider window on the server's payment, the wait for the webhook, and
 * "Ask about…" where the business can't take the payment online. The look
 * is the browser pass's.
 */

// The page's own provider window, answered by whichever test set it.
const pageWindow: { open: OpenCheckout | null } = { open: null };
vi.mock("../booking-flow/checkout", () => ({
    openProviderCheckout: ((request) => {
        if (!pageWindow.open) throw new Error("no window set");
        return pageWindow.open(request);
    }) as OpenCheckout,
}));

beforeEach(() => {
    pageWindow.open = vi.fn(() => ({
        outcome: Promise.resolve("paid" as const),
        close: vi.fn(),
    }));
});

async function press(element: Element | undefined | null) {
    if (!element) throw new Error("nothing to press");
    await act(async () => {
        fireEvent.click(element);
        await Promise.resolve();
    });
}

const OPTIONS: SignInOptions = {
    businessName: "Pulse Fitness",
    phone: null,
    challenge: { required: false, siteKey: null },
};

const MONTHLY: PublicPlan = {
    id: "plan_monthly",
    name: "Monthly unlimited",
    description: "Every class, every day.",
    price: "2500.00",
    currency: "INR",
    interval: "MONTH",
    mostChosen: true,
};

const TEN: PublicPack = {
    id: "pack_10",
    name: "10 classes",
    description: "Any group class.",
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
    kind: "CLASSES",
    singlePrice: "600.00",
};

const HANDOFF = {
    provider: "RAZORPAY",
    amountCents: 250000,
    currency: "INR",
    providerIntentId: "order_1",
    publicKey: "rzp_test_1",
    clientParams: { razorpayOrderId: "order_1" },
};

const STARTED: PlanJoinStarted = {
    ref: "inv_join",
    plan: { name: "Monthly unlimited", interval: "MONTH" },
    total: "2500.00",
    currency: "INR",
    payment: HANDOFF,
};

function actions(
    over: {
        signedIn?: boolean;
        code?: CodeRequestResult;
        phone?: string | null;
        join?: JoinResult<PlanJoinStarted>[];
        standing?: JoinResult<PlanJoinAttempt>;
    } = {},
) {
    const joins = [...(over.join ?? [])];
    const join = vi.fn<JoinApi["join"]>(() =>
        Promise.resolve(joins.shift() ?? { ok: true, data: STARTED }),
    );
    const standing = vi.fn<JoinApi["standing"]>(() =>
        Promise.resolve(
            over.standing ?? {
                ok: true,
                data: {
                    state: "joined",
                    plan: { name: "Monthly unlimited" },
                },
            },
        ),
    );
    const signIn: SignInApi = {
        requestCode: vi.fn(() =>
            Promise.resolve(
                over.code ?? { ok: true as const, resendAfterSeconds: 30 },
            ),
        ),
        verifyCode: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                customer: { email: "asha@example.in", name: "Asha" },
            }),
        ),
    };
    const packs: PacksApi = {
        buy: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                data: {
                    ref: "inv_pack",
                    pack: { name: "10 classes", credits: 10, validityDays: 60 },
                    total: "4500.00",
                    currency: "INR",
                    payment: HANDOFF,
                },
            }),
        ),
        standing: vi.fn(() =>
            Promise.resolve({
                ok: true as const,
                data: {
                    state: "bought" as const,
                    pack: { name: "10 classes", credits: 10 },
                    expiresAt: "2026-12-01T00:00:00.000Z",
                },
            }),
        ),
    };
    const prices: PricesActions = {
        businessName: "Pulse Fitness",
        customer: over.signedIn
            ? { email: "asha@example.in", name: "Asha" }
            : null,
        signInOptions: { ...OPTIONS, phone: over.phone ?? null },
        signIn,
        join: { join, standing },
        packs,
        accountHref: "/account/plan",
    };
    return { prices, join, standing, signIn, packs };
}

const PLANS: RenderedPlans = { variant: "default", title: "Memberships" };
const PACKS: RenderedPacks = { variant: "default", title: "Class packs" };

function plansFeed(over: Partial<PlansFeed> = {}): PlansFeed {
    return {
        plans: [MONTHLY],
        joinHref: "/contact#enquiry",
        payOnline: true,
        ...over,
    };
}

function packsFeed(over: Partial<PacksFeed> = {}): PacksFeed {
    return {
        packs: [TEN],
        payOnline: true,
        askHref: "/contact#enquiry",
        ...over,
    };
}

async function signInAsAsha() {
    expect(
        await screen.findByText(
            "Last step: confirm it's you, then we'll finish. No password.",
        ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "asha@example.in" },
    });
    await press(screen.getByRole("button", { name: "Send code" }));
    fireEvent.change(await screen.findByLabelText("Code"), {
        target: { value: "123456" },
    });
    await press(screen.getByRole("button", { name: "Sign in" }));
}

describe("Join on the Plans block", () => {
    it("signs in first, then joins: the design's sheet, the provider window, joined once the server says so", async () => {
        const { prices, join, standing } = actions();
        render(
            <PlansSection content={PLANS} feed={plansFeed()} prices={prices} />,
        );

        await press(
            screen.getByRole("button", { name: "Join: Monthly unlimited" }),
        );
        await signInAsAsha();

        const sheet = await screen.findByRole("dialog", {
            name: "Monthly unlimited",
        });
        expect(sheet).toHaveTextContent("Every class, every day.");
        expect(sheet).toHaveTextContent("Every month");
        expect(sheet).toHaveTextContent("Starts");
        expect(sheet).toHaveTextContent("Today");
        // No autopay where the provider takes none, and no way to pay
        // named (D12, DEC-059).
        expect(sheet.textContent).not.toMatch(/autopay|upi|card/i);
        expect(join).not.toHaveBeenCalled();

        await press(
            within(sheet).getByRole("button", {
                name: "Start Monthly unlimited · ₹2,500",
            }),
        );
        expect(join).toHaveBeenCalledWith(
            "plan_monthly",
            expect.stringMatching(/^join-[A-Za-z0-9_-]+$/),
        );
        expect(pageWindow.open).toHaveBeenCalledWith(
            expect.objectContaining({
                handoff: HANDOFF,
                business: "Pulse Fitness",
                booker: { name: "Asha", email: "asha@example.in" },
            }),
        );

        const done = await screen.findByText(
            "You're on Monthly unlimited. Welcome.",
        );
        expect(standing).toHaveBeenCalledWith("inv_join");
        expect(done.closest("[role=status]")).not.toBeNull();
        expect(
            screen.getByRole("link", { name: "See it in your account" }),
        ).toHaveAttribute("href", "/account/plan");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("opens the sheet at once for a customer already signed in", async () => {
        const { prices } = actions({ signedIn: true });
        render(
            <PlansSection content={PLANS} feed={plansFeed()} prices={prices} />,
        );
        await press(screen.getByRole("button", { name: /^Join/ }));
        expect(
            screen.getByRole("dialog", { name: "Monthly unlimited" }),
        ).toBeInTheDocument();
    });

    it("says the code couldn't be sent, with the business's phone, and joins nothing", async () => {
        const { prices, join } = actions({
            code: { ok: false, reason: "unavailable" },
            phone: "+91 80 4000 1234",
        });
        render(
            <PlansSection content={PLANS} feed={plansFeed()} prices={prices} />,
        );
        await press(screen.getByRole("button", { name: /^Join/ }));
        await screen.findByLabelText("Email");
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "asha@example.in" },
        });
        await press(screen.getByRole("button", { name: "Send code" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn't send your code — try again in a few minutes",
        );
        expect(
            screen.getByRole("link", {
                name: "Or call Pulse Fitness on +91 80 4000 1234",
            }),
        ).toBeInTheDocument();
        expect(join).not.toHaveBeenCalled();
        expect(
            screen.queryByRole("dialog", { name: "Monthly unlimited" }),
        ).toBeNull();
    });

    it("says why when the business can't take it online, and signs in again when the session ended", async () => {
        const { prices, join } = actions({
            signedIn: true,
            join: [
                {
                    ok: false,
                    reason: "ask",
                    message:
                        "This business isn't taking payments online right now. Ask them about joining.",
                },
                { ok: false, reason: "signed-out", message: "Signed out" },
            ],
        });
        render(
            <PlansSection content={PLANS} feed={plansFeed()} prices={prices} />,
        );
        await press(screen.getByRole("button", { name: /^Join/ }));
        const start = screen.getByRole("button", { name: /^Start / });
        await press(start);
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Ask them about joining.",
        );

        await press(screen.getByRole("button", { name: /^Start / }));
        expect(join).toHaveBeenCalledTimes(2);
        expect(
            await screen.findByText(
                "Last step: confirm it's you, then we'll finish. No password.",
            ),
        ).toBeInTheDocument();
    });

    it("asks about joining where the business can't take the payment online (Payments with no provider)", () => {
        const { prices } = actions({ signedIn: true });
        render(
            <PlansSection
                content={PLANS}
                feed={plansFeed({ payOnline: false })}
                prices={prices}
            />,
        );
        expect(screen.queryByRole("button", { name: /^Join/ })).toBeNull();
        expect(
            screen.getByRole("link", {
                name: "Ask about joining: Monthly unlimited",
            }),
        ).toHaveAttribute("href", "/contact?join=Monthly%20unlimited#enquiry");
    });

    it("asks about joining where the site hands in no actions (the account area off)", () => {
        render(<PlansSection content={PLANS} feed={plansFeed()} />);
        expect(screen.queryByRole("button")).toBeNull();
        expect(
            screen.getByRole("link", { name: /^Ask about joining/ }),
        ).toBeInTheDocument();
    });
});

describe("the Class packs block", () => {
    it("says how many classes, for how long, and the price per class against one class", () => {
        expect(packEyebrow(TEN)).toBe("10 classes · use within 60 days");
        expect(packPerClass(TEN)).toBe("₹450 a class instead of ₹600");
        expect(
            packEyebrow({
                ...TEN,
                kind: "ONE_TO_ONE",
                credits: 1,
                validityDays: 1,
            }),
        ).toBe("1 session · use within 1 day");
        // Nothing cheaper to say: the price per class alone.
        expect(packPerClass({ ...TEN, singlePrice: null })).toBe(
            "₹450 a class",
        );
        expect(packPerClass({ ...TEN, singlePrice: "400.00" })).toBe(
            "₹450 a class",
        );
    });

    it("draws each pack as the design's card, and nothing when there are none", () => {
        const { container, rerender } = render(
            <PacksSection content={PACKS} feed={packsFeed()} />,
        );
        const card = screen.getByRole("listitem");
        expect(card).toHaveTextContent("10 classes · use within 60 days");
        expect(card).toHaveTextContent("₹450 a class instead of ₹600");
        expect(card).toHaveTextContent("Any group class.");
        expect(card).toHaveTextContent("₹4,500");

        rerender(
            <PacksSection
                content={{ ...PACKS, showDescriptions: false }}
                feed={packsFeed()}
            />,
        );
        expect(screen.queryByText("Any group class.")).toBeNull();

        rerender(
            <PacksSection content={PACKS} feed={packsFeed({ packs: [] })} />,
        );
        expect(container.innerHTML).toBe("");
    });

    it("signs in first, then buys through A11's sheet, and says it's bought", async () => {
        const { prices, packs } = actions();
        render(
            <PacksSection content={PACKS} feed={packsFeed()} prices={prices} />,
        );
        await press(screen.getByRole("button", { name: "Buy: 10 classes" }));
        await signInAsAsha();

        const sheet = await screen.findByRole("dialog", { name: "10 classes" });
        expect(sheet).toHaveTextContent("10 credits to use within 60 days.");
        await press(
            within(sheet).getByRole("button", { name: "Buy · ₹4,500" }),
        );
        expect(packs.buy).toHaveBeenCalledWith("pack_10", expect.any(String));
        expect(
            await screen.findByText(
                "10 classes bought. Book a class to use one.",
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "See it in your account" }),
        ).toHaveAttribute("href", "/account/plan");
    });

    it("asks about the pack where the business can't take the payment online, and draws no button with no enquiry form", () => {
        const { prices } = actions({ signedIn: true });
        const { rerender } = render(
            <PacksSection
                content={PACKS}
                feed={packsFeed({ payOnline: false })}
                prices={prices}
            />,
        );
        expect(
            screen.getByRole("link", {
                name: "Ask about this pack: 10 classes",
            }),
        ).toHaveAttribute("href", "/contact?pack=10%20classes#enquiry");

        rerender(
            <PacksSection
                content={PACKS}
                feed={packsFeed({ payOnline: false, askHref: null })}
                prices={prices}
            />,
        );
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("the merchant's own button words", () => {
        render(
            <PacksSection
                content={{ ...PACKS, buttonLabel: "Get this pack" }}
                feed={packsFeed({ payOnline: false })}
            />,
        );
        expect(
            screen.getByRole("link", { name: "Get this pack: 10 classes" }),
        ).toBeInTheDocument();
    });
});

describe("the Class packs block on the editor's canvas", () => {
    it("says what will show with no site, and why it's empty when nothing is on sale", async () => {
        const { unmount } = render(<PacksSection content={PACKS} />);
        expect(screen.getByRole("status")).toHaveTextContent(
            "Your class packs on sale show here on your live site",
        );
        unmount();

        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(new Response(null, { status: 404 }));
        render(
            <PacksSection
                content={PACKS}
                siteId="site_1"
                apiUrl="https://api"
            />,
        );
        expect(
            await screen.findByText(/No packs on sale yet/),
        ).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
            "https://api/public/sites/site_1/packs",
            expect.anything(),
        );
        // Never names a module switch (DEC-057).
        expect(document.body.textContent).not.toMatch(
            /switched|turn on|is off|isn.t on/i,
        );
        fetchMock.mockRestore();
    });

    it("draws the packs it reads, the button in the live site's words", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ payOnline: true, packs: [TEN] }), {
                status: 200,
            }),
        );
        render(
            <PacksSection
                content={PACKS}
                siteId="site_1"
                apiUrl="https://api"
            />,
        );
        expect(await screen.findByText("10 classes")).toBeInTheDocument();
        expect(screen.getByText("Buy")).toBeInTheDocument();
        // Drawn, not followed.
        expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
        fetchMock.mockRestore();
    });
});
