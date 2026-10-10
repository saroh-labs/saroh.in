"use client";

import { tooLightToScan } from "@saroh/ui/lib/qr-art";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRef, useState } from "react";

import { createQrCode, updateQrCode } from "@/lib/qr/actions";
import { QR_INK } from "@/lib/qr/colours";
import type { QrTarget, QrTargets } from "@/lib/qr/targets";
import {
    findReusable,
    findTarget,
    targetKey,
    targetOfCode,
} from "@/lib/qr/targets";
import type {
    QrCodeChange,
    QrCodeView,
    QrPlace,
    QrResult,
    QrStyle,
    QrTargetKind,
} from "@/lib/qr/types";
import type { QrRefusalWords } from "@/lib/qr/words";
import { defaultLabel, linkWords, refusalWords } from "@/lib/qr/words";

import type { DownloadEnv, QrFormat, QrLogoChoice } from "./qr-download";
import { BROWSER, downloadQr, qrFile } from "./qr-download";
import type { QrStyleLock } from "./qr-style-lock";
import { qrStyleLockOfRefusal } from "./qr-style-lock";

/**
 * The maker's state and what its buttons do.
 *
 * **A code on screen is one of two things.** Bound: a saved code, drawn
 * from its own short link, which downloads and Copy link use. Or a sample:
 * the business's address drawn in the look being chosen, with no short
 * link yet, which is never turned into a file. "Make this code" (or the
 * first Download) saves it; only then is there a link to encode, so nobody
 * downloads a code the server doesn't know.
 *
 * **Choosing never makes a duplicate.** Picking a target and a place that a
 * code already has binds that code, in its saved look. "Make another" is
 * the explicit way to a second one (two counters).
 *
 * **Change** (from the list) binds one code and turns the pickers into its
 * re-pointing: target and place are then changes to that code, sent with
 * Save, and its short link never changes.
 */

export interface MakerDraft {
    targetKey: string;
    place: QrPlace;
    placeNote: string;
    style: QrStyle;
    color: string;
    /** "" is no label. */
    label: string;
}

export type MakerBusy = "make" | QrFormat | null;

export interface UseQrMakerInput {
    siteId: string;
    /** `https://<address>.saroh.app`, where the short links live. */
    origin: string | null;
    /** Where customers go, for a target's address line. */
    displayOrigin: string | null;
    targets: QrTargets;
    /** Every code of the site, newest first. */
    codes: readonly QrCodeView[];
    lock: QrStyleLock | null;
    business: { name: string; hasLogo: boolean } & QrLogoChoice;
    /** The code "Change" opened, or null while making. */
    changing: QrCodeView | null;
    onChangingDone: () => void;
    /** A code was made or changed: the list takes it. */
    onSaved: (code: QrCodeView) => void;
    env?: DownloadEnv;
}

function draftOf(code: QrCodeView): MakerDraft {
    return {
        targetKey: targetKey(code.target.kind, code.target.ref),
        place: code.place,
        placeNote: code.placeNote ?? "",
        style: code.style,
        color: code.color.toLowerCase(),
        label: code.label ?? "",
    };
}

function parseKey(key: string): { kind: QrTargetKind; ref: string | null } {
    const at = key.indexOf(":");
    return at < 0
        ? { kind: key as QrTargetKind, ref: null }
        : { kind: key.slice(0, at) as QrTargetKind, ref: key.slice(at + 1) };
}

const noteOf = (draft: Pick<MakerDraft, "place" | "placeNote">) =>
    draft.place === "OTHER" ? draft.placeNote.trim() || null : null;

function start(input: UseQrMakerInput): {
    draft: MakerDraft;
    bound: QrCodeView | null;
} {
    if (input.changing) {
        return { draft: draftOf(input.changing), bound: input.changing };
    }
    const first = input.targets.main.at(0);
    const key = first?.key ?? "SITE";
    const match = findReusable(input.codes, {
        targetKey: key,
        place: "COUNTER",
    });
    if (match) return { draft: draftOf(match), bound: match };
    return {
        draft: {
            targetKey: key,
            place: "COUNTER",
            placeNote: "",
            style: "PLAIN",
            color: QR_INK,
            label: defaultLabel(first?.kind ?? "SITE"),
        },
        bound: null,
    };
}

