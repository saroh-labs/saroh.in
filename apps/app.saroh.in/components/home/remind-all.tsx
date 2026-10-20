"use client";

import { Button } from "@saroh/ui/button";
import { Skeleton } from "@saroh/ui/skeleton";
import { TextLink } from "@saroh/ui/text-link";
import { Check } from "lucide-react";
import { useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { FormSheet } from "@/components/shared/form-sheet";
import { formatMoney } from "@/lib/format/money";
import type { RemindAllBill, RemindAllPreview } from "@/lib/home/remind-all";
import {
    channelNote,
    fromPreview,
    introWords,
    lateWords,
    noneWords,
    PROVIDERS_HREF,
    sendLabel,
    skippedHeading,
} from "@/lib/home/remind-all";
import type { HomeNeedGroup } from "@/lib/home/service";
import { previewReminders } from "@/lib/invoices/actions";

import type { InlineActions } from "./use-inline-actions";

export type RemindAllRead =
    | { status: "loading" }
    | { status: "failed" }
    | { status: "ready"; preview: RemindAllPreview };

/**
 * Remind all, on Home's unpaid bills group (DEC-171, Home plan U8, boards
 * `HARemindD`, `HARemindP`, `HPSheets`): one button that opens who gets a
 * reminder for an overdue bill, who is skipped and why (reminded in the
 * last 3 days, no way to reach them), and the words they get. The one
 * sheet (`FormSheet`): a panel on the right at a desk, a bottom sheet on a
 * phone.
 *
 * The bills are the group's own (`group.remind`: the 100 oldest overdue,
 * sent only to someone who may send a reminder, `invoice:write`); the
 * list is Remind many's preview (`POST invoices/reminders/preview`, U5)
 * asked to wait anyone heard from in the last 3 days. Send closes it and
 * holds the reminders ten seconds with Undo on Home's one hold
 * (`useInlineActions().remindAll`); the server reads each bill again when
 * they go, so the list here is what was meant, never a promise.
 */
export function RemindAll({
    group,
    actions,
    inSheet = false,
}: {
    group: HomeNeedGroup;
    actions: InlineActions;
    /** In the phone's bills sheet (`HPSheets`): the foot's main button. */
    inSheet?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [read, setRead] = useState<RemindAllRead>({ status: "loading" });

    async function load() {
        setRead({ status: "loading" });
        try {
            const ask = group.remind;
            if (!ask) {
                setRead({ status: "failed" });
                return;
            }
            const res = await previewReminders(ask);
            setRead(
                res.ok
                    ? {
                          status: "ready",
                          preview: fromPreview(
                              res.data,
                              group.late - ask.invoiceIds.length,
                          ),
                      }
                    : { status: "failed" },
            );
        } catch {
            setRead({ status: "failed" });
        }
    }

    const preview = read.status === "ready" ? read.preview : null;
    const going = preview?.going.length ?? 0;

    function send() {
        if (!preview || going === 0) return;
        setOpen(false);
        actions.remindAll({
            invoiceIds: preview.going.map((g) => g.invoiceId),
            quietDays: group.remind?.quietDays,
            people: preview.people,
            skipped: preview.skipped.length,
            reasons: preview.skipped.map((s) => s.reason),
        });
    }

    return (
        <FormSheet
            open={open}
            trigger={
                inSheet ? (
                    <Button type="button" className="flex-1">
                        Remind all
                    </Button>
                ) : (
                    <Button type="button" variant="outline" size="sm">
                        Remind all
                    </Button>
                )
            }
            onOpen={() => {
                setOpen(true);
                void load();
            }}
            onClose={() => setOpen(false)}
            eyebrow="Unpaid bills"
            title="Remind all"
            description={describe(read)}
            wide
            bottomOnPhone
            onSubmit={(event) => {
                event.preventDefault();
                send();
            }}
            saveLabel={going > 0 ? sendLabel(going) : "Send reminders"}
            saveOff={going === 0}
            {...(preview && going === 0
                ? { doneOnly: true, doneLabel: "Close" }
                : {})}
        >
            <RemindAllBody read={read} onRetry={() => void load()} />
        </FormSheet>
    );
}

/** The one sentence under the title, for each state of the read. */
function describe(read: RemindAllRead): string {
    if (read.status === "loading") return "Reading who owes you…";
    if (read.status === "failed") return "Nothing was sent.";
    const { preview } = read;
    return preview.going.length > 0
        ? introWords(preview)
        : noneWords(preview).title;
}

/** The sheet's body, for each state of the read. */
export function RemindAllBody({
    read,
    onRetry,
}: {
    read: RemindAllRead;
    onRetry: () => void;
}) {
    if (read.status === "loading") {
        return (
            <div className="grid content-start gap-3" aria-busy="true">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        );
    }
    if (read.status === "failed") {
        return (
            <FailedRead
                things="who owes you"
                reassurance="No reminder was sent."
                onRetry={onRetry}
            />
        );
    }

    const { preview } = read;
    const skipped = skippedHeading(preview);

    return (
        <div data-remind-all="" className="grid content-start">
            {preview.going.length > 0 ? (
                <>
                    {preview.message ? (
                        <div className="grid gap-1.5 rounded-[10px] bg-muted px-3.5 py-3">
                            <p className="label">What they get</p>
                            <p
                                data-ph-mask=""
                                className="whitespace-pre-line text-[13px] leading-normal"
                            >
                                {preview.message}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {channelNote(preview)}
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            {channelNote(preview)}
                        </p>
                    )}
                    <h3 className="label mt-4">Getting a reminder</h3>
                    <ul
                        aria-label="Getting a reminder"
                        className="mb-3.5 mt-1.5"
                    >
                        {preview.going.map((bill) => (
                            <BillRow
                                key={bill.invoiceId}
                                bill={bill}
                                note={lateWords(bill.lateDays)}
                            />
                        ))}
                    </ul>
                </>
            ) : (
                <None preview={preview} />
            )}
            {skipped ? (
                <>
                    <h3 className="label">{skipped}</h3>
                    <ul aria-label="Skipped" className="mt-1.5">
                        {preview.skipped.map((bill) => (
                            <BillRow
                                key={bill.invoiceId}
                                bill={bill}
                                note={bill.words}
                                skipped
                            />
                        ))}
                    </ul>
                </>
            ) : null}
            {preview.more > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                    These are the 100 oldest. Remind all again tomorrow for the
                    other {preview.more}.
                </p>
            ) : null}
        </div>
    );
}

function None({ preview }: { preview: RemindAllPreview }) {
    const none = noneWords(preview);
    return (
        <div className="mb-4 grid gap-1">
            <p className="text-sm text-muted-foreground">{none.body}</p>
            {none.connect ? (
                <TextLink href={PROVIDERS_HREF} className="text-sm">
                    Open Settings › Providers
                </TextLink>
            ) : null}
        </div>
    );
}

function BillRow({
    bill,
    note,
    skipped = false,
}: {
    bill: RemindAllBill;
    note: string;
    skipped?: boolean;
}) {
    const amount = formatMoney(bill.amountMinor, bill.currency);
    return (
        <li
            data-remind-row={skipped ? "skipped" : "going"}
            className={
                skipped
                    ? "flex items-center gap-2.5 border-t border-border py-[9px] text-[13.5px] text-muted-foreground"
                    : "flex items-center gap-2.5 border-t border-border py-[9px] text-[13.5px]"
            }
        >
            {skipped ? (
                <span
                    aria-hidden
                    className="size-4 flex-none rounded-full border-[1.5px] border-muted-foreground/70"
                />
            ) : (
                <Check
                    aria-hidden
                    strokeWidth={2.2}
                    className="size-[15px] flex-none text-success-subtle-foreground"
                />
            )}
            <span className="grid min-w-0 flex-1 gap-0.5">
                <b
                    data-ph-mask=""
                    className={
                        skipped
                            ? "font-semibold [overflow-wrap:anywhere]"
                            : "font-semibold text-foreground [overflow-wrap:anywhere]"
                    }
                >
                    {bill.name ?? bill.number ?? "A customer"}
                </b>
                <small className="text-xs text-muted-foreground">{note}</small>
            </span>
            {amount ? <span className="tabular-nums">{amount}</span> : null}
        </li>
    );
}
