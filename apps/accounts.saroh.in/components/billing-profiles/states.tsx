"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState, LoadingState } from "@saroh/ui/data-state";
import { FailedRead } from "@saroh/ui/failed-read";
import { useState } from "react";

import type { BillingProfile, OwnedBusiness } from "@/lib/billing-profiles";
import { namesList } from "@/lib/billing-profiles";

import { AddProfileSheet } from "./profile-sheet";

/**
 * The Billing profiles pages' states (F7), on the shared states
 * (`@saroh/ui/data-state`, `FailedRead`): loading, no profiles yet, an owner
 * whose business has none, a teammate who owns none, and a read that
 * failed. The page's header stays above each.
 */

export function LoadingProfiles({
    what = "your billing profiles",
}: {
    what?: string;
}) {
    return <LoadingState rows={3} label={`Loading ${what}`} />;
}

export const EMPTY_TITLE = "No billing profiles yet";
export const EMPTY_SAYS =
    "Your first one is made when you create a business, from its details. Nothing is charged until you pick a paid plan.";

export function EmptyProfiles({ createUrl }: { createUrl: string }) {
    return (
        <EmptyState
            size="panel"
            title={EMPTY_TITLE}
            description={EMPTY_SAYS}
            action={
                <Button asChild>
                    <a href={createUrl}>Create a business</a>
                </Button>
            }
        />
    );
}

/** "Saroh hasn't got billing details for CarePoint Clinic yet." */
export function ownerNoProfileSays(names: string[]): string {
    return `Saroh hasn't got billing details for ${namesList(names)} yet. Add them before you pick a paid plan.`;
}

/**
 * An owner whose business has no profile (UX audit, 28 Oct: they were told
 * the first is made when a business is created, with no way through). Add
 * opens here, the business already chosen to bill.
 */
export function OwnerNoProfile({
    businesses,
}: {
    businesses: readonly OwnedBusiness[];
}) {
    const [adding, setAdding] = useState(false);
    const [opening, setOpening] = useState(0);
    const none: readonly BillingProfile[] = [];
    return (
        <>
            <EmptyState
                size="panel"
                title={EMPTY_TITLE}
                description={ownerNoProfileSays(businesses.map((b) => b.name))}
                action={
                    <Button
                        type="button"
                        onClick={() => {
                            setOpening((n) => n + 1);
                            setAdding(true);
                        }}
                    >
                        + Add billing profile
                    </Button>
                }
            />
            <AddProfileSheet
                key={opening}
                profiles={none}
                businesses={businesses}
                billFirst={businesses[0]?.id}
                open={adding}
                onClose={() => setAdding(false)}
            />
        </>
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
    return (
        <EmptyState
            size="panel"
            title={TEAMMATE_TITLE}
            description={teammateSays(businesses)}
        />
    );
}

/** A read that failed: said, with Try again; nothing was changed. */
export function FailedProfiles({
    what = "your billing profiles",
}: {
    what?: string;
}) {
    return <FailedRead size="panel" things={what} />;
}
