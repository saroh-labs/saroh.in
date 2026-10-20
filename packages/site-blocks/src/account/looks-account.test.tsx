import type { LookId } from "@saroh/block-contract";
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteChromeFrame } from "./account-header";
import type { CodeRequestResult, SignInApi, VerifyResult } from "./api";
import { AccountBookingsTab } from "./bookings-list";
import { AccountLookFrame } from "./look-account";
import { ACCOUNT_PARTS, accountLookRules } from "./look-account-rules";
import {
    backWords,
    greetingWords,
    lookAccountTitle,
    lookTabLabel,
} from "./look-account-words";
import { LookSignIn } from "./look-sign-in";
import type { AccountPlanTab, AccountTab, AccountView } from "./model";
import { AccountOrders, OrderRow } from "./orders-list";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    Tag,
} from "./parts";
import { PlanTab } from "./plan-tab";

/**
 * The customer's account in each look (DEC-172, plan U12): the tabs are a
 * nav of links that follow the business's modules, "Details" is the tab
 * and "Your details" the page, the page's one heading is the look's,
 * signing in asks the code on the page with the same words for every
 * email, orders say their stage in one set of words, and her plan comes
 * first. Classic is held by `classic-account-pin.test.tsx`.
 */

const nav = vi.hoisted(() => ({
    pathname: "/account",
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: nav.push,
        replace: nav.replace,
        refresh: nav.refresh,
    }),
    usePathname: () => nav.pathname,
    useSearchParams: () => new URLSearchParams(),
}));

const LOOKS: LookId[] = ["folio", "quiet", "live"];

/** A studio's tabs: bookings, a plan, messages; no shop. */
const STUDIO: AccountTab[] = [
    { key: "home", label: "Home" },
    { key: "bookings", label: "Bookings" },
    { key: "plan", label: "Plan" },
    { key: "messages", label: "Messages" },
    { key: "me", label: "Your details" },
];

/** A bakery's: orders, no bookings. */
const BAKERY: AccountTab[] = [
    { key: "home", label: "Home" },
    { key: "orders", label: "Orders" },
    { key: "messages", label: "Messages" },
    { key: "me", label: "Your details" },
];

const ACCOUNT: AccountView = {
    name: "Asha Kumar",
    email: "asha.kumar@example.com",
    phone: null,
    businessName: "Prana Yoga",
    tabs: STUDIO,
    offers: { appointments: true, orders: false, plans: true },
    bookingsLabel: "Bookings",
    healthNotes: false,
};

function frame(
    look: LookId,
    tabs: AccountTab[] = STUDIO,
    extra: Partial<Parameters<typeof AccountLookFrame>[0]> = {},
) {
    return render(
        <AccountLookFrame
            look={look}
            businessName="Prana Yoga"
            tabs={tabs}
            name="Asha Kumar"
            greeting="Good morning"
            {...extra}
        >
            <p>The page</p>
        </AccountLookFrame>,
    );
}

/** The tabs' row at the top (on a phone too under Quiet). */
function tabRow(): HTMLElement {
    const row = document.querySelector<HTMLElement>("[data-account-tabs]");
    if (!row) throw new Error("no tab row");
    return row;
}

