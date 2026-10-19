"use client";

import { Button } from "@saroh/ui/button";
import {
    couldntLoad,
    NOTHING_CHANGED,
    TRY_AGAIN,
} from "@saroh/ui/lib/state-copy";
import { Skeleton } from "@saroh/ui/skeleton";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { namesList } from "@/lib/billing-profiles";

/**
 * The Billing profiles pages' states (F7): loading, no profiles yet, a
 * teammate who owns none, and a read that failed. The page's title stays
 * above each, so it never arrives as a different layout.
 */

export const card = "rounded-xl border border-border bg-card";

export function PageTitle({ children }: { children: ReactNode }) {
    return (
        <h1 className="font-display text-[23px] font-semibold leading-tight tracking-[-0.03em] md:text-[25px]">
            {children}
        </h1>
    );
}

export function LoadingProfiles({
    what = "your billing profiles",
}: {
    what?: string;
}) {
    return (
        <div role="status" aria-busy="true" className="flex flex-col gap-2.5">
            <span className="sr-only">Loading {what}</span>
            <Skeleton aria-hidden className="h-3.5 w-3/5 rounded-md" />
            <Skeleton aria-hidden className="h-[92px] rounded-xl" />
            <Skeleton aria-hidden className="h-[92px] rounded-xl" />
        </div>
    );
}

function Panel({
    title,
    children,
    action,
}: {
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className={`${card} flex flex-col items-start gap-2 p-[26px]`}>
            <strong className="font-display text-[17px] font-semibold">
                {title}
            </strong>
            <span className="text-muted-foreground text-[13px] leading-[1.55]">
                {children}
            </span>
            {action ? <div className="mt-1">{action}</div> : null}
        </div>
    );
}

export const EMPTY_TITLE = "No billing profiles yet";
export const EMPTY_SAYS =
    "Your first one is made when you create a business, from its details. Nothing is charged until you pick a paid plan.";

export function EmptyProfiles({ createUrl }: { createUrl: string }) {
    return (
        <Panel
            title={EMPTY_TITLE}
            action={
                <Button asChild>
                    <a href={createUrl}>Create a business</a>
                </Button>
            }
        >
            {EMPTY_SAYS}
        </Panel>
    );
}

export const TEAMMATE_TITLE = "You don't pay for any business";

/** What a teammate reads: whose billing it is, and when theirs appears. */
export function teammateSays(businesses: string[]): string {
    const one = businesses.length === 1;
    return `You're on the team at ${namesList(businesses)}. ${
        one ? "Its owner pays" : "Their owners pay"
    } Saroh, so ${one ? "its" : "their"} billing is theirs to see. Your own profiles appear here when you create a business.`;
}

export function TeammateState({ businesses }: { businesses: string[] }) {
    return <Panel title={TEAMMATE_TITLE}>{teammateSays(businesses)}</Panel>;
}

/** A read that failed: said, with Try again; nothing was changed. */
export function FailedProfiles({
    what = "your billing profiles",
}: {
    what?: string;
}) {
    const router = useRouter();
    return (
        <div
            role="alert"
            className={`${card} flex flex-col items-start gap-1.5 p-5`}
        >
            <strong className="text-sm font-semibold">
                {couldntLoad(what)}
            </strong>
            <span className="text-muted-foreground text-[13px]">
                {NOTHING_CHANGED}
            </span>
            <Button
                type="button"
                size="sm"
                className="mt-1.5"
                onClick={() => router.refresh()}
            >
                {TRY_AGAIN}
            </Button>
        </div>
    );
}
