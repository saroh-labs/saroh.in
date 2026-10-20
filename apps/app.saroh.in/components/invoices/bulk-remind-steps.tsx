"use client";

import { phoneLabel } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { Skeleton } from "@saroh/ui/skeleton";
import { TextLink } from "@saroh/ui/text-link";
import { Check, Mail, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";

import { shortNumber } from "@/components/invoices/invoice-row";
import { MessagePreview } from "@/components/invoices/share-sheet";
import { FailedRead } from "@/components/shared/failed-read";
import { ViewerDate } from "@/components/shared/viewer-date";
import { CONNECT_EMAIL_HREF } from "@/lib/communications/email-setup";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import type {
    EmailPhase,
    PickRow,
    Tally,
    WayRow,
    Ways,
} from "@/lib/invoices/remind-many";
import {
    lateLine,
    names,
    tallyLines,
    waysHead,
} from "@/lib/invoices/remind-many";

/*
 * The three steps of Remind many (DEC-173, U12 #1124, INVBulkSend and
 * INVBulkSendPhone), drawn from what `bulk-remind-sheet.tsx` holds. Each
 * is the body of the one `FormSheet`; the sheet draws the foot.
 */

/** Step 1, Pick who: every owed invoice shown, each with its tick. */
export function PickStep({
    rows,
    ticked,
    onToggle,
}: {
    rows: readonly PickRow[];
    ticked: ReadonlySet<string>;
    onToggle: (invoiceId: string) => void;
}) {
    return (
        <ul aria-label="Pick who" className="grid" data-remind-pick="">
            {rows.map((row) => {
                const id = `remind-pick-${row.invoiceId}`;
                return (
                    <li
                        key={row.invoiceId}
                        className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                    >
                        <Checkbox
                            id={id}
                            checked={ticked.has(row.invoiceId)}
                            onCheckedChange={() => onToggle(row.invoiceId)}
                            className="size-[18px] coarse:size-5"
                        />
                        <Label
                            htmlFor={id}
                            className="grid min-w-0 flex-1 cursor-pointer gap-0.5 font-normal"
                        >
                            <span
                                data-ph-mask=""
                                className="truncate text-[14px] font-semibold"
                            >
                                {row.name}
                            </span>
                            <span className="truncate text-[12.5px] text-muted-foreground">
                                <span className="font-mono">
                                    {shortNumber(row.number)}
                                </span>
                                {" · "}
                                <span
                                    className={
                                        row.lateDays > 0
                                            ? "text-destructive-subtle-foreground"
                                            : undefined
                                    }
                                >
                                    {lateLine(row.lateDays)}
                                </span>
                            </span>
                        </Label>
                        <span className="whitespace-nowrap font-display text-[14px] font-semibold tabular-nums">
                            {formatMoney(row.amountMinor, row.currency)}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

export type WaysRead =
    | { status: "loading" }
    | { status: "failed" }
    | { status: "ready"; ways: Ways };

/**
 * Step 2, How each one goes: INVShareB's one look at the top, then the
 * three groups, each person with how or why.
 */
export function WaysStep({
    read,
    onRetry,
}: {
    read: WaysRead;
    onRetry: () => void;
}) {
    if (read.status === "loading") {
        return (
            <div className="grid content-start gap-3" aria-busy="true">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
            </div>
        );
    }
    if (read.status === "failed") {
        return (
            <FailedRead
                things="how each one goes"
                reassurance="No reminder was sent."
                onRetry={onRetry}
            />
        );
    }
    const { ways } = read;
    const head = waysHead(ways);
    return (
        <div className="grid content-start gap-5" data-remind-ways="">
            <div className="grid gap-1 rounded-[10px] bg-muted px-3.5 py-3">
                <p className="font-display text-[15px] font-semibold tabular-nums">
                    {head.title}
                </p>
                <p className="text-[13px] leading-normal text-muted-foreground">
                    {head.line}
                </p>
            </div>
            {ways.email.length > 0 ? (
                <Group
                    way="email"
                    title="Email, sent for you"
                    sub={`${ways.email.length} · from your own email`}
                    icon={<Mail aria-hidden className="size-4" />}
                    rows={ways.email}
                />
            ) : null}
            {ways.whatsapp.length > 0 ? (
                <Group
                    way="whatsapp"
                    title="WhatsApp, one tap each"
                    sub={`${ways.whatsapp.length} · opens your WhatsApp with the message filled in`}
                    icon={<MessageCircle aria-hidden className="size-4" />}
                    rows={ways.whatsapp}
                />
            ) : null}
            {ways.cantReach.length > 0 ? (
                <Group
                    way="none"
                    title="Can’t reach now"
                    sub={`${ways.cantReach.length}`}
                    rows={ways.cantReach}
                />
            ) : null}
            {ways.noProvider ? (
                <Notice tone="neutral" role="note" data-no-provider="">
                    Reminders are emailed from your own email. Until it is
                    connected, they open on WhatsApp.{" "}
                    <TextLink href={CONNECT_EMAIL_HREF}>Connect email</TextLink>
                </Notice>
            ) : null}
        </div>
    );
}

function Group({
    way,
    title,
    sub,
    icon,
    rows,
}: {
    way: "email" | "whatsapp" | "none";
    title: string;
    sub: string;
    icon?: ReactNode;
    rows: readonly WayRow[];
}) {
    return (
        <section aria-label={title} data-remind-way={way}>
            <h3 className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                {icon}
                {title}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>
            <ul className="mt-1.5">
                {rows.map((row) => (
                    <li
                        key={row.invoiceId}
                        data-remind-row={way}
                        className="flex items-center gap-2.5 border-t border-border py-[9px] text-[13.5px]"
                    >
                        <span className="grid min-w-0 flex-1 gap-0.5">
                            <b
                                data-ph-mask=""
                                className="font-semibold [overflow-wrap:anywhere]"
                            >
                                {row.name}
                            </b>
                            <small
                                data-ph-mask=""
                                className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
                            >
                                {row.note}
                                {row.phone ? (
                                    <>
                                        {" · "}
                                        <span className="font-mono tabular-nums">
                                            {phoneLabel(row.phone)}
                                        </span>
                                    </>
                                ) : null}
                            </small>
                        </span>
                        {row.retryAt && row.waits ? (
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                                <ViewerDate
                                    iso={row.retryAt}
                                    variant="dayMonth"
                                />
                            </span>
                        ) : row.amountMinor !== null ? (
                            <span className="whitespace-nowrap tabular-nums">
                                {formatMoney(row.amountMinor, row.currency)}
                            </span>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** Step 3's email card: held with Undo, sent, undone, or failed. */
export function EmailCard({
    emails,
    total,
    onUndo,
}: {
    emails: EmailPhase;
    /** How many were to be emailed. */
    total: number;
    onUndo: () => void;
}) {
    if (emails.phase === "none") return null;
    let title: string;
    let line: ReactNode = null;
    switch (emails.phase) {
        case "held":
            title = `Sending ${count(total, "email")} in 10 seconds`;
            line = names(emails.names);
            break;
        case "sent":
            title =
                emails.emailed.length > 0
                    ? `${count(emails.emailed.length, "email")} sent`
                    : "No emails went";
            line = (
                <>
                    {emails.emailed.length > 0
                        ? `${names(emails.emailed)} · each logged on its invoice`
                        : null}
                    {emails.failed.map((f) => (
                        <span key={f.name} className="block">
                            {f.name}: {f.words}
                        </span>
                    ))}
                    {emails.waits.length > 0 ? (
                        <span className="block">
                            {names(emails.waits)}: reminded today already
                        </span>
                    ) : null}
                </>
            );
            break;
        case "undone":
            title = "Emails undone";
            line = "Nothing was emailed.";
            break;
        case "failed":
            title = "The emails didn’t go";
            line = "Nothing was emailed.";
            break;
    }
    const sent = emails.phase === "sent" && emails.emailed.length > 0;
    return (
        <Notice
            tone={sent ? "success" : "neutral"}
            role="status"
            data-remind-emails={emails.phase}
            icon={
                sent ? (
                    <Check aria-hidden strokeWidth={2.2} />
                ) : (
                    <Mail aria-hidden />
                )
            }
            title={<span className="tabular-nums">{title}</span>}
            action={
                emails.phase === "held" ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onUndo}
                    >
                        Undo
                    </Button>
                ) : null
            }
        >
            {line ? <span data-ph-mask="">{line}</span> : null}
        </Notice>
    );
}

/** Step 3's WhatsApp card: who is next, and the message they get. */
export function WalkCard({
    row,
    message,
}: {
    row: WayRow;
    /** The reminder as it will read; null when it can't be drawn here. */
    message: string | null;
}) {
    const amount = formatMoney(row.amountMinor, row.currency);
    return (
        <div className="grid gap-3" data-remind-walk={row.invoiceId}>
            <p className="text-[13.5px]">
                <span className="text-muted-foreground">Next: </span>
                <b data-ph-mask="" className="font-semibold">
                    {row.name}
                </b>
                {amount ? (
                    <span className="tabular-nums"> · {amount}</span>
                ) : null}
            </p>
            {message ? <MessagePreview text={message} /> : null}
            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                WhatsApp opens in a new tab. Press send there, come back, and
                Saroh moves to the next one.
            </p>
        </div>
    );
}

/** The end: who was reminded and how, who waits, who couldn't be. */
export function DoneStep({
    picked,
    tally,
}: {
    /** "6 picked · ₹13,440". */
    picked: string;
    tally: Tally;
}) {
    const lines = tallyLines(tally);
    return (
        <div className="grid content-start gap-4" data-remind-done="">
            <p className="text-[13px] tabular-nums text-muted-foreground">
                {picked}
            </p>
            <ul aria-label="Reminders done" className="grid">
                {lines.map((line) => (
                    <li
                        key={line.key}
                        data-tally={line.key}
                        className="flex items-baseline gap-2 border-b border-border py-2.5 text-[13.5px] last:border-b-0"
                    >
                        <b className="font-semibold tabular-nums">
                            {line.count} {line.words}
                        </b>
                        <span
                            data-ph-mask=""
                            className="min-w-0 flex-1 truncate text-right text-muted-foreground"
                        >
                            {line.who}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-[12.5px] text-muted-foreground">
                Each one reminded shows “Reminded today” on the list and how,
                and it is logged on the invoice.
            </p>
        </div>
    );
}
