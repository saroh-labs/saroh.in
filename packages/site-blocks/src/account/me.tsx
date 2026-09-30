"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import type { SignInOptions } from "./api";
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
 * Me, in the customer's account (round-2 plan A, A5; Saroh Customer Site
 * design): their details, a health note for the team, receipts, and
 * signing out.
 *
 * - **Details:** a name and a phone, kept as a contact detail and never a
 *   way to sign in (default 75). The email changes only with a code sent to
 *   the new address, through the sign-in sheet.
 * - **Health notes** (default 12) arrive as a suggestion the team confirms,
 *   and show only once the team can act on them (C12): `healthNotes`.
 * - **Receipts:** paid invoices, each opening its paper.
 * - There is no "Remove my details" (user, 2026-09-27): a customer asks the
 *   business by message or in person.
 *
 * Everything it changes goes through the site's server actions (`api`).
 */

export type { DetailsResult, MeApi, NoteResult } from "./me-api";

export interface MeProps {
    account: AccountView;
    receipts: Block<AccountReceipt[]>;
    /** Null while health notes are closed (C12). */
    notes: Block<AccountNote[]> | null;
    /** For the email change's sheet: the phone line and the challenge. */
    options: SignInOptions;
    api: MeApi;
}

type Open = "details" | "email" | "note" | null;

export function Me({
    account: initial,
    receipts,
    notes,
    options,
    api,
}: MeProps) {
    const router = useRouter();
    const [account, setAccount] = useState(initial);
    const [open, setOpen] = useState<Open>(null);
    const [sent, setSent] = useState<AccountNote[]>([]);
    const [signingOut, setSigningOut] = useState<"one" | "all" | null>(null);
    const [problem, setProblem] = useState<string | null>(null);
    const [said, setSaid] = useState<string | null>(null);

    const clinic = account.bookingsLabel === "Appointments";
    const notesTitle = clinic ? "Health notes" : "Notes for the team";
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
        <div className="grid gap-3.5">
            {said ? (
                <p role="status" className="text-site-body text-sm">
                    {said}
                </p>
            ) : null}

            <AccountCard labelledBy="me-details" title="My details">
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
                    title={notesTitle}
                    lead="Tell us about medicines, allergies, injuries or anything else. Only the team sees this."
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

            <AccountCard
                labelledBy="me-receipts"
                title="Receipts"
                lead={
                    receipts.ok && receipts.value.length === 0
                        ? "No receipts yet."
                        : undefined
                }
                actions={
                    <>
                        <button
                            type="button"
                            className={smallButton}
                            disabled={signingOut !== null}
                            onClick={() => void signOut(false)}
                        >
                            {signingOut === "one" ? "Signing out…" : "Sign out"}
                        </button>
                        <button
                            type="button"
                            className={smallButton}
                            disabled={signingOut !== null}
                            onClick={() => void signOut(true)}
                        >
                            {signingOut === "all"
                                ? "Signing out…"
                                : "Sign out everywhere"}
                        </button>
                    </>
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
                {problem ? (
                    <p
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
            </AccountCard>

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
                        "Done. Use that email to sign in from now on — other devices are signed out.",
                    );
                    router.refresh();
                }}
            />
            <NoteSheet
                open={open === "note"}
                title={clinic ? "Add a health note" : "Add a note"}
                placeholder={
                    clinic
                        ? "e.g. I started taking blood thinners"
                        : "e.g. Sore left knee"
                }
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
