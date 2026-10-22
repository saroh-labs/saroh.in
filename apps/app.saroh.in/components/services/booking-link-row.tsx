"use client";

import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { CopyButton } from "@saroh/ui/copy-button";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { QrButton } from "@/components/qr/qr-button";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { Row } from "@/components/shared/page/settings-rows";
import { runAction } from "@/lib/api/run-action";
import type { BookingLinkView } from "@/lib/services/booking-link";
import {
    BOOKING_LINK_LABEL,
    bookingLinkRow,
    MAKE_LABEL,
    PUBLISH_LABEL,
    publishLine,
    shownAddress,
    WEBSITE_HREF,
} from "@/lib/services/booking-link";
import {
    makeBookingPage,
    publishBookingPage,
} from "@/lib/services/booking-link-actions";

/**
 * "Your booking page" on Bookings › Services (DEC-175, #1158): read first,
 * one row. Live, it is the address with Copy link and its QR code. Not yet,
 * it says customers can't open it, and Publish booking page opens a sheet
 * that publishes it and finishes there, with the link to copy and the code.
 * A business with no website yet is offered Make my booking page, or told
 * what is missing first.
 *
 * Nothing here is a second way to build a website: Website keeps every
 * control it has, and this publishes the same site Website › Publish does.
 */
export function BookingLinkRow({
    view: read,
    className,
}: {
    view: BookingLinkView;
    className?: string;
}) {
    const router = useRouter();
    // What the last write answered, until the page is read again: kept
    // against the read it answered over, so a fresh read always wins.
    const [answer, setAnswer] = useState<{
        over: BookingLinkView;
        view: BookingLinkView;
    } | null>(null);
    const view = answer?.over === read ? answer.view : read;
    const setAnswered = (next: BookingLinkView) =>
        setAnswer({ over: read, view: next });
    const row = bookingLinkRow(view);
    const [open, setOpen] = useState(false);
    const [opening, setOpening] = useState(0);
    const [making, setMaking] = useState(false);
    const [makeError, setMakeError] = useState<string | null>(null);

    const make = async () => {
        setMakeError(null);
        const res = await runAction(makeBookingPage, {
            setBusy: setMaking,
            quiet: true,
            onUnreached: setMakeError,
        });
        if (!res) return;
        if (!res.ok) {
            setMakeError(res.error);
            return;
        }
        setAnswered(res.data);
        showSuccess("Your booking page is made. Publish it when you're ready.");
        router.refresh();
    };

    const action =
        row.kind === "live" ? (
            <span className="flex flex-wrap items-center gap-2">
                <CopyButton value={row.url} label="Copy link" />
                <QrButton
                    compact="phone"
                    link={{
                        mode: "saved",
                        kind: "BOOK",
                        ...(view.site ? { siteId: view.site.id } : {}),
                        url: row.url,
                        what: "your booking page",
                        from: "Services screen",
                    }}
                />
            </span>
        ) : row.kind === "draft" && row.publish === "here" ? (
            <Button
                size="sm"
                onClick={() => {
                    setOpening((n) => n + 1);
                    setOpen(true);
                }}
            >
                {PUBLISH_LABEL}
            </Button>
        ) : row.kind === "draft" && row.publish === "website" ? (
            <Button asChild size="sm" variant="outline">
                <Link href={WEBSITE_HREF}>Open Website</Link>
            </Button>
        ) : row.kind === "none" && row.action === "make" ? (
            <Button
                size="sm"
                onClick={() => void make()}
                disabled={making}
                aria-busy={making || undefined}
            >
                {making ? "Making…" : MAKE_LABEL}
            </Button>
        ) : row.kind === "none" && row.action === "website" ? (
            <Button asChild size="sm" variant="outline">
                <Link href={WEBSITE_HREF}>Open Website</Link>
            </Button>
        ) : undefined;

    return (
        <Card className={className} data-booking-link={row.kind}>
            <CardContent className="p-0">
                <Row label={BOOKING_LINK_LABEL} inline action={action}>
                    <span className="grid gap-0.5">
                        {row.kind === "live" ? (
                            <TextLink
                                href={row.url}
                                external
                                className="font-medium [overflow-wrap:anywhere]"
                            >
                                {row.address}
                            </TextLink>
                        ) : row.kind === "draft" && row.address ? (
                            <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-foreground [overflow-wrap:anywhere]">
                                    {row.address}
                                </span>
                                <StatusBadge tone="draft">Not live</StatusBadge>
                            </span>
                        ) : null}
                        <span
                            className="text-[12.5px] leading-normal text-muted-foreground"
                            data-ph-unmask=""
                        >
                            {row.line}
                        </span>
                        {makeError ? (
                            <span
                                role="alert"
                                className="text-[12.5px] text-destructive"
                            >
                                {makeError}
                            </span>
                        ) : null}
                    </span>
                </Row>
            </CardContent>
            {(row.kind === "draft" && row.publish === "here") ||
            (row.kind === "live" && open) ? (
                <PublishSheet
                    // A fresh draft each time it opens; kept across the
                    // publish, so it finishes in place.
                    key={opening}
                    open={open}
                    view={view}
                    published={row.kind === "live"}
                    onPublished={(next) => {
                        setAnswered(next);
                        router.refresh();
                    }}
                    onClose={() => setOpen(false)}
                />
            ) : null}
        </Card>
    );
}

/**
 * Publish booking page: what goes live, then one press. It finishes in
 * place: once live, the sheet shows the link to copy and its QR code, and
 * Done closes it.
 */
function PublishSheet({
    open,
    view,
    published = false,
    onPublished,
    onClose,
}: {
    open: boolean;
    view: BookingLinkView;
    /** It has just gone live: the sheet shows the link. */
    published?: boolean;
    onPublished: (view: BookingLinkView) => void;
    onClose: () => void;
}) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const address = view.url ? shownAddress(view.url) : null;

    if (published && view.url) {
        return (
            <FormSheet
                open={open}
                title="Your booking page is live"
                description={`Customers can open ${address} and book.`}
                onClose={onClose}
                doneOnly
            >
                <div className="grid gap-3">
                    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-medium [overflow-wrap:anywhere]">
                        {address}
                    </p>
                    <span className="flex flex-wrap items-center gap-2">
                        <CopyButton value={view.url} label="Copy link" />
                        <QrButton
                            link={{
                                mode: "saved",
                                kind: "BOOK",
                                ...(view.site ? { siteId: view.site.id } : {}),
                                url: view.url,
                                what: "your booking page",
                                from: "Services screen",
                            }}
                        />
                    </span>
                </div>
            </FormSheet>
        );
    }

    return (
        <FormSheet
            open={open}
            title="Publish your booking page"
            description={publishLine(view)}
            pending={pending}
            saveLabel={PUBLISH_LABEL}
            savingLabel="Publishing…"
            onClose={onClose}
            onSubmit={async () => {
                setError(null);
                const res = await runAction(publishBookingPage, {
                    setBusy: setPending,
                    quiet: true,
                    onUnreached: setError,
                });
                if (!res) return;
                if (!res.ok) {
                    setError(res.error);
                    return;
                }
                onPublished(res.data);
            }}
        >
            <div className="grid gap-3">
                {address ? (
                    <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-medium [overflow-wrap:anywhere]">
                        {address}
                    </p>
                ) : null}
                <p className="text-[12.5px] leading-normal text-muted-foreground">
                    Your services, times and prices show as they are in
                    Bookings. How the page looks is changed in Website.
                </p>
                {error ? (
                    <Notice tone="error" role="alert">
                        {error}
                    </Notice>
                ) : null}
            </div>
        </FormSheet>
    );
}
