import type { Metadata } from "next";

import { AccountMessages } from "@saroh/site-blocks";

import { getAccount, getThread } from "@/lib/account-area";
import { accountTitle } from "@/lib/account-site";
import { ACCOUNT_PAGE_TITLES } from "@/lib/account-title";

import { sendMessage } from "./actions";

/**
 * Messages, in the customer's account (round-2 A13): their one thread with
 * the business, and a line to write the next message. Reading it opens it,
 * so the tab's dot clears. The layout has already checked the switch and
 * the session.
 */
export function generateMetadata(): Promise<Metadata> {
    return accountTitle(ACCOUNT_PAGE_TITLES.messages);
}

export default async function AccountMessagesPage() {
    const [lookup, thread] = await Promise.all([getAccount(), getThread()]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    return (
        <AccountMessages
            businessName={lookup.account.businessName}
            thread={thread}
            api={{ send: sendMessage }}
        />
    );
}
