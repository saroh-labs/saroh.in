import Link from "next/link";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { CoursesCard } from "./courses-card";
import type { LeaveLine, PayInvoice } from "./details-api";
import { NextBooking } from "./home-next-booking";
import type { HomeBlock } from "./home-order";
import { homeLayout } from "./home-order";
import { linkPendingLine, offersLead, welcomeLead } from "./home-words";
import { ACCOUNT_TAB_HREF, ORDERS_HREF } from "./hrefs";
import { InvoicesDue } from "./invoices-due";
import type { AccountView, AccountHome as Home } from "./model";
import { classesLine, planLine, planPrice } from "./model";
import { OrderRow } from "./orders-list";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    Tag,
    Unavailable,
} from "./parts";
import { SinceLastHere } from "./since-last-here";
import { WaitlistPlaces } from "./waitlist-places";

/**
 * The account's Home (round-2 plan A, A5; ordered by DEC-142): what this
 * customer has, in the order it matters to them (`home-order.ts`).
 *
 * - "Since you were last here" leads when something changed.
 * - Then what is in progress: a place held for them, an invoice to pay, a
 *   booking coming up, an order on its way, a message they haven't opened.
 * - Then what is recent: their latest orders, classes left, their plan,
 *   their courses, a line they are waiting in.
 * - Then, last, what else they can do here, only for what the business
 *   offers. With nothing at all there is one welcome block, never a column
 *   of empty cards.
 *
 * Each block was read on its own: one whose read failed says so and never
 * shows zero. From tablet width up the blocks sit in two columns, in the
 * same order the page reads them in.
 *
 * Move and Cancel on the next booking open their sheets on the Bookings tab
 * (A6); an order on its way has Track (A7).
 */

/** Blocks that take the page's whole width from tablet width up. */
const FULL_WIDTH: ReadonlySet<HomeBlock> = new Set<HomeBlock>([
    "changes",
    "welcome",
    "offers",
]);

