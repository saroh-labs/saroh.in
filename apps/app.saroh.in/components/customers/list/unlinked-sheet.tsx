"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, LoadingState, PartialNotice } from "@saroh/ui/data-state";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { personHref } from "@/lib/contacts/person-href";
import { linkCustomerAction } from "@/lib/customer-workspace/actions";
import { loadUnlinkedCustomers } from "@/lib/customers/actions";
import { customerHref } from "@/lib/customers/links";
import type { UnlinkedCustomer, UnlinkedPage } from "@/lib/customers/list";
import { rowName, unlinkedText } from "@/lib/customers/list";

/**
 * "12 paying customers aren't linked to a contact yet · Review" (C4).
 *
 * C2 made a contact for every paying store customer — except where a
 * contact already held their email, because linking silently is what #120
 * refused. Those people aren't rows yet, so the list names them rather than
 * quietly showing fewer customers than there are. The notice goes when the
 * count reaches zero.
 */
export function UnlinkedNotice({
    count,
    store,
    canLink,
}: {
    count: number;
    /** The storefront filter, which the count and the sheet honour. */
    store: string | null;
    /** `contact:write`: who may link a store customer to a contact. */
    canLink: boolean;
}) {
    const [open, setOpen] = useState(false);
    if (count <= 0) return null;
    return (
        <>
            <PartialNotice
                className="mb-3"
                action={
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOpen(true)}
                        className="shrink-0"
                    >
                        Review
                    </Button>
                }
            >
                {unlinkedText(count)}. Until they are, they aren&apos;t in this
                list.
            </PartialNotice>
            <UnlinkedSheet
                open={open}
                onOpenChange={setOpen}
                store={store}
                canLink={canLink}
            />
        </>
    );
}

type Read =
    | { state: "loading" }
    | { state: "failed" }
    | { state: "ready"; data: UnlinkedPage };

