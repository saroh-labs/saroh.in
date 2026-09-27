"use client";

import { Input } from "@saroh/ui/input";
import { useEffect, useRef, useState } from "react";

import { Chip } from "@/components/shared/chip";
import { findCustomers, readCustomerAttention } from "@/lib/customers/actions";
import type {
    CustomerPick,
    CustomerSearch,
    CustomerSearchResult,
    NewCustomerDraft,
} from "@/lib/customers/picker";
import {
    addLabel,
    draftFromTyped,
    exactly,
    offerAdd,
    pickName,
    pickOf,
    resultLabel,
} from "@/lib/customers/picker";
import type { PeekAttention } from "@/lib/services/peek";
import { attentionText } from "@/lib/services/peek";

import { DuplicateWarning, NewCustomerForm, WalkInForm } from "./picker-forms";

/** How long typing settles before the search runs. */
const SETTLE_MS = 200;
/** How many people are shown at once (the design). */
const SHOWN = 8;

/**
 * The shared customer picker (E4): search by name or phone, most recent
 * first, 8 shown; "+ Add ‹typed› as a new customer"; and, once someone is
 * picked, their Needs attention (C1), sensitive entries only for a viewer
 * who may see them and otherwise counted. New booking uses it, and New order
 * (B13) will, with `allowWalkIn` for a customer who leaves no record.
 *
 * The search runs on the API and normalises there (C2's `duplicates.ts`);
 * nothing here matches a phone or an email itself. Adding someone new asks
 * for an email, because every customer record is kept by one (DEC-045), and
 * checks it first: an email that is already someone's picks them, and a
 * phone that is already someone's asks whether it is the same person.
 *
 * A viewer without `contact:read` (`canSearch` false, or the API says 403)
 * gets no search, only "+ Add".
 */
