"use client";

import type { Catalog } from "@saroh/pricing-catalog";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    discardPricingDraftAction,
    pricingImpactAction,
    savePricingDraftAction,
} from "@/lib/pricing-actions";
import type { DraftCheck, Outdated } from "@/lib/pricing-draft";
import {
    baseVersionOf,
    checkDraft,
    conflictMessage,
    liveVersionOf,
    outdatedOf,
    parseConflict,
} from "@/lib/pricing-draft";
import type {
    AdminPricing,
    AdminPricingImpact,
    AdminVersion,
    DraftConflict,
    Impact,
    StaffName,
} from "@/lib/pricing-types";

import { usePageReturn } from "./use-page-return";

/**
 * The one shared draft behind every Plans & modules tab (plans catalogue U6,
 * KTD-3). A tab reads `catalog` and changes it only through `edit`; it never
 * holds a copy of its own and never calls the draft endpoint itself.
 *
 * - The first edit clones the newest published version (`base`: the live
 *   one, or one waiting for billing above it) into a draft (revision 0,
 *   which the API reads as "start a draft"), and says which version it
 *   cloned. The API refuses the start when a newer one has been published.
 * - Edits autosave, debounced, with the revision they were based on; a save
 *   is never in flight twice, and edits made during one are saved after it.
 * - A 409 stops saving and says who saved since, with Reload. A failure is
 *   "Not saved" with Try again. Neither loses what is on screen.
 * - Without `pricing:edit` nothing edits: `edit` does nothing, and the tabs
 *   draw read-only from `canEdit`.
 * - With nothing published there is nothing to clone: `start` hands the
 *   store the first draft whole (the starter catalogue, or a blank one).
 * - The page is read again when it comes back into view (the tab, the
 *   window, the browser's Back), after every write that changes versions,
 *   and every so often while a version waits for billing. With nothing
 *   unsaved the store takes that read; with something unsaved it keeps
 *   what is on screen and `outdated` says a newer version was published.
 * - `flush` is also the "Save draft" button: autosave stays, and the
 *   button saves now. `saving` is a save on its way, `savedAt` when the
 *   draft on screen was last saved.
 */

export const AUTOSAVE_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export interface DraftStore {
    /** The live version's record, or null when nothing is published yet. */
    live: AdminVersion | null;
    /**
     * The version an edit starts from: the newest published, which is the
     * live one unless a newer one is waiting for billing.
     */
    base: AdminVersion | null;
    /** What the tabs draw: the draft when there is one, else `base`. */
    catalog: Catalog | null;
    hasDraft: boolean;
    /** The revision the next save is based on; 0 before a draft exists. */
    revision: number;
    canEdit: boolean;
    save: SaveState;
    /** A save is on its way to the API now. */
    saving: boolean;
    /** When the saved draft was last saved; null with none saved. */
    savedAt: string | null;
    /** The refusal's own words when `save` is failed or conflict. */
    saveError: string | null;
    conflict: DraftConflict | null;
    /**
     * A newer version was published than the one this draft was started
     * from: it can't be published, and says what it changed.
     */
    outdated: Outdated | null;
    /** Validity and the change log, worked out as the operator types. */
    check: DraftCheck;
    /** The saved draft's impact; null until worked out for this revision. */
    impact: Impact | null;
    /** Everyone who has saved this draft (D-2). */
    editors: StaffName[];
    /** Change the draft; the first change starts it. */
    edit: (change: (draft: Catalog) => void) => void;
    /**
     * Start the first draft from a whole catalogue, on an instance with
     * nothing live and no draft (the first-run screen). Does nothing once
     * either exists.
     */
    start: (catalog: Catalog) => void;
    /**
     * Save now. `saved` when what is on screen is saved, with the revision it
     * is saved as (what a preview link or a publish names).
     */
    flush: () => Promise<{ saved: boolean; revision: number }>;
    /** Try a failed save again. */
    retry: () => void;
    /** Drop local edits and take the server's draft (after a conflict). */
    reload: () => void;
    /**
     * Read the page again, after a write that changed versions. Unsaved
     * edits stay on screen.
     */
    refresh: () => void;
    /** The draft was published: there is none now, here or on the server. */
    published: () => void;
    discard: (input: {
        reason?: string;
        idempotencyKey: string;
    }) => Promise<{ ok: boolean; error?: string }>;
}

