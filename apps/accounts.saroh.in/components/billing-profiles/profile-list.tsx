"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import type { BillingProfile, OwnedBusiness } from "@/lib/billing-profiles";
import {
    ADD_PROFILE,
    chips,
    gstLine,
    initial,
    LIST_FOOT,
    LIST_INTRO,
    LIST_INTRO_MORE,
    LIST_TITLE,
    paysForLine,
    syncBadge,
} from "@/lib/billing-profiles";

import { AddProfileSheet } from "./profile-sheet";
import { PageTitle } from "./states";

/**
 * The owner's billing profiles (F1; F8 on a phone): one card each, with
 * where Razorpay stands, its GST and billing email, and the businesses it
 * pays for. + Add billing profile opens the Add panel (also from a link,
 * `?add=1`, which the Move dialog's "+ A new billing profile" uses).
 */
export function ProfileList({
    profiles,
    businesses,
    startAdding = false,
}: {
    profiles: readonly BillingProfile[];
    businesses: readonly OwnedBusiness[];
    startAdding?: boolean;
}) {
    const router = useRouter();
    const path = usePathname();
    const [adding, setAdding] = useState(startAdding);
    const [opening, setOpening] = useState(0);

    return (
        <div className="max-w-[760px]">
            <ListHead
                onAdd={() => {
                    setOpening((n) => n + 1);
                    setAdding(true);
                }}
            />
            <ul className="mt-3 flex list-none flex-col gap-2.5 p-0 md:mt-[18px]">
                {profiles.map((p) => (
                    <li key={p.id}>
                        <ProfileCard profile={p} />
                    </li>
                ))}
            </ul>
            <p className="text-muted-foreground mt-3.5 text-xs">{LIST_FOOT}</p>
            <AddProfileSheet
                key={`add-${opening}`}
                profiles={profiles}
                businesses={businesses}
                open={adding}
                onClose={() => {
                    setAdding(false);
                    // A link that opened it leaves no `?add=1` behind.
                    if (startAdding) router.replace(path);
                }}
            />
        </div>
    );
}

export function ListHead({ onAdd }: { onAdd?: () => void }) {
    return (
        <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-[1_1_320px]">
                <PageTitle>{LIST_TITLE}</PageTitle>
                <p className="text-muted-foreground mt-[7px] text-[13px] leading-[1.55]">
                    {LIST_INTRO}{" "}
                    <span className="hidden md:inline">{LIST_INTRO_MORE}</span>
                </p>
            </div>
            {onAdd ? (
                <Button
                    type="button"
                    onClick={onAdd}
                    className="w-full md:w-auto"
                >
                    {ADD_PROFILE}
                </Button>
            ) : null}
        </div>
    );
}

export function ProfileCard({ profile: p }: { profile: BillingProfile }) {
    const badge = syncBadge(p.sync, "list");
    return (
        <Link
            href={`/account/billing-profiles/${encodeURIComponent(p.id)}`}
            aria-label={`Open ${p.legalName}`}
            className="border-border bg-card text-foreground duration-fast hover:border-foreground focus-visible:ring-ring focus-visible:ring-offset-background flex items-center gap-3 rounded-xl border px-3.5 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 md:gap-3.5 md:px-[18px] md:py-4"
        >
            <span
                aria-hidden
                className="bg-muted font-display hidden size-10 flex-none items-center justify-center rounded-[10px] text-[15px] font-semibold md:flex"
            >
                {initial(p.legalName)}
            </span>
            <span
                className="flex min-w-0 flex-1 flex-col gap-[3px]"
                data-ph-mask=""
            >
                <span className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-[15px] font-semibold md:text-[15.5px]">
                        {p.legalName}
                    </span>
                    {badge ? (
                        <Badge variant={badge.variant} size="sm">
                            {badge.label}
                        </Badge>
                    ) : null}
                </span>
                <span className="dark:text-muted-foreground text-xs text-neutral-700 [overflow-wrap:anywhere] md:text-[12.5px]">
                    {gstLine(p)}
                    <span className="hidden md:inline">
                        {" "}
                        · invoices to {p.billingEmail}
                    </span>
                </span>
                <span className="text-muted-foreground text-xs md:hidden">
                    {paysForLine(p)}
                </span>
                <span className="mt-1 hidden flex-wrap gap-1.5 md:flex">
                    {chips(p).map((c) => (
                        <span
                            key={c}
                            className="border-muted bg-muted/50 dark:text-muted-foreground rounded-full border px-[9px] py-0.5 text-[11.5px] text-neutral-700"
                        >
                            {c}
                        </span>
                    ))}
                </span>
            </span>
            <ChevronRight
                aria-hidden
                className="text-muted-foreground size-4 flex-none"
            />
        </Link>
    );
}
