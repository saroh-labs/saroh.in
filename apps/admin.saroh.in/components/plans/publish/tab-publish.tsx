"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { pricingImpactAction } from "@/lib/pricing-actions";
import { upcomingVersions } from "@/lib/pricing-draft";
import type { Impact } from "@/lib/pricing-types";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { nextVersion } from "../versions/versions";
import { CompareTable } from "./compare-table";
import type { ImpactState } from "./impact-list";
import { ImpactList } from "./impact-list";
import { PublishPanel } from "./publish-panel";

/**
 * Review & publish (plans catalogue U10): what the draft does to real
 * businesses, live and draft side by side, and the publish panel. The
 * impact is the API's, worked out for the saved revision: opening the tab
 * saves what is on screen first, so it never describes an older draft.
 */
export function TabPublish() {
    const { pricing, access } = usePlans();
    const draft = useDraft();
    const { hasDraft, check, revision, save, flush } = draft;
    const [fetched, setFetched] = useState<{
        revision: number;
        impact: Impact | null;
    } | null>(null);
    const [failed, setFailed] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    const known =
        draft.impact ??
        (fetched?.revision === revision ? fetched.impact : null);
    const wanted = hasDraft && check.valid && !known;

    const busy = useRef(false);
    const load = useCallback(async () => {
        if (busy.current) return;
        busy.current = true;
        setFailed(null);
        try {
            const { saved, revision: rev } = await flush();
            if (!saved) return;
            const r = await pricingImpactAction();
            if (!r.ok) {
                setFailed(r.error);
                return;
            }
            if (!r.data) {
                setFailed("What this draft does can't be worked out just now.");
                return;
            }
            // An answer for an older revision waits for the next one.
            if (r.data.revision === rev) {
                setFetched({ revision: rev, impact: r.data.impact });
            }
        } finally {
            busy.current = false;
        }
    }, [flush]);

    useEffect(() => {
        if (!wanted || save === "saving") return;
        void load();
    }, [wanted, save, revision, attempt, load]);

    const state: ImpactState = !hasDraft
        ? { kind: "none" }
        : !check.valid
          ? { kind: "invalid", errors: check.errors }
          : failed
            ? { kind: "failed", error: failed }
            : known
              ? { kind: "ready", impact: known }
              : { kind: "loading" };

    const live = draft.live?.catalog ?? null;
    const scheduled = upcomingVersions(pricing).at(0);
    const blocked =
        save === "conflict"
            ? "Reload the draft first"
            : !check.valid
              ? "Fix the draft before publishing"
              : check.changes.length === 0
                ? "Nothing differs from the live version"
                : scheduled
                  ? `Version ${scheduled.version} is already scheduled`
                  : null;

    return (
        <div className="grid gap-3.5 text-[13.5px]">
            <ImpactList
                state={state}
                onRetry={() => setAttempt((n) => n + 1)}
            />
            {draft.catalog && (
                <CompareTable live={live} draft={draft.catalog} />
            )}
            {hasDraft &&
                (access.canPublish ? (
                    <PublishPanel
                        nextV={nextVersion(pricing.versions)}
                        blocked={blocked}
                    />
                ) : (
                    <p className="rounded-[14px] border border-border bg-card px-4 py-3.5 text-[12.5px] text-muted-foreground">
                        Publishing needs permission to publish pricing. Someone
                        who has it can publish this draft from here.
                    </p>
                ))}
        </div>
    );
}
