"use client";

import { FailedRead } from "@/components/shared/states/failed-read";
import { Input } from "@saroh/ui/input";
import { useEffect, useRef, useState } from "react";

import { Chip } from "@/components/shared/lists/chip";
import { findCustomers, readCustomerAttention } from "@/lib/customers/actions";
import type {
    CustomerPick,
    CustomerSearch,
    CustomerSearchResult,
    NewCustomerDraft,
} from "@/lib/customers/picker";
import {
    addLabel,
    apartByEmailMessage,
    draftFromTyped,
    exactly,
    offerAdd,
    pickName,
    pickOf,
    resultLabel,
} from "@/lib/customers/picker";
import type { PeekAttention } from "@/lib/services/peek";
import { attentionText } from "@/lib/services/peek";

import { Notice } from "@saroh/ui/notice";
import { DuplicateWarning, NewCustomerForm, WalkInForm } from "./picker-forms";

/** How long typing settles before the search runs. */
const SETTLE_MS = 200;
/** How many people are shown at once (the design). */
const SHOWN = 8;
/**
 * A chip holding a person's name or email, or what was typed: it wraps,
 * and breaks an address with nowhere to break, so a long one never sets
 * the sheet's width. The chip's own `whitespace-nowrap` and `shrink-0`
 * let "Aishwarya Lakshmi Venkataraman-Subramaniam" widen a phone's New
 * order sheet past the screen, and a tap then scrolled the whole form
 * sideways (DEV_LEARNINGS, 20 Oct 2026).
 */
const PERSON_CHIP =
    "h-auto min-h-8 max-w-full whitespace-normal py-1 text-left [overflow-wrap:anywhere] coarse:h-auto coarse:min-h-11";

/**
 * The shared customer picker (E4): search by name or phone, most recent
 * first, 8 shown; "+ Add ‹typed› as a new customer"; and, once someone is
 * picked, their Needs attention (C1), sensitive entries only for a viewer
 * who may see them and otherwise counted. New booking uses it, and New order
 * (B13) does, with `allowWalkIn` for a customer who leaves only a name (a
 * phone keeps them as a customer, B13b).
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
    emailOptional = false,
    labelledBy,
}: {
    value: CustomerPick | null;
    onPick: (pick: CustomerPick | null) => void;
    /** Offer "+ Add ‹typed› as a new customer". */
    allowAdd?: boolean;
    /**
     * Offer "Walk-in": a name, and a phone that keeps them as a customer
     * (B13, B13b).
     */
    allowWalkIn?: boolean;
    /** The viewer holds `contact:read`. */
    canSearch?: boolean;
    /** Show the picked customer's Needs attention. */
    showAttention?: boolean;
    /**
     * A booking (DEC-170): someone new needs a name and a phone, and the
     * email only when typed. An order still needs it.
     */
    emailOptional?: boolean;
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
    // "Add someone new" on a phone already someone's, with no email: by
    // phone alone the API would book them, so the email is asked for.
    const [apart, setApart] = useState<string | null>(null);
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
        setApart(null);
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
            const byEmail = clean.email
                ? await lookUp(clean.email)
                : ({ ok: true, results: [] } as CustomerSearch);
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
                className="mb-2"
            />
            {attentionNote ? (
                <Notice tone="error" role="note" className="mb-2">
                    {attentionNote}
                </Notice>
            ) : null}
            {failed ? (
                <FailedRead
                    className="mb-2"
                    things="customers"
                    onRetry={() => setRetry((n) => n + 1)}
                />
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
                        className={PERSON_CHIP}
                    >
                        {resultLabel(r)}
                    </Chip>
                ))}
                {pickedShown ? (
                    <Chip
                        on
                        onClick={() => pick(pickedShown)}
                        className={PERSON_CHIP}
                    >
                        {pickName(pickedShown)}
                        {pickedShown.kind === "new"
                            ? " · new"
                            : pickedShown.kind === "walk-in" &&
                                !pickedShown.phone.trim()
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
                        className="min-h-8 max-w-full rounded-full border border-dashed border-border-strong bg-transparent px-[11px] py-1 text-left text-[12.5px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast [overflow-wrap:anywhere] hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active coarse:min-h-11"
                    >
                        {addLabel(query)}
                    </button>
                ) : null}
            </div>
            {adding && !duplicate ? (
                <NewCustomerForm
                    key={apart ?? "new"}
                    initial={adding}
                    onAdd={add}
                    emailOptional={emailOptional}
                    initialError={apart}
                    onCancel={() => {
                        setAdding(null);
                        setApart(null);
                    }}
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
                        if (emailOptional && !duplicate.draft.email) {
                            setAdding(duplicate.draft);
                            setApart(
                                apartByEmailMessage(
                                    resultLabel(duplicate.match),
                                    duplicate.draft.name,
                                ),
                            );
                            setDuplicate(null);
                            return;
                        }
                        pick({ kind: "new", ...duplicate.draft });
                        setAdding(null);
                        setApart(null);
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