export function CustomerPicker({
    value,
    onPick,
    allowAdd = true,
    allowWalkIn = false,
    canSearch = true,
    showAttention = true,
    labelledBy,
}: {
    value: CustomerPick | null;
    onPick: (pick: CustomerPick | null) => void;
    /** Offer "+ Add ‹typed› as a new customer". */
    allowAdd?: boolean;
    /** Offer "Walk-in": a name and a phone, no record (B13). */
    allowWalkIn?: boolean;
    /** The viewer holds `contact:read`. */
    canSearch?: boolean;
    /** Show the picked customer's Needs attention. */
    showAttention?: boolean;
    /** The id of the label over the picker. */
    labelledBy?: string;
}) {
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<{
        query: string;
        read: CustomerSearch;
    } | null>(null);
    const [retry, setRetry] = useState(0);
    const [adding, setAdding] = useState<NewCustomerDraft | null>(null);
    const [walkIn, setWalkIn] = useState(false);
    const [duplicate, setDuplicate] = useState<{
        draft: NewCustomerDraft;
        match: CustomerSearchResult;
    } | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [attention, setAttention] = useState<{
        id: string;
        read: PeekAttention | null;
    } | null>(null);
    const latest = useRef(0);

    const forbidden =
        !canSearch || (found?.read.ok === false && found.read.forbidden);

    useEffect(() => {
        // Not allowed to search: never ask again on every keystroke.
        if (forbidden) return;
        const ask = ++latest.current;
        const timer = setTimeout(
            () => {
                void findCustomers(query)
                    .catch((): CustomerSearch => ({
                        ok: false,
                        forbidden: false,
                    }))
                    .then((read) => {
                        if (ask === latest.current) setFound({ query, read });
                    });
            },
            query ? SETTLE_MS : 0,
        );
        return () => clearTimeout(timer);
    }, [query, forbidden, retry]);

    const pickedId = value?.kind === "contact" ? value.id : null;
    useEffect(() => {
        if (!pickedId || !showAttention || !canSearch) return;
        let live = true;
        void readCustomerAttention(pickedId)
            .catch(() => null)
            .then((read) => {
                if (live) setAttention({ id: pickedId, read });
            });
        return () => {
            live = false;
        };
    }, [pickedId, showAttention, canSearch]);

    const results = found?.read.ok ? found.read.results.slice(0, SHOWN) : [];
    const failed = found?.read.ok === false && !found.read.forbidden;
    const settled = found?.query === query;
    const attentionNote =
        pickedId && attention?.id === pickedId
            ? attentionText(attention.read)
            : null;
    // The picked person keeps their chip when the search moves on.
    const pickedShown =
        value &&
        !(value.kind === "contact" && results.some((r) => r.id === value.id))
            ? value
            : null;
    const showAdd =
        allowAdd &&
        !adding &&
        !walkIn &&
        (forbidden || settled || failed) &&
        offerAdd(query, results);

    function pick(next: CustomerPick | null) {
        setNote(null);
        setDuplicate(null);
        onPick(next);
    }

    /** "Add customer": the email is checked, then the phone, then it's new. */
    async function add(draft: NewCustomerDraft) {
        const clean = {
            name: draft.name.trim(),
            phone: draft.phone.trim(),
            email: draft.email.trim(),
        };
        // A check that can't run leaves it to the booking or order, which
        // still keeps one record per email.
        const lookUp = (q: string) =>
            findCustomers(q).catch((): CustomerSearch => ({
                ok: false,
                forbidden: false,
            }));
        if (!forbidden) {
            const byEmail = await lookUp(clean.email);
            const same = byEmail.ok ? exactly(byEmail.results, "email") : null;
            if (same) {
                pick(pickOf(same));
                setNote(
                    `${resultLabel(same)} already has that email, so they're picked.`,
                );
                setAdding(null);
                setQuery("");
                return;
            }
            if (clean.phone) {
                const byPhone = await lookUp(clean.phone);
                const match = byPhone.ok
                    ? exactly(byPhone.results, "phone")
                    : null;
                if (match) {
                    setDuplicate({ draft: clean, match });
                    return;
                }
            }
        }
        pick({ kind: "new", ...clean });
        setAdding(null);
        setQuery("");
    }

    return (
        <div>
            <Input
                type="search"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setNote(null);
                }}
                placeholder={
                    forbidden
                        ? "Their name, phone or email"
                        : "Search by name or phone"
                }
                aria-label="Find the customer"
                autoComplete="off"
                className="mb-2 h-9 rounded-[9px] text-[13px]"
            />
            {attentionNote ? (
                <div
                    role="note"
                    className="mb-2 rounded-lg bg-destructive-subtle px-2.5 py-[7px] text-[12.5px] leading-[1.45] text-destructive-subtle-foreground"
                >
                    {attentionNote}
                </div>
            ) : null}
            {failed ? (
                <p
                    role="alert"
                    className="mb-2 text-[12.5px] text-destructive-subtle-foreground"
                >
                    Couldn&apos;t search customers — try again.{" "}
                    <button
                        type="button"
                        onClick={() => setRetry((n) => n + 1)}
                        className="font-semibold underline underline-offset-2"
                    >
                        Try again
                    </button>
                </p>
            ) : null}
            {forbidden && canSearch ? (
                <p className="mb-2 text-[11.5px] text-muted-foreground">
                    Your role can&apos;t look customers up. Type who it is to
                    add them.
                </p>
            ) : null}
            <div
                role="radiogroup"
                aria-labelledby={labelledBy}
                aria-label={labelledBy ? undefined : "Customer"}
                aria-busy={canSearch && !forbidden && !settled}
                className="mb-3 flex flex-wrap gap-1.5"
            >
                {results.map((r) => (
                    <Chip
                        key={r.id}
                        on={pickedId === r.id}
                        onClick={() => pick(pickOf(r))}
                    >
                        {resultLabel(r)}
                    </Chip>
                ))}
                {pickedShown ? (
                    <Chip on onClick={() => pick(pickedShown)}>
                        {pickName(pickedShown)}
                        {pickedShown.kind === "new"
                            ? " · new"
                            : pickedShown.kind === "walk-in"
                              ? " · walk-in"
                              : ""}
                    </Chip>
                ) : null}
                {allowWalkIn && value?.kind !== "walk-in" ? (
                    <Chip
                        on={walkIn}
                        onClick={() => {
                            setAdding(null);
                            setWalkIn(true);
                        }}
                    >
                        Walk-in
                    </Chip>
                ) : null}
                {showAdd ? (
                    <button
                        type="button"
                        onClick={() => {
                            setWalkIn(false);
                            setAdding(draftFromTyped(query));
                        }}
                        className="h-8 rounded-full border border-dashed border-border-strong bg-transparent px-[11px] text-[12.5px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11"
                    >
                        {addLabel(query)}
                    </button>
                ) : null}
            </div>
            {adding && !duplicate ? (
                <NewCustomerForm
                    initial={adding}
                    onAdd={add}
                    onCancel={() => setAdding(null)}
                />
            ) : null}
            {duplicate ? (
                <DuplicateWarning
                    match={duplicate.match}
                    onPickThem={() => {
                        pick(pickOf(duplicate.match));
                        setAdding(null);
                        setQuery("");
                    }}
                    onAddAnyway={() => {
                        pick({ kind: "new", ...duplicate.draft });
                        setAdding(null);
                        setQuery("");
                    }}
                />
            ) : null}
            {walkIn ? (
                <WalkInForm
                    initial={draftFromTyped(query)}
                    onUse={(w) => {
                        pick({ kind: "walk-in", ...w });
                        setWalkIn(false);
                        setQuery("");
                    }}
                    onCancel={() => setWalkIn(false)}
                />
            ) : null}
            {note ? (
                <p
                    role="status"
                    className="-mt-1.5 mb-3 text-[11.5px] text-muted-foreground"
                >
                    {note}
                </p>
            ) : null}
        </div>
    );
}
