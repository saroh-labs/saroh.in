import Link from "next/link";

import { BOOKINGS_HREF } from "./bookings-model";
import { bookingHref } from "./details-model";
import type { AccountHome as Home } from "./model";
import { bookingWhen } from "./model";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    Tag,
    Unavailable,
} from "./parts";

/**
 * Home's next booking (A5; DEC-142): what is booked next, with Move and
 * Cancel, which open their sheets on the Bookings tab (A6), and its own
 * page behind its title. Nothing booked draws no card at all — "Book a
 * time" is offered lower down — and a read that failed says so.
 */
export function NextBooking({
    block,
    title,
    bookLabel,
    bookHref,
    className,
}: {
    block: NonNullable<Home["nextBooking"]>;
    title: string;
    bookLabel: string;
    bookHref: string | null;
    className?: string;
}) {
    // Not the card's main thing once something is booked: a quiet way to
    // book again.
    const book = bookHref ? (
        <Link href={bookHref} className={buttonClasses(false)}>
            {bookLabel}
        </Link>
    ) : undefined;
    if (!block.ok) {
        return (
            <AccountCard
                labelledBy="account-next"
                title={title}
                actions={book}
                className={className}
            >
                <Unavailable what="Your bookings" />
            </AccountCard>
        );
    }
    const next = block.value;
    // Nothing booked draws no card: "Book a time" is offered lower down.
    if (!next) return null;
    const where = next.online === true ? "Video call" : null;
    return (
        <AccountCard
            labelledBy="account-next"
            title={title}
            actions={book}
            className={className}
        >
            <AccountRow
                title={`${next.service} · ${bookingWhen(next.startAt, next.timezone)}`}
                href={bookingHref(next.ref)}
                sub={
                    [next.staff ? `With ${next.staff}` : null, where]
                        .filter(Boolean)
                        .join(" · ") || undefined
                }
                tag={<Tag tone="quiet">Booked</Tag>}
                actions={
                    <>
                        <Link
                            href={`${BOOKINGS_HREF}?move=${encodeURIComponent(next.ref)}`}
                            className={smallButton}
                            aria-label={`Move ${next.service}`}
                        >
                            Move
                        </Link>
                        <Link
                            href={`${BOOKINGS_HREF}?cancel=${encodeURIComponent(next.ref)}`}
                            className={smallButton}
                            aria-label={`Cancel ${next.service}`}
                        >
                            Cancel
                        </Link>
                    </>
                }
            />
        </AccountCard>
    );
}
