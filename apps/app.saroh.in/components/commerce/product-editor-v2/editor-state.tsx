"use client";

import { showSuccess } from "@saroh/ui/toast";
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

import type { SectionKey } from "@/lib/products/editor-sections";
import {
    partitionSections,
    savedMessage,
    SECTION_ORDER,
} from "@/lib/products/editor-sections";
import type { ProductPatch } from "@/lib/products/service";

/** What a section says about itself, for its card, the jumps and the header. */
export interface SectionState {
    dirty: boolean;
    /** The first thing to fix before it can save; "" when it can. */
    problem: string;
    /** What saving will do, when it is more than "Saves …". */
    note?: string;
    /** The note is bad news even with nothing to fix (a failed save). */
    noteIsError?: boolean;
    saveLabel?: string;
    discardLabel?: string;
    /** Said after it saves, instead of "{Name} saved." */
    savedMessage?: string;
}

/**
 * What a section can be asked to do. `save` reports whether it went, and
 * says why not itself (on its field, or as a toast). `collect` is creating's
 * way in: the section's part of the new product.
 */
export interface SectionHandle {
    save: () => Promise<boolean>;
    discard: () => void;
    collect?: () => ProductPatch;
    /** Creating: what this section saves once the product exists. */
    afterCreate?: (productId: string) => Promise<boolean>;
}

interface EditorApi {
    mode: "create" | "edit";
    canWrite: boolean;
    states: Partial<Record<SectionKey, SectionState>>;
    saving: SectionKey[];
    report: (key: SectionKey, state: SectionState) => void;
    register: (key: SectionKey, handle: SectionHandle) => () => void;
    saveSections: (keys: SectionKey[]) => Promise<void>;
    discard: (key: SectionKey) => void;
    /** Every section's part of a new product, merged. */
    collectAll: () => ProductPatch;
    /** The saves that need the new product's id; false if any failed. */
    afterCreateAll: (productId: string) => Promise<boolean>;
}

const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
    const api = useContext(EditorContext);
    if (!api) throw new Error("useEditor outside ProductEditorProvider");
    return api;
}

/**
 * The editor's one piece of shared state. Each section keeps its own form —
 * its values, its validation, its save — and tells the editor two things:
 * whether it has changes, and what it must fix first. That is all the header
 * hint, the jump dots and Save all need.
 */
export function ProductEditorProvider({
    mode,
    canWrite,
    children,
}: {
    mode: "create" | "edit";
    canWrite: boolean;
    children: ReactNode;
}) {
    const router = useRouter();
    const [states, setStates] = useState<
        Partial<Record<SectionKey, SectionState>>
    >({});
    const [saving, setSaving] = useState<SectionKey[]>([]);
    const handles = useRef(new Map<SectionKey, SectionHandle>());
    // Read inside saveSections, which runs after the states it was asked
    // about were rendered.
    const statesRef = useRef(states);
    useEffect(() => {
        statesRef.current = states;
    }, [states]);

    const report = useCallback((key: SectionKey, next: SectionState) => {
        setStates((prev) => {
            const cur = prev[key];
            if (
                cur?.dirty === next.dirty &&
                cur.problem === next.problem &&
                cur.note === next.note &&
                cur.noteIsError === next.noteIsError &&
                cur.saveLabel === next.saveLabel &&
                cur.discardLabel === next.discardLabel &&
                cur.savedMessage === next.savedMessage
            )
                return prev;
            return { ...prev, [key]: next };
        });
    }, []);

    const register = useCallback((key: SectionKey, handle: SectionHandle) => {
        handles.current.set(key, handle);
        return () => {
            if (handles.current.get(key) === handle)
                handles.current.delete(key);
        };
    }, []);

    const saveSections = useCallback(
        async (keys: SectionKey[]) => {
            const current = statesRef.current;
            const dirty = keys.filter((k) => current[k]?.dirty);
            const problems = Object.fromEntries(
                dirty.map((k) => [k, current[k]?.problem ?? ""]),
            );
            const { savable, stuck } = partitionSections(dirty, problems);
            if (savable.length === 0) return;
            setSaving(savable);
            const saved: SectionKey[] = [];
            // One at a time, in page order: each is its own call, and a
            // failure in one leaves the others' results standing.
            for (const k of savable) {
                const handle = handles.current.get(k);
                if (handle && (await handle.save())) saved.push(k);
            }
            setSaving([]);
            if (saved.length === 0) return;
            router.refresh();
            const only = saved.length === 1 ? saved[0] : undefined;
            showSuccess(
                savedMessage(
                    saved,
                    stuck,
                    only ? current[only]?.savedMessage : undefined,
                ),
            );
        },
        [router],
    );

    const discard = useCallback((key: SectionKey) => {
        handles.current.get(key)?.discard();
    }, []);

    const collectAll = useCallback(() => {
        const out: ProductPatch = {};
        for (const k of SECTION_ORDER) {
            const part = handles.current.get(k)?.collect?.();
            if (!part) continue;
            // shopFields is shared by several sections; merge rather than
            // let the last one win.
            const shopFields = { ...out.shopFields, ...part.shopFields };
            Object.assign(out, part, { shopFields });
        }
        return out;
    }, []);

    const afterCreateAll = useCallback(async (productId: string) => {
        let ok = true;
        for (const k of SECTION_ORDER) {
            const step = handles.current.get(k)?.afterCreate;
            if (step && !(await step(productId))) ok = false;
        }
        return ok;
    }, []);

    const api = useMemo<EditorApi>(
        () => ({
            mode,
            canWrite,
            states,
            saving,
            report,
            register,
            saveSections,
            discard,
            collectAll,
            afterCreateAll,
        }),
        [
            mode,
            canWrite,
            states,
            saving,
            report,
            register,
            saveSections,
            discard,
            collectAll,
            afterCreateAll,
        ],
    );
    return (
        <EditorContext.Provider value={api}>{children}</EditorContext.Provider>
    );
}

/**
 * A section's link to the editor: report its state whenever it changes, and
 * keep its handle current. The handle is read through a ref so a section's
 * save always sees its latest values without re-registering each keystroke.
 */
export function useSection(
    key: SectionKey,
    state: SectionState,
    handle: SectionHandle,
) {
    const { report, register } = useEditor();
    const latest = useRef(handle);
    useEffect(() => {
        latest.current = handle;
    });

    useEffect(
        () =>
            register(key, {
                save: () => latest.current.save(),
                discard: () => latest.current.discard(),
                collect: () => latest.current.collect?.() ?? {},
                afterCreate: (id) =>
                    latest.current.afterCreate?.(id) ?? Promise.resolve(true),
            }),
        [key, register],
    );

    const {
        dirty,
        problem,
        note,
        noteIsError,
        saveLabel,
        discardLabel,
        savedMessage: said,
    } = state;
    useEffect(() => {
        report(key, {
            dirty,
            problem,
            note,
            noteIsError,
            saveLabel,
            discardLabel,
            savedMessage: said,
        });
    }, [
        key,
        report,
        dirty,
        problem,
        note,
        noteIsError,
        saveLabel,
        discardLabel,
        said,
    ]);
}
