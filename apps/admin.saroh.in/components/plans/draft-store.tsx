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
import type { DraftCheck } from "@/lib/pricing-draft";
import {
    checkDraft,
    conflictMessage,
    liveVersionOf,
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

/**
 * The one shared draft behind every Plans & modules tab (plans catalogue U6,
 * KTD-3). A tab reads `catalog` and changes it only through `edit`; it never
 * holds a copy of its own and never calls the draft endpoint itself.
 *
 * - The first edit clones the live catalogue into a draft (revision 0, which
 *   the API reads as "start a draft").
 * - Edits autosave, debounced, with the revision they were based on; a save
 *   is never in flight twice, and edits made during one are saved after it.
 * - A 409 stops saving and says who saved since, with Reload. A failure is
 *   "Not saved" with Try again. Neither loses what is on screen.
 * - Without `pricing:edit` nothing edits: `edit` does nothing, and the tabs
 *   draw read-only from `canEdit`.
 */

export const AUTOSAVE_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "failed" | "conflict";

export interface DraftStore {
    /** The live version's record, or null when nothing is published yet. */
    live: AdminVersion | null;
    /** What the tabs draw: the draft when there is one, else live. */
    catalog: Catalog | null;
    hasDraft: boolean;
    /** The revision the next save is based on; 0 before a draft exists. */
    revision: number;
    canEdit: boolean;
    save: SaveState;
    /** The refusal's own words when `save` is failed or conflict. */
    saveError: string | null;
    conflict: DraftConflict | null;
    /** Validity and the change log, worked out as the operator types. */
    check: DraftCheck;
    /** The saved draft's impact; null until worked out for this revision. */
    impact: Impact | null;
    /** Everyone who has saved this draft (D-2). */
    editors: StaffName[];
    /** Change the draft; the first change starts it. */
    edit: (change: (draft: Catalog) => void) => void;
    /**
     * Save now. `saved` when what is on screen is saved, with the revision it
     * is saved as (what a preview link or a publish names).
     */
    flush: () => Promise<{ saved: boolean; revision: number }>;
    /** Try a failed save again. */
    retry: () => void;
    /** Drop local edits and take the server's draft (after a conflict). */
    reload: () => void;
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

    const [draft, setDraft] = useState<Catalog | null>(() =>
        serverDraftCatalog(pricing),
    );
    const [revision, setRevision] = useState(pricing.draft?.revision ?? 0);
    const [save, setSave] = useState<SaveState>("idle");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [conflict, setConflict] = useState<DraftConflict | null>(null);
    const [impact, setImpact] = useState<AdminPricingImpact | null>(
        initialImpact,
    );
    const [editors, setEditors] = useState<StaffName[]>(
        pricing.draft?.editors ?? [],
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
            idempotencyKey,
        }).catch(() => null);
        if (r?.ok) {
            savedRef.current = body;
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
            return;
        }
        setSaveError(r?.error ?? "The draft could not be saved.");
        setSave("failed");
    }, [dirty, me, refreshImpact]);

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
            try {
                await attempt;
            } finally {
                inFlightRef.current = null;
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
            const base = draftRef.current ?? liveCatalog;
            if (!base) return;
            const next = structuredClone(base);
            change(next);
            draftRef.current = next;
            setDraft(next);
            // An edit after a failed save is the next attempt.
            stoppedRef.current = false;
            setSaveError(null);
            setSave("saving");
            schedule();
        },
        [canEdit, liveCatalog, schedule],
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

    const discard = useCallback(
        async (input: { reason?: string; idempotencyKey: string }) => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
            // Nothing saved yet: the draft is only on this screen.
            if (revisionRef.current === 0) {
                draftRef.current = null;
                setDraft(null);
                setSave("idle");
                return { ok: true };
            }
            if (inFlightRef.current) await inFlightRef.current;
            const r = await discardPricingDraftAction({
                revision: revisionRef.current,
                reason: input.reason?.trim() ? input.reason : undefined,
                idempotencyKey: input.idempotencyKey,
            });
            if (!r.ok) return { ok: false, error: r.error };
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
            setSave("idle");
            return { ok: true };
        },
        [],
    );

    // A fresh read from the server (Reload, or a refresh after a write
    // elsewhere): take it when asked to, or when nothing here is unsaved.
    useEffect(() => {
        if (!adoptRef.current && dirty()) return;
        adoptRef.current = false;
        const next = serverDraftCatalog(pricing);
        draftRef.current = next;
        savedRef.current = pricing.draft
            ? JSON.stringify(pricing.draft.catalog)
            : null;
        revisionRef.current = pricing.draft?.revision ?? 0;
        stoppedRef.current = false;
        conflictRef.current = false;
        setDraft(next);
        setRevision(pricing.draft?.revision ?? 0);
        setEditors(pricing.draft?.editors ?? []);
        setConflict(null);
        setSaveError(null);
        setSave("idle");
        setImpact(initialImpact);
    }, [pricing, initialImpact, dirty]);

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

    const value = useMemo<DraftStore>(
        () => ({
            live,
            catalog: draft ?? liveCatalog,
            hasDraft: draft !== null,
            revision,
            canEdit,
            save,
            saveError,
            conflict,
            check,
            impact: impact?.revision === revision ? impact.impact : null,
            editors,
            edit,
            flush,
            retry,
            reload,
            discard,
        }),
        [
            live,
            draft,
            liveCatalog,
            revision,
            canEdit,
            save,
            saveError,
            conflict,
            check,
            impact,
            editors,
            edit,
            flush,
            retry,
            reload,
            discard,
        ],
    );

    return (
        <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
    );
}
