"use client";

import { count } from "@/lib/format/plural";
import { AbsentOr, AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { showSuccess } from "@saroh/ui/toast";
import { Tip } from "@saroh/ui/tooltip";
import { Link2 } from "lucide-react";
import { useState } from "react";

import { BusinessDate } from "@/components/shared/dates/business-zone";
import {
    ListTable,
    ListTableHead,
    listTable,
} from "@/components/shared/lists/list-toolbar";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { runAction } from "@/lib/api/run-action";
import { personHref } from "@/lib/contacts/person-href";
import { linkCustomerAction } from "@/lib/customer-workspace/actions";
import { customerHref } from "@/lib/customers/links";
import type { CustomerRow, CustomersPage } from "@/lib/customers/list";
import {
    lastSub,
    noOrderText,
    owesText,
    rowName,
    rowTags,
    spentText,
} from "@/lib/customers/list";
import { useCustomerSave } from "@/lib/customers/use-customers";
import { phoneLabel } from "@/lib/organizations/business-phone";
import { EmptyState } from "@saroh/ui/data-state";
import { clearLabel } from "@saroh/ui/lib/state-copy";

/**
 * The design's columns (DEC-275): Name · Phone · Last order · Paid · Owes,
 * and the row's action. A part the viewer can't read has no column at all
 * (C3 leaves it out of the row, and an empty column would read as zero):
 * no orders without `order:read` or `order:stage`, no Paid or Owes without
 * `order:read` and `invoice:read`.
 */
const COLS = {
    all: "sm:grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_minmax(96px,1fr)_84px_84px_64px]",
    orders: "sm:grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_minmax(96px,1fr)_64px]",
    person: "sm:grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_64px]",
} as const;

/**
 * The list's rows. On a phone each row is a card: the name and its tags
 * with what they owe or have paid, then the phone and the last order; from
 * `sm` it is the design's table. A paying person no contact holds yet
 * (DEC-275) is a row too, tagged Not linked, with Link.
 */
export function Rows({
    page,
    empty,
    canLink = false,
}: {
    page: CustomersPage;
    /** What shows in place of rows when nothing matches. */
    empty: React.ReactNode;
    /** `contact:write`: link a paying store customer to their contact. */
    canLink?: boolean;
}) {
    const cols = page.sees.spent
        ? COLS.all
        : page.sees.orders
          ? COLS.orders
          : COLS.person;
    const many = (page.storefronts?.length ?? 0) > 1;
    return (
        <ListTable>
            <div className="sm:overflow-x-auto">
                <div className="sm:min-w-[620px]">
                    <ListTableHead className={cn("hidden gap-3 sm:grid", cols)}>
                        <span data-ph-unmask="">Name</span>
                        <span data-ph-unmask="">Phone</span>
                        {page.sees.orders ? (
                            <span data-ph-unmask="">Last order</span>
                        ) : null}
                        {page.sees.spent ? (
                            <>
                                <span data-ph-unmask="" className="text-right">
                                    Paid
                                </span>
                                <span data-ph-unmask="" className="text-right">
                                    Owes
                                </span>
                            </>
                        ) : null}
                        <span />
                    </ListTableHead>
                    {page.rows.length === 0
                        ? empty
                        : page.rows.map((row) => (
                              <Row
                                  key={row.contactId}
                                  row={row}
                                  cols={cols}
                                  sees={page.sees}
                                  many={many}
                                  canLink={canLink}
                              />
                          ))}
                </div>
            </div>
        </ListTable>
    );
}

function Row({
    row,
    cols,
    sees,
    many,
    canLink,
}: {
    row: CustomerRow;
    cols: string;
    sees: CustomersPage["sees"];
    many: boolean;
    canLink: boolean;
}) {
    const tags = rowTags(row);
    const sub = lastSub(row, many);
    const orders = row.orders;
    const payer = row.unlinked;
    const owes = owesText(row.owes);
    const phone = row.phone?.trim() ? phoneLabel(row.phone) : "No phone";
    const last = orders?.lastAt ? (
        <BusinessDate iso={orders.lastAt} variant="recent" />
    ) : null;
    const className = cn(
        "grid grid-cols-1 items-center gap-x-3 gap-y-1 text-[13px] text-foreground",
        listTable.row,
        cols,
    );
    const name = (
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="min-w-0 truncate font-semibold">
                {rowName(row)}
            </span>
            {payer ? (
                <StatusBadge tone="off" data-ph-unmask="">
                    Not linked
                </StatusBadge>
            ) : null}
            {tags.map((t) => (
                <StatusBadge key={t.label} tone={t.tone}>
                    {t.label}
                </StatusBadge>
            ))}
            {/* The phone's card says the money beside the name. */}
            {sees.spent ? (
                <span
                    className={cn(
                        "ml-auto shrink-0 text-[12.5px] tabular-nums sm:hidden",
                        owes ? "font-medium" : "text-muted-foreground",
                    )}
                >
                    {owes ??
                        (row.spent && row.spent.length > 0
                            ? `${spentText(row.spent)} paid`
                            : null)}
                </span>
            ) : null}
        </span>
    );
    const cells = (
        <>
            <span className="grid min-w-0 gap-[3px]">
                {name}
                <span className="hidden truncate text-[12px] text-muted-foreground sm:block">
                    {payer
                        ? orders
                            ? `Paid for ${count(orders.count, "order")}`
                            : "Paid you"
                        : rowEmail(row)}
                </span>
                {/* The phone's one line: how to reach them and when they
                    last ordered; the table says it in columns from `sm`. */}
                <span className="truncate text-[12px] text-muted-foreground sm:hidden">
                    {phone}
                    {sees.orders ? (
                        last ? (
                            <>
                                {" · last order "}
                                {last}
                            </>
                        ) : row.addedByHand ? (
                            " · added by hand"
                        ) : null
                    ) : null}
                    {sub?.open ? (
                        <span className="text-foreground">{` · ${sub.text}`}</span>
                    ) : null}
                </span>
            </span>
            <span className="hidden truncate tabular-nums sm:block">
                {row.phone?.trim() ? phone : <AbsentValue says="No phone" />}
            </span>
            {sees.orders ? (
                <span className="hidden min-w-0 gap-0.5 sm:grid">
                    <span>
                        {last ?? (
                            <AbsentOr says="None">{noOrderText(row)}</AbsentOr>
                        )}
                    </span>
                    {sub ? (
                        <span
                            className={cn(
                                "truncate text-[12px]",
                                sub.open
                                    ? "text-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {sub.text}
                        </span>
                    ) : null}
                </span>
            ) : null}
            {sees.spent ? (
                <>
                    <span className="hidden text-right font-medium tabular-nums sm:block">
                        <AbsentOr says="None">
                            {spentText(row.spent ?? [])}
                        </AbsentOr>
                    </span>
                    <span className="hidden text-right font-medium tabular-nums sm:block">
                        <AbsentOr says="None">
                            {spentText(row.owes ?? [])}
                        </AbsentOr>
                    </span>
                </>
            ) : null}
        </>
    );

    if (payer) {
        return (
            <div className={className}>
                {cells}
                <span className="flex justify-start sm:justify-end">
                    <LinkPayer row={row} canLink={canLink} />
                </span>
            </div>
        );
    }
    return (
        <IntentLink
            href={personHref(row.contactId)}
            className={cn(className, listTable.pressable)}
        >
            {cells}
            <span
                aria-hidden
                className="hidden text-right text-[12.5px] text-muted-foreground sm:block"
            >
                Open
            </span>
        </IntentLink>
    );
}

/** The email under the name, when it isn't the name already. */
function rowEmail(row: CustomerRow): string | null {
    return row.name && row.email ? row.email : null;
}

/**
 * Link on a Not linked row (DEC-275, DEC-041): read first, then confirm.
 * Linking stays the merchant's action; Saroh never links on its own.
 */
function LinkPayer({ row, canLink }: { row: CustomerRow; canLink: boolean }) {
    const [open, setOpen] = useState(false);
    const { orgId, saved } = useCustomerSave();
    const payer = row.unlinked;
    const holder = payer?.holder ?? null;
    if (!payer) return null;
    if (!holder) {
        // Nobody holds their email: no link is coming until they pay again.
        return payer.storefront ? (
            <TextLink
                data-ph-unmask=""
                href={customerHref(payer.storefront.id, payer.customerId)}
                className="text-[12.5px] coarse:flex coarse:min-h-11 coarse:items-center"
            >
                Open
            </TextLink>
        ) : null;
    }
    const holderName = rowName(holder);
    const payerName = rowName(row);
    if (!canLink) {
        return (
            <Tip label="Someone who can edit customers can link them.">
                <Button type="button" size="sm" variant="outline" disabled>
                    Link
                </Button>
            </Tip>
        );
    }
    return (
        <>
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOpen(true)}
                aria-label={`Link ${payerName}`}
            >
                Link
            </Button>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                tone="neutral"
                icon={Link2}
                title={`Link ${payerName} to ${holderName}?`}
                description={
                    <>
                        Their email belongs to {holderName}
                        {payer.storefront ? (
                            <>
                                {" ("}
                                <TextLink
                                    href={customerHref(
                                        payer.storefront.id,
                                        payer.customerId,
                                    )}
                                >
                                    compare their record
                                </TextLink>
                                {")"}
                            </>
                        ) : null}
                        . If they&apos;re the same person, their orders join
                        that customer. Saroh never links anyone on its own.
                    </>
                }
                confirmLabel="Link them"
                busyLabel="Linking…"
                keepLabel="Keep apart"
                onConfirm={async () => {
                    const res = await runAction(() =>
                        linkCustomerAction(
                            holder.contactId,
                            payer.customerId,
                            orgId,
                        ),
                    );
                    if (!res) return false;
                    if (res.ok) {
                        showSuccess(`Linked to ${holderName}.`);
                        void saved();
                        return true;
                    }
                    return { ok: false, error: res.error };
                }}
            />
        </>
    );
}

/** No row matches the search or filters: say which, and the way out. */
export function NoMatch({
    title,
    searched,
    onClear,
}: {
    title: string;
    /** A search term narrowed it (else only filters did). */
    searched: boolean;
    onClear: () => void;
}) {
    return (
        <div className="p-4">
            <EmptyState
                data-ph-mask=""
                kind="no-results"
                things="customers"
                cause="filters"
                title={title}
                className="border-0"
                action={
                    <Button
                        data-ph-unmask=""
                        type="button"
                        variant="outline"
                        className="wk-press"
                        onClick={onClear}
                    >
                        {clearLabel(
                            searched ? "search" : "filters",
                            "customers",
                        )}
                    </Button>
                }
            />
        </div>
    );
}
