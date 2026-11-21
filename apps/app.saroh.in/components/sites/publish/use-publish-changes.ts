import { useRef, useState } from "react";

import { readSiteChanges } from "@/lib/sites/changes-read";
import {
    defaultLeftOut,
    includesWaiting,
    withDependants,
} from "@/lib/sites/leave-out";
import type { SiteChanges } from "@/lib/sites/service";

/**
 * The Publish sheet's changes (U11): read afresh each time it opens
 * (whoever opens it calls `load`), and
 * what this person chose to leave out. A failed publish keeps the choices
 * (Try again sends the same); a new opening starts from the defaults.
 */
export function usePublishChanges(siteId: string) {
    const [changes, setChanges] = useState<SiteChanges | null>(null);
    const [read, setRead] = useState<"loading" | "failed" | "ready">("loading");
    const [chosen, setChosen] = useState<Set<string>>(new Set());
    // Only the newest read may write (the rule `refreshFlags` keeps).
    const request = useRef(0);

    /** Read afresh: on each opening of the sheet, and on Try again. */
    async function load() {
        const mine = ++request.current;
        setRead("loading");
        try {
            const next = await readSiteChanges(siteId);
            if (mine !== request.current) return;
            setChanges(next);
            setChosen(defaultLeftOut(next));
            setRead("ready");
        } catch {
            if (mine === request.current) setRead("failed");
        }
    }

    const units = changes?.units ?? [];
    const leftOut = withDependants(units, chosen);

    /**
     * Leave out, or put back in. Putting back a change that needs another
     * left out puts that one back too, so what is shown is what goes.
     */
    function toggle(key: string) {
        setChosen((prev) => {
            const next = new Set(prev);
            if (!leftOut.has(key)) {
                next.add(key);
                return next;
            }
            const back = [key];
            for (let k = back.pop(); k !== undefined; k = back.pop()) {
                next.delete(k);
                const unit = units.find((u) => u.key === k);
                for (const r of unit?.requires ?? []) {
                    if (withDependants(units, next).has(r)) back.push(r);
                }
            }
            return next;
        });
    }

    return {
        changes,
        read,
        load,
        leftOut,
        toggle,
        /** An owner put in a change that waits for approval (KTD-6). */
        overriding: includesWaiting(
            units,
            leftOut,
            changes?.approvalRequired === true,
        ),
    };
}

export type PublishChanges = ReturnType<typeof usePublishChanges>;
