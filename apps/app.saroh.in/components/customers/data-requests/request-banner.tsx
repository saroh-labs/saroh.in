"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { DataRequestRow } from "@/lib/customer-workspace/data-requests-view";

import { CloseRequestDialog } from "./close-request-dialog";
import { CLOSED_TOAST } from "./request-sheet";

/**
 * The one banner on a customer's page while they have an open "Ask to
 * remove my data" request (DEC-172, #1107): "Asked to remove their data on
 * {date}", with Review removal opening the existing removal preview (C11),
 * which marks the request done, and Close without removal, which asks for
 * a reason. While it shows it is the page's only note (one message at a
 * time, owner 13 Oct): the screen leaves its other notes out.
 */
export function RequestBanner({
    request,
    name,
    onReview,
}: {
    request: DataRequestRow;
    /** Their name, as the page shows it. */
    name: string;
    /** Opens "Remove their details"; absent without `customer:remove`. */
    onReview?: () => void;
}) {
    const router = useRouter();
    const [closing, setClosing] = useState(false);
    return (
        <>
            <Notice
                tone="warning"
                className="mb-4"
                align="center"
                action={
                    onReview ? (
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={onReview}>
                                Review removal
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setClosing(true)}
                            >
                                Close without removal
                            </Button>
                        </div>
                    ) : null
                }
            >
                <strong className="font-semibold">
                    Asked to remove their data on{" "}
                    <ViewerDate iso={request.askedAt} variant="dayMonthLong" />.
                </strong>{" "}
                They asked from your website. Receipts and invoices are kept as
                the law requires.
            </Notice>
            {onReview ? (
                <CloseRequestDialog
                    request={request}
                    who={name}
                    open={closing}
                    onOpenChange={setClosing}
                    onClosed={() => {
                        setClosing(false);
                        showSuccess(CLOSED_TOAST);
                        router.refresh();
                    }}
                />
            ) : null}
        </>
    );
}
