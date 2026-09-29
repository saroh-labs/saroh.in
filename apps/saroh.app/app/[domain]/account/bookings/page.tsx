import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { SignInOptions } from "@saroh/site-blocks";
import { AccountBookingsTab } from "@saroh/site-blocks";

import { getAccount, getBookings } from "@/lib/account-area";
import { getSignInOptions } from "@/lib/sign-in";

import {
    bookVisit,
    cancelBooking,
    moveBooking,
    moveTimes,
    visitTimes,
} from "./actions";

/**
 * The account's Bookings (round-2 plan A, A6): Coming up, Past and
 * Cancelled, a treatment's visits, and the customer's own Move and Cancel.
 * `?move=‹ref›` or `?cancel=‹ref›` (Home's next booking) opens that sheet.
 * The layout has already checked the switch and the session. A business
 * that takes no bookings has no Bookings tab, and this page is a 404 for it.
 */
export const metadata: Metadata = { title: "Bookings" };

function one(value: string | string[] | undefined): string | null {
    const text = typeof value === "string" ? value.trim() : "";
    return text && text.length <= 64 ? text : null;
}

export default async function AccountBookingsPage({
    searchParams,
}: {
    searchParams: Promise<{
        move?: string | string[];
        cancel?: string | string[];
    }>;
}) {
    const [query, lookup] = await Promise.all([searchParams, getAccount()]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    const { account } = lookup;
    const tab = account.tabs.find((t) => t.key === "bookings");
    if (!tab) notFound();

    const [bookings, options] = await Promise.all([
        getBookings(),
        // The business's public phone, for "Call"; never blocks the page.
        getSignInOptions().catch((): SignInOptions | null => null),
    ]);
    const move = one(query.move);
    const cancel = one(query.cancel);

    return (
        <AccountBookingsTab
            bookings={bookings}
            title={tab.label}
            businessName={account.businessName}
            phone={options?.phone ?? null}
            api={{
                moveTimes,
                move: moveBooking,
                cancel: cancelBooking,
                visitTimes,
                bookVisit,
            }}
            initial={
                move
                    ? { kind: "move", ref: move }
                    : cancel
                      ? { kind: "cancel", ref: cancel }
                      : null
            }
        />
    );
}