export function useQrMaker(input: UseQrMakerInput) {
    const { siteId, origin, targets, codes, changing } = input;
    const env = input.env ?? BROWSER;
    const [initial] = useState(() => start(input));
    const [draft, setDraft] = useState(initial.draft);
    const [boundTo, setBound] = useState(initial.bound);
    const [another, setAnother] = useState(false);
    const [labelTouched, setLabelTouched] = useState(false);
    const [busy, setBusy] = useState<MakerBusy>(null);
    const [problem, setProblem] = useState<QrRefusalWords | null>(null);
    const [refusedLock, setRefusedLock] = useState<QrStyleLock | null>(null);
    const [copied, setCopied] = useState(false);
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The list may hold a newer copy of the bound code (after a refresh).
    // One retired from the list is no longer a code to hold.
    const held = boundTo
        ? (codes.find((c) => c.id === boundTo.id) ?? boundTo)
        : null;
    const bound = held && !held.retired ? held : null;
    const lock = input.lock ?? refusedLock;
    const isChanging = changing !== null;

    const target: QrTarget | null =
        findTarget(targets, draft.targetKey) ??
        (bound &&
        targetKey(bound.target.kind, bound.target.ref) === draft.targetKey
            ? targetOfCode(bound, input.displayOrigin)
            : null);

    const tooLight = tooLightToScan(draft.color);
    const lookDirty =
        bound !== null &&
        (bound.style !== draft.style ||
            bound.color.toLowerCase() !== draft.color ||
            (bound.label ?? "") !== draft.label.trim());
    const placeDirty =
        bound !== null &&
        (bound.place !== draft.place ||
            (bound.placeNote ?? null) !== noteOf(draft));
    const targetDirty =
        bound !== null &&
        targetKey(bound.target.kind, bound.target.ref) !== draft.targetKey;
    const dirty = lookDirty || placeDirty || targetDirty;

    /** Bind the code already made for this target and place, or none. */
    function rebind(next: MakerDraft, allowAnother = false) {
        const match = allowAnother
            ? null
            : findReusable(codes, {
                  targetKey: next.targetKey,
                  place: next.place,
                  placeNote: next.placeNote,
              });
        setAnother(allowAnother);
        if (match) {
            setBound(match);
            // Its own look, but where it goes stays as typed.
            setDraft({ ...draftOf(match), placeNote: next.placeNote });
            return;
        }
        setBound(null);
        setDraft(next);
    }

    function move(patch: Partial<MakerDraft>) {
        const next = { ...draft, ...patch };
        if (isChanging) {
            setDraft(next);
            return;
        }
        // A new code's label follows what it opens until one is chosen.
        if (patch.targetKey && !labelTouched) {
            next.label = defaultLabel(parseKey(patch.targetKey).kind);
        }
        rebind(next);
    }

    const pickTarget = (key: string) => {
        if (problem?.where === "target") setProblem(null);
        move({ targetKey: key });
    };
    const pickPlace = (place: QrPlace) => move({ place });
    const setPlaceNote = (placeNote: string) => move({ placeNote });
    const pickStyle = (style: QrStyle) => setDraft((d) => ({ ...d, style }));
    const pickColor = (color: string) => {
        if (problem?.where === "color") setProblem(null);
        setDraft((d) => ({ ...d, color: color.toLowerCase() }));
    };
    const setLabel = (label: string) => {
        setLabelTouched(true);
        setDraft((d) => ({ ...d, label }));
    };
    const makeAnother = () => rebind(draft, true);

    function refused(res: Extract<QrResult<unknown>, { ok: false }>) {
        const planLock = qrStyleLockOfRefusal(res.plan);
        if (planLock) {
            // The plan changed under the page: said as the lock, and the
            // code goes back to what every plan may make.
            setRefusedLock(planLock);
            setDraft((d) => ({ ...d, style: bound?.style ?? "PLAIN" }));
            return;
        }
        const words = refusalWords(res);
        if (words.where === "general") showError(words.text);
        else setProblem(words);
    }

    /** The bound code, saved as drawn: made if new, patched if changed. */
    async function persist(): Promise<QrCodeView | null> {
        if (tooLight) return null;
        if (bound && !dirty) return bound;
        const { kind, ref } = parseKey(draft.targetKey);
        const label = draft.label.trim() || null;
        let res: QrResult<QrCodeView>;
        if (!bound) {
            res = await createQrCode(siteId, {
                targetKind: kind,
                targetRef: ref,
                place: draft.place,
                placeNote: noteOf(draft),
                label,
                style: draft.style,
                color: draft.color,
            });
        } else {
            const change: QrCodeChange = {};
            if (targetDirty) {
                change.targetKind = kind;
                change.targetRef = ref;
            }
            if (bound.place !== draft.place) change.place = draft.place;
            if ((bound.placeNote ?? null) !== noteOf(draft)) {
                change.placeNote = noteOf(draft);
            }
            if ((bound.label ?? "") !== draft.label.trim()) {
                change.label = label;
            }
            if (bound.style !== draft.style) change.style = draft.style;
            if (bound.color.toLowerCase() !== draft.color) {
                change.color = draft.color;
            }
            res = await updateQrCode(siteId, bound.id, change);
        }
        if (!res.ok) {
            refused(res);
            return null;
        }
        setProblem(null);
        setAnother(false);
        setBound(res.data);
        setDraft((d) => ({ ...draftOf(res.data), placeNote: d.placeNote }));
        input.onSaved(res.data);
        return res.data;
    }

    /** "Make this code", or "Save changes". */
    async function make() {
        if (busy) return;
        const wasNew = bound === null;
        setBusy("make");
        try {
            const code = await persist();
            if (!code) return;
            showSuccess(
                wasNew ? "Code made" : "Changes saved",
                wasNew && code.link
                    ? linkWords(code.link)
                    : "The printed code keeps working.",
            );
            if (isChanging) input.onChangingDone();
        } finally {
            setBusy(null);
        }
    }

    /** Save first if needed, then hand over the file for the saved code. */
    async function download(format: QrFormat) {
        if (busy) return;
        setBusy(format);
        try {
            const code = await persist();
            if (!code) return;
            const file = qrFile(code, input.business.name, input.business);
            if (!file) {
                showError(
                    "This site has no web address yet, so there is nothing for a code to open.",
                );
                return;
            }
            try {
                await downloadQr(file, format, env);
            } catch {
                showError(
                    format === "png"
                        ? "Couldn't make the PNG. Try again, or download the SVG."
                        : "Couldn't make the file. Try again.",
                );
            }
        } finally {
            setBusy(null);
        }
    }

    async function copy() {
        if (!bound?.link) return;
        try {
            await navigator.clipboard.writeText(bound.link);
            setCopied(true);
            if (copiedTimer.current) clearTimeout(copiedTimer.current);
            copiedTimer.current = setTimeout(() => setCopied(false), 1600);
        } catch {
            showError(
                "Couldn't copy the link. Select it and copy it instead.",
                bound.link,
            );
        }
    }

    return {
        draft,
        bound,
        target,
        lock,
        isChanging,
        another,
        dirty,
        tooLight,
        busy,
        problem,
        copied,
        /** What the code on screen encodes: its link, or the address as a sample. */
        text: bound?.link ?? origin ?? "",
        /** A bound code already branded keeps its look under a lock. */
        brandedLocked: lock !== null && bound?.style !== "BRANDED",
        colorLocked: (hex: string) =>
            lock !== null &&
            hex !== QR_INK &&
            hex !== bound?.color.toLowerCase(),
        pickTarget,
        pickPlace,
        setPlaceNote,
        pickStyle,
        pickColor,
        setLabel,
        makeAnother,
        make,
        download,
        copy,
    };
}

export type QrMakerState = ReturnType<typeof useQrMaker>;