export function AccountHome({
    account,
    home,
    doors,
    api,
    now,
}: {
    account: AccountView;
    home: Home;
    /**
     * Where the offers lead: the booking page and the shop, each null when
     * it isn't there to send them to. Left out, bookings follow what the
     * business offers and the shop isn't offered.
     */
    doors?: { bookHref: string | null; shopHref: string | null };
    /**
     * The site's server actions. Required: this is drawn on the server,
     * and only a server action may be handed on to the buttons that call
     * it.
     */
    api: { payInvoice: PayInvoice; leaveLine: LeaveLine };
    /** When the page was drawn (ISO); now, when left out. */
    now?: string;
}) {
    const clinic = account.bookingsLabel === "Appointments";
    const business = account.businessName;
    const has = (key: string) => account.tabs.some((t) => t.key === key);
    const bookHref =
        doors === undefined
            ? account.offers.appointments
                ? "/book"
                : null
            : doors.bookHref;
    const shopHref = doors?.shopHref ?? null;
    const drawnAt = now ?? new Date().toISOString();
    const layout = homeLayout(account, home, {
        canBook: bookHref !== null,
        canShop: shopHref !== null,
    });
    const messagesHref = has("messages") ? ACCOUNT_TAB_HREF.messages : null;
    const { payInvoice, leaveLine } = api;

    // With an odd number of half-width cards, the first takes the whole
    // row: the thing that matters most gets the room, and no card is left
    // alone beside a gap.
    const halves = layout.blocks.filter((b) => !FULL_WIDTH.has(b));
    const lead = halves.length % 2 === 1 ? halves[0] : null;
    const span = (key: HomeBlock) =>
        FULL_WIDTH.has(key) || key === lead ? "md:col-span-2" : undefined;

    const bookLabel = clinic ? "Make a booking" : "Book a class or session";
    const unread = account.unreadMessages ?? 0;

    function draw(key: HomeBlock): ReactNode {
        const wide = span(key);
        switch (key) {
            case "changes":
                return (
                    <SinceLastHere
                        changes={layout.changes}
                        since={home.since}
                        failed={home.changes?.ok === false}
                        businessName={business}
                        messagesHref={messagesHref}
                        now={drawnAt}
                        className={wide}
                    />
                );
            case "place-held":
                return home.waitlist ? (
                    <WaitlistPlaces
                        places={home.waitlist}
                        show="held"
                        leave={leaveLine}
                        now={drawnAt}
                        className={wide}
                    />
                ) : null;
            case "waiting":
                return home.waitlist ? (
                    <WaitlistPlaces
                        places={home.waitlist}
                        show="waiting"
                        leave={leaveLine}
                        now={drawnAt}
                        className={wide}
                    />
                ) : null;
            case "to-pay":
                return home.invoicesDue ? (
                    <InvoicesDue
                        invoices={home.invoicesDue}
                        businessName={business}
                        payNow={payInvoice}
                        className={wide}
                    />
                ) : null;
            case "booking":
                return home.nextBooking ? (
                    <NextBooking
                        block={home.nextBooking}
                        title={clinic ? "Next booking" : "Next up"}
                        bookLabel={bookLabel}
                        bookHref={bookHref}
                        className={wide}
                    />
                ) : null;
            case "orders":
                return home.orders ? (
                    <AccountCard
                        labelledBy="account-orders"
                        title="Your orders"
                        className={wide}
                        actions={
                            home.orders.ok && has("orders") ? (
                                <Link
                                    href={ORDERS_HREF}
                                    className={buttonClasses(false)}
                                >
                                    See all orders
                                </Link>
                            ) : undefined
                        }
                    >
                        {home.orders.ok ? (
                            home.orders.value.map((order) => (
                                // Track opens on the Orders tab (A7).
                                <OrderRow
                                    key={order.ref}
                                    order={order}
                                    details={false}
                                />
                            ))
                        ) : (
                            <Unavailable what="Orders" />
                        )}
                    </AccountCard>
                ) : null;
            case "messages":
                return (
                    <AccountCard
                        labelledBy="account-messages"
                        title="Messages"
                        lead={
                            unread === 1
                                ? `A new message from ${business}.`
                                : `${unread} new messages from ${business}.`
                        }
                        needsYou
                        className={wide}
                        actions={
                            <Link
                                href={ACCOUNT_TAB_HREF.messages}
                                className={buttonClasses(true)}
                            >
                                Read messages
                            </Link>
                        }
                    />
                );
            case "classes":
                return home.classes.ok ? (
                    home.classes.value ? (
                        <AccountCard
                            labelledBy="account-classes"
                            title="Classes left"
                            lead={classesLine(home.classes.value)}
                            className={wide}
                        />
                    ) : null
                ) : (
                    <AccountCard
                        labelledBy="account-classes"
                        title="Classes left"
                        className={wide}
                    >
                        <Unavailable what="Your classes" />
                    </AccountCard>
                );
            case "plan":
                return home.plan.ok ? (
                    home.plan.value ? (
                        <AccountCard
                            labelledBy="account-plan"
                            title="Membership"
                            className={wide}
                            actions={
                                // The Plan tab's page (A8), linked only
                                // when this business shows it.
                                has("plan") ? (
                                    <Link
                                        href="/account/plan"
                                        className={buttonClasses(false)}
                                    >
                                        Manage plan
                                    </Link>
                                ) : undefined
                            }
                        >
                            <AccountRow
                                title={`${home.plan.value.name} · ${planPrice(home.plan.value)}`}
                                sub={planLine(home.plan.value)}
                                tag={
                                    home.plan.value.status === "PAUSED" ? (
                                        <Tag tone="quiet">Paused</Tag>
                                    ) : (
                                        <Tag tone="accent">Active</Tag>
                                    )
                                }
                            />
                        </AccountCard>
                    ) : null
                ) : (
                    <AccountCard
                        labelledBy="account-plan"
                        title="Membership"
                        className={wide}
                    >
                        <Unavailable what="Your plan" />
                    </AccountCard>
                );
            case "courses":
                return home.courses ? (
                    <CoursesCard courses={home.courses} className={wide} />
                ) : null;
            case "offers":
                return (
                    <AccountCard
                        labelledBy="account-offers"
                        title="More you can do here"
                        lead={offersLead(layout.offers)}
                        className={wide}
                        actions={
                            <>
                                {layout.offers.book && bookHref ? (
                                    <Link
                                        href={bookHref}
                                        className={buttonClasses(false)}
                                    >
                                        Book a time
                                    </Link>
                                ) : null}
                                {layout.offers.shop && shopHref ? (
                                    <Link
                                        href={shopHref}
                                        className={buttonClasses(false)}
                                    >
                                        Go to the shop
                                    </Link>
                                ) : null}
                            </>
                        }
                    />
                );
            case "welcome":
                return (
                    <AccountCard
                        labelledBy="account-welcome"
                        title="Nothing here yet"
                        lead={welcomeLead(account)}
                        className={wide}
                        actions={
                            <>
                                {layout.offers.book && bookHref ? (
                                    <Link
                                        href={bookHref}
                                        className={buttonClasses(true)}
                                    >
                                        Book a time
                                    </Link>
                                ) : null}
                                {layout.offers.shop && shopHref ? (
                                    <Link
                                        href={shopHref}
                                        className={buttonClasses(
                                            !(layout.offers.book && bookHref),
                                        )}
                                    >
                                        Go to the shop
                                    </Link>
                                ) : null}
                                {messagesHref ? (
                                    <Link
                                        href={messagesHref}
                                        className={buttonClasses(false)}
                                    >
                                        Message {business}
                                    </Link>
                                ) : null}
                            </>
                        }
                    >
                        {home.linkPending ? (
                            <p className="text-site-body mt-3 max-w-[60ch] text-[15px] leading-normal [text-wrap:pretty]">
                                {linkPendingLine(business, messagesHref)}
                            </p>
                        ) : null}
                    </AccountCard>
                );
        }
    }

    return (
        <div className="grid gap-3.5 md:grid-cols-2 md:items-start md:gap-4">
            {layout.blocks.map((key) => (
                <Fragment key={key}>{draw(key)}</Fragment>
            ))}
        </div>
    );
}
