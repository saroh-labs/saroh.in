"use client";

import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import type { TestReleaseRefusal } from "../test-release/words";
import type { Block } from "./model";
import { accountDate } from "./model";
import { AccountCard, buttonClasses, Unavailable } from "./parts";
import { Sheet, sheetAltButton, sheetButton } from "./sheet";

/**
 * "Ask to remove my data" on Your details (DEC-172, #1107; site templates
 * v2 plan, U14). A request the business sees and acts on, never an instant
 * delete: the customer confirms it in a dialog that says receipts and
 * invoices are kept as the law requires, and the card then reads "Request
 * sent" with its date, across reloads, for as long as it is open.
 *
 * - **Open:** the sent state, and no button: asking again would return the
 *   same request (the API's POST is idempotent).
 * - **Closed** by the business without removal: its date, and the button
 *   is offered again. The business's reason never reaches the customer.
 * - **Done:** seen only by a send that raced the removal; after a removal
 *   the account no longer exists, and the done email is their record.
 * - **A failed read** says so and still offers the button: asking is safe
 *   either way, since an open request is returned rather than doubled.
 *
 * Automatic messages to the customer are email only (DEC-172). Drawn on the
 * site's own tokens, so each look wears it in its own type and colour.
 */

/** Their latest request, as the API's allow-list sends it (`customer-view.ts`). */
export interface AccountDataRequest {
    ref: string;
    status: "open" | "done" | "closed";
    askedAt: string;
    /** When it was done or closed; null while open. */
    handledAt: string | null;
}

export type DataRequestResult =
    | { ok: true; request: AccountDataRequest }
    | { ok: false; message: string }
    | TestReleaseRefusal;

/** Send the request: the site's server action. */
export type AskDataRequest = () => Promise<DataRequestResult>;

const OFFLINE = "We couldn't reach the business. Try again in a moment.";

/** The confirmation's words (the plan's, U14), with the business named. */
export function confirmWords(business: string): string {
    return `We'll ask ${business} to remove your details. We'll email you to confirm, and again when it's done. Receipts and invoices are kept as the law requires.`;
}

/** "Request sent on 19 Oct 2026. We've emailed you a confirmation." */
export function sentWords(askedAt: string): string {
    return `Request sent on ${accountDate(askedAt)}. We've emailed you a confirmation.`;
}

export function DataRequestCard({
    request: initial,
    businessName,
    ask,
}: {
    /** Their latest request: null when they never asked. */
    request: Block<AccountDataRequest | null>;
    businessName: string;
    ask: AskDataRequest;
}) {
    const [request, setRequest] = useState<AccountDataRequest | null>(
        initial.ok ? initial.value : null,
    );
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    async function send() {
        if (busy) return;
        setBusy(true);
        setProblem(null);
        const result = await ask().catch((): DataRequestResult => ({
            ok: false,
            message: OFFLINE,
        }));
        setBusy(false);
        if (!result.ok) {
            // Said in the dialog, which stays open to try again.
            setProblem(result.message);
            return;
        }
        setRequest(result.request);
        setOpen(false);
    }

    function close() {
        if (busy) return;
        setOpen(false);
        setProblem(null);
    }

    const status = request?.status ?? null;
    const canAsk = status === null || status === "closed";

    return (
        <AccountCard
            labelledBy="me-data"
            title="Your data"
            lead={<Lead request={request} businessName={businessName} />}
            actions={
                canAsk ? (
                    <button
                        type="button"
                        className={buttonClasses(false)}
                        onClick={() => {
                            setProblem(null);
                            setOpen(true);
                        }}
                    >
                        Ask to remove my data
                    </button>
                ) : null
            }
        >
            {initial.ok ? null : <Unavailable what="Your request" />}
            <Sheet
                open={open}
                onClose={close}
                title={`Ask ${businessName} to remove your data?`}
                lead={confirmWords(businessName)}
            >
                <p className="text-site-body mt-3 text-[14px] leading-normal">
                    Nothing is removed straight away. You can still sign in
                    until they&apos;ve done it.
                </p>
                {problem ? (
                    <p
                        role="alert"
                        className={cn(destructiveAlertClasses, "mt-3")}
                    >
                        {problem}
                    </p>
                ) : null}
                <button
                    type="button"
                    disabled={busy}
                    className={sheetButton(busy)}
                    onClick={() => void send()}
                >
                    {busy ? "Sending…" : "Send request"}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    className={sheetAltButton}
                    onClick={close}
                >
                    Cancel
                </button>
            </Sheet>
        </AccountCard>
    );
}

/** The card's sentence, by where their request stands. */
function Lead({
    request,
    businessName,
}: {
    request: AccountDataRequest | null;
    businessName: string;
}) {
    if (request?.status === "open") {
        return (
            <span role="status">
                <strong className="text-site-fg font-semibold">
                    Request sent.
                </strong>{" "}
                {sentWords(request.askedAt)} Until {businessName} has done it,
                you can still sign in.
            </span>
        );
    }
    if (request?.status === "done") {
        return (
            <span role="status">
                {businessName} has removed your details. We&apos;ve emailed you
                to confirm.
            </span>
        );
    }
    const about = `${businessName} can remove your account and details. Receipts and invoices are kept as the law requires.`;
    if (request?.status === "closed") {
        return (
            <>
                <span className="block">
                    {businessName} closed your request of{" "}
                    {accountDate(request.askedAt)} on{" "}
                    {accountDate(request.handledAt ?? request.askedAt)} without
                    removing your data. You can ask again.
                </span>
                <span className="mt-1.5 block">{about}</span>
            </>
        );
    }
    return <>{about}</>;
}