beforeEach(() => {
    nav.pathname = "/account";
    nav.replace.mockReset();
    nav.push.mockReset();
    nav.refresh.mockReset();
    window.sessionStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("the account's tabs in each look", () => {
    for (const look of LOOKS) {
        describe(look, () => {
            it("are a nav of links, not a tablist, with the page marked", () => {
                nav.pathname = "/account/bookings";
                frame(look);
                const tabs = tabRow();
                expect(tabs.tagName).toBe("NAV");
                expect(tabs).toHaveAttribute("aria-label", "Account pages");
                expect(screen.queryByRole("tablist")).toBeNull();
                expect(screen.queryByRole("tab")).toBeNull();
                const links = within(tabs).getAllByRole("link");
                expect(links.map((a) => a.textContent)).toEqual([
                    "Home",
                    "Bookings",
                    "Plan",
                    "Messages",
                    "Details",
                ]);
                expect(
                    within(tabs).getByRole("link", { name: "Bookings" }),
                ).toHaveAttribute("aria-current", "page");
                expect(
                    within(tabs).getByRole("link", { name: "Home" }),
                ).not.toHaveAttribute("aria-current");
                expect(
                    within(tabs).getByRole("link", { name: "Details" }),
                ).toHaveAttribute("href", "/account/me");
            });

            it("follow the business's modules: a bakery has Orders, no Bookings", () => {
                frame(look, BAKERY);
                const tabs = tabRow();
                expect(
                    within(tabs)
                        .getAllByRole("link")
                        .map((a) => a.textContent),
                ).toEqual(["Home", "Orders", "Messages", "Details"]);
            });

            it("are each at least 44px tall", () => {
                frame(look);
                for (const link of within(tabRow()).getAllByRole("link")) {
                    expect(link.className).toContain("min-h-11");
                }
            });

            it("scroll inside their own row on a phone, never the page", () => {
                frame(look);
                const row = tabRow().querySelector("a")?.parentElement;
                expect(row?.className).toContain("overflow-x-auto");
                // The fades are drawn, and hidden until there is more.
                const fades = document.querySelectorAll(
                    "[data-account-tabs-fade]",
                );
                expect(fades).toHaveLength(2);
                for (const fade of Array.from(fades)) {
                    expect(fade).toHaveAttribute("aria-hidden", "true");
                    expect(fade.className).toContain("opacity-0");
                }
            });

            it("mark Messages while the business has written", () => {
                frame(look, STUDIO, { unreadMessages: 2 });
                for (const link of screen.getAllByRole("link", {
                    name: /Messages/,
                })) {
                    expect(link).toHaveTextContent("(2 new)");
                }
            });

            it("put the look's stylesheet and mark around the page", () => {
                const { container } = frame(look);
                const root = container.querySelector(
                    `[data-account-look="${look}"]`,
                );
                expect(root).not.toBeNull();
                expect(root?.querySelector("style")?.textContent).toContain(
                    `[data-account-look="${look}"]`,
                );
                expect(root?.querySelector("main")).toHaveAttribute(
                    "data-site-page",
                );
            });
        });
    }

    it("Quiet wears no fixed bar: the phone's one bar is Book's", () => {
        const { container } = frame("quiet");
        expect(container.innerHTML).not.toMatch(/\bfixed\b/);
        expect(tabRow().className).not.toContain("max-[699px]:hidden");
    });

    for (const look of ["folio", "live"] as const) {
        it(`${look} puts the tabs in one bar at a phone's foot`, () => {
            nav.pathname = "/account/me";
            const { container } = frame(look);
            const bars = container.querySelectorAll(
                '[data-site-chrome-bar="account"]',
            );
            expect(bars).toHaveLength(1);
            const bar = bars[0] as HTMLElement;
            expect(bar.tagName).toBe("NAV");
            expect(bar).toHaveAttribute("aria-label", "Account pages");
            expect(bar).toHaveAttribute("data-account-bar", look);
            expect(bar.className).toContain("fixed");
            // A phone's only: a desk has the row (or the column).
            expect(bar.className).toContain("min-[700px]:hidden");
            // It steps aside while a sheet or the banner holds the foot.
            expect(bar.className).toContain(
                "[html[data-site-bar=none]_&]:hidden",
            );
            // The row at the top is a desk's only, so one nav per size.
            expect(tabRow().className).toContain("max-[699px]:hidden");
            // (Hidden from the desk-sized test page, as a phone's only.)
            expect(
                within(bar)
                    .getAllByRole("link", { hidden: true })
                    .map((a) => a.textContent),
            ).toEqual(["Home", "Bookings", "Plan", "Messages", "Details"]);
            expect(
                within(bar).getByRole("link", {
                    name: "Details",
                    hidden: true,
                }),
            ).toHaveAttribute("aria-current", "page");
            // Never a tablist: each tab is its own page.
            expect(within(bar).queryByRole("tab", { hidden: true })).toBeNull();
        });
    }

    it("draw no bar while signed out", () => {
        const { container } = frame("folio", []);
        expect(
            container.querySelector('[data-site-chrome-bar="account"]'),
        ).toBeNull();
    });

    it("leave Sign out beside the tabs on a desk", async () => {
        const signOut = vi.fn().mockResolvedValue({ ok: true });
        frame("quiet", STUDIO, { signOut });
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
        expect(signOut).toHaveBeenCalledOnce();
        expect(nav.refresh).toHaveBeenCalled();
    });
});

describe("the page's one heading", () => {
    it("greets her on Home in Folio and Quiet, by first name, set apart", () => {
        for (const look of ["folio", "quiet"] as const) {
            const { unmount } = frame(look);
            const h1 = screen.getByRole("heading", { level: 1 });
            expect(h1).toHaveTextContent("Good morning, Asha.");
            expect(h1.querySelector("i")).toHaveTextContent("Asha");
            unmount();
        }
    });

    it("says Hi on Live's Home", () => {
        frame("live");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Hi, Asha.",
        );
    });

    it("is Your details on Details, and the tab's word elsewhere", () => {
        nav.pathname = "/account/me";
        const { unmount } = frame("quiet");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Your details",
        );
        unmount();
        nav.pathname = "/account/plan";
        frame("quiet");
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Plan",
        );
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("names a thing's own page for the thing", () => {
        const title = (pathname: string) =>
            lookAccountTitle({
                pathname,
                tabs: STUDIO,
                name: "Asha",
                look: "folio",
                greeting: "Good evening",
            }).text;
        expect(title("/account/orders/ord_1")).toBe("Your order");
        expect(title("/account/bookings/bk_1")).toBe("Your booking");
        expect(title("/account/receipts/inv_1")).toBe("Receipt");
    });

    it("greets by the hour on the business's clock", () => {
        // 7:30 am in Bengaluru is 2:00 am UTC.
        expect(greetingWords("2026-10-20T02:00:00.000Z", "Asia/Kolkata")).toBe(
            "Good morning",
        );
        expect(greetingWords("2026-10-20T09:00:00.000Z", "Asia/Kolkata")).toBe(
            "Good afternoon",
        );
        expect(greetingWords("2026-10-20T14:00:00.000Z", "Asia/Kolkata")).toBe(
            "Good evening",
        );
        // An unknown zone reads India's clock, never throws.
        expect(greetingWords("2026-10-20T02:00:00.000Z", "Mars/Base")).toBe(
            "Good morning",
        );
    });

    it("labels Your details' tab Details, and keeps every other word", () => {
        expect(STUDIO.map(lookTabLabel)).toEqual([
            "Home",
            "Bookings",
            "Plan",
            "Messages",
            "Details",
        ]);
    });
});

describe("the site's header and footer stay around a look's account", () => {
    const draw = (look?: LookId) =>
        renderToStaticMarkup(
            <SiteChromeFrame
                account
                look={look}
                header={<header>site header</header>}
                footer={<footer>site footer</footer>}
            >
                <main>page</main>
            </SiteChromeFrame>,
        );

    it("under every look", () => {
        for (const look of LOOKS) {
            const html = draw(look);
            expect(html).toContain("site header");
            expect(html).toContain("site footer");
        }
    });

    it("and are left out for Classic, as before", () => {
        const html = draw();
        expect(html).not.toContain("site header");
        expect(html).not.toContain("site footer");
    });
});

describe("the look's stylesheet finds the account's parts", () => {
    it("by the classes each part carries", () => {
        const { container } = render(
            <AccountCard labelledBy="c" title="Card" needsYou>
                <AccountRow
                    title="Row"
                    tag={<Tag tone="quiet">Tag</Tag>}
                    actions={
                        <button type="button" className={smallButton}>
                            Act
                        </button>
                    }
                />
                <a href="/x" className={buttonClasses(true)}>
                    Go
                </a>
            </AccountCard>,
        );
        const card = container.querySelector("section");
        expect(card?.matches(ACCOUNT_PARTS.card)).toBe(true);
        expect(card?.matches(ACCOUNT_PARTS.cardNeedsYou)).toBe(true);
        expect(
            screen
                .getByRole("heading", { name: "Card" })
                .matches(ACCOUNT_PARTS.cardTitle),
        ).toBe(true);
        expect(
            screen
                .getByText("Row")
                .closest("span")
                ?.matches(ACCOUNT_PARTS.rowTitle),
        ).toBe(true);
        expect(screen.getByText("Tag").matches(ACCOUNT_PARTS.tag)).toBe(true);
        expect(
            screen
                .getByRole("button", { name: "Act" })
                .matches(ACCOUNT_PARTS.button),
        ).toBe(true);
        expect(
            screen
                .getByRole("link", { name: "Go" })
                .matches(ACCOUNT_PARTS.button),
        ).toBe(true);
    });

    it("draws from the business's tokens only, never a colour of its own", () => {
        for (const look of LOOKS) {
            const css = accountLookRules(look);
            expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
            expect(css).not.toMatch(/rgb\(|oklch\(/i);
            for (const name of css.match(/--[a-z-]+/g) ?? []) {
                expect(name).toMatch(/^--site-/);
            }
            // Corners: the small radius for cards and fields, the look's
            // own (a pill under Quiet) for its buttons only.
            expect(css).toContain("var(--site-radius-s");
            expect(css).toMatch(
                /button\[class\*="rounded-\[calc\(var\(--site-radius\)\+8px\)\]"\][^{]*\{\s*border-radius: var\(--site-radius\);/,
            );
        }
    });
});

describe("signing in on the account's page, in a look", () => {
    const OPTIONS = {
        businessName: "Prana Yoga",
        phone: null,
        challenge: { required: false, siteKey: null },
    };

    function api(
        verify: VerifyResult = {
            ok: true,
            customer: { email: "asha.kumar@example.com", name: "Asha Kumar" },
        },
    ) {
        const sent: string[] = [];
        const signIn: SignInApi = {
            requestCode: (email: string): Promise<CodeRequestResult> => {
                sent.push(email);
                return Promise.resolve({ ok: true, resendAfterSeconds: 30 });
            },
            verifyCode: (): Promise<VerifyResult> => Promise.resolve(verify),
        };
        return { signIn, sent };
    }

    function draw(look: LookId, a = api()) {
        return render(
            <LookSignIn
                look={look}
                options={OPTIONS}
                api={a.signIn}
                lead="Sign in to see your bookings with Prana Yoga."
            />,
        );
    }

    async function sendFor(email: string) {
        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: email },
        });
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", { name: "Send me a code" }),
            );
            await Promise.resolve();
        });
    }

    for (const look of LOOKS) {
        it(`${look}: one filled button, then the code under the email`, async () => {
            const a = api();
            draw(look, a);
            expect(
                screen.getByRole("button", { name: "Send me a code" }),
            ).toHaveAttribute("data-site-primary");
            await sendFor("asha.kumar@example.com");
            expect(a.sent).toEqual(["asha.kumar@example.com"]);
            expect(
                screen.getByText(
                    "We sent a 6-digit code to asha.kumar@example.com to confirm it's you.",
                ),
            ).toBeInTheDocument();
            expect(screen.getByLabelText("Code")).toHaveAttribute(
                "autocomplete",
                "one-time-code",
            );
            // The button gives way to the code field.
            expect(
                screen.queryByRole("button", { name: "Send me a code" }),
            ).toBeNull();
        });
    }

    it("says the same to a new address and a known one", async () => {
        const words: string[] = [];
        for (const email of ["new@example.com", "asha.kumar@example.com"]) {
            const { container, unmount } = draw("quiet");
            await sendFor(email);
            words.push(container.textContent.replace(email, "‹email›"));
            unmount();
            window.sessionStorage.clear();
        }
        expect(words[0]).toBe(words[1]);
    });

    it("stays on the account page that asked, when nothing opened it", async () => {
        nav.pathname = "/account/messages";
        draw("folio");
        await sendFor("asha.kumar@example.com");
        await act(async () => {
            fireEvent.change(screen.getByLabelText("Code"), {
                target: { value: "123456" },
            });
            await Promise.resolve();
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Signed in.",
        );
        expect(nav.replace).not.toHaveBeenCalled();
        expect(nav.refresh).toHaveBeenCalled();
    });

    it("goes back to the page Sign in was pressed on, and says so", async () => {
        window.sessionStorage.setItem(
            "saroh.sign-in-opener",
            JSON.stringify({
                from: "/timetable?day=2",
                title: "Timetable",
                to: "/account",
            }),
        );
        draw("quiet");
        expect(
            await screen.findByText(/You'll come back to Timetable\./),
        ).toBeInTheDocument();
        await sendFor("asha.kumar@example.com");
        await act(async () => {
            fireEvent.change(screen.getByLabelText("Code"), {
                target: { value: "123456" },
            });
            await Promise.resolve();
        });
        expect(await screen.findByRole("status")).toHaveTextContent(
            "Signed in. Taking you back to Timetable…",
        );
        expect(nav.replace).toHaveBeenCalledWith("/timetable?day=2");
        expect(window.sessionStorage.getItem("saroh.sign-in-opener")).toBe(
            null,
        );
    });

    it("never goes back off the site", () => {
        expect(backWords({ from: "/", title: "Prana Yoga" })).toBe(
            "the home page",
        );
        window.sessionStorage.setItem(
            "saroh.sign-in-opener",
            JSON.stringify({
                from: "//evil.example.com/",
                title: "x",
                to: "/account",
            }),
        );
        draw("live");
        expect(screen.queryByText(/come back/)).toBeNull();
    });
});

describe("orders in one set of words", () => {
    const ORDER = {
        ref: "ord_1",
        number: "1093",
        placedAt: "2026-10-19T13:12:00.000Z",
        total: "560.00",
        currency: "INR",
        open: true,
        status: "Preparing",
        fulfilment: "Pick-up",
        items: [{ name: "Country sourdough", quantity: 1 }],
        moreItems: 0,
    };

    for (const look of LOOKS) {
        it(`${look}: a pick-up being made is for pick-up, never on its way`, () => {
            render(<OrderRow order={ORDER} look={look} />);
            expect(
                screen.getByText("Being made · for pick-up"),
            ).toBeInTheDocument();
            expect(document.body.textContent).not.toMatch(/on its way/i);
        });
    }

    it("keeps the API's word for Classic", () => {
        render(<OrderRow order={ORDER} />);
        expect(screen.getByText("Preparing")).toBeInTheDocument();
    });

    it("on the Orders tab too", () => {
        render(
            <AccountOrders
                orders={{
                    ok: true,
                    value: [
                        ORDER,
                        {
                            ...ORDER,
                            ref: "ord_2",
                            number: "1094",
                            status: "Out for delivery",
                            fulfilment: "Local delivery",
                        },
                    ],
                }}
                track={null}
                businessName="Rye & Co."
                shopHref={null}
                messagesHref={null}
                look="quiet"
            />,
        );
        expect(
            screen.getByText("Being made · for pick-up"),
        ).toBeInTheDocument();
        expect(screen.getByText("On its way")).toBeInTheDocument();
    });
});

describe("her plan first", () => {
    const TAB: AccountPlanTab = {
        subscriptions: { ok: true, value: [] },
        packs: {
            ok: true,
            value: [
                {
                    name: "10-class pack",
                    credits: 10,
                    left: 7,
                    expiresAt: "2027-01-18T00:00:00.000Z",
                    live: true,
                },
            ],
        },
        pauseWeeks: [2, 4, 8],
    };
    const PLAN_API = {
        pause: vi.fn(),
        resume: vi.fn(),
        cancel: vi.fn(),
        payNow: vi.fn(),
    };

    it("puts a pack holder's pack first, and plans in one line under it", () => {
        const { container } = render(
            <PlanTab
                account={ACCOUNT}
                tab={TAB}
                api={PLAN_API}
                plansHref="/prices"
                look="folio"
            />,
        );
        const text = container.textContent;
        expect(text.indexOf("10-class pack")).toBeLessThan(
            text.indexOf("You're not on a membership"),
        );
        expect(screen.queryByText("No plan yet")).toBeNull();
        expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute(
            "href",
            "/prices",
        );
    });

    it("keeps Classic's No plan yet card above the packs", () => {
        const { container } = render(
            <PlanTab
                account={ACCOUNT}
                tab={TAB}
                api={PLAN_API}
                plansHref="/prices"
            />,
        );
        const text = container.textContent;
        expect(text.indexOf("No plan yet")).toBeLessThan(
            text.indexOf("10-class pack"),
        );
    });
});

describe("Bookings on with none booked", () => {
    it("shows the Bookings tab and its empty state", () => {
        frame("quiet");
        expect(screen.getByRole("link", { name: "Bookings" })).toBeVisible();
        render(
            <AccountBookingsTab
                bookings={{
                    ok: true,
                    value: {
                        comingUp: [],
                        past: [],
                        cancelled: [],
                        treatments: [],
                    },
                }}
                businessName="Prana Yoga"
                phone={null}
                api={{} as never}
            />,
        );
        expect(
            screen.getByRole("heading", { name: "Coming up" }),
        ).toBeInTheDocument();
    });
});
