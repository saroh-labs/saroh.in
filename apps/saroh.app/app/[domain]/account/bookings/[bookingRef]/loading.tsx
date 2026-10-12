import { AccountLoading } from "@saroh/site-blocks";

/**
 * A booking's own page while it loads (DEC-142): the way back and its card, held in place
 * under the account's header and tabs, which the layout has already drawn.
 * A read that then fails draws the page's own "couldn't be loaded" block.
 */
export default function AccountBookingsBookingrefLoading() {
    return <AccountLoading shape="one" label="Loading your booking" />;
}
