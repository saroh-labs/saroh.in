import { AccountLoading } from "@saroh/site-blocks";

/**
 * Home while it loads (DEC-142): Home's cards, held in place
 * under the account's header and tabs, which the layout has already drawn.
 * A read that then fails draws the page's own "couldn't be loaded" block.
 */
export default function AccountHomeLoading() {
    return <AccountLoading shape="home" />;
}
