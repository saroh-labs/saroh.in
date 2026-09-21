"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { showError, showSuccess } from "@saroh/ui/toast";
import {
    ChevronDown,
    ChevronLeft,
    Eye,
    Link2,
    Lock,
    Monitor,
    Palette,
    PanelBottom,
    PanelTop,
    Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddSectionDialog } from "@/components/sites/add-section-dialog";
import { SECTION_ICONS } from "@/components/sites/block-icons";
import {
    BlockInspector,
    FixedBlockInspector,
} from "@/components/sites/block-inspector";
import { EditorTabs, PanelDivider } from "@/components/sites/editor-chrome";
import type { Device } from "@/components/sites/editor-constants";
import {
    DEVICE_WIDTH,
    DEVICES,
    SECTION_LABELS,
    sectionTitle,
} from "@/components/sites/editor-constants";
import { emptySection } from "@/components/sites/empty-section";
import {
    heldBackSummary,
    unfinishedPhrase,
} from "@/components/sites/held-back-copy";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { saveableSections } from "@/components/sites/saveable-sections";
import { withVariant } from "@/components/sites/section-fields/variant-field";
import { syncEnquiryForms } from "@/components/sites/sync-enquiry-forms";
import { useLeaveGuard } from "@/components/sites/use-leave-guard";
import { useServicesForPicker } from "@/components/sites/use-services-for-picker";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PagesPanel } from "@/components/sites/pages-panel";
import { PrePublishCheck } from "@/components/sites/pre-publish-check";
import { ReviewPanel } from "@/components/sites/review-panel";
import { DraftPreview } from "@/components/sites/section-preview";
import { StylePanel } from "@/components/sites/style-panel";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { ensureFormForSection } from "@/lib/forms/actions";
import {
    getReviewState,
    getSiteFlags,
    listComments,
    publishSite,
    requestReview,
    saveDraftSections,
    updateSiteStyle,
} from "@/lib/sites/actions";
import {
    getChrome,
    getChromeOnServer,
    getPlace,
    PANEL_DEFAULT,
    PANEL_MAX,
    PANEL_MIN,
    placeOnServer,
    RAIL_DEFAULT,
    RAIL_MAX,
    RAIL_MIN,
    setChrome,
    setPlace,
    subscribe,
} from "@/lib/sites/editor-prefs";
import type { EditorStatusTone } from "@/lib/sites/editor-status";
import { editorStatus } from "@/lib/sites/editor-status";
import { exactDate } from "@/lib/sites/format-date";
import type { SiteChangeKind } from "@/lib/sites/pending";
import { describePendingChanges } from "@/lib/sites/pending";
import type {
    ApprovalOutcome,
    Flag,
    ReviewState,
    Section,
    SectionType,
    SiteCommentView,
    SiteFlags,
    SiteFooter,
    SiteNavigation,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * The bar's verdict badge, worded per outcome. Keyed by the union so a new
 * outcome is a type error here rather than a badge that falls through to
 * "asked for changes". Only an approval takes the accent: it is the one
 * good-news verdict.
 *
 * `stale` is whether the newest approval was of a different draft than the one
 * that would go live now (#278). #193: an approval "does not survive later
 * edits to that draft" — so the badge must not keep claiming it does, and an
 * approval that no longer covers the work does not keep the accent either.
 */
const APPROVAL_BADGE: Record<
    ApprovalOutcome,
    {
        approved: (stale: boolean) => boolean;
        text: (by: string, stale: boolean) => string;
    }
> = {
    REQUESTED: {
        approved: () => false,
        text: (by) => `In review — asked by ${by}`,
    },
    APPROVED: {
        approved: (stale) => !stale,
        text: (by, stale) =>
            stale ? `Approved by ${by}, then edited` : `Approved by ${by}`,
    },
    CHANGES_REQUESTED: {
        approved: () => false,
        text: (by) => `${by} asked for changes`,
    },
    BYPASSED: {
        approved: () => false,
        text: (by) => `Published without approval by ${by}`,
    },
};

/** The status pill's colour, by what it means (#335). */
const STATUS_BADGE: Record<
    EditorStatusTone,
    "error" | "draft" | "neutral" | "success"
> = {
    danger: "error",
    attention: "draft",
    quiet: "neutral",
    done: "success",
};

/**
 * SiteEditor (S2-004) — the ticket's core deliverable. A client-side editable
 * list of sections rendered next to a LIVE `DraftPreview` that reflects local
 * state with no network round-trip (that is the "preview without publishing"
 * requirement). "Save draft" and "Publish" are the only API calls, via the
 * server actions. A dirty flag (local state vs. last-saved) gates publishing.
 */

export function SiteEditor({
    siteId,
    pageId,
    pages,
    initialFlags,
    initialComments,
    initialReview,
    neverPublished: initialNeverPublished,
    unreadableSections,
    initialPendingChanges,
    initialPendingSiteChanges,
    initialSections,
    initialRevision,
    siteName,
    navigation,
    footerPreview,
    address,
    initialStyle,
    styleOptions,
}: {
    siteId: string;
    pageId: string;
    /** Every page on this site, for the Pages tab. */
    pages: SitePage[];
    /** The site's advisory flags, as the server computed them. */
    initialFlags: SiteFlags;
    /** Reviewer notes and the latest verdict (#193). */
    initialComments: SiteCommentView[];
    initialReview: ReviewState;
    /** Never-published sites say "Publish site", not "Publish changes". */
    /**
     * Whether anything has ever been published. The INITIAL value: publishing
     * makes it false without a reload (#288), so the editor keeps this in
     * state rather than reading the prop directly.
     */
    neverPublished: boolean;
    /**
     * Keys of sections whose stored content no longer matches their contract
     * (#275). Shown, not hidden: it is the merchant's work, and a section
     * quietly missing from the list would be deleted by the next save.
     */
    unreadableSections: string[];
    /**
     * How many sections publishing would change, as the server counted it on
     * load (#190). Null before the first publish. Refreshed by every autosave.
     */
    initialPendingChanges: number | null;
    /** Site-level settings publishing would change (#282). Null before the first publish. */
    initialPendingSiteChanges: SiteChangeKind[] | null;
    initialSections: Section[];
    /** Which edit of the draft `initialSections` are (#285). */
    initialRevision: number;
    siteName: string;
    /** The site's menu, by page id; resolved here for the canvas header. */
    navigation: SiteNavigation | null;
    /** The footer, sanitized by the API, for the canvas to draw (#336). */
    footerPreview: SiteFooter | null;
    initialStyle: SiteStyle;
    styleOptions: SiteStyleOptions;
    /** Where this site lives, shown in the bar. Null before a subdomain exists. */
    address?: string | null;
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
    const router = useRouter();
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
    const [comments, setComments] =
        useState<SiteCommentView[]>(initialComments);
    const [review, setReview] = useState<ReviewState>(initialReview);
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
    const openNotes = review.openNotes;

    /*
     * One counter per re-read below. Both fire from several places — every
     * autosave, opening the check, publishing, a note changing — and nothing
     * orders their responses, so a slow early read landing after a fast later
     * one would put back the state from before. Each call takes the next
     * number and only the newest may write; the same rule `measuring` keeps
     * for the share image in site settings.
     */
    const reviewRequest = useRef(0);
    const flagsRequest = useRef(0);

    /** Re-read notes and the verdict together — they move together. */
    async function refreshReview() {
        const request = ++reviewRequest.current;
        const [next, state] = await Promise.all([
            listComments(siteId),
            getReviewState(siteId),
        ]);
        if (request !== reviewRequest.current) return;
        setComments(next);
        setReview(state);
    }

    /** Re-read flags from the server. They settle after a save, not per key. */
    async function refreshFlags() {
        const request = ++flagsRequest.current;
        const next = await getSiteFlags(siteId);
        if (request !== flagsRequest.current) return;
        setSiteFlags(next);
    }

    const [errorIndex, setErrorIndex] = useState<number | null>(null);
    /*
     * Panel widths, device and place come from the preferences store rather
     * than component state: they belong to the browser, outlive this mount,
     * and the server has no business guessing them. `useSyncExternalStore`
     * renders the server snapshot (the defaults) during hydration and swaps to
     * the stored values before paint, so the markup matches what was sent and
     * nothing visibly jumps from 200px to whatever the merchant chose.
     */
    const chrome = useSyncExternalStore(
        subscribe,
        getChrome,
        getChromeOnServer,
    );
    const { railWidth, panelWidth, device } = chrome;

    // The section count is what makes a remembered index meaningful, so it is
    // bound into both snapshots rather than read inside the store.
    const initialCount = initialSections.length;
    // Held stable because useSyncExternalStore compares snapshots by identity.
    const serverPlace = useMemo(
        () => placeOnServer(initialCount),
        [initialCount],
    );
    const place = useSyncExternalStore(
        subscribe,
        () => getPlace(siteId, initialCount),
        () => serverPlace,
    );
    const { selectedIndex, rail, inspector } = place;

    // Setters that keep every call site below unchanged. Writing through the
    // store is what makes the choice survive a reload; the re-render is the
    // store's notification, not a second source of truth.
    const setRailWidth = (px: number) => setChrome({ railWidth: px });
    const setPanelWidth = (px: number) => setChrome({ panelWidth: px });
    // Relative steps read the store, not this render, so they accumulate.
    const nudgeRail = (d: number) =>
        setChrome({ railWidth: getChrome().railWidth + d });
    const nudgePanel = (d: number) =>
        setChrome({ panelWidth: getChrome().panelWidth + d });
    const setDevice = (next: Device) => {
        setChrome({ device: next });
        // The dip lasts as long as the width transition it accompanies.
        setSwitching(true);
        setTimeout(() => setSwitching(false), 300);
    };
    /*
     * The header or footer, when one of those is selected instead of a block
     * (#336). Not remembered between visits: they are the same on every page,
     * and coming back to the site's header is rarely where anyone left off.
     */
    const [selectedChrome, setSelectedChrome] = useState<
        "header" | "footer" | null
    >(null);
    const setSelectedIndex = (next: number | null) => {
        setSelectedChrome(null);
        setPlace(siteId, initialCount, { selectedIndex: next });
    };
    const selectChrome = (part: "header" | "footer") => {
        setPlace(siteId, initialCount, { selectedIndex: null });
        setSelectedChrome(part);
        setInspector("block");
    };
    const setRail = (next: "sections" | "style") =>
        setPlace(siteId, initialCount, { rail: next });
    const setInspector = (next: "block" | "feedback") =>
        setPlace(siteId, initialCount, { inspector: next });

    /** Briefly dimmed while a device switch animates — the cross-fade. */
    const [switching, setSwitching] = useState(false);
    /** Full-screen preview: everything else hides, Escape returns (spec §2). */
    const [fullScreen, setFullScreen] = useState(false);
    /** The page switcher under the page name in the breadcrumb. */
    const [pagesOpen, setPagesOpen] = useState(false);
    const [asking, setAsking] = useState(false);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const scrollWrite = useRef<ReturnType<typeof setTimeout> | null>(null);

    /*
     * Restore where the merchant was scrolled to. Mount-only: re-running it on
     * a later change would yank the canvas back mid-scroll, and the stored
     * value is already being kept up to date by the handler below.
     */
    useEffect(() => {
        const el = canvasRef.current;
        if (el === null) return;
        el.scrollTop = place.scrollTop;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!fullScreen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFullScreen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [fullScreen]);
    /*
     * Drag state. `dragIndex` is the row being carried, `dropIndex` the row it
     * would land on — kept apart so the source can dim while the target draws
     * its own outline, and so an abandoned drag clears both.
     */
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const [style, setStyle] = useState<SiteStyle>(initialStyle);
    const [addOpen, setAddOpen] = useState(false);
    const [styleSaving, setStyleSaving] = useState(false);
    const [savedStyleJson, setSavedStyleJson] = useState(() =>
        JSON.stringify(initialStyle),
    );
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
    // The Remove-section confirmation (replaces window.confirm, §9). Mirrors
    // pages-panel.tsx's pendingDelete + deleteOpen: the section removed is
    // kept after the dialog closes so its title does not blank out during
    // the closing animation, and so onConfirm still has something to remove
    // once removeAt has cleared the selection and `active` has gone null.
    const [pendingRemove, setPendingRemove] = useState<{
        index: number;
        title: string;
    } | null>(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const services = useServicesForPicker();

    const sectionsJson = JSON.stringify(sections);
    const dirty = sectionsJson !== lastSavedJson;
    /*
     * Everything that could be saved is, and only unfinished sections are
     * waiting. Still `dirty` — publish stays blocked, because the page on
     * screen is not the page that would go live.
     */
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
    /*
     * A style change that is unsaved or still saving counts as unpublished
     * work too (#282). Publish only waited on the sections, so publishing inside
     * the style debounce snapshotted the previous look.
     */
    const styleDirty = styleSaving || JSON.stringify(style) !== savedStyleJson;
    const pendingSummary = describePendingChanges(
        pendingChanges,
        pendingSiteChanges,
    );

    function replaceAt(index: number, next: Section) {
        setSections((prev) => prev.map((s, i) => (i === index ? next : s)));
    }

    function addSection(type: SectionType, variant?: string) {
        const section = emptySection(type);
        // A look chosen in the picker is set the way the Look field sets it,
        // so the two cannot disagree (#267, #254).
        setSections((prev) => [
            ...prev,
            variant ? withVariant(section, variant) : section,
        ]);
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
            siteName,
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
        /*
         * Stamp ONLY the new formIds onto what is on screen now (#281). This
         * used to replace the whole list with the copy taken before the sync,
         * so anything typed while the form request was in flight was lost.
         *
         * A section is matched by identity first, meaning it is unchanged since
         * the save began. Failing that, it is matched by position, for an
         * enquiry section still waiting for its first formId. That way a section
         * edited mid-save still gets its id, instead of creating a second Form
         * on the next autosave.
         */
        const newFormIds = synced.sections.flatMap((next, index) => {
            const before = sections[index];
            return next.type === "enquiry" &&
                before.type === "enquiry" &&
                next.content.formId &&
                next.content.formId !== before.content.formId
                ? [{ index, before, formId: next.content.formId }]
                : [];
        });
        if (newFormIds.length > 0) {
            setSections((current) =>
                current.map((section, index) => {
                    if (section.type !== "enquiry" || section.content.formId) {
                        return section;
                    }
                    const hit =
                        newFormIds.find((n) => n.before === section) ??
                        newFormIds.find((n) => n.index === index);
                    return hit
                        ? {
                              ...section,
                              content: {
                                  ...section.content,
                                  formId: hit.formId,
                              },
                          }
                        : section;
                }),
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
            setPendingChanges(res.data.pendingSectionChanges ?? null);
            setPendingSiteChanges(res.data.pendingSiteChanges ?? null);
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

    /*
     * Style autosave.
     *
     * Separate from the sections autosave because they are different documents
     * on different endpoints: a colour change should not have to wait behind a
     * section save, and a failed section save must not silently discard a
     * palette. Debounced longer, because dragging a slider produces a value on
     * every pixel and none of the intermediate ones is worth a request.
     */
    /*
     * One style save at a time (#282). Without that, an older PUT could land
     * after a newer one and leave the older palette saved. The effect waits
     * while a save is in flight, then runs again for the newest style.
     *
     * A style that failed to save is not retried until it changes, or a 400
     * would retry every 700ms with a toast each time. A request that never
     * reached the API resolves to a failure too, instead of leaving
     * `styleSaving` stuck on and every later style unsaved.
     */
    const failedStyleJson = useRef<string | null>(null);
    useEffect(() => {
        const json = JSON.stringify(style);
        if (json === savedStyleJson || styleSaving) return;
        if (failedStyleJson.current === json) return;
        const id = setTimeout(() => {
            const payload = style;
            const payloadJson = JSON.stringify(payload);
            setStyleSaving(true);
            updateSiteStyle(siteId, payload)
                .then((res) => {
                    if (res.ok) {
                        failedStyleJson.current = null;
                        setSavedStyleJson(payloadJson);
                    } else {
                        failedStyleJson.current = payloadJson;
                        showError(res.error);
                    }
                })
                .catch(() => {
                    failedStyleJson.current = payloadJson;
                    showError(
                        "Could not reach Saroh. Your style is still here and will save with your next change.",
                    );
                })
                .finally(() => setStyleSaving(false));
        }, 700);
        return () => clearTimeout(id);
    }, [style, savedStyleJson, siteId, styleSaving]);

    function resetStyle() {
        // Back to the business's own defaults — which is what the site looked
        // like before anyone touched the panel, not a Saroh default.
        const defaults: SiteStyle = {
            colours: Object.fromEntries(
                styleOptions.rows.map((r) => [r.key, r.swatches[0]?.key ?? ""]),
            ),
            scalars: Object.fromEntries(
                styleOptions.scalars.map((sc) => [sc.key, sc.default]),
            ),
        };
        setStyle(defaults);
    }

    /**
     * Publishing goes through the pre-publish check first — the spec makes it
     * "its own moment before going live", not a button that fires immediately.
     * The check itself never refuses: every flag is advisory, so the merchant
     * can read them and publish anyway from the same screen.
     */
    async function openCheck() {
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

    async function onPublish() {
        setPublishing(true);
        const res = await publishSite(siteId);
        setPublishing(false);
        if (!res.ok) {
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
            res.data.bypassed
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
        // Something is live now, so the button stops offering to publish the
        // site and the "nothing's live yet" line goes (#288).
        setNeverPublished(false);
        await Promise.all([refreshFlags(), refreshReview()]);
    }

    /**
     * Open the block a note is about. A note names a block by KEY, and only
     * the open page's blocks are loaded — so a note on another page is a
     * navigation first and a selection after it.
     */
    function jumpToNote(jumpPageId: string, sectionKey: string) {
        if (jumpPageId !== pageId) {
            // The same guard the Pages tab puts on opening a page: leaving
            // mid-flight loses whatever autosave has not sent yet.
            if (dirty) {
                showError("Save this page before opening another.");
                return;
            }
            router.push(`/sites/${siteId}?page=${jumpPageId}`);
            return;
        }
        const index = sections.findIndex((sec) => sec.key === sectionKey);
        if (index === -1) return;
        setRail("sections");
        setSelectedIndex(index);
    }

    /*
     * The selected section AND its index together, so nothing downstream has to
     * assert that the index is still valid. Removing a section can leave the
     * index past the end, and carrying the pair makes that a single check here
     * rather than a non-null assertion at every use.
     */
    const active =
        selectedIndex !== null && selectedIndex < sections.length
            ? { index: selectedIndex, section: sections[selectedIndex] }
            : null;

    /*
     * Flags for the page currently open, indexed by section. The server sends
     * flags for the whole site; the rail can only draw dots for the sections it
     * is showing.
     */
    const flagsBySection = new Map<number, Flag[]>();
    for (const flag of siteFlags.flags) {
        if (flag.pageId !== pageId || flag.sectionIndex === null) continue;
        const list = flagsBySection.get(flag.sectionIndex) ?? [];
        list.push(flag);
        flagsBySection.set(flag.sectionIndex, list);
    }
    const activeFlags =
        active === null ? [] : (flagsBySection.get(active.index) ?? []);

    /*
     * Section keys on this page carrying an unresolved note. The issue asks
     * for it directly: "the section list should show which sections carry
     * unresolved ones." Resolved notes do not mark anything — a settled note
     * is history, and a dot for it would never go out.
     */
    const notedKeys = new Set(
        comments
            .filter(
                (c) =>
                    c.pageId === pageId && c.resolvedAt === null && !c.orphaned,
            )
            .map((c) => c.sectionKey),
    );

    /** Open notes per block on this page — the canvas draws them as pins. */
    const notesByKey = new Map<string, number>();
    for (const c of comments) {
        if (c.pageId !== pageId || c.resolvedAt !== null || c.orphaned)
            continue;
        notesByKey.set(c.sectionKey, (notesByKey.get(c.sectionKey) ?? 0) + 1);
    }

    /*
     * The header the canvas draws, with the menu resolved the way publish
     * resolves it: over the pages that will be written, so an entry for a
     * hidden page is absent here exactly as it will be on the live site.
     */
    const canvasChrome = {
        name: siteName,
        navigation: (navigation?.items ?? []).flatMap((item) => {
            const page = pages.find((p) => p.id === item.pageId && !p.hidden);
            return page
                ? [{ label: item.label ?? page.title, href: page.path }]
                : [];
        }),
        footer: footerPreview,
    };

    const activePage = pages.find((page) => page.id === pageId);
    const status = editorStatus({
        saving,
        saveError,
        heldBackSummary: onlyHeldBack ? heldBackSummary(heldBack) : null,
        dirty,
        review: {
            pending: review.pending,
            outcome: review.latestApproval?.outcome ?? null,
            approvalIsStale: review.approvalIsStale,
        },
        neverPublished,
        hasPendingChanges: pendingSummary !== null,
    });
    /*
     * What the pill leaves out, for anyone who hovers it: when it last saved,
     * what publishing would change, and the reviewer's verdict in full.
     */
    const statusDetail = [
        lastSavedAt && !dirty
            ? `Saved at ${lastSavedAt.toLocaleTimeString(DISPLAY_LOCALE, { hour: "2-digit", minute: "2-digit" })}`
            : null,
        pendingSummary
            ? `${pendingSummary} changed since the last publish`
            : null,
        review.latestApproval
            ? `${APPROVAL_BADGE[review.latestApproval.outcome].text(
                  review.latestApproval.by,
                  review.approvalIsStale,
              )} · ${exactDate(review.latestApproval.at)}`
            : null,
        openNotes > 0
            ? `${openNotes} open ${openNotes === 1 ? "note" : "notes"}`
            : null,
    ]
        .filter(Boolean)
        .join("\n");

    /**
     * Share for review (#335): ask for a review, which is what reviewers
     * are notified of and what puts the page In review (#278). It blocks
     * nothing — publishing while it stands is recorded as a bypass.
     */
    async function askForReview() {
        setAsking(true);
        const res = await requestReview(siteId);
        setAsking(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess(
            "Asked for a review. Reviewers can comment on any block and cannot change the page.",
        );
        await refreshReview();
    }

    return (
        /*
         * The editor follows the workspace's theme (#335), and the bar has a
         * toggle for it. It used to force dark; the design gives the merchant
         * the choice, and the page on the canvas is bright either way.
         */
        <div className="flex h-screen flex-col bg-background text-foreground">
            {/*
             * ONE line, and it has to stay one line: the actions never
             * shrink, the breadcrumb truncates instead. Losing the end of a
             * page name is a smaller loss than losing Publish.
             */}
            <header className="flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b px-4">
                <nav
                    aria-label="Breadcrumb"
                    className="flex min-w-0 items-center gap-2 text-sm"
                >
                    <Link
                        href="/sites"
                        title={address ?? undefined}
                        className="flex min-w-0 shrink items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ChevronLeft aria-hidden className="size-4 shrink-0" />
                        <span className="truncate">{siteName}</span>
                    </Link>
                    <span aria-hidden className="text-muted-foreground">
                        /
                    </span>
                    {/*
                     * The page name is the page switcher: which page is open
                     * is part of where you are, so it lives in the
                     * breadcrumb rather than in a tab beside the blocks.
                     */}
                    <Popover open={pagesOpen} onOpenChange={setPagesOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                aria-label={`Page: ${activePage?.title ?? "Page"}. Switch or manage pages`}
                                className="flex min-w-0 items-center gap-1 rounded font-semibold transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="truncate">
                                    {activePage?.title ?? "Page"}
                                </span>
                                <ChevronDown
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground"
                                />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="start"
                            className="max-h-[70vh] w-80 overflow-y-auto p-0"
                        >
                            <PagesPanel
                                siteId={siteId}
                                pages={pages}
                                activePageId={pageId}
                                dirty={dirty}
                                unfinished={
                                    onlyHeldBack
                                        ? unfinishedPhrase(heldBack)
                                        : undefined
                                }
                            />
                        </PopoverContent>
                    </Popover>
                    <span aria-hidden className="text-muted-foreground">
                        /
                    </span>
                    <Badge
                        role="status"
                        variant={STATUS_BADGE[status.tone]}
                        title={statusDetail || undefined}
                        className="shrink-0 whitespace-nowrap uppercase tracking-[0.06em]"
                    >
                        {status.label}
                    </Badge>
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <ThemeToggle />
                    {/*
                     * Width only — the preview is already local, and
                     * switching must not become a re-fetch. Desktop and
                     * phone: the widths a merchant's customers arrive at.
                     */}
                    <div
                        role="group"
                        aria-label="Preview width"
                        className="flex h-8 items-center gap-0.5 rounded-md border p-0.5"
                    >
                        {DEVICES.map((d) => {
                            const Icon =
                                d.key === "phone" ? Smartphone : Monitor;
                            return (
                                <button
                                    key={d.key}
                                    type="button"
                                    onClick={() => setDevice(d.key)}
                                    aria-pressed={device === d.key}
                                    aria-label={`Show at ${d.label.toLowerCase()} width`}
                                    title={d.label}
                                    className={cn(
                                        "flex h-full w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        device === d.key
                                            ? "bg-secondary text-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <Icon aria-hidden className="size-4" />
                                </button>
                            );
                        })}
                    </div>

                    {/*
                     * Preview removes the editing chrome; it does not switch
                     * to another renderer. Escape returns.
                     */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setFullScreen(true)}
                    >
                        <Eye aria-hidden className="size-4" />
                        Preview
                    </Button>

                    <Button
                        variant={rail === "style" ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() =>
                            setRail(rail === "style" ? "sections" : "style")
                        }
                        aria-pressed={rail === "style"}
                    >
                        <Palette aria-hidden className="size-4" />
                        Style
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={asking || review.pending}
                        onClick={() => void askForReview()}
                    >
                        <Link2 aria-hidden className="size-4" />
                        {review.pending ? "In review" : "Share for review"}
                    </Button>

                    {/*
                     * The one action that puts the site in front of the
                     * public. Not disabled while In review: publishing then
                     * is allowed and recorded as a bypass (#278).
                     */}
                    <Button
                        size="sm"
                        className="wk-press h-8"
                        title="Make these changes live"
                        onClick={() => void openCheck()}
                        disabled={publishing || dirty || saving || styleDirty}
                    >
                        {publishing
                            ? "Publishing…"
                            : neverPublished
                              ? "Publish site"
                              : "Publish"}
                        {/*
                         * The outstanding flag count as a badge, so the
                         * button keeps its width while the number moves.
                         */}
                        {!publishing && siteFlags.flags.length > 0 ? (
                            <span className="ml-1.5 rounded bg-background/20 px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none">
                                {siteFlags.flags.length}
                            </span>
                        ) : null}
                    </Button>
                </div>
            </header>

            <div
                className="grid min-h-0 flex-1 lg:grid-cols-[var(--editor-cols)]"
                style={
                    {
                        // Blocks, the page, the inspector (#340). The two 1px
                        // tracks are the drag handles. Giving them real grid
                        // tracks — rather than absolutely positioning them over
                        // a border — is what keeps the hit area and the line
                        // the merchant is aiming at the same object.
                        "--editor-cols": `${railWidth}px 1px minmax(0,1fr) 1px ${panelWidth}px`,
                    } as React.CSSProperties
                }
            >
                {/*
                 * Left: this page's blocks, in order (#340). The fields are on
                 * the right now, so this column is only ever a list — the
                 * page as the merchant reads it, top to bottom.
                 */}
                <aside className="flex min-h-0 flex-col">
                    {rail === "style" ? (
                        <StylePanel
                            style={style}
                            options={styleOptions}
                            onChange={setStyle}
                            onReset={resetStyle}
                            onBack={() => setRail("sections")}
                            saving={styleSaving}
                        />
                    ) : (
                        <>
                            <EditorTabs
                                label="Page"
                                tabs={[{ key: "sections", label: "This page" }]}
                                value={rail}
                                onSelect={setRail}
                            />
                            {
                                <>
                                    <p className="px-4 pb-1 pt-4 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                        {`${sections.length + 2} blocks`}
                                    </p>
                                    <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pl-4">
                                        <FixedBlockRow
                                            part="header"
                                            selected={
                                                selectedChrome === "header"
                                            }
                                            onSelect={() =>
                                                selectChrome("header")
                                            }
                                        />
                                        {sections.map((section, index) => (
                                            <li
                                                key={index}
                                                /*
                                                 * The row is the drop target, not the
                                                 * handle: aiming at a 32px row is far
                                                 * easier than aiming at the grip, and
                                                 * the grip is what starts the drag.
                                                 */
                                                onDragOver={(e) => {
                                                    if (dragIndex === null)
                                                        return;
                                                    e.preventDefault();
                                                    setDropIndex(index);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (dragIndex === null)
                                                        return;
                                                    moveTo(dragIndex, index);
                                                    setSelectedIndex(index);
                                                    setDragIndex(null);
                                                    setDropIndex(null);
                                                }}
                                                className={cn(
                                                    "rounded",
                                                    dropIndex === index &&
                                                        dragIndex !== index &&
                                                        "ring-1 ring-inset ring-ring",
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        // A row is not a button and must not
                                                        // scale — at 32px tall a shrink reads
                                                        // as a jitter. It answers a press with
                                                        // the surface it would settle on, so
                                                        // the feedback is the outcome arriving
                                                        // early rather than a separate effect.
                                                        "group relative flex h-10 w-full items-center gap-1 rounded-md pr-2 text-left text-[0.8125rem] transition-colors",
                                                        /*
                                                         * The selected row carries a bar
                                                         * on its edge as well as a fill,
                                                         * as the design draws it: the
                                                         * fill alone is too quiet on the
                                                         * dark chrome.
                                                         */
                                                        selectedIndex === index
                                                            ? "bg-secondary font-medium before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-highlight"
                                                            : "hover:bg-muted active:bg-secondary",
                                                        (errorIndex === index ||
                                                            heldBackAt(
                                                                index,
                                                            )) &&
                                                            "text-destructive",
                                                        dragIndex === index &&
                                                            "opacity-40",
                                                    )}
                                                >
                                                    {/*
                                                     * The grip is the drag surface. It
                                                     * carries no click of its own — a
                                                     * handle that also navigates makes
                                                     * every aborted drag a selection.
                                                     */}
                                                    <span
                                                        draggable
                                                        onDragStart={() => {
                                                            setDragIndex(index);
                                                            setDropIndex(index);
                                                        }}
                                                        onDragEnd={() => {
                                                            setDragIndex(null);
                                                            setDropIndex(null);
                                                        }}
                                                        aria-hidden="true"
                                                        className="cursor-grab select-none px-1 text-muted-foreground active:cursor-grabbing group-hover:text-muted-foreground"
                                                    >
                                                        ⋮
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-current={
                                                            selectedIndex ===
                                                            index
                                                                ? "true"
                                                                : undefined
                                                        }
                                                        title={
                                                            SECTION_LABELS[
                                                                section.type
                                                            ]
                                                        }
                                                        onClick={() =>
                                                            setSelectedIndex(
                                                                index,
                                                            )
                                                        }
                                                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2.5">
                                                            {(() => {
                                                                const Icon =
                                                                    SECTION_ICONS[
                                                                        section
                                                                            .type
                                                                    ];
                                                                return (
                                                                    <Icon
                                                                        aria-hidden="true"
                                                                        className="size-4 shrink-0 text-muted-foreground"
                                                                    />
                                                                );
                                                            })()}
                                                            <span
                                                                className={cn(
                                                                    "truncate",
                                                                    /*
                                                                     * A hidden block is
                                                                     * dimmed rather than
                                                                     * removed: it is still
                                                                     * part of the page the
                                                                     * merchant is building,
                                                                     * just not part of the
                                                                     * one visitors get.
                                                                     */
                                                                    section.hidden &&
                                                                        "text-muted-foreground line-through",
                                                                )}
                                                            >
                                                                {sectionTitle(
                                                                    section,
                                                                )}
                                                            </span>
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-1.5">
                                                            {/*
                                                             * The spec's flag dot: 4px,
                                                             * amber #c99f6f (§7). It is
                                                             * the ONLY thing flags draw
                                                             * while editing — "quiet
                                                             * until publish" — so it
                                                             * carries a title rather
                                                             * than expanding into the
                                                             * row.
                                                             */}
                                                            {(flagsBySection.get(
                                                                index,
                                                            )?.length ?? 0) >
                                                                0 ||
                                                            (section.key !==
                                                                undefined &&
                                                                notedKeys.has(
                                                                    section.key,
                                                                )) ? (
                                                                <span
                                                                    className="size-1 shrink-0 rounded-full bg-highlight"
                                                                    title={[
                                                                        ...(flagsBySection
                                                                            .get(
                                                                                index,
                                                                            )
                                                                            ?.map(
                                                                                (
                                                                                    f,
                                                                                ) =>
                                                                                    f.message,
                                                                            ) ??
                                                                            []),
                                                                        ...(section.key !==
                                                                            undefined &&
                                                                        notedKeys.has(
                                                                            section.key,
                                                                        )
                                                                            ? [
                                                                                  "A reviewer has left a note on this section.",
                                                                              ]
                                                                            : []),
                                                                    ].join(
                                                                        "\n",
                                                                    )}
                                                                />
                                                            ) : null}
                                                        </span>
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                        {sections.length === 0 ? (
                                            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                                                No blocks yet.
                                            </li>
                                        ) : null}
                                        <FixedBlockRow
                                            part="footer"
                                            selected={
                                                selectedChrome === "footer"
                                            }
                                            onSelect={() =>
                                                selectChrome("footer")
                                            }
                                        />
                                    </ul>
                                    <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                                        Header and footer carry a lock — they
                                        are on every page, so this page cannot
                                        remove them.
                                    </p>
                                    <div className="p-2">
                                        {/*
                                         * The design draws this as a dashed outline
                                         * spanning the rail — reading as a slot waiting
                                         * to be filled rather than another row in the
                                         * list, which is what it is. It opens the
                                         * picker, which shows each block before it is
                                         * added (#267).
                                         */}
                                        <button
                                            type="button"
                                            onClick={() => setAddOpen(true)}
                                            className="w-full rounded-md border border-dashed px-2 py-2 text-center text-sm text-muted-foreground transition-colors hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            + Add section
                                        </button>
                                        <AddSectionDialog
                                            open={addOpen}
                                            onOpenChange={setAddOpen}
                                            variables={resolveStyleVariables(
                                                style,
                                                styleOptions,
                                            )}
                                            onAdd={(type, variant) => {
                                                addSection(type, variant);
                                                setSelectedIndex(
                                                    sections.length,
                                                );
                                            }}
                                        />
                                    </div>
                                </>
                            }
                        </>
                    )}
                </aside>

                <PanelDivider
                    label="Resize the block list"
                    width={railWidth}
                    min={RAIL_MIN}
                    max={RAIL_MAX}
                    reset={RAIL_DEFAULT}
                    onResize={setRailWidth}
                    onNudge={nudgeRail}
                />

                {/*
                 * Preview — width changes, data does not.
                 *
                 * The canvas ground is the SAME #0b0b0b as the chrome (spec §7),
                 * not a lighter tray. A raised panel here would make the canvas
                 * a second bright object competing with the one that matters:
                 * the rendered site.
                 */}
                <div
                    ref={canvasRef}
                    onScroll={(e) => {
                        /*
                         * Remembered per site — the spec lists preview scroll
                         * position among the things that persist. Debounced:
                         * a scroll fires dozens of events a second, and every
                         * one of them writing to storage would serialise the
                         * whole place object each time for no benefit.
                         */
                        const top = e.currentTarget.scrollTop;
                        if (scrollWrite.current !== null) {
                            clearTimeout(scrollWrite.current);
                        }
                        scrollWrite.current = setTimeout(() => {
                            setPlace(siteId, initialCount, { scrollTop: top });
                        }, 250);
                    }}
                    className="min-h-0 overflow-y-auto bg-background p-6"
                >
                    {/*
                     * Someone else saved this page while this editor was open
                     * (#285). Loud, because everything typed since is now
                     * unsaveable — and the merchant has to choose what happens
                     * to it. Reloading takes the other version and drops this
                     * one, so it is offered, never done automatically.
                     */}
                    {conflict ? (
                        <div
                            role="alert"
                            className="mx-auto mb-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm"
                        >
                            <p className="font-medium">
                                Someone else saved this page while you were
                                editing.
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                Nothing you have written has been lost, and
                                nothing more will save until you reload.
                                Reloading shows their version and discards
                                yours, so copy anything you want to keep first.
                            </p>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-3"
                                onClick={() => window.location.reload()}
                            >
                                Reload the latest
                            </Button>
                        </div>
                    ) : null}

                    {/*
                     * The first-run nudge (spec §5), in the spec's own words.
                     * "It does not nag" — so it is one quiet line above the
                     * preview, shown only until the site has been published
                     * once, and it never reappears afterwards.
                     */}
                    {neverPublished ? (
                        <p
                            className="mx-auto mb-4 text-center text-xs text-muted-foreground"
                            style={{ maxWidth: DEVICE_WIDTH[device] }}
                        >
                            Nothing&rsquo;s live yet — publish when you&rsquo;re
                            ready, nobody can see this in the meantime.
                        </p>
                    ) : null}
                    <div
                        /*
                         * "Switching frames cross-fades and resizes — the frame
                         * animates to the new width, content reflows during
                         * it." The width transition does the resize; the brief
                         * dip in opacity is the cross-fade, and it is what stops
                         * a reflow mid-animation reading as a glitch.
                         *
                         * This animates `max-width`, which is a LAYOUT property
                         * and so breaks the usual transform/opacity-only rule,
                         * deliberately. The whole point of a device preview is
                         * showing how the site reflows at that width; a
                         * transform would scale the content instead of
                         * reflowing it, which is the one thing this control
                         * exists to show. So the reflow is the work, not an
                         * accident of implementation.
                         *
                         * What that buys is a duty to keep it short: 200ms
                         * rather than the 300 it was, because every frame here
                         * costs a layout pass over the whole rendered site.
                         */
                        className={`mx-auto transition-[max-width,opacity,transform] duration-slow ease-out motion-reduce:transition-none ${
                            switching ? "opacity-70" : "opacity-100"
                        }`}
                        style={{
                            maxWidth: DEVICE_WIDTH[device],
                        }}
                    >
                        {/*
                         * The page sits in a window whose bar names the
                         * address it lives at (#340): this is the merchant's
                         * website, not a mock-up of one, and the bar says
                         * where a customer would find it.
                         */}
                        <div className="overflow-hidden rounded-lg border shadow-xl shadow-black/10 dark:shadow-black/40">
                            <div className="flex h-9 items-center gap-3 border-b bg-muted px-3">
                                <span
                                    aria-hidden="true"
                                    className="flex gap-1.5"
                                >
                                    <span className="size-2 rounded-full bg-foreground/15" />
                                    <span className="size-2 rounded-full bg-foreground/15" />
                                    <span className="size-2 rounded-full bg-foreground/15" />
                                </span>
                                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                    {address
                                        ? `${address}/`
                                        : "Not published yet"}
                                </span>
                            </div>
                            <DraftPreview
                                sections={sections}
                                pages={pages}
                                style={style}
                                styleOptions={styleOptions}
                                selectedIndex={selectedIndex}
                                onSelect={(index) => {
                                    setRail("sections");
                                    setSelectedIndex(index);
                                }}
                                chrome={canvasChrome}
                                selectedChrome={selectedChrome}
                                onSelectChrome={selectChrome}
                                notesByKey={notesByKey}
                                onOpenNotes={(index) => {
                                    setSelectedIndex(index);
                                    setInspector("feedback");
                                }}
                            />
                        </div>
                    </div>
                </div>

                <PanelDivider
                    label="Resize the inspector"
                    width={panelWidth}
                    min={PANEL_MIN}
                    max={PANEL_MAX}
                    reset={PANEL_DEFAULT}
                    onResize={setPanelWidth}
                    onNudge={nudgePanel}
                    panelSide="right"
                />

                {/*
                 * Right: the inspector (#340). Block is what can be changed
                 * about the selected block; Feedback is what reviewers have
                 * said. Both answer questions about the thing selected on the
                 * page, which is why they sit beside it rather than under the
                 * list.
                 */}
                <aside aria-label="Inspector" className="flex min-h-0 flex-col">
                    <EditorTabs
                        label="Inspector"
                        tabs={[
                            { key: "block", label: "Block" },
                            {
                                key: "feedback",
                                label: "Feedback",
                                count: openNotes,
                            },
                        ]}
                        value={inspector}
                        onSelect={setInspector}
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {inspector === "feedback" ? (
                            <ReviewPanel
                                siteId={siteId}
                                pages={pages}
                                comments={comments}
                                review={review}
                                onChanged={() => void refreshReview()}
                                onJump={jumpToNote}
                            />
                        ) : selectedChrome ? (
                            <FixedBlockInspector
                                part={selectedChrome}
                                siteId={siteId}
                                hasFooter={footerPreview !== null}
                            />
                        ) : (
                            <BlockInspector
                                active={active}
                                count={sections.length}
                                siteId={siteId}
                                pageId={pageId}
                                pages={pages}
                                services={services}
                                style={style}
                                styleOptions={styleOptions}
                                flags={activeFlags}
                                unreadable={
                                    active?.section.key !== undefined &&
                                    unreadableSections.includes(
                                        active.section.key,
                                    )
                                }
                                error={
                                    active !== null &&
                                    errorIndex === active.index
                                        ? errorMessage
                                        : null
                                }
                                heldBack={
                                    active === null
                                        ? undefined
                                        : heldBackAt(active.index)
                                }
                                onChange={(next) => {
                                    if (active) replaceAt(active.index, next);
                                }}
                                onToggleHidden={() => {
                                    if (active) toggleHidden(active.index);
                                }}
                                onMove={(delta) => {
                                    if (!active) return;
                                    move(active.index, delta);
                                    setSelectedIndex(active.index + delta);
                                }}
                                onRemove={() => {
                                    if (!active) return;
                                    /*
                                     * Ask first, and name the block. Autosave
                                     * commits a removal, and version history
                                     * only covers what was PUBLISHED, so copy
                                     * written since is gone for good. The
                                     * question names hiding too — usually what
                                     * a merchant reaching for Remove wants.
                                     */
                                    setPendingRemove({
                                        index: active.index,
                                        title: sectionTitle(active.section),
                                    });
                                    setRemoveOpen(true);
                                }}
                                onNoteAdded={refreshReview}
                            />
                        )}
                    </div>
                    {/*
                     * Outside both branches: confirming removes the block,
                     * which sets `active` to null and would otherwise unmount
                     * this dialog mid-close.
                     */}
                    <ConfirmDialog
                        open={removeOpen}
                        onOpenChange={setRemoveOpen}
                        title={`Remove "${pendingRemove?.title ?? ""}"?`}
                        description="Anything written here since your last publish cannot be brought back. To take it off the site and keep the work, hide it instead."
                        confirmLabel="Remove section"
                        cancelLabel="Keep section"
                        onConfirm={() => {
                            if (!pendingRemove) return;
                            const { index, title } = pendingRemove;
                            removeAt(index);
                            setSelectedIndex(null);
                            showSuccess(`Removed ${title}.`);
                        }}
                    />
                </aside>
            </div>

            {/*
             * The pre-publish check. Rendered inside the editor rather than
             * on its own route so nothing is torn down and rebuilt behind
             * it — the merchant goes back to exactly the editing state they
             * left, including unsaved selection and scroll.
             */}
            {/*
             * Full-screen preview: "hides everything; Escape returns". The
             * frame keeps its device width, so this is the site at the size
             * being designed for with nothing else on screen — not a
             * maximised editor.
             */}
            {fullScreen ? (
                <div className="fixed inset-0 z-40 overflow-y-auto bg-background p-6">
                    <button
                        type="button"
                        onClick={() => setFullScreen(false)}
                        className="fixed right-4 top-4 z-10 rounded border bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                    >
                        Escape to return
                    </button>
                    <div
                        className="mx-auto transition-[max-width] duration-slow ease-out motion-reduce:transition-none"
                        style={{ maxWidth: DEVICE_WIDTH[device] }}
                    >
                        <DraftPreview
                            sections={sections}
                            pages={pages}
                            style={style}
                            styleOptions={styleOptions}
                            chrome={canvasChrome}
                        />
                    </div>
                </div>
            ) : null}

            {checking ? (
                <PrePublishCheck
                    siteName={siteName}
                    pages={pages}
                    flags={siteFlags.flags}
                    awaitingNavigation={siteFlags.awaitingNavigation}
                    publishing={publishing}
                    neverPublished={neverPublished}
                    review={review}
                    onPublish={() => void onPublish()}
                    onClose={() => setChecking(false)}
                    onJump={(jumpPageId, sectionIndex) => {
                        setChecking(false);
                        /*
                         * A flag on another page needs that page loaded, which
                         * is a navigation. One on this page is just a
                         * selection — doing it without a round trip keeps the
                         * jump instant where it can be.
                         */
                        if (jumpPageId !== null && jumpPageId !== pageId) {
                            router.push(`/sites/${siteId}?page=${jumpPageId}`);
                            return;
                        }
                        if (sectionIndex !== null) {
                            setRail("sections");
                            setSelectedIndex(sectionIndex);
                        }
                    }}
                />
            ) : null}
        </div>
    );
}

/** Per-type field editor. Narrowing on `section.type` gives the exact shape. */

/**
 * The header or footer in the block list (#336): on every page, so it is
 * listed where it sits — first and last — with a lock instead of a grip. It
 * can be selected, never dragged.
 */
function FixedBlockRow({
    part,
    selected,
    onSelect,
}: {
    part: "header" | "footer";
    selected: boolean;
    onSelect: () => void;
}) {
    const Icon = part === "header" ? PanelTop : PanelBottom;
    const label = part === "header" ? "Header" : "Footer";
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-current={selected ? "true" : undefined}
                className={cn(
                    "relative flex h-10 w-full items-center gap-2.5 rounded-md pl-5 pr-2 text-left text-[0.8125rem] transition-colors",
                    selected
                        ? "bg-secondary font-medium before:absolute before:inset-y-1.5 before:-left-2 before:w-0.5 before:rounded-full before:bg-highlight"
                        : "hover:bg-muted",
                )}
            >
                <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="flex-1 truncate">{label}</span>
                <Lock
                    aria-label="On every page"
                    className="size-3.5 shrink-0 text-muted-foreground"
                />
            </button>
        </li>
    );
}
