"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { LookId } from "@saroh/block-contract";

import type { LookChoice } from "@/components/sites/looks/look-picker";
import { lookChoices, lookName } from "@/components/sites/looks/look-picker";
import { starterContentActions } from "@/components/sites/looks/starter-content-actions";
import { addPageOffers } from "@/lib/sites/page-menu";
import type { ModulePageKind } from "@/lib/sites/service";

import { AddPageSheet } from "./add/add-page-sheet";

/**
 * Empty site, first time (E1, `fix/WXKStates`): start from a look filled
 * with the business's services, prices and hours (the look's starter
 * content, DEC-182, with Bring in my details), or add a page in Add's own
 * sheet. Neither leaves the editor; either reads the site again, and the
 * editor opens on its new pages. A reader is told nothing waits for them.
 * Ask AI beside them (E2) waits for batch 8.
 */
export function EmptySite({
    siteId,
    readOnly,
    address,
    looksAvailable,
    draftLook,
    addableKinds,
}: {
    siteId: string;
    readOnly: boolean;
    address: string | null;
    /** The looks are on for this business (`lookChoices`). */
    looksAvailable: boolean;
    draftLook: LookId | null;
    addableKinds: ModulePageKind[];
}) {
    // Classic at least, whatever the rollout: a look is always a start.
    const offered = lookChoices({
        available: looksAvailable,
        draftLook,
        liveLook: null,
    });
    const looks: LookChoice[] = offered.length ? offered : ["classic"];
    const router = useRouter();
    const [picking, setPicking] = useState(false);
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState<LookChoice | null>(null);
    const [error, setError] = useState<string | null>(null);
    const starter = starterContentActions({
        siteId,
        homePageId: null,
        unsaved: false,
        settleUndo: () => undefined,
        reloadDraft: () => router.refresh(),
    });

    if (readOnly) {
        return (
            <EmptyState
                title="Your site has no pages yet"
                description="Pages show here once a teammate adds one."
            />
        );
    }
    const start = async (look: LookChoice) => {
        setBusy(look);
        setError(null);
        const done = await starter.copy(look === "classic" ? null : look, true);
        setBusy(null);
        if (!done.ok) setError(done.error);
    };
    return (
        <>
            <EmptyState
                title="Your site has no pages yet"
                description="Start from a look filled with your services, prices and hours, or add a page of your own."
                action={
                    <div className="grid justify-items-center gap-3">
                        <div className="flex flex-wrap justify-center gap-2">
                            {looks.length > 0 ? (
                                <Button
                                    type="button"
                                    aria-expanded={picking}
                                    onClick={() => setPicking((p) => !p)}
                                >
                                    Start from a look
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setAdding(true)}
                            >
                                Add a page
                            </Button>
                        </div>
                        {picking ? (
                            <ul
                                aria-label="Looks"
                                className="flex flex-wrap justify-center gap-2"
                            >
                                {looks.map((look) => (
                                    <li key={look}>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            busy={busy === look}
                                            disabled={busy !== null}
                                            onClick={() => void start(look)}
                                        >
                                            {lookName(
                                                look === "classic"
                                                    ? null
                                                    : look,
                                            )}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {error ? (
                            <p
                                role="alert"
                                className="text-sm text-destructive"
                            >
                                {error}
                            </p>
                        ) : null}
                    </div>
                }
            />
            <AddPageSheet
                open={adding}
                siteId={siteId}
                address={address}
                offers={addPageOffers(addableKinds)}
                page={undefined}
                start="blank"
                onClose={() => setAdding(false)}
                onAdded={(page) => {
                    setAdding(false);
                    router.push(`/sites/${siteId}?page=${page.id}`);
                    router.refresh();
                }}
            />
        </>
    );
}
