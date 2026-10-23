"use client";

import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useState } from "react";

import { RemoveDetailsDialog } from "@/components/customers/more-actions/remove-details-dialog";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { personHref } from "@/lib/contacts/person-href";
import type { DataRequestRow } from "@/lib/customer-workspace/data-requests-view";
import {
    requesterLabel,
    STATUS_WORDS,
} from "@/lib/customer-workspace/data-requests-view";

import { CloseRequestDialog } from "./close-request-dialog";

/** What a removal from here says, once the request reads Done. */
export const REMOVED_FROM_REQUEST =
    "Their details were removed, and the request is done. We've emailed them.";

/** What closing one says. */
export const CLOSED_TOAST = "Request closed. We've emailed them.";

/**
 * One request, read first, in the side sheet a Requests row opens
 * (DEC-172, #1107): who asked, when, from which email, and where it
 * stands. The work is finished here, never on another page: "Remove their
 * details" opens the existing privacy removal (C11), which marks the
 * request done, and "Close without removal" asks for a reason. The
 * customer's page is one link away for anything else.
 */
export function RequestSheet({
    request,
    canRemove,
    onClose,
    onChanged,
}: {
    request: DataRequestRow | null;
    /** `customer:remove`, which the API asks again on every write. */
    canRemove: boolean;
    onClose: () => void;
    /** It was done or closed: the list reads again. */
    onChanged: () => void;
}) {
    const [removing, setRemoving] = useState(false);
    const [closing, setClosing] = useState(false);
    if (!request) return null;
    const who = requesterLabel(request);
    const open = request.status === "OPEN";
    const status = STATUS_WORDS[request.status];

    return (
        <>
            <FormSheet
                open
                title={`${who}'s request`}
                description="They asked to remove their data from your website's account page."
                doneOnly
                doneLabel="Close"
                fieldsClassName="gap-4"
                onClose={onClose}
            >
                <dl className="grid gap-3 text-[13px]">
                    <Fact label="Status">
                        <StatusBadge tone={status.tone}>
                            {status.label}
                        </StatusBadge>
                    </Fact>
                    <Fact label="Asked">
                        <ViewerDate iso={request.askedAt} variant="moment" />
                    </Fact>
                    {request.email ? (
                        <Fact label="Asked from">
                            <span
                                data-ph-mask=""
                                className="[overflow-wrap:anywhere]"
                            >
                                {request.email}
                            </span>
                        </Fact>
                    ) : null}
                    {request.handledAt ? (
                        <Fact
                            label={
                                request.status === "DONE" ? "Removed" : "Closed"
                            }
                        >
                            <ViewerDate
                                iso={request.handledAt}
                                variant="moment"
                            />
                        </Fact>
                    ) : null}
                    {request.reason ? (
                        <Fact label="Why it was closed">
                            <span className="[overflow-wrap:anywhere]">
                                {request.reason}
                            </span>
                        </Fact>
                    ) : null}
                </dl>

                {open ? (
                    <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        {request.contactId
                            ? "Removing their details takes away their name, email, phone, address and website account. Receipts and invoices are kept as the law requires."
                            : "This request isn't linked to a customer yet. Find them by the email they asked from and run the removal there, or close it with a reason."}
                    </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                    {open && canRemove && request.contactId ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setRemoving(true)}
                        >
                            Remove their details…
                        </Button>
                    ) : null}
                    {open && canRemove ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setClosing(true)}
                        >
                            Close without removal…
                        </Button>
                    ) : null}
                    {request.contactId ? (
                        <Button type="button" variant="ghost" asChild>
                            <Link href={personHref(request.contactId)}>
                                Open customer
                            </Link>
                        </Button>
                    ) : null}
                </div>
            </FormSheet>

            {removing && request.contactId ? (
                <RemoveDetailsDialog
                    contactId={request.contactId}
                    name={who}
                    open
                    onOpenChange={setRemoving}
                    onRemoved={() => {
                        setRemoving(false);
                        showSuccess(REMOVED_FROM_REQUEST);
                        onChanged();
                    }}
                />
            ) : null}
            <CloseRequestDialog
                request={request}
                who={who}
                open={closing}
                onOpenChange={setClosing}
                onClosed={() => {
                    setClosing(false);
                    showSuccess(CLOSED_TOAST);
                    onChanged();
                }}
            />
        </>
    );
}

function Fact({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-3">
            <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    );
}
