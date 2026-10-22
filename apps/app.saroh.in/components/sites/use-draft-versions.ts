"use client";

import { useState } from "react";

import type {
    StarterContentActions,
    VersionsRead,
} from "@/components/sites/editor/starter-content-actions";

/**
 * The state behind Previous versions (DEC-182, amended 22 Oct 2026): the
 * list read when the sheet opens, which version is asking to roll back or
 * showing its sections to bring in, and what the last try said. The
 * changes themselves are `starterContentActions`'; each success starts the
 * editor afresh, so the sheet closes.
 */
export function useDraftVersions(
    starter: StarterContentActions,
    onDone: () => void,
) {
    const [read, setRead] = useState<VersionsRead | null>(null);
    /** The version whose roll back is being confirmed. */
    const [confirming, setConfirming] = useState<string | null>(null);
    /** The version whose sections are shown to bring in. */
    const [showing, setShowing] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        setRead(null);
        setConfirming(null);
        setShowing(null);
        setError(null);
        setRead(await starter.listVersions());
    }

    async function run(
        change: () => ReturnType<StarterContentActions["rollback"]>,
    ) {
        setBusy(true);
        setError(null);
        let outcome: Awaited<ReturnType<typeof change>>;
        try {
            outcome = await change();
        } finally {
            setBusy(false);
        }
        if (outcome.ok) onDone();
        else setError(outcome.error);
    }

    return {
        read,
        confirming,
        showing,
        busy,
        error,
        load,
        askRollback: (id: string | null) => {
            setError(null);
            setConfirming(id);
        },
        toggleSections: (id: string) => {
            setError(null);
            setShowing((open) => (open === id ? null : id));
        },
        rollback: (id: string) => run(() => starter.rollback(id)),
        bringIn: (id: string, pageId: string, sectionKey: string) =>
            run(() => starter.bringIn(id, pageId, sectionKey)),
    };
}
