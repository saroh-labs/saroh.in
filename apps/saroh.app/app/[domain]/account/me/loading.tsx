import { AccountLoading } from "@saroh/site-blocks";

/**
 * Your details while it loads (DEC-142): its cards, held in place
 * under the account's header and tabs, which the layout has already drawn.
 * A read that then fails draws the page's own "couldn't be loaded" block.
 */
export default function AccountMeLoading() {
    return <AccountLoading shape="details" />;
}