function UnlinkedSheet({
    open,
    onOpenChange,
    store,
    canLink,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    store: string | null;
    canLink: boolean;
}) {
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [read, setRead] = useState<Read>({ state: "loading" });
    /** Linked while the sheet is open: customer id → the contact's name. */
    const [linked, setLinked] = useState<Record<string, string>>({});

    const fetchPage = useCallback(
        (at: number) =>
            loadUnlinkedCustomers(store, at)
                .catch(() => null)
                .then((data) =>
                    setRead(
                        data ? { state: "ready", data } : { state: "failed" },
                    ),
                ),
        [store],
    );

    // Opening reads the first page; the sheet starts as loading, and goes
    // back to it when it closes.
    useEffect(() => {
        if (open) void fetchPage(1);
    }, [open, fetchPage]);

    function goTo(at: number) {
        setPage(at);
        setRead({ state: "loading" });
        void fetchPage(at);
    }

    const pages =
        read.state === "ready"
            ? Math.max(1, Math.ceil(read.data.total / read.data.pageSize))
            : 1;

    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                onOpenChange(o);
                if (!o) {
                    setPage(1);
                    setRead({ state: "loading" });
                    setLinked({});
                }
            }}
        >
            <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[480px]">
                <div>
                    <SheetTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                        Paying customers to link
                    </SheetTitle>
                    <SheetDescription className="mt-1 text-pretty text-[13px] leading-[1.5] text-muted-foreground">
                        Each paid at a location with an email a contact already
                        has. Link them if they&apos;re the same person and their
                        orders join that customer. Saroh never links anyone on
                        its own.
                    </SheetDescription>
                </div>

                {read.state === "loading" ? (
                    <LoadingState
                        variant="list"
                        rows={4}
                        label="Loading paying customers"
                    />
                ) : read.state === "failed" ? (
                    <FailedState
                        title="Couldn't load them"
                        description="Something went wrong on our side. Nothing has been changed."
                        action={
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => goTo(page)}
                            >
                                Try again
                            </Button>
                        }
                    />
                ) : read.data.rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border-strong px-5 py-[30px] text-center text-[13px] text-muted-foreground">
                        Every paying customer is linked.
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {read.data.rows.map((c) => (
                            <UnlinkedItem
                                key={c.customerId}
                                customer={c}
                                canLink={canLink}
                                linkedTo={linked[c.customerId] ?? null}
                                onLinked={(name) => {
                                    setLinked((m) => ({
                                        ...m,
                                        [c.customerId]: name,
                                    }));
                                    // The count, the notice and the rows
                                    // are read again behind the sheet.
                                    router.refresh();
                                }}
                            />
                        ))}
                    </ul>
                )}

                {read.state === "ready" && pages > 1 ? (
                    <div className="mt-auto flex items-center gap-2 pt-1 text-[12.5px] text-muted-foreground">
                        <span className="flex-1 tabular-nums">
                            Page {page} of {pages}
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => goTo(page - 1)}
                        >
                            Previous
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={page >= pages}
                            onClick={() => goTo(page + 1)}
                        >
                            Next
                        </Button>
                    </div>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function UnlinkedItem({
    customer: c,
    canLink,
    linkedTo,
    onLinked,
}: {
    customer: UnlinkedCustomer;
    canLink: boolean;
    linkedTo: string | null;
    onLinked: (name: string) => void;
}) {
    const [pending, start] = useTransition();
    const holder = c.holder;
    const holderName = holder ? rowName(holder) : null;
    const reach = [c.email, c.phone].filter(Boolean).join(" · ");

    function link() {
        if (!holder || !holderName) return;
        start(async () => {
            const res = await linkCustomerAction(
                holder.contactId,
                c.customerId,
            );
            if (res.ok) {
                showSuccess(`Linked to ${holderName}`);
                onLinked(holderName);
            } else {
                showError("Couldn't link them", res.error);
            }
        });
    }

    return (
        <li className="rounded-xl border border-border bg-card px-3.5 py-3">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <div className="min-w-0 flex-[1_1_200px]">
                    <p className="truncate text-[13.5px] font-semibold">
                        {rowName(c)}
                    </p>
                    {reach && c.name ? (
                        <p className="truncate text-[12px] text-muted-foreground">
                            {reach}
                        </p>
                    ) : null}
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {c.paidOrders !== undefined
                            ? `${c.paidOrders === 1 ? "1 paid order" : `${c.paidOrders} paid orders`}`
                            : "Paid"}
                        {c.storefront ? ` at ${c.storefront.name}` : null}
                        {c.lastPaidOrderAt ? (
                            <>
                                {", last "}
                                <ViewerDate
                                    iso={c.lastPaidOrderAt}
                                    variant="recent"
                                />
                            </>
                        ) : null}
                    </p>
                </div>
                {c.storefront ? (
                    <Button asChild variant="ghost" size="sm">
                        <Link
                            href={customerHref(c.storefront.id, c.customerId)}
                        >
                            Open their record
                        </Link>
                    </Button>
                ) : null}
            </div>
            <div className="mt-2.5 border-t border-border/60 pt-2.5 text-[12.5px]">
                {linkedTo ? (
                    <p className="flex items-center gap-1.5 font-medium text-success-subtle-foreground">
                        <Check aria-hidden className="size-4" />
                        Linked to {linkedTo}
                    </p>
                ) : holder && holderName ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-[1_1_180px] text-muted-foreground">
                            Their email belongs to{" "}
                            <Link
                                href={personHref(holder.contactId)}
                                className="font-medium text-brand transition-colors hover:text-foreground active:text-muted-foreground"
                            >
                                {holderName}
                            </Link>
                            .
                        </p>
                        {canLink ? (
                            <Button
                                data-ph-mask=""
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={link}
                            >
                                {pending ? "Linking…" : `Link to ${holderName}`}
                            </Button>
                        ) : (
                            <p className="w-full text-muted-foreground">
                                Someone who can edit customers can link them.
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        No contact holds their email yet. They get one the next
                        time they pay.
                    </p>
                )}
            </div>
        </li>
    );
}