const DraftContext = createContext<DraftStore | null>(null);

export function useDraft(): DraftStore {
    const store = useContext(DraftContext);
    if (!store) throw new Error("useDraft is used outside DraftProvider");
    return store;
}

const NO_CHANGES: DraftCheck = { valid: true, errors: [], changes: [] };

function serverDraftCatalog(pricing: AdminPricing): Catalog | null {
    // Stored as saved: it may not validate while it is being edited, but it
    // is the editor's own shape, so the tabs draw it as one.
    return (pricing.draft?.catalog as Catalog | undefined) ?? null;
}

export function DraftProvider({
    pricing,
    impact: initialImpact,
    canEdit,
    me,
    children,
}: {
    pricing: AdminPricing;
    impact: AdminPricingImpact | null;
    canEdit: boolean;
    me: StaffName;
    children: ReactNode;
}) {
    const router = useRouter();
    const live = useMemo(() => liveVersionOf(pricing), [pricing]);
    const liveCatalog = live?.catalog ?? null;
    const base = useMemo(() => baseVersionOf(pricing), [pricing]);
    const baseCatalog = base?.catalog ?? null;
    const baseVersion = base?.version ?? null;

    const [draft, setDraft] = useState<Catalog | null>(() =>
        serverDraftCatalog(pricing),
    );
    const [revision, setRevision] = useState(pricing.draft?.revision ?? 0);
    const [save, setSave] = useState<SaveState>("idle");
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(
        pricing.draft?.updatedAt ?? null,
    );
    const [saveError, setSaveError] = useState<string | null>(null);
    const [conflict, setConflict] = useState<DraftConflict | null>(null);
    const [impact, setImpact] = useState<AdminPricingImpact | null>(
        initialImpact,
    );
    const [editors, setEditors] = useState<StaffName[]>(
        pricing.draft?.editors ?? [],
    );
    /** The version the draft is a copy of; only read while there is one. */
    const [startedFrom, setStartedFrom] = useState<number | null>(
        pricing.draft?.baseVersion ?? null,
    );

    // The loop's own view, current between renders.
    const draftRef = useRef(draft);
    const revisionRef = useRef(revision);
    /** JSON of the last catalogue the API accepted; null before any. */
    const savedRef = useRef<string | null>(
        pricing.draft ? JSON.stringify(pricing.draft.catalog) : null,
    );
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inFlightRef = useRef<Promise<void> | null>(null);
    /** A save failed or was refused: the loop waits for an edit or Try again. */
    const stoppedRef = useRef(false);
    /** A 409: nothing more is saved over the other editor's work until Reload. */
    const conflictRef = useRef(false);
    /** One key per payload, so a retry of the same save is the same request. */
    const keyRef = useRef<{ body: string; key: string } | null>(null);
    const adoptRef = useRef(false);
    const startedFromRef = useRef(startedFrom);
    /** The API's time of the last save: a read from before it is old news. */
    const savedAtRef = useRef<string | null>(null);
    const refreshedAtRef = useRef(0);

    const dirty = useCallback(
        () =>
            draftRef.current !== null &&
            JSON.stringify(draftRef.current) !== savedRef.current,
        [],
    );

    const refreshImpact = useCallback(async (rev: number) => {
        const r = await pricingImpactAction();
        // Only the answer for the revision still on screen is worth showing.
        if (r.ok && revisionRef.current === rev) setImpact(r.data);
    }, []);

    /** One save of what is on screen, based on the revision held now. */
    const saveOnce = useCallback(async (): Promise<void> => {
        const body = JSON.stringify(draftRef.current);
        const base = revisionRef.current;
        const tag = `${base}:${body}`;
        if (keyRef.current?.body !== tag) {
            keyRef.current = { body: tag, key: crypto.randomUUID() };
        }
        const idempotencyKey = keyRef.current.key;
        setSave("saving");
        const r = await savePricingDraftAction({
            catalog: JSON.parse(body) as unknown,
            revision: base,
            // A start names the version it copied, so a page read before a
            // newer one was published is refused instead of saved over it.
            ...(base === 0 ? { baseVersion: startedFromRef.current } : {}),
            idempotencyKey,
        }).catch(() => null);
        if (r?.ok) {
            savedRef.current = body;
            savedAtRef.current = r.data.updatedAt;
            setSavedAt(r.data.updatedAt);
            revisionRef.current = r.data.revision;
            setRevision(r.data.revision);
            setSaveError(null);
            setEditors((list) =>
                list.some((e) => e.userId === me.userId) ? list : [...list, me],
            );
            setSave(dirty() ? "saving" : "saved");
            if (r.data.valid) void refreshImpact(r.data.revision);
            else setImpact(null);
            return;
        }
        stoppedRef.current = true;
        if (r?.status === 409) {
            const c = parseConflict(r.details) ?? {
                revision: null,
                updatedBy: null,
                updatedAt: null,
            };
            conflictRef.current = true;
            setConflict(c);
            setSaveError(conflictMessage(c));
            setSave("conflict");
            // A newer version: read it, so the page says which and what
            // these changes were. They stay on screen (dirty, not adopted).
            if (c.newestVersion !== undefined) router.refresh();
            return;
        }
        setSaveError(r?.error ?? "The draft could not be saved.");
        setSave("failed");
    }, [dirty, me, refreshImpact, router]);

    /**
     * Save until what is on screen is saved, one request at a time: edits
     * made while a save is out are sent, on the new revision, after it.
     */
    const runSave = useCallback(async (): Promise<void> => {
        for (;;) {
            const pending = inFlightRef.current;
            if (pending) {
                await pending;
                continue;
            }
            if (stoppedRef.current || !dirty()) return;
            const attempt = saveOnce();
            inFlightRef.current = attempt;
            setSaving(true);
            try {
                await attempt;
            } finally {
                inFlightRef.current = null;
                setSaving(false);
            }
        }
    }, [dirty, saveOnce]);

    const schedule = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void runSave();
        }, AUTOSAVE_MS);
    }, [runSave]);

    const edit = useCallback(
        (change: (draft: Catalog) => void) => {
            if (!canEdit || conflictRef.current) return;
            const from = draftRef.current ?? baseCatalog;
            if (!from) return;
            if (!draftRef.current) {
                startedFromRef.current = baseVersion;
                setStartedFrom(baseVersion);
            }
            const next = structuredClone(from);
            change(next);
            draftRef.current = next;
            setDraft(next);
            // An edit after a failed save is the next attempt.
            stoppedRef.current = false;
            setSaveError(null);
            setSave("saving");
            schedule();
        },
        [canEdit, baseCatalog, baseVersion, schedule],
    );

    const start = useCallback(
        (first: Catalog) => {
            if (!canEdit || conflictRef.current) return;
            if (draftRef.current || baseCatalog) return;
            startedFromRef.current = null;
            setStartedFrom(null);
            const next = structuredClone(first);
            draftRef.current = next;
            setDraft(next);
            stoppedRef.current = false;
            setSaveError(null);
            setSave("saving");
            schedule();
        },
        [canEdit, baseCatalog, schedule],
    );

    const flush = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        await runSave();
        return {
            saved: !dirty() && !stoppedRef.current && revisionRef.current > 0,
            revision: revisionRef.current,
        };
    }, [dirty, runSave]);

    const retry = useCallback(() => {
        if (conflictRef.current) return;
        stoppedRef.current = false;
        setSaveError(null);
        void runSave();
    }, [runSave]);

    const reload = useCallback(() => {
        adoptRef.current = true;
        router.refresh();
    }, [router]);

    const refresh = useCallback(() => {
        refreshedAtRef.current = Date.now();
        router.refresh();
    }, [router]);

    /** No draft here any more: published, or discarded. */
    const clear = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        draftRef.current = null;
        savedRef.current = null;
        revisionRef.current = 0;
        stoppedRef.current = false;
        conflictRef.current = false;
        setDraft(null);
        setRevision(0);
        setConflict(null);
        setSaveError(null);
        setImpact(null);
        setEditors([]);
        setSavedAt(null);
        setSave("idle");
    }, []);

    const published = useCallback(() => {
        clear();
        // The new version is what the next edit must start from.
        refresh();
    }, [clear, refresh]);

    const discard = useCallback(
        async (input: { reason?: string; idempotencyKey: string }) => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            // Nothing saved yet: the draft is only on this screen.
            if (revisionRef.current === 0) {
                clear();
                refresh();
                return { ok: true };
            }
            if (inFlightRef.current) await inFlightRef.current;
            const r = await discardPricingDraftAction({
                revision: revisionRef.current,
                reason: input.reason?.trim() ? input.reason : undefined,
                idempotencyKey: input.idempotencyKey,
            });
            if (!r.ok) return { ok: false, error: r.error };
            clear();
            refresh();
            return { ok: true };
        },
        [clear, refresh],
    );

    // A fresh read from the server (Reload, or a refresh after a write
    // elsewhere): take it when asked to, or when nothing here is unsaved.
    useEffect(() => {
        if (!adoptRef.current) {
            if (dirty()) return;
            // A read that left before this page's last save landed: taking
            // it would put an older draft, or none, back on screen.
            const behind = pricing.draft
                ? pricing.draft.revision < revisionRef.current
                : savedAtRef.current !== null &&
                  pricing.now < savedAtRef.current;
            if (behind) return;
        }
        adoptRef.current = false;
        const next = serverDraftCatalog(pricing);
        draftRef.current = next;
        savedRef.current = pricing.draft
            ? JSON.stringify(pricing.draft.catalog)
            : null;
        revisionRef.current = pricing.draft?.revision ?? 0;
        startedFromRef.current = pricing.draft?.baseVersion ?? null;
        savedAtRef.current = null;
        stoppedRef.current = false;
        conflictRef.current = false;
        setDraft(next);
        setRevision(pricing.draft?.revision ?? 0);
        setEditors(pricing.draft?.editors ?? []);
        setStartedFrom(pricing.draft?.baseVersion ?? null);
        setSavedAt(pricing.draft?.updatedAt ?? null);
        setConflict(null);
        setSaveError(null);
        setSave("idle");
        setImpact(initialImpact);
    }, [pricing, initialImpact, dirty]);

    // Back in view, or a version waiting for billing: read the page again.
    const savingNow = useCallback(
        () => timerRef.current !== null || inFlightRef.current !== null,
        [],
    );
    usePageReturn({
        refresh,
        refreshedAt: refreshedAtRef,
        saving: savingNow,
        dirty,
        waiting: pricing.versions.some((v) => v.status === "waiting"),
    });

    // Leaving with an unsaved change asks first.
    useEffect(() => {
        const onLeave = (event: BeforeUnloadEvent) => {
            if (dirty() || inFlightRef.current) event.preventDefault();
        };
        window.addEventListener("beforeunload", onLeave);
        return () => {
            window.removeEventListener("beforeunload", onLeave);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [dirty]);

    const check = useMemo(
        () => (draft ? checkDraft(liveCatalog, draft) : NO_CHANGES),
        [draft, liveCatalog],
    );

    const outdated = useMemo(
        () => (draft ? outdatedOf({ pricing, draft, startedFrom }) : null),
        [draft, pricing, startedFrom],
    );

    const value = useMemo<DraftStore>(
        () => ({
            live,
            base,
            catalog: draft ?? baseCatalog,
            hasDraft: draft !== null,
            revision,
            canEdit,
            save,
            saving,
            savedAt,
            saveError,
            conflict,
            outdated,
            check,
            impact: impact?.revision === revision ? impact.impact : null,
            editors,
            edit,
            start,
            flush,
            retry,
            reload,
            refresh,
            published,
            discard,
        }),
        [
            live,
            base,
            draft,
            baseCatalog,
            revision,
            canEdit,
            save,
            saving,
            savedAt,
            saveError,
            conflict,
            outdated,
            check,
            impact,
            editors,
            edit,
            start,
            flush,
            retry,
            reload,
            refresh,
            published,
            discard,
        ],
    );

    return (
        <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
    );
}
