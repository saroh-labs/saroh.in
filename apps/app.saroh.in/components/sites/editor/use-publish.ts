import { showError, showSuccess } from "@saroh/ui/toast";
import { useCallback, useRef, useState } from "react";

import { unfinishedPhrase } from "@/components/sites/held-back-copy";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { getSiteFlags, publishSite } from "@/lib/sites/actions";
import type { SiteChangeKind } from "@/lib/sites/pending";
import {
    describePendingChanges,
    shortPendingChanges,
} from "@/lib/sites/pending";
import type { SiteFlags } from "@/lib/sites/service";

/** What the draft must say before the pre-publish check may open. */
export interface DraftReadiness {
    dirty: boolean;
    onlyHeldBack: boolean;
    heldBack: HeldBackSection[];
}

/**
 * Publishing: the site's flags, what publishing would change, the pre-publish
 * check and the publish itself, including publishing past a review (#278).
 * Moved out of `site-editor.tsx` unchanged (#260).
 */
export function usePublish({
    siteId,
    address,
    initialFlags,
    initialNeverPublished,
    initialPendingChanges,
    initialPendingSiteChanges,
    refreshReview,
    initialNeedsApproval = false,
    canOverride = false,
    onLiveChanged,
}: {
    siteId: string;
    address?: string | null;
    initialFlags: SiteFlags;
    initialNeverPublished: boolean;
    initialPendingChanges: number | null;
    initialPendingSiteChanges: SiteChangeKind[] | null;
    /** Publishing moves the review state too; the review hook re-reads it. */
    refreshReview: () => Promise<void>;
    /**
     * "Publishing needs approval" is on (DEC-071, R10): Publish is refused
     * unless an owner overrides. State, because a refusal can reveal it was
     * turned on since the editor loaded.
     */
    initialNeedsApproval?: boolean;
    /** This person is an owner who can publish past it (KTD-11). */
    canOverride?: boolean;
    /** The live site moved: the test releases re-read what they say. */
    onLiveChanged?: () => void;
}) {
    const [needsApproval, setNeedsApproval] = useState(initialNeedsApproval);
    const [publishing, setPublishing] = useState(false);
    /*
     * Flags come from the server and settle after each save rather than
     * updating per keystroke. The spec calls them "quiet until publish", and a
     * dot that flickers as you type is the opposite of quiet — it also keeps
     * one implementation of nine rules instead of two that can disagree.
     */
    const [siteFlags, setSiteFlags] = useState<SiteFlags>(initialFlags);
    /*
     * How many sections publishing would change (#190).
     *
     * The SERVER's number, not one this component works out. It is a diff
     * between the draft and the live publication, and the browser holds only
     * the page it is editing — so a count computed here would speak for one
     * page while the button it sits beside publishes the whole site. Refreshed
     * from each save's response, which is why it is state rather than a prop.
     *
     * Null until the site has published once; the button says "Publish site"
     * in that case and there is no count to give.
     */
    const [pendingChanges, setPendingChanges] = useState<number | null>(
        initialPendingChanges,
    );
    const [pendingSiteChanges, setPendingSiteChanges] = useState<
        SiteChangeKind[] | null
    >(initialPendingSiteChanges);
    const [checking, setChecking] = useState(false);
    /*
     * Whether anything is live yet (#288).
     *
     * State, not the prop it starts from: after the first publish the button
     * still read "Publish site" and "Nothing's live yet" stayed above the
     * preview until a reload, which is the editor telling a merchant their
     * publish did not happen.
     *
     * `router.refresh()` would fix it and cost more than it fixes — it
     * remounts the editor, dropping the selected section and the scroll
     * position, so the merchant would lose their place as a reward for
     * publishing.
     */
    const [neverPublished, setNeverPublished] = useState(initialNeverPublished);

    /*
     * One counter for the flags re-read. It fires from several places — every
     * autosave, opening the check, publishing — and nothing orders the
     * responses, so a slow early read landing after a fast later one would put
     * back the state from before. Each call takes the next number and only the
     * newest may write; the same rule `measuring` keeps for the share image in
     * site settings.
     */
    const flagsRequest = useRef(0);

    /** Re-read flags from the server. They settle after a save, not per key. */
    async function refreshFlags() {
        const request = ++flagsRequest.current;
        const next = await getSiteFlags(siteId);
        if (request !== flagsRequest.current) return;
        setSiteFlags(next);
    }

    const pendingSummary = describePendingChanges(
        pendingChanges,
        pendingSiteChanges,
    );
    /** The same, in the pill's words: "2 blocks, footer" (G2). */
    const pendingShort = shortPendingChanges(
        pendingChanges,
        pendingSiteChanges,
    );
    /*
     * Whether the server's count is here at all (G2). Null is how a site that
     * has never published says "nothing to compare with", so on a published
     * site a null count means the read or the save that carries it came back
     * without one. The bar then says it couldn't check, never "Published".
     */
    const pendingKnown =
        neverPublished ||
        pendingChanges !== null ||
        pendingSiteChanges !== null;

    /**
     * A save recounted what publishing would change; take its answer rather
     * than guessing at one from what was just sent.
     */
    function recordSaved(
        sections: number | null,
        site: SiteChangeKind[] | null,
    ) {
        setPendingChanges(sections);
        setPendingSiteChanges(site);
    }

    /**
     * A saved site setting — the style, or the name or footer typed in the
     * inspector (G6) — is a change publishing would make; without this the
     * pill read "Published" (review). Stable, so the autosaves can depend on
     * it. The next section save recounts, and its answer replaces this.
     */
    const markSitePending = useCallback((kind: SiteChangeKind) => {
        setPendingSiteChanges((prev) =>
            prev === null || prev.includes(kind) ? prev : [...prev, kind],
        );
    }, []);
    const markStylePending = useCallback(
        () => markSitePending("style"),
        [markSitePending],
    );

    /**
     * Publishing goes through the pre-publish check first — the spec makes it
     * "its own moment before going live", not a button that fires immediately.
     * The check itself never refuses: every flag is advisory, so the merchant
     * can read them and publish anyway from the same screen.
     */
    async function openCheck({
        dirty,
        onlyHeldBack,
        heldBack,
    }: DraftReadiness) {
        if (dirty) {
            // "Save first" cannot help when everything saveable IS saved and
            // only unfinished sections are waiting; name what will.
            showError(
                onlyHeldBack
                    ? `Finish or remove ${unfinishedPhrase(heldBack)} before publishing.`
                    : "You have unsaved changes — save the draft first.",
            );
            return;
        }
        setChecking(true);
        // Re-read rather than trusting what was loaded: the merchant may have
        // been editing for an hour, and a stale check is worse than none.
        await refreshFlags();
    }

    /** `siteName` is the name as it is now: the inspector can change it (G6). */
    async function onPublish(siteName: string) {
        setPublishing(true);
        // With the setting on, only an owner's Publish goes through, and it
        // is sent as the override it is, so the record is written (T9).
        const override = needsApproval && canOverride;
        const res = await publishSite(siteId, override);
        setPublishing(false);
        if (!res.ok) {
            if (res.code === "APPROVAL_REQUIRED") {
                // Turned on since the editor loaded: the bar says so now,
                // and the way on is a test release someone approves.
                setNeedsApproval(true);
                showError(
                    res.error,
                    canOverride
                        ? "Make a test release and get it approved, or publish without approval."
                        : "Make a test release and get it approved, then go live with it.",
                );
                return;
            }
            showError(res.error);
            return;
        }
        setChecking(false);
        /*
         * The live state names the business and its address, per the spec —
         * "Flour & Ferment is live at flour-and-ferment.saroh.app". A bare
         * "Published" leaves the merchant to go and check what happened.
         */
        const live =
            address === null || address === undefined
                ? `${siteName} is live.`
                : `${siteName} is live at ${address}.`;
        showSuccess(
            // Bypassing is recorded, not prevented (#199) — and said, so the
            // record is never a surprise in version history later.
            override
                ? `${live} Recorded as gone live without approval.`
                : res.data.bypassed
                  ? `${live} Recorded as published without approval.`
                  : live,
        );
        /*
         * Everything the bar counted just went live, so the count is zero —
         * set here rather than left for the next autosave to recount, which
         * never comes if the merchant only opened the editor to publish. The
         * review state moves too: publishing over a request for changes writes
         * a bypass record, and the approval line should say so now rather
         * than after a reload. Flags are re-read for the same reason.
         */
        setPendingChanges(0);
        // The site-level settings went live too.
        setPendingSiteChanges([]);
        // Something is live now, so the button stops offering to publish the
        // site and the "nothing's live yet" line goes (#288).
        setNeverPublished(false);
        // A scheduled go-live won't run over this publish (KTD-14); the
        // releases re-read, and Go live's "replaces" line moves on.
        onLiveChanged?.();
        await Promise.all([refreshFlags(), refreshReview()]);
    }

    /**
     * A test release went live (T11): something is live, and what publishing
     * would change is the server's new count — or unknown until the next
     * save, when it couldn't be read. Never guessed.
     */
    async function recordWentLive(
        pending: {
            sections: number | null;
            site: SiteChangeKind[] | null;
        } | null,
    ) {
        setNeverPublished(false);
        setPendingChanges(pending?.sections ?? null);
        setPendingSiteChanges(pending?.site ?? null);
        await Promise.all([refreshFlags(), refreshReview()]);
    }

    return {
        needsApproval,
        canOverride,
        recordWentLive,
        siteFlags,
        refreshFlags,
        pendingSummary,
        pendingShort,
        pendingKnown,
        recordSaved,
        markStylePending,
        markSitePending,
        checking,
        setChecking,
        publishing,
        neverPublished,
        openCheck,
        onPublish,
    };
}

export type EditorPublish = ReturnType<typeof usePublish>;
