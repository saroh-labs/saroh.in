import Link from "next/link";

import type { AccountView, AccountHome as Home } from "./model";
import {
    bookingWhen,
    classesLine,
    firstName,
    planLine,
    planPrice,
} from "./model";
import { OrderRow } from "./orders-list";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    Tag,
    Unavailable,
} from "./parts";

/**
 * The account's Home (round-2 plan A, A5; Saroh Customer Site design): the
 * next booking, classes left, the latest orders and the plan, each its own
 * card, each read on its own. A card whose read failed says so and never
 * shows zero; a card for something the business doesn't offer isn't drawn.
 *
 * Move and Cancel on the next booking come with A6, "Order again" with the
 * shop (G13) and "Buy a pack" with A11: nothing here links to a page that
 * isn't there yet. An order on its way has Track (A7).
 */
export function AccountHome({
    account,
    home,
}: {
    account: AccountView;
    home: Home;
}) {
    const first = firstName(account.name);
    const clinic = account.bookingsLabel === "Appointments";
    return (
        <div className="grid gap-3.5">
            <h1 className="font-site-heading text-site-fg m-0 text-[26px] font-semibold tracking-[-0.02em]">
                {first ? `Hi, ${first}` : "Hi"}
            </h1>

            {home.nextBooking ? (
                <NextBooking
                    block={home.nextBooking}
                    title={clinic ? "Next appointment" : "Next up"}
                    bookLabel={
                        clinic
                            ? "Book an appointment"
                            : "Book a class or session"
                    }
                />
            ) : null}

            {home.classes.ok ? (
                home.classes.value ? (
                    <AccountCard
                        labelledBy="account-classes"
                        title="Classes left"
                        lead={classesLine(home.classes.value)}
                    />
                ) : null
            ) : (
                <AccountCard labelledBy="account-classes" title="Classes left">
                    <Unavailable what="Your classes" />
                </AccountCard>
            )}

            {home.orders ? (
                <AccountCard
                    labelledBy="account-orders"
                    title="Your orders"
                    lead={
                        home.orders.ok && home.orders.value.length === 0
                            ? "No orders yet."
                            : undefined
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
            ) : null}

            {home.plan.ok ? (
                home.plan.value ? (
                    <AccountCard labelledBy="account-plan" title="Membership">
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
                <AccountCard labelledBy="account-plan" title="Membership">
                    <Unavailable what="Your plan" />
                </AccountCard>
            )}
        </div>
    );
}

function NextBooking({
    block,
    title,
    bookLabel,
}: {
    block: NonNullable<Home["nextBooking"]>;
    title: string;
    bookLabel: string;
}) {
    const book = (
        <Link href="/book" className={buttonClasses(true)}>
            {bookLabel}
        </Link>
    );
    if (!block.ok) {
        return (
            <AccountCard labelledBy="account-next" title={title} actions={book}>
                <Unavailable what="Your bookings" />
            </AccountCard>
        );
    }
    const next = block.value;
    if (!next) {
        return (
            <AccountCard
                labelledBy="account-next"
                title={title}
                sub="Nothing booked"
                lead="Book a time that suits you."
                actions={book}
            />
        );
    }
    const where = next.online === true ? "Video call" : null;
    return (
        <AccountCard labelledBy="account-next" title={title} actions={book}>
            <AccountRow
                title={`${next.service} · ${bookingWhen(next.startAt, next.timezone)}`}
                sub={
                    [next.staff ? `With ${next.staff}` : null, where]
                        .filter(Boolean)
                        .join(" · ") || undefined
                }
                tag={<Tag tone="quiet">Booked</Tag>}
            />
        </AccountCard>
    );
}
