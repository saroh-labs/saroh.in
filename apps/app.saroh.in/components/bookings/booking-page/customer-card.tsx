"use client";

import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { ArrowRight, Mail, Phone, User } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { personHref } from "@/lib/contacts/person-href";
import { firstName } from "@/lib/names";
import { phoneLabel } from "@/lib/organizations/business-phone";
import type { PeekPerson } from "@/lib/services/peek";
import { attentionText } from "@/lib/services/peek";

import { CARD, CardTitle, Row } from "./cards";

/**
 * Customer (BKMBookingDetail's card, BKDBooking's right column): who,
 * their Needs attention, the phone with Call, the email, their note, and
 * their page.
 */
export function CustomerCard({
    who,
    contactId,
    phone,
    email,
    person,
    note,
    className,
    style,
}: {
    who: string;
    contactId: string | null;
    /** The number it was booked with, else the contact's. */
    phone: string | null;
    email: string | null;
    /** Their Needs attention, read by the page; null when not read. */
    person: PeekPerson | null;
    /** The booker's note (E7), for whoever may see it. */
    note: string | null;
    className?: string;
    style?: CSSProperties;
}) {
    const attention = attentionText(person?.attention ?? null);
    const first = firstName(who);
    const call = phone?.replace(/\s+/g, "") ?? null;
    return (
        <section
            aria-labelledby="customer-title"
            className={cn(CARD, "min-[760px]:self-start", className)}
            style={style}
        >
            <div className="min-[760px]:flex min-[760px]:items-center min-[760px]:gap-3">
                <Avatar
                    aria-hidden
                    className="hidden size-10 text-[13px] min-[760px]:flex"
                >
                    <AvatarFallback>{avatarInitials(who)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <CardTitle id="customer-title">Customer</CardTitle>
                    <p
                        data-ph-mask=""
                        className="hidden text-[16px] font-semibold min-[760px]:block"
                    >
                        {who}
                    </p>
                </div>
            </div>
            <div className="flex min-h-12 items-center gap-3 border-b border-border/70 text-[14px] min-[760px]:hidden">
                <span className="flex w-[22px] shrink-0 text-muted-foreground">
                    <User aria-hidden className="size-[18px]" />
                </span>
                <b data-ph-mask="" className="min-w-0 flex-1">
                    {who}
                </b>
            </div>
            {attention ? (
                // Read by whoever is about to see them (DEC-040): a
                // warning, not an error the merchant made.
                <Notice
                    tone="warning"
                    role="note"
                    className="my-2 min-[760px]:mb-1.5 min-[760px]:mt-3"
                >
                    <span data-ph-mask="">{attention}</span>
                </Notice>
            ) : null}
            <div data-ph-mask="">
                <Row
                    label="Phone"
                    icon={<Phone aria-hidden className="size-[18px]" />}
                    aside={
                        call ? (
                            <a
                                href={`tel:${call}`}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[12.5px] text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[760px]:min-h-0 min-[760px]:text-[13.5px] min-[760px]:font-semibold min-[760px]:text-foreground"
                            >
                                <Phone
                                    aria-hidden
                                    className="hidden size-3.5 min-[760px]:block"
                                />
                                Call
                                <span className="sr-only"> {who}</span>
                            </a>
                        ) : null
                    }
                >
                    {phone ? (
                        phoneLabel(phone)
                    ) : (
                        <span className="text-muted-foreground">Not given</span>
                    )}
                </Row>
                <Row
                    label="Email"
                    icon={<Mail aria-hidden className="size-[18px]" />}
                >
                    {email ?? (
                        <span className="text-muted-foreground">Not given</span>
                    )}
                </Row>
            </div>
            {note ? (
                <p
                    data-ph-mask=""
                    className="py-2 text-[12.5px] leading-[1.5] text-muted-foreground"
                >
                    Their note: “{note}”
                </p>
            ) : null}
            {contactId ? (
                <>
                    <Link
                        href={personHref(contactId)}
                        data-ph-mask=""
                        className="flex min-h-12 items-center gap-3 text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-[760px]:hidden"
                    >
                        <span className="flex w-[22px] shrink-0 text-muted-foreground">
                            <ArrowRight aria-hidden className="size-[18px]" />
                        </span>
                        <span className="flex-1">Open {first}&apos;s page</span>
                    </Link>
                    <Button
                        asChild
                        variant="outline"
                        className="mt-2.5 hidden w-full min-[760px]:inline-flex"
                    >
                        <Link href={personHref(contactId)} data-ph-mask="">
                            Open {first}&apos;s page
                        </Link>
                    </Button>
                </>
            ) : null}
        </section>
    );
}
