import type { Metadata } from "next";

import type {
    AccountBlock,
    AccountNote,
    SignInOptions,
} from "@saroh/site-blocks";
import { Me } from "@saroh/site-blocks";

import { getAccount, getNotes, getReceipts } from "@/lib/account-area";
import { getSignInOptions } from "@/lib/sign-in";

import { signOut, signOutEverywhere } from "../actions";
import {
    addHealthNote,
    confirmEmailChange,
    requestEmailChangeCode,
    updateAccountDetails,
} from "./actions";

/**
 * Me, in the customer's account (round-2 plan A, A5): details, a health
 * note for the team (once C12 lets staff act on it), receipts, and signing
 * out. The layout has already checked the switch and the session.
 */
export const metadata: Metadata = { title: "Me" };

export default async function MePage() {
    const lookup = await getAccount();
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    const { account } = lookup;
    const [receipts, notes, options] = await Promise.all([
        getReceipts(),
        account.healthNotes
            ? getNotes()
            : Promise.resolve<AccountBlock<AccountNote[]> | null>(null),
        getSignInOptions().catch((): SignInOptions | null => null),
    ]);
    return (
        <Me
            account={account}
            receipts={receipts}
            notes={notes}
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
            }}
        />
    );
}
