import type { Metadata } from "next";

import type {
    AccountBlock,
    AccountNote,
    SignInOptions,
} from "@saroh/site-blocks";
import { Me } from "@saroh/site-blocks";

import {
    getAccount,
    getDataRequest,
    getInvoicesDue,
    getNotes,
    getNotices,
    getReceipts,
} from "@/lib/account-area";
import { accountTitle } from "@/lib/account-site";
import { ACCOUNT_PAGE_TITLES } from "@/lib/account-title";
import { getSignInOptions } from "@/lib/sign-in";

import { signOut, signOutEverywhere } from "../actions";
import {
    addHealthNote,
    askDataRemoval,
    confirmEmailChange,
    payInvoiceNow,
    requestEmailChangeCode,
    saveEmailChoice,
    updateAccountDetails,
} from "./actions";

/**
 * Your details, in the customer's account (round-2 plan A, A5; the tab was
 * "Me" until DEC-142): their name and contact, what is still to pay, their
 * receipts, a health note for the team (once C12 lets staff act on it),
 * whether the business may email them, "Ask to remove my data" (DEC-172),
 * and signing out. The layout has
 * already checked the switch and the session.
 */
export function generateMetadata(): Promise<Metadata> {
    return accountTitle(ACCOUNT_PAGE_TITLES.me);
}

export default async function MePage() {
    const lookup = await getAccount();
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    const { account } = lookup;
    const [receipts, invoices, notices, notes, options, dataRequest] =
        await Promise.all([
            getReceipts(),
            getInvoicesDue(),
            getNotices(),
            account.healthNotes
                ? getNotes()
                : Promise.resolve<AccountBlock<AccountNote[]> | null>(null),
            getSignInOptions().catch((): SignInOptions | null => null),
            getDataRequest(),
        ]);
    return (
        <Me
            account={account}
            receipts={receipts}
            invoices={invoices}
            notices={notices}
            notes={notes}
            dataRequest={dataRequest}
            options={
                options ?? {
                    businessName: account.businessName,
                    phone: null,
                    challenge: { required: false, siteKey: null },
                }
            }
            api={{
                updateDetails: updateAccountDetails,
                emailChange: {
                    requestCode: requestEmailChangeCode,
                    verifyCode: confirmEmailChange,
                },
                addNote: addHealthNote,
                signOut,
                signOutEverywhere,
                payInvoice: payInvoiceNow,
                saveNotices: saveEmailChoice,
                askDataRemoval,
            }}
        />
    );
}
