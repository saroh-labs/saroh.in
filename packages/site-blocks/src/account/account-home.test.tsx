import type { LookId } from "@saroh/block-contract";
import { defaultSiteStyle, siteStyleVariables } from "@saroh/block-contract";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { componentRules } from "../component-theme";
import { AccountHome } from "./account-home";
import type { AccountInvoiceDue, AccountWaitlistPlace } from "./details-model";
import { AccountLookFrame } from "./look-account";
import { ACCOUNT_PARTS, accountLookRules } from "./look-account-rules";
import type { AccountView, AccountHome as HomeData } from "./model";

/**
 * One account design (DEC-229, plan U13): Home in one fixed order, each
 * part left out when empty, the same parts under every look, and the
 * merchant's component styles reaching them.
 */

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/account",
    useSearchParams: () => new URLSearchParams(),
}));

const ACCOUNT: AccountView = {
    name: "Kabir Malhotra",
    email: "kabir@example.com",
    phone: null,
    businessName: "Iron & Oak",
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
};

const INVOICE: AccountInvoiceDue = {
    ref: "inv_1",
    number: "IO-0412",
    what: "Locker, December",
    issuedAt: "2026-11-01T00:00:00.000Z",
    dueAt: "2026-12-01T00:00:00.000Z",
    overdue: false,
    total: "354.00",
    currency: "INR",
    billOfSupply: false,
    pay: "online",
};

const HELD: AccountWaitlistPlace = {
    service: "Boxing",
    serviceRef: "svc_1",
    startAt: "2026-11-19T13:00:00.000Z",
    timezone: "Asia/Kolkata",
    status: "OFFERED",
    placeInLine: null,
    offeredUntil: "2026-11-18T15:30:00.000Z",
};

const ok = <T,>(value: T) => ({ ok: true as const, value });

const EMPTY: HomeData = {
    nextBooking: ok(null),
    classes: ok(null),
    orders: ok([]),
    plan: ok(null),
    changes: ok([]),
    since: null,
    invoicesDue: ok([]),
    waitlist: ok([]),
    courses: ok([]),
    linkPending: false,
};

const MEMBER: HomeData = {
    ...EMPTY,
    nextBooking: ok({
        ref: "IO-B-2231",
        service: "Strength",
        startAt: "2026-11-19T00:30:00.000Z",
        endAt: "2026-11-19T01:30:00.000Z",
        timezone: "Asia/Kolkata",
        staff: "Devika",
        online: false,
    }),
    invoicesDue: ok([INVOICE]),
    waitlist: ok([HELD]),
    plan: ok({
        ref: "sub_1",
        name: "Full",
        price: "3600.00",
        currency: "INR",
        interval: "MONTH",
        status: "ACTIVE",
        renewsAt: "2026-12-01T00:00:00.000Z",
        pausedUntil: null,
        endsAt: null,
    }),
    classes: ok({
        membership: null,
        packs: [
            {
                name: "Ten classes",
                credits: 10,
                left: 6,
                expiresAt: "2027-02-12T00:00:00.000Z",
            },
        ],
    }),
    orders: ok([
        {
            ref: "o_1043",
            number: "1043",
            placedAt: "2026-11-10T00:00:00.000Z",
            total: "1150.00",
            currency: "INR",
            open: false,
            status: "Collected",
            fulfilment: "Pick-up",
            items: [{ name: "Shaker bottle", quantity: 1 }],
            moreItems: 0,
        },
    ]),
};

const API = { payInvoice: vi.fn(), leaveLine: vi.fn() };

function home(data: HomeData) {
    return (
        <AccountHome
            account={ACCOUNT}
            home={data}
            api={API}
            doors={{ bookHref: "/book", shopHref: "/shop" }}
            now="2026-11-18T09:00:00.000Z"
        />
    );
}

