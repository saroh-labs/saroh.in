import { blockExample } from "@saroh/block-contract";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useEffect, useMemo, useRef, useState } from "react";

import {
    newFormIds,
    stampFormIds,
} from "@/components/sites/editor/stamp-form-ids";
import { emptySection } from "@/components/sites/empty-section";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { saveableSections } from "@/components/sites/saveable-sections";
import { withVariant } from "@/components/sites/section-fields/variant-field";
import { syncEnquiryForms } from "@/components/sites/sync-enquiry-forms";
import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import { ensureFormForSection } from "@/lib/forms/actions";
import { saveDraftSections } from "@/lib/sites/actions";
import { insertPosition } from "@/lib/sites/editor-positions";
import type { SiteChangeKind } from "@/lib/sites/pending";
import type { Section, SectionType } from "@/lib/sites/service";

/**
 * The page's sections as the merchant edits them, what the server last
 * accepted, and the autosave between the two. Moved out of `site-editor.tsx`
 * unchanged (#260).
 */
export function useEditorDraft({
    siteId,
    pageId,
    siteName,
    initialSections,
    initialRevision,
    publishing,
    recordSaved,
    refreshFlags,
    selectedIndexNow,
}: {
    siteId: string;
    pageId: string;
    siteName: string;
    initialSections: Section[];
    /** Which edit of the draft `initialSections` are (#285). */
    initialRevision: number;
    /** Nothing autosaves while a publish is in flight. */
    publishing: boolean;
    /** What publishing would change, as the save recounted it. */
    recordSaved: (
        sections: number | null,
        site: SiteChangeKind[] | null,
    ) => void;
    /** Flags settle after a save, not per keystroke. */
    refreshFlags: () => Promise<void>;
    /** The selection as of now, where a new block goes after. */
    selectedIndexNow: () => number | null;
}) {
    const [sections, setSections] = useState<Section[]>(initialSections);
    /*
     * The list the server holds for this page: what the last accepted save
     * SENT, which is not always what is on screen. A section that fails its
     * contract is held back from the save (`saveable-sections.ts`), and this is
     * where its previously saved version is found.
     */
    const [savedSections, setSavedSections] =
        useState<Section[]>(initialSections);
    const lastSavedJson = useMemo(
        () => JSON.stringify(savedSections),
        [savedSections],
    );
    const [saving, setSaving] = useState(false);
    const [errorIndex, setErrorIndex] = useState<number | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
    const [saveError, setSaveError] = useState(false);
    /*
     * The draft's revision, and whether someone else has moved past it (#285).
     *
     * On a conflict the editor stops saving and says so. It does NOT reload by
     * itself: the merchant's unsaved work is the thing at risk, and throwing it
     * away to fetch someone else's version is the failure this was written to
     * prevent, only faster.
     */
    const [revision, setRevision] = useState(initialRevision);
    const [conflict, setConflict] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const sectionsJson = JSON.stringify(sections);
    const dirty = sectionsJson !== lastSavedJson;
    /*
     * What a save would send right now, and what it would hold back. DERIVED
     * from the sections on screen, not stored from the last save: a stored
     * list went stale whenever the page changed without a save — a revert, a
     * removal, a fix typed while a save was in flight, a failed save (review
     * of #328). The save itself runs the same function, so the markers and
     * what is actually sent cannot disagree.
     */
    const livePlan = useMemo(
        () => saveableSections(sections, savedSections),
        [sections, savedSections],
    );
    const heldBack = livePlan.heldBack;
    /*
     * Everything that could be saved is, and only unfinished sections are
     * waiting. Still `dirty` — publish stays blocked, because the page on
     * screen is not the page that would go live.
     */
    const onlyHeldBack =
        dirty &&
        heldBack.length > 0 &&
        JSON.stringify(livePlan.toSend) === lastSavedJson;

    // Unfinished sections that were never saved live only in this tab, and the
    // bar reads "Saved · …" for everything else (review of #328).
    useLeaveGuard(dirty);

    /** Why the section at this position is not saved, if the last save held it back. */
    function heldBackAt(index: number): HeldBackSection | undefined {
        // Nothing differs from what is saved, so nothing is waiting. (A
        // section stored invalid before its contract tightened is reported
        // by `unreadableSections` instead.)
        if (!dirty) return undefined;
        return heldBack.find((h) => h.index === index);
    }

    function replaceAt(index: number, next: Section) {
        setSections((prev) => prev.map((s, i) => (i === index ? next : s)));
    }

    /** The block count as of the last add, ahead of React's next render. */
    const sectionCount = useRef(sections.length);
    useEffect(() => {
        sectionCount.current = sections.length;
    }, [sections.length]);

    /**
     * Add a block after the selected one (or at the end), and say where it
     * went so the caller can select it and bring it into view (#337). A look
     * chosen in the picker is set the way the Look field sets it, so the two
     * cannot disagree (#267, #254).
     */
    function insertSection(type: SectionType, variant?: string): number {
        const empty = emptySection(type);
        /*
         * Start from the example the picker showed, so the block reads like
         * the preview that was chosen rather than an empty box. The flag
         * engine names any example text still there before it goes live.
         * Blocks with no example (testimonials, contact, gallery, and those
         * seeded with working defaults) start as they always have.
         */
        const example = blockExample(type, variant);
        const section: Section = example
            ? ({
                  ...empty,
                  contractVersion: example.contractVersion,
                  content: structuredClone(example.content),
              } as Section)
            : variant
              ? withVariant(empty, variant)
              : empty;
        // Read at call time, not from this render: two quick adds must land
        // in the order they were clicked.
        const at = insertPosition(selectedIndexNow(), sectionCount.current);
        sectionCount.current += 1;
        setSections((prev) => [
            ...prev.slice(0, at),
            section,
            ...prev.slice(at),
        ]);
        return at;
    }

    function removeAt(index: number) {
        setSections((prev) => prev.filter((_, i) => i !== index));
        setErrorIndex(null);
        setErrorMessage(null);
    }

    function move(index: number, delta: number) {
        moveTo(index, index + delta);
    }

    /**
     * Move a section to an absolute position. The arrows and the drag both
     * land here so there is one definition of what reordering means, and the
     * array order IS the saved order — the API persists `order = index`.
     */
    function moveTo(from: number, to: number) {
        setSections((prev) => {
            if (to < 0 || to >= prev.length || from === to) return prev;
            const next = [...prev];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return next;
        });
    }

    /**
     * Hide or show a section. Hiding is not deleting: the section keeps its
     * place and its copy, and publish leaves it out of the snapshot. That is
     * the whole point — a merchant can take a section off the live site
     * without losing the work that went into it.
     */
    function toggleHidden(index: number) {
        setSections((prev) =>
            prev.map((s, i) => (i === index ? { ...s, hidden: !s.hidden } : s)),
        );
    }

    /**
     * Sync each enquiry section's backing Form to its authored fields before
     * saving, writing the returned `formId` back into the section content. The
     * Form is what a submission targets. It is NOT what a live submission is
     * validated against: that is the published snapshot's fields (#281), so a
     * draft edit synced here cannot change what the live site accepts. On any
     * failure (including a missing active org) the offending section index +
     * message are surfaced and the save is aborted.
     */
    /*
     * The draft the last save failed on, as JSON. Without it a failure re-arms
     * the autosave below — still dirty, no longer saving — and the same draft
     * goes out again every 1.5s, each attempt with a fresh error toast, for as
     * long as the failure lasts. A ref rather than state: it only gates the
     * timer, and nothing on screen reads it.
     */
    const failedJson = useRef<string | null>(null);

    async function onSave(auto = false) {
        setSaving(true);
        setErrorIndex(null);
        setErrorMessage(null);

        // Keep every enquiry section's Form in sync first — this stamps the
        // returned formId into the content we then persist + publish.
        const synced = await syncEnquiryForms(
            sections,
            { id: siteId, name: siteName },
            ensureFormForSection,
        );
        if (!synced.ok) {
            setSaving(false);
            // Not saved, and the bar has to say so (#281). A failed form sync
            // used to leave saveError alone, so the bar kept showing the last
            // successful save while this one had failed.
            setSaveError(true);
            setErrorIndex(synced.index);
            setErrorMessage(synced.error);
            showError(synced.error);
            // Recorded like any other failed save, so the autosave does not
            // send the same draft again every 1.5s with a fresh toast.
            failedJson.current = JSON.stringify(sections);
            return;
        }
        // Stamp ONLY the new formIds onto what is on screen now (#281).
        const found = newFormIds(sections, synced.sections);
        if (found.length > 0) {
            setSections((current) =>
                stampFormIds(current, found, sections.length),
            );
        }

        /*
         * A thrown save is a DIFFERENT failure from a rejected one, and it was
         * the only one not handled. The service returns { ok: false } for
         * anything the api answered — but if the api is unreachable the fetch
         * rejects, the await throws, and `setSaving(false)` below never ran:
         * the bar sat on "Saving…" for ever while the work stayed unsaved.
         *
         * The editor's own rule is that an autosave failing silently is worse
         * than a Save button that visibly fails. An outage has to look like a
         * failure, and the retry is the next edit.
         */
        /*
         * Send only what passes its contract. The API refuses the whole list
         * on the first invalid section, and a section is added empty — so one
         * new section used to stop every other edit on the page from saving.
         * An unfinished section is held back instead: left out if it was never
         * saved, or sent as its saved version so the save does not delete it.
         */
        const plan = saveableSections(synced.sections, savedSections);
        if (
            plan.heldBack.length > 0 &&
            JSON.stringify(plan.toSend) === lastSavedJson
        ) {
            // The server already has everything that can be sent: only the
            // unfinished sections changed. No request, nothing to announce.
            setSaving(false);
            failedJson.current = null;
            setSaveError(false);
            return;
        }
        const res = await saveDraftSections(
            siteId,
            pageId,
            plan.toSend,
            revision,
        ).catch(() => ({
            ok: false as const,
            error: "Could not reach Saroh — your work is still here. It will save again with your next edit.",
        }));
        setSaving(false);
        if (res.ok) {
            failedJson.current = null;
            if (typeof res.data.revision === "number") {
                setRevision(res.data.revision);
            }
            setSavedSections(plan.toSend);
            setLastSavedAt(new Date());
            setSaveError(false);
            // The save recounted what publishing would change; take its answer
            // rather than guessing at one from what was just sent.
            recordSaved(
                res.data.pendingSectionChanges ?? null,
                res.data.pendingSiteChanges ?? null,
            );
            // An autosave that announces itself every few seconds is noise; the
            // bar already states when it last saved.
            if (!auto) showSuccess("Draft saved.");
            /*
             * The flags settle here — after the save, not on every keystroke.
             * Deliberately not awaited: the dots catching up a moment later is
             * fine, and blocking the save's completion on an advisory check
             * would make editing feel slower for no benefit.
             */
            void refreshFlags();
            return;
        }
        failedJson.current = JSON.stringify(synced.sections);
        setSaveError(true);
        if ("conflict" in res && res.conflict === true) {
            // Stops the autosave loop from retrying a save that can only lose
            // one side's work. The banner offers the reload instead.
            setConflict(true);
        }
        if ("index" in res && typeof res.index === "number") {
            // The server counts positions in what was SENT; the editor's list
            // may have held-back sections in between.
            setErrorIndex(plan.sentFrom[res.index] ?? res.index);
            setErrorMessage(res.error);
        }
        showError(res.error);
    }

    /*
     * Autosave, debounced.
     *
     * The design replaces an explicit Save with "Draft changes · autosaved 2m
     * ago", which is only an improvement if failure is visible: an autosave that
     * fails silently is worse than a Save button that visibly does. The bar
     * therefore reads "Not saved" on failure and keeps the work in local state,
     * so the next edit retries.
     *
     * Publishing is blocked while dirty or saving, so a merchant can never
     * publish a state the server has not accepted.
     */
    useEffect(() => {
        if (!dirty || saving || publishing) return;
        /*
         * Nothing autosaves once the draft has moved on under this editor
         * (#285). Every later edit would carry the same stale revision and be
         * refused, so retrying is noise — and if it were not refused, it would
         * be overwriting the other editor's work keystroke by keystroke.
         */
        if (conflict) return;
        // Not the draft that just failed, again: see `failedJson`. Any edit
        // changes the JSON, so the next edit is still the retry.
        if (saveError && JSON.stringify(sections) === failedJson.current) {
            return;
        }
        // Nor a list whose only unsaved part is unfinished sections: sending
        // it again changes nothing until one of them is filled in.
        if (onlyHeldBack) return;
        const id = setTimeout(() => {
            void onSave(true);
        }, 1500);
        return () => clearTimeout(id);
        // `onSave` is redefined each render; depending on it would restart the
        // timer on every keystroke and never fire.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        dirty,
        saving,
        publishing,
        saveError,
        conflict,
        sections,
        onlyHeldBack,
    ]);

    return {
        sections,
        dirty,
        saving,
        saveError,
        lastSavedAt,
        conflict,
        errorIndex,
        errorMessage,
        heldBack,
        onlyHeldBack,
        heldBackAt,
        /** Where each sent section sits on screen, for per-block flags. */
        sentFrom: livePlan.sentFrom,
        replaceAt,
        /** Put a previous list back: Undo (G3, `use-undo.ts`). */
        restoreSections: setSections,
        insertSection,
        removeAt,
        move,
        moveTo,
        toggleHidden,
    };
}

export type EditorDraft = ReturnType<typeof useEditorDraft>;
