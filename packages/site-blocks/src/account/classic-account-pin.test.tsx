import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AccountHeader, SiteChromeFrame } from "./account-header";
import { AccountHome } from "./account-home";
import type { AccountView, AccountHome as HomeData } from "./model";
import { AccountOrders } from "./orders-list";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    smallPrimaryButton,
    Tag,
} from "./parts";
import { AccountTabBar } from "./tab-bar";

/**
 * Classic's account, pinned (DEC-172, plan U12).
 *
 * Written BEFORE the looks' account landed: a site with no look keeps its
 * account exactly as it was (the compact header, the tab bar fixed to a
 * phone's foot, the cards), so nothing a look adds may reach these.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/account",
    useSearchParams: () => new URLSearchParams(),
}));

const ACCOUNT: AccountView = {
    name: "Asha Kumar",
    email: "asha@example.com",
    phone: null,
    businessName: "Prana Yoga",
    tabs: [
        { key: "home", label: "Home" },
        { key: "bookings", label: "Bookings" },
        { key: "orders", label: "Orders" },
        { key: "plan", label: "Plan" },
        { key: "messages", label: "Messages" },
        { key: "me", label: "Your details" },
    ],
    offers: { appointments: true, orders: true, plans: true },
    bookingsLabel: "Bookings",
    healthNotes: false,
    unreadMessages: 1,
};

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

const HOME: HomeData = {
    nextBooking: {
        ok: true,
        value: {
            ref: "bk_1",
            service: "Hatha yoga",
            startAt: "2026-10-20T01:30:00.000Z",
            endAt: "2026-10-20T02:30:00.000Z",
            timezone: "Asia/Kolkata",
            staff: "Meera",
            online: false,
        },
    },
    classes: { ok: true, value: null },
    orders: { ok: true, value: [ORDER] },
    plan: { ok: true, value: null },
};

const API = {
    payInvoice: vi.fn(),
    leaveLine: vi.fn(),
};

describe("Classic's account is pinned", () => {
    it("the frame leaves the site's header and footer out", () => {
        expect(
            renderToStaticMarkup(
                <SiteChromeFrame
                    account
                    header={<header>site header</header>}
                    footer={<footer>site footer</footer>}
                >
                    <main>page</main>
                </SiteChromeFrame>,
            ),
        ).toMatchSnapshot();
    });

    it("the compact header and the tab bar", () => {
        expect(
            renderToStaticMarkup(
                <>
                    <AccountHeader
                        businessName="Prana Yoga"
                        tabs={ACCOUNT.tabs}
                        name={ACCOUNT.name}
                    />
                    <AccountTabBar tabs={ACCOUNT.tabs} unreadMessages={1} />
                </>,
            ),
        ).toMatchSnapshot();
    });

    it("Home", () => {
        expect(
            renderToStaticMarkup(
                <AccountHome
                    account={ACCOUNT}
                    home={HOME}
                    api={API}
                    doors={{ bookHref: "/book", shopHref: "/shop" }}
                    now="2026-10-19T03:00:00.000Z"
                />,
            ),
        ).toMatchSnapshot();
    });

    it("Orders", () => {
        expect(
            renderToStaticMarkup(
                <AccountOrders
                    orders={{ ok: true, value: [ORDER] }}
                    track={null}
                    businessName="Prana Yoga"
                    shopHref="/shop"
                    messagesHref="/account/messages"
                />,
            ),
        ).toMatchSnapshot();
    });

    it("the cards, rows, tags and buttons", () => {
        expect(
            renderToStaticMarkup(
                <AccountCard labelledBy="c" title="Card" lead="Lead" needsYou>
                    <AccountRow
                        title="Row"
                        href="/x"
                        sub="Sub"
                        tag={<Tag tone="accent">Tag</Tag>}
                        actions={<button className={smallButton}>Act</button>}
                    />
                </AccountCard>,
            ),
        ).toMatchSnapshot();
        expect([
            buttonClasses(true),
            buttonClasses(false),
            smallButton,
            smallPrimaryButton,
        ]).toMatchSnapshot();
    });
});