const headings = () =>
    screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("Home's one order", () => {
    it("puts a held place and a bill due under Waiting on you, above what's next", () => {
        render(home(MEMBER));
        const waiting = screen.getByRole("group", { name: "Waiting on you" });
        const held = within(waiting).getByRole("heading", {
            name: /held for you/i,
        });
        expect(
            within(waiting).getByRole("heading", { name: "To pay" }),
        ).toBeInTheDocument();
        const next = screen.getByRole("heading", { name: "Next up" });
        expect(waiting.contains(next)).toBe(false);
        expect(
            held.compareDocumentPosition(next) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        // Then plan and packs (one card), then the latest order.
        const order = headings();
        expect(order.indexOf("Your plan")).toBeGreaterThan(
            order.indexOf("Next up"),
        );
        expect(order.indexOf("Your orders")).toBeGreaterThan(
            order.indexOf("Your plan"),
        );
        expect(order).not.toContain("Classes left");
        expect(
            within(screen.getByRole("region", { name: "Your plan" })).getByText(
                /Ten classes: 6 left/,
            ),
        ).toBeInTheDocument();
    });

    it("leaves Waiting on you out when nothing waits on them", () => {
        render(home({ ...MEMBER, waitlist: ok([]), invoicesDue: ok([]) }));
        expect(screen.queryByRole("group", { name: "Waiting on you" })).toBe(
            null,
        );
        expect(headings()[0]).toBe("Next up");
    });

    it("with nothing at all, shows only the welcome with Book and the shop", () => {
        render(home(EMPTY));
        expect(headings()).toEqual(["Nothing here yet"]);
        expect(
            screen.getByRole("link", { name: "Book a time" }),
        ).toHaveAttribute("href", "/book");
        expect(
            screen.getByRole("link", { name: "Go to the shop" }),
        ).toHaveAttribute("href", "/shop");
    });
});

/** Every account part in the page, in order, by name. */
function parts(root: Element): string[] {
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll("*"))) {
        for (const [name, selector] of Object.entries(ACCOUNT_PARTS)) {
            if (name === "stack") continue;
            if (el.matches(selector)) out.push(name);
        }
    }
    return out;
}

describe("one set of parts for every look", () => {
    it("draws the same parts under Classic, Folio and Live; only the variables differ", () => {
        const classic = render(home(MEMBER));
        const want = parts(classic.container);
        expect(want.length).toBeGreaterThan(10);
        classic.unmount();
        for (const look of ["folio", "live"] as LookId[]) {
            const { container, unmount } = render(
                <AccountLookFrame
                    look={look}
                    businessName="Iron & Oak"
                    tabs={[]}
                    greeting="Hi"
                >
                    {home(MEMBER)}
                </AccountLookFrame>,
            );
            const body = container.querySelector("[data-account-body] > div");
            if (!body) throw new Error("no account body");
            expect(parts(body)).toEqual(want);
            unmount();
        }
        expect(accountLookRules("folio")).not.toBe(accountLookRules("live"));
    });
});

describe("component styles reach the account", () => {
    /** The selector of the rule that writes `declaration`. */
    function ruleFor(css: string, declaration: string): string {
        for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
            if (body.includes(declaration)) return selector.trim();
        }
        throw new Error(`no rule writes ${declaration}`);
    }

    const rules = (
        components: Parameters<typeof siteStyleVariables>[0]["components"],
    ) =>
        componentRules(
            ":root",
            undefined,
            siteStyleVariables({ ...defaultSiteStyle(), components }),
        );

    it("Cards = Flat flattens the account's cards", () => {
        const { container } = render(home(MEMBER));
        const selector = ruleFor(
            rules({ cards: "flat" }),
            "border-color: transparent",
        );
        const cards = container.querySelectorAll(ACCOUNT_PARTS.card);
        expect(cards.length).toBeGreaterThan(0);
        // The rule finds the account's cards by the part's own selector
        // (jsdom can't match the nested :is() itself).
        expect(selector).toContain(ACCOUNT_PARTS.card);
    });

    it("square buttons reach the account's buttons, past a look's account rules", () => {
        const { container } = render(home(MEMBER));
        const selector = ruleFor(
            rules({ buttons: "square" }),
            "border-radius: var(--site-button-radius)",
        );
        const buttons = container.querySelectorAll(ACCOUNT_PARTS.button);
        expect(buttons.length).toBeGreaterThan(0);
        expect(selector).toContain(ACCOUNT_PARTS.button);
        // And past a look's own account rules.
        expect(rules({ buttons: "square" })).toContain(
            `:root [data-account-look] :is(${ACCOUNT_PARTS.button})`,
        );
    });
});
