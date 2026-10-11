import { AccountLoading } from "@saroh/site-blocks";

/**
 * A receipt while it loads (DEC-142): the way back and the paper, held in place
 * under the account's header and tabs, which the layout has already drawn.
 * A read that then fails draws the page's own "couldn't be loaded" block.
 */
export default function AccountReceiptsInvoiceidLoading() {
    return <AccountLoading shape="one" label="Loading your receipt" />;
}
