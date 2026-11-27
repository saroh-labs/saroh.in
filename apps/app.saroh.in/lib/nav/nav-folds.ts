"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { NAV_GROUPS } from "@/components/shared/navigation/nav-items";

/**
 * Which menu groups each person keeps open (DEC-279, 27 Nov 2026).
 *
 * Every group is open the first time; a group the person folds or opens
 * keeps that state, on the desk rail and in the phone's More sheet alike
 * (both call this hook, so one key serves both). Stored as each group's
 * last open/closed value, never as "the folded ones", so a group opened
 * again stays open.
 *
 * In this browser, per person: the key carries the user id, so two people
 * on one device never share it. shortcut: browser-only, so another device
 * starts open; upgrade to a per-user JSON preference on the API when one
 * exists (DEC-279 says what it needs).
 */

export type NavFolds = Readonly<Record<string, boolean>>;

const PREFIX = "saroh-nav-folds-v1:";
const CHANGE_EVENT = "saroh:nav-folds";

export const navFoldsKey = (userId: string) => `${PREFIX}${userId}`;

/** Only the menu's own group labels, each with a boolean: nothing else. */
const KNOWN = new Set(
    NAV_GROUPS.map((group) => group.label).filter(Boolean) as string[],
);

export function parseNavFolds(raw: string | null): NavFolds {
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        if (typeof parsed !== "object" || parsed === null) return {};
        return Object.fromEntries(
            Object.entries(parsed).filter(
                ([label, open]) =>
                    KNOWN.has(label) && typeof open === "boolean",
            ),
        );
    } catch {
        return {};
    }
}

/** This visit's folds, for a browser whose storage refused them. */
const remembered = new Map<string, NavFolds>();

export function readNavFolds(userId: string): NavFolds {
    const kept = remembered.get(userId);
    if (kept) return kept;
    try {
        return parseNavFolds(window.localStorage.getItem(navFoldsKey(userId)));
    } catch {
        return {};
    }
}

export function writeNavFolds(userId: string, folds: NavFolds): void {
    try {
        window.localStorage.setItem(navFoldsKey(userId), JSON.stringify(folds));
        remembered.delete(userId);
    } catch {
        remembered.set(userId, folds);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

// The server has no window; the layout effect still runs before paint.
const useBeforePaint =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Open or folded, per group, for this person.
 *
 * `current` is the group holding the page they are on: it is SHOWN open
 * whatever they saved, so they never lose their place, and the saved
 * value is left alone. Folding it there hides it while they stay in it.
 */
export function useNavFolds(userId: string, current: string | null) {
    // Everything open until the stored state is read; read before paint.
    const [folds, setFolds] = useState<NavFolds>({});
    const [unrevealed, setUnrevealed] = useState<string | null>(null);

    useBeforePaint(() => {
        const sync = () => setFolds(readNavFolds(userId));
        sync();
        const onStorage = (e: StorageEvent) => {
            if (e.key === navFoldsKey(userId)) sync();
        };
        window.addEventListener(CHANGE_EVENT, sync);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(CHANGE_EVENT, sync);
            window.removeEventListener("storage", onStorage);
        };
    }, [userId]);

    // Moving to another group shows the current group again (reset in
    // render, React's pattern for state that follows a prop).
    const [seenCurrent, setSeenCurrent] = useState(current);
    if (seenCurrent !== current) {
        setSeenCurrent(current);
        setUnrevealed(null);
    }

    const isOpen = useCallback(
        (label: string) =>
            (folds[label] ?? true) ||
            (label === current && unrevealed !== label),
        [folds, current, unrevealed],
    );

    const toggle = useCallback(
        (label: string) => {
            const next = !isOpen(label);
            if (!next && label === current) setUnrevealed(label);
            writeNavFolds(userId, { ...readNavFolds(userId), [label]: next });
        },
        [isOpen, current, userId],
    );

    return { isOpen, toggle };
}
