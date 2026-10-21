"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { SignInOptions } from "./api";
import type { AccountDataRequest } from "./data-request";
import { DataRequestCard } from "./data-request";
import type { AccountInvoiceDue, AccountNotices } from "./details-model";
import { TO_PAY_ID } from "./details-model";
import { EmailChoice } from "./email-choice";
import { InvoicesDue } from "./invoices-due";
import type { MeApi } from "./me-api";
import { DetailsSheet, NoteSheet } from "./me-sheets";
import type { AccountNote, AccountReceipt, AccountView, Block } from "./model";
import { accountDate, accountMoney } from "./model";
import {
    AccountCard,
    AccountRow,
    buttonClasses,
    smallButton,
    Tag,
    Unavailable,
} from "./parts";
import { SignInSheet } from "./sign-in-sheet";

/**
 * Your details, in the customer's account (round-2 plan A, A5; Saroh
 * Customer Site design; the tab was "Me" until DEC-142): their details,
 * what is still to pay, receipts, a health note for the team, whether the
 * business may email them, and signing out.
 *
 * - **Details:** a name and a phone, kept as a contact detail and never a
 *   way to sign in (default 75). The email changes only with a code sent to
 *   the new address, through the sign-in sheet.
 * - **Health notes** (default 12) arrive as a suggestion the team confirms,
 *   and show only once the team can act on them (C12): `healthNotes`. The
 *   card is worded by what the business is (`notesKind`, UX-040).
 * - **To pay:** their open invoices, each with "Pay now" where the business
 *   takes payment online (DEC-142), above the receipts.
 * - **Receipts:** paid invoices, each opening its paper.
 * - **Emails:** their own yes or no to email from the business: the consent
 *   that already exists (DEC-142).
 * - **Signing out:** "Sign out" is the button. "Sign out everywhere" is
 *   rare, so it waits behind "More" (DEC-142).
 * - **Your data:** "Ask to remove my data" (DEC-172, #1107): a request the
 *   business acts on, with a confirmation and a sent state
 *   (`data-request.tsx`). It replaced 2026-09-27's "ask by message".
 *
 * Everything it changes goes through the site's server actions (`api`).
 */

export type { DetailsResult, MeApi, NoteResult } from "./me-api";

/**
 * The notes card in the words of what the business is (UX-040): a clinic
 * asks about medicines, a bakery about allergies, anyone else in general
 * words — never health on a bakery or a boutique.
 */
const NOTES_WORDS = {
    health: {
        title: "Health notes",
        lead: "Tell us about medicines, allergies, injuries or anything else. Only the team sees this.",
        sheet: "Add a health note",
        placeholder: "e.g. I started taking blood thinners",
    },
    food: {
        title: "Allergies and notes",
        lead: "Tell us about allergies, or anything else we should know. Only the team sees this.",
        sheet: "Add a note",
        placeholder: "e.g. I'm allergic to peanuts",
    },
    general: {
        title: "Notes for the team",
        lead: "Tell us anything we should know. Only the team sees this.",
        sheet: "Add a note",
        placeholder: "e.g. Mornings suit me best",
    },
} as const;

/** "More": a quiet control, 44px to press, that opens what is rarely needed. */
const quietButton = cn(
    "text-site-fg inline-flex h-11 cursor-pointer items-center rounded-[calc(var(--site-radius)+8px)] px-3 text-[14px] font-semibold underline-offset-[3px] transition-opacity duration-150 [transition-timing-function:var(--site-ease,cubic-bezier(0.2,0.8,0.2,1))] hover:underline active:opacity-70 motion-reduce:transition-none",
    focusRing,
);

export interface MeProps {
    account: AccountView;
    receipts: Block<AccountReceipt[]>;
    /** Null while health notes are closed (C12). */
    notes: Block<AccountNote[]> | null;
    /** Their open invoices (DEC-142). Left out by an older caller: none drawn. */
    invoices?: Block<AccountInvoiceDue[]>;
    /** Whether the business may email them (DEC-142); null draws no card. */
    notices?: Block<AccountNotices> | null;
    /**
     * Their latest "Ask to remove my data" request (DEC-172), null when
     * they never asked. Left out, with `api.askDataRemoval`, by an older
     * caller: no Your data card.
     */
    dataRequest?: Block<AccountDataRequest | null>;
    /** For the email change's sheet: the phone line and the challenge. */
    options: SignInOptions;
    api: MeApi;
}

type Open = "details" | "email" | "note" | null;

