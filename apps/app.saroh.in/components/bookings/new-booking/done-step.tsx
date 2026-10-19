"use client";

import { Button } from "@saroh/ui/button";
import { useCopy } from "@saroh/ui/copy-button";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import {
    Check,
    ChevronRight,
    Clock,
    Copy,
    Eye,
    IndianRupee,
    MessageCircle,
    MessageSquareText,
    Plus,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import { PayLinkPanel } from "@/components/bookings/pay-link-panel";
import { firstName } from "@/lib/names";
import type { MessagePay } from "@/lib/services/booking-message";
import {
    bookingMessage,
    smsHref,
    whatsAppHref,
} from "@/lib/services/booking-message";

/** What was booked, for the done screen and its message. */
export interface Booked {
    bookingId: string;
    customer: string;
    phone: string | null;
    service: string;
    /** Who they'll see, by name; null for a service nobody takes. */
    withName: string | null;
    startAt: string;
    timeZone: string;
    zone: string;
    /** "Tue 20 Oct, 10:00 to 10:45 am". */
    when: string;
    /** "With Meera on Tue 20 Oct at 10:00 am". */
    line: string;
    /** "Pays at the visit · ₹800" and what it means. */
    pay: { title: string; sub: string };
    message: MessagePay;
    /** The payment link, when one was asked for. */
    link: PayLinkResult | null;
    business: string | null;
}

/**
 * Booked (BKMNewBookingStep6, BKDNewBooking "6 · booked"): who is booked
 * with whom and when, how it is paid, the payment link when one was made
 * (Copy link, Share), and what next: send the confirmation on WhatsApp or
 * by SMS, or copy it (Q12: these open the phone's own apps; Saroh sends
 * nothing), view the booking, add another, or Done.
 */
export function DoneStep({
    booked,
    onAgain,
    onDone,
}: {
    booked: Booked;
    onAgain: () => void;
    onDone: () => void;
}) {
    const first = firstName(booked.customer);
    const [url, setUrl] = useState<string | null>(
        booked.link?.ok ? booked.link.url : null,
    );
    const pay: MessagePay =
        booked.message.kind === "link"
            ? { ...booked.message, url }
            : booked.message;
    const text = bookingMessage({
        customer: booked.customer,
        service: booked.service,
        withName: booked.withName,
        startAt: booked.startAt,
        timeZone: booked.timeZone,
        zone: booked.zone,
        business: booked.business,
        pay,
    });
    const { copy, copied } = useCopy();
    // Booked: the keyboard and a screen reader start at what happened.
    const heading = useRef<HTMLHeadingElement | null>(null);
    useEffect(() => heading.current?.focus(), []);
    const view = `/bookings/${encodeURIComponent(booked.bookingId)}`;

    const send = (
        <div className="grid min-w-0 gap-2">
            <span className="label">What next?</span>
            <div className="grid min-w-0 overflow-hidden rounded-[12px] border border-border bg-card">
                <NextRow
                    href={whatsAppHref(booked.phone, text)}
                    external
                    icon={<MessageCircle className="text-success" />}
                    title="Send confirmation on WhatsApp"
                    sub="Opens WhatsApp with the message ready"
                />
                <NextRow
                    href={smsHref(booked.phone, text)}
                    icon={<MessageSquareText />}
                    title="Send it by SMS"
                    sub="Opens Messages with the message ready"
                />
                <NextRow
                    onClick={() => {
                        void copy(text).then((ok) => {
                            if (!ok) {
                                showError(
                                    "Couldn't copy the message. Send it on WhatsApp or by SMS instead.",
                                );
                            }
                        });
                    }}
                    icon={copied ? <Check /> : <Copy />}
                    title={copied ? "Copied" : "Copy message"}
                    sub="To paste anywhere"
                    live
                />
                <NextRow
                    href={view}
                    icon={<Eye />}
                    title="View booking"
                    className="min-[760px]:hidden"
                />
                <NextRow
                    onClick={onAgain}
                    icon={<Plus />}
                    title="Add another booking"
                    className="min-[760px]:hidden"
                />
            </div>
            <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                Saroh sends nothing itself: these open WhatsApp or SMS with the
                message filled in, or copy it.
            </p>
        </div>
    );

    return (
        <>
            <div
                data-overlay-body
                className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-14 min-[760px]:px-10 min-[760px]:pb-8 min-[760px]:pt-8"
            >
                <div className="grid min-w-0 gap-6 min-[760px]:grid-cols-[minmax(0,1fr)_300px] min-[760px]:gap-8">
                    <div className="grid min-w-0 content-start gap-3.5">
                        <span
                            aria-hidden
                            className="mx-auto grid size-[72px] place-items-center rounded-full bg-success-subtle text-success-subtle-foreground min-[760px]:mx-0 min-[760px]:size-11"
                        >
                            <Check className="size-8 min-[760px]:size-6" />
                        </span>
                        <h2
                            ref={heading}
                            tabIndex={-1}
                            data-done-heading=""
                            className="text-center font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] outline-none min-[760px]:text-left min-[760px]:text-[28px]"
                        >
                            {first} is booked
                        </h2>
                        <p className="-mt-1.5 text-center text-[14px] text-muted-foreground min-[760px]:text-left min-[760px]:text-[15px]">
                            {booked.line}
                        </p>
                        <dl className="grid min-w-0 rounded-[12px] border border-border bg-card px-3.5">
                            <div className="flex min-h-14 items-center gap-3 border-b border-border py-2">
                                <dt className="flex w-7 shrink-0 justify-center text-muted-foreground">
                                    <Clock
                                        aria-label="When"
                                        className="size-[18px]"
                                    />
                                </dt>
                                <dd className="grid min-w-0">
                                    <span className="text-[14.5px] font-semibold">
                                        {booked.when}
                                        {booked.zone ? ` · ${booked.zone}` : ""}
                                    </span>
                                    <span className="text-[12.5px] text-muted-foreground">
                                        {booked.withName
                                            ? `${booked.service} with ${booked.withName}`
                                            : booked.service}
                                    </span>
                                </dd>
                            </div>
                            <div className="flex min-h-14 items-center gap-3 py-2">
                                <dt className="flex w-7 shrink-0 justify-center text-muted-foreground">
                                    <IndianRupee
                                        aria-label="Payment"
                                        className="size-[18px]"
                                    />
                                </dt>
                                <dd className="grid min-w-0">
                                    <span className="text-[14.5px] font-semibold">
                                        {booked.pay.title}
                                    </span>
                                    <span className="text-[12.5px] text-muted-foreground">
                                        {booked.pay.sub}
                                    </span>
                                </dd>
                            </div>
                        </dl>
                        {booked.link ? (
                            <PayLinkPanel
                                variant="card"
                                bookingId={booked.bookingId}
                                first={booked.link}
                                payer={first}
                                onLink={setUrl}
                            />
                        ) : null}
                    </div>
                    {send}
                </div>
                <Button
                    type="button"
                    size="lg"
                    className="mt-6 w-full min-[760px]:hidden"
                    onClick={onDone}
                >
                    Done
                </Button>
            </div>
            <div className="hidden shrink-0 items-center gap-2 border-t border-border bg-card px-6 py-3 min-[760px]:flex">
                <Button asChild variant="outline" size="lg">
                    <Link href={view}>View booking</Link>
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={onAgain}
                >
                    Add another booking
                </Button>
                <span className="flex-1" />
                <Button type="button" size="lg" onClick={onDone}>
                    Done
                </Button>
            </div>
        </>
    );
}

/** A row of What next?: a link, or a button that does it here. */
function NextRow({
    href,
    external = false,
    onClick,
    icon,
    title,
    sub,
    live = false,
    className,
}: {
    href?: string;
    external?: boolean;
    onClick?: () => void;
    icon: ReactNode;
    title: string;
    sub?: string;
    /** Its title changes on a press ("Copied"): said politely. */
    live?: boolean;
    className?: string;
}) {
    const body = (
        <>
            <span
                aria-hidden
                className="flex w-5 shrink-0 justify-center [&>svg]:size-5"
            >
                {icon}
            </span>
            <span className="grid min-w-0 flex-1 text-left">
                <span
                    aria-live={live ? "polite" : undefined}
                    className="text-[14.5px] font-semibold"
                >
                    {title}
                </span>
                {sub ? (
                    <span className="text-[12.5px] font-normal text-muted-foreground">
                        {sub}
                    </span>
                ) : null}
            </span>
            <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
            />
        </>
    );
    const rowClass = cn(
        "flex min-h-14 w-full min-w-0 items-center gap-3 border-b border-border px-3.5 py-2.5 text-foreground transition-colors duration-fast last:border-b-0 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active",
        className,
    );
    if (href) {
        return external ? (
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={rowClass}
            >
                {body}
            </a>
        ) : href.startsWith("/") ? (
            <Link href={href} className={rowClass}>
                {body}
            </Link>
        ) : (
            <a href={href} className={rowClass}>
                {body}
            </a>
        );
    }
    return (
        <button type="button" onClick={onClick} className={rowClass}>
            {body}
        </button>
    );
}
