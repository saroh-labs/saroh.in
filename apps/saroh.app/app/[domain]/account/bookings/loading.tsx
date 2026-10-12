import { AccountLoading } from "@saroh/site-blocks";

/**
 * The Bookings tab while it loads (DEC-142): its lists, held in place
 * under the account's header and tabs, which the layout has already drawn.
 * A read that then fails draws the page's own "couldn't be loaded" block.
 */
export default function AccountBookingsLoading() {
    return <AccountLoading shape="list" label="Loading your bookings" />;
}
