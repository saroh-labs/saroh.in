import { AccountLoading } from "@saroh/site-blocks";

/**
 * Messages while it loads (DEC-142): the thread and the line to write in, held in place
 * under the account's header and tabs, which the layout has already drawn.
 * A read that then fails draws the page's own "couldn't be loaded" block.
 */
export default function AccountMessagesLoading() {
    return <AccountLoading shape="messages" />;
}