export function Me({
    account: initial,
    receipts,
    notes,
    invoices,
    notices = null,
    dataRequest,
    options,
    api,
}: MeProps) {
    const router = useRouter();
    const [account, setAccount] = useState(initial);
    const [open, setOpen] = useState<Open>(null);
    const [sent, setSent] = useState<AccountNote[]>([]);
    const [signingOut, setSigningOut] = useState<"one" | "all" | null>(null);
    // "Sign out everywhere" waits behind More (DEC-142).
    const [more, setMore] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [said, setSaid] = useState<string | null>(null);

    const words =
        NOTES_WORDS[
            account.notesKind ??
                (account.bookingsLabel === "Appointments"
                    ? "health"
                    : "general")
        ];
    const contact = [account.phone, account.email].filter(Boolean).join(" · ");

    async function signOut(everywhere: boolean) {
        if (signingOut) return;
        setSigningOut(everywhere ? "all" : "one");
        setProblem(null);
        const result = await (
            everywhere ? api.signOutEverywhere() : api.signOut()
        ).catch(() => ({ ok: false }));
        setSigningOut(null);
        if (!result.ok) {
            // Said here, before leaving: this browser's session is gone
            // either way (the action clears the cookie).
            setProblem(
                everywhere
                    ? "You're signed out here, but we couldn't reach the business to sign out your other devices. Sign in again and try once more."
                    : "We couldn't reach the business, but you're signed out on this device.",
            );
            return;
        }
        router.push("/");
        router.refresh();
    }

    const shownNotes = notes?.ok ? [...sent, ...notes.value] : sent;

    return (
        <div className="grid gap-3.5 md:gap-4">
            {said ? (
                <p role="status" className="text-site-body text-[15px]">
                    {said}
                </p>
            ) : null}

            <AccountCard labelledBy="me-details" title="Name and contact">
                <AccountRow
                    title={account.name ?? "Add your name"}
                    sub={contact}
                    actions={
                        <>
                            <button
                                type="button"
                                className={smallButton}
                                onClick={() => setOpen("details")}
                            >
                                Edit
                            </button>
                            <button
                                type="button"
                                className={smallButton}
                                onClick={() => setOpen("email")}
                            >
                                Change email
                            </button>
                        </>
                    }
                />
            </AccountCard>

            {account.healthNotes && notes ? (
                <AccountCard
                    labelledBy="me-notes"
                    title={words.title}
                    lead={words.lead}
                    actions={
                        <button
                            type="button"
                            className={buttonClasses(false)}
                            onClick={() => setOpen("note")}
                        >
                            Add a note
                        </button>
                    }
                >
                    {notes.ok ? null : <Unavailable what="Your notes" />}
                    {shownNotes.map((note) => (
                        <AccountRow
                            key={note.ref}
                            title={note.text}
                            sub={
                                note.state === "ON_RECORD"
                                    ? "On your record"
                                    : "Sent · the team will confirm it"
                            }
                        />
                    ))}
                </AccountCard>
            ) : null}

            {invoices ? (
                <InvoicesDue
                    id={TO_PAY_ID}
                    invoices={invoices}
                    businessName={account.businessName}
                    payNow={api.payInvoice}
                    whenNone="Nothing to pay."
                />
            ) : null}

            <AccountCard
                labelledBy="me-receipts"
                title="Receipts"
                lead={
                    receipts.ok && receipts.value.length === 0
                        ? "No receipts yet."
                        : undefined
                }
            >
                {receipts.ok ? (
                    receipts.value.map((r) => (
                        <AccountRow
                            key={r.ref}
                            title={`${r.billOfSupply ? "Bill of supply" : "Receipt"} ${r.number}`}
                            sub={[
                                accountDate(r.paidAt ?? r.issuedAt),
                                accountMoney(r.total, r.currency),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            tag={<Tag tone="quiet">Paid</Tag>}
                            actions={
                                <Link
                                    href={`/account/receipts/${encodeURIComponent(r.ref)}`}
                                    className={smallButton}
                                >
                                    View
                                </Link>
                            }
                        />
                    ))
                ) : (
                    <Unavailable what="Receipts" />
                )}
            </AccountCard>

            {notices ? (
                <EmailChoice
                    notices={notices}
                    account={account}
                    save={api.saveNotices}
                />
            ) : null}

            {dataRequest && api.askDataRemoval ? (
                <DataRequestCard
                    request={dataRequest}
                    businessName={account.businessName}
                    ask={api.askDataRemoval}
                />
            ) : null}

            <section
                aria-label="Signing out"
                className="border-site-border mt-1 border-t pt-4"
            >
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className={buttonClasses(false)}
                        disabled={signingOut !== null}
                        onClick={() => void signOut(false)}
                    >
                        {signingOut === "one" ? "Signing out…" : "Sign out"}
                    </button>
                    <button
                        type="button"
                        className={quietButton}
                        aria-expanded={more}
                        aria-controls="me-sign-out-more"
                        onClick={() => setMore((m) => !m)}
                    >
                        More
                        <span
                            aria-hidden="true"
                            className={cn(
                                "ml-1 inline-block transition-transform duration-150 [transition-timing-function:var(--site-ease,cubic-bezier(0.2,0.8,0.2,1))] motion-reduce:transition-none",
                                more && "rotate-180",
                            )}
                        >
                            ▾
                        </span>
                    </button>
                </div>
                <div id="me-sign-out-more" hidden={!more} className="mt-3">
                    <p className="text-site-body max-w-[60ch] text-[14px] leading-normal">
                        Signed in on a phone or computer you no longer use? This
                        signs you out on every one of them.
                    </p>
                    <button
                        type="button"
                        className={cn(smallButton, "mt-2")}
                        disabled={signingOut !== null}
                        onClick={() => void signOut(true)}
                    >
                        {signingOut === "all"
                            ? "Signing out…"
                            : "Sign out everywhere"}
                    </button>
                </div>
                {problem ? (
                    <p
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
            </section>

            <DetailsSheet
                open={open === "details"}
                account={account}
                onClose={() => setOpen(null)}
                save={api.updateDetails}
                onSaved={(next) => {
                    setAccount(next);
                    setOpen(null);
                    setSaid("Saved.");
                    router.refresh();
                }}
            />
            <SignInSheet
                open={open === "email"}
                purpose="change-email"
                onClose={() => setOpen(null)}
                options={options}
                api={api.emailChange}
                onSignedIn={(customer) => {
                    setAccount((a) => ({ ...a, email: customer.email }));
                    setSaid(
                        "Done. Use that email to sign in from now on. Other devices are signed out.",
                    );
                    router.refresh();
                }}
            />
            <NoteSheet
                open={open === "note"}
                title={words.sheet}
                placeholder={words.placeholder}
                onClose={() => setOpen(null)}
                send={api.addNote}
                onSent={(note) => {
                    setSent((s) => [note, ...s]);
                    setOpen(null);
                    setSaid("Sent. The team will confirm it.");
                }}
            />
        </div>
    );
}
