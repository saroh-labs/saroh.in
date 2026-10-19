"use client";

import { phoneLabel } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { nothingChanged } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Check, Plus, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { BusinessPhoneInput } from "@/components/shared/business-phone-input";
import { findCustomers, readCustomerAttention } from "@/lib/customers/actions";
import type {
    CustomerPick,
    CustomerSearch,
    CustomerSearchResult,
    NewCustomerDraft,
    NewCustomerProblems,
} from "@/lib/customers/picker";
import {
    ADD_AS_NEW_NOTE,
    addAsNewLabel,
    apartByEmailMessage,
    draftFromTyped,
    exactly,
    initialsOf,
    listLabel,
    newCustomerProblems,
    offerAdd,
    pickName,
    pickOf,
    resultLabel,
    withDialCode,
} from "@/lib/customers/picker";
import { firstName } from "@/lib/names";
import type { PeekAttention } from "@/lib/services/peek";
import { attentionText } from "@/lib/services/peek";

/** How long typing settles before the search runs. */
const SETTLE_MS = 200;
/** How many people are shown at once (the boards). */
const SHOWN = 8;

const failedSearch = (): CustomerSearch => ({ ok: false, forbidden: false });

/**
 * The customer step's state (U3), so a flow's own foot can drive it: New
 * booking's sticky button reads "Add and use" while the new-customer card
 * is open and calls `add()` (BKMNewBooking), while the free-time sheet
 * draws the card's own Back and Add and use (BKMNewFromGap).
 */
export function useCustomerFinder({
    value,
    onPick,
    canSearch = true,
    dialCode = "+91",
    showAttention = true,
}: {
    value: CustomerPick | null;
    /** Someone was picked, found or new. The flow moves on. */
    onPick: (pick: CustomerPick) => void;
    /** The viewer holds `contact:read`. */
    canSearch?: boolean;
    /** Put in front of a phone typed without one (the business's). */
    dialCode?: string;
    /** Read the picked customer's Needs attention. */
    showAttention?: boolean;
}) {
    const [query, setQueryState] = useState("");
    const [found, setFound] = useState<{
        query: string;
        read: CustomerSearch;
    } | null>(null);
    const [retry, setRetry] = useState(0);
    const [adding, setAdding] = useState<NewCustomerDraft | null>(null);
    const [problems, setProblems] = useState<NewCustomerProblems>({});
    const [checking, setChecking] = useState(false);
    const [dup, setDup] = useState<{
        draft: NewCustomerDraft;
        match: CustomerSearchResult;
    } | null>(null);
    const [note, setNote] = useState<string | null>(null);
    // The customer whose phone it is, already answered "No" for: Zara is
    // added by her email, without asking again.
    const [declined, setDeclined] = useState<string | null>(null);
    const [attention, setAttention] = useState<{
        id: string;
        read: PeekAttention | null;
    } | null>(null);
    const latest = useRef(0);

    const forbidden =
        !canSearch || (found?.read.ok === false && found.read.forbidden);

    useEffect(() => {
        if (forbidden) return;
        const ask = ++latest.current;
        const timer = setTimeout(
            () => {
                void findCustomers(query)
                    .catch(failedSearch)
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

    function pick(next: CustomerPick, said: string | null = null) {
        setNote(said);
        setDup(null);
        setAdding(null);
        setProblems({});
        onPick(next);
    }

    function startAdd() {
        setNote(null);
        setDup(null);
        setProblems({});
        setAdding(draftFromTyped(query));
    }

    /**
     * "Add and use": a name and a phone are enough (DEC-170). An email
     * that is already someone's picks them; a phone that is already
     * someone's asks whether it is the same person; else they are new.
     * True when someone was picked.
     */
    async function add(): Promise<boolean> {
        if (!adding || checking) return false;
        // As people read it, "+91 90000 54321", whether the field gave
        // E.164 (#1036) or a number typed before it was touched.
        const draft = {
            name: adding.name.trim(),
            phone: phoneLabel(withDialCode(adding.phone, dialCode)),
            email: adding.email.trim(),
        };
        const wrong = newCustomerProblems(draft);
        setProblems(wrong);
        if (Object.keys(wrong).length > 0) return false;
        if (forbidden) {
            pick({ kind: "new", ...draft });
            setQueryState("");
            return true;
        }
        setChecking(true);
        try {
            if (draft.email) {
                const byEmail = await findCustomers(draft.email).catch(
                    failedSearch,
                );
                const same = byEmail.ok
                    ? exactly(byEmail.results, "email")
                    : undefined;
                if (same) {
                    pick(
                        pickOf(same),
                        `${resultLabel(same)} already has that email, so they're picked.`,
                    );
                    setQueryState("");
                    return true;
                }
            }
            const byPhone = await findCustomers(draft.phone).catch(
                failedSearch,
            );
            const match = byPhone.ok
                ? exactly(byPhone.results, "phone")
                : undefined;
            if (match && match.id !== declined) {
                setDup({ draft, match });
                return false;
            }
        } finally {
            setChecking(false);
        }
        pick({ kind: "new", ...draft });
        setQueryState("");
        return true;
    }

    return {
        query,
        setQuery: (next: string) => {
            setQueryState(next);
            setNote(null);
        },
        results,
        label: listLabel(query, results.length),
        failed,
        forbidden,
        settled,
        retry: () => setRetry((n) => n + 1),
        showAdd:
            !adding &&
            !dup &&
            (forbidden || settled || failed) &&
            offerAdd(query, results),
        value,
        pickedId,
        pick: (r: CustomerSearchResult) => {
            pick(pickOf(r));
            setQueryState("");
        },
        startAdd,
        adding,
        setField: (key: keyof NewCustomerDraft, next: string) => {
            setAdding((d) => (d ? { ...d, [key]: next } : d));
            setProblems((p) => ({ ...p, [key]: undefined }));
        },
        cancelAdd: () => {
            setAdding(null);
            setProblems({});
        },
        problems,
        checking,
        add,
        dup,
        /** "Yes, book Rohan Mehta". */
        pickMatch: () => {
            if (!dup) return;
            pick(pickOf(dup.match));
            setQueryState("");
        },
        /**
         * "No, add Zara Ahmed". By phone alone the API books whoever has
         * that phone, so Zara is kept apart by her email: asked for when
         * there is none.
         */
        addAnyway: () => {
            if (!dup) return;
            if (!dup.draft.email) {
                setDeclined(dup.match.id);
                // Back in the card as it was: the phone field splits the
                // code from the number itself (#1036).
                setAdding({ ...dup.draft });
                setProblems({
                    email: apartByEmailMessage(
                        resultLabel(dup.match),
                        dup.draft.name,
                    ),
                });
                setDup(null);
                return;
            }
            pick({ kind: "new", ...dup.draft });
            setQueryState("");
        },
        note,
        attention:
            pickedId && attention?.id === pickedId
                ? attentionText(attention.read)
                : null,
        dialCode,
    };
}

export type CustomerFinder = ReturnType<typeof useCustomerFinder>;

/**
 * Find or add a customer (U3, BKMNewBooking step 1 and its states,
 * BKDNewBooking, BKDAddCustomer, BKMNewFromGap): search by name or phone,
 * the eight most recent first; "Add “Zara” as a new customer · Just a
 * name and phone number"; a short card with Name, Phone (+91) and an
 * optional Email; "Rohan Mehta has this number. Is Zara the same
 * person?"; the picked customer's Needs attention; and "Couldn't search
 * your customers" with Try again, keeping what was typed.
 *
 * `addButtons="own"` draws Back and Add and use on the card (the free-time
 * sheet); `"foot"` leaves them to the flow's sticky foot, which calls
 * `finder.add()` (New booking).
 */
export function CustomerStep({
    finder,
    addButtons = "own",
    className,
}: {
    finder: CustomerFinder;
    addButtons?: "own" | "foot";
    className?: string;
}) {
    const ids = {
        list: useId(),
        name: useId(),
        email: useId(),
        dup: useId(),
    };
    const f = finder;
    const picked = f.value;
    const pickedName = picked ? pickName(picked) : "";
    // The picked person keeps their row when the search moves on.
    const pickedRow =
        picked?.kind === "contact" && !f.results.some((r) => r.id === picked.id)
            ? {
                  id: picked.id,
                  name: picked.name,
                  email: picked.email,
                  phone: picked.phone,
                  lastSeenAt: null,
                  exactOn: [],
              }
            : null;
    const rows = pickedRow ? [pickedRow, ...f.results] : f.results;

    return (
        <div className={cn("grid min-w-0 gap-3", className)}>
            {f.adding || f.dup ? null : (
                <div className="relative">
                    <Search
                        aria-hidden
                        className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        type="search"
                        value={f.query}
                        onChange={(e) => f.setQuery(e.target.value)}
                        placeholder={
                            f.forbidden
                                ? "Their name or phone number"
                                : "Name or phone number"
                        }
                        aria-label="Find the customer"
                        autoComplete="off"
                        data-autofocus
                        className="h-12 pl-10 text-[16px]"
                    />
                </div>
            )}

            {f.attention && picked ? (
                <Notice tone="error" role="note">
                    <strong>{firstName(pickedName)} needs attention.</strong>{" "}
                    {f.attention}
                </Notice>
            ) : null}

            {f.failed && !f.adding && !f.dup ? (
                <FailedState
                    size="panel"
                    title="Couldn't search your customers"
                    description={nothingChanged("Check your connection.")}
                    onRetry={f.retry}
                />
            ) : null}

            {f.forbidden && !f.adding ? (
                <p className="text-[12.5px] text-muted-foreground">
                    Your role can&apos;t look customers up. Type who it is to
                    add them.
                </p>
            ) : null}

            {f.showAdd ? (
                <Button
                    type="button"
                    variant="ghost"
                    data-ph-mask=""
                    onClick={f.startAdd}
                    className="h-auto min-h-[60px] w-full justify-start gap-3 rounded-none border-b border-border px-0 text-left hover:bg-transparent coarse:h-auto"
                >
                    <span
                        aria-hidden
                        className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-border-strong bg-card"
                    >
                        <Plus className="size-4" />
                    </span>
                    <span className="grid min-w-0 flex-1 text-left">
                        <span className="truncate text-[14.5px] font-semibold">
                            {addAsNewLabel(f.query)}
                        </span>
                        <span className="text-[12.5px] font-normal text-muted-foreground">
                            {ADD_AS_NEW_NOTE}
                        </span>
                    </span>
                </Button>
            ) : null}

            {!f.adding && !f.dup && !f.forbidden && !f.failed ? (
                <div className="grid min-w-0 gap-0">
                    <span id={ids.list} className="label mb-1 mt-1">
                        {f.label}
                    </span>
                    {rows.length > 0 ? (
                        // Buttons, not a radio group: a pick moves the
                        // flow on, so the arrows must never pick.
                        <ul
                            aria-labelledby={ids.list}
                            className="grid min-w-0 sm:grid-cols-2 sm:gap-x-4"
                        >
                            {rows.map((r) => {
                                const on = f.pickedId === r.id;
                                return (
                                    <li key={r.id} className="min-w-0">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            data-ph-mask=""
                                            aria-current={
                                                on ? "true" : undefined
                                            }
                                            onClick={() => f.pick(r)}
                                            className="h-auto min-h-[60px] w-full min-w-0 justify-start gap-3 rounded-none border-b border-border px-0 text-left font-normal hover:bg-muted/50 coarse:h-auto"
                                        >
                                            <span
                                                aria-hidden
                                                className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-[12.5px] font-semibold text-foreground"
                                            >
                                                {initialsOf(resultLabel(r))}
                                            </span>
                                            <span className="grid min-w-0 flex-1 text-left">
                                                <span className="truncate text-[14.5px] font-semibold">
                                                    {resultLabel(r)}
                                                </span>
                                                {(r.phone ?? r.email) ? (
                                                    <span className="truncate text-[12.5px] text-muted-foreground">
                                                        {r.phone ?? r.email}
                                                    </span>
                                                ) : null}
                                            </span>
                                            {on ? (
                                                <Check
                                                    aria-label="Picked"
                                                    className="size-5 shrink-0 text-success"
                                                />
                                            ) : null}
                                        </Button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : null}
                </div>
            ) : null}

            {f.adding ? (
                <div
                    role="group"
                    aria-label="New customer"
                    className="grid max-w-[460px] gap-3.5 rounded-[12px] border border-border bg-card p-4"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && addButtons === "own") {
                            e.preventDefault();
                            void f.add();
                        }
                    }}
                >
                    <p className="text-[15px] font-semibold">New customer</p>
                    <Field label="Name" error={f.problems.name} holdsData>
                        <Input
                            id={ids.name}
                            value={f.adding.name}
                            onChange={(e) => f.setField("name", e.target.value)}
                            autoComplete="off"
                            className="h-12 text-[16px]"
                        />
                    </Field>
                    <Field label="Phone" error={f.problems.phone} holdsData>
                        <BusinessPhoneInput
                            value={f.adding.phone}
                            onValueChange={(next) => f.setField("phone", next)}
                            boxClassName="h-12 text-[16px]"
                        />
                    </Field>
                    <Field
                        label="Email"
                        optional
                        hint="Add it to email them their booking."
                        error={f.problems.email}
                        holdsData
                    >
                        <Input
                            id={ids.email}
                            type="email"
                            inputMode="email"
                            value={f.adding.email}
                            onChange={(e) =>
                                f.setField("email", e.target.value)
                            }
                            autoComplete="off"
                            placeholder="zara.ahmed@example.com"
                            className="h-12 text-[16px]"
                        />
                    </Field>
                    {addButtons === "own" ? (
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="lg"
                                className="flex-1"
                                onClick={f.cancelAdd}
                            >
                                Back
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                className="flex-[2]"
                                busy={f.checking}
                                busyLabel="Checking…"
                                onClick={() => void f.add()}
                            >
                                Add and use
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {f.dup ? (
                <Notice
                    tone="warning"
                    role="alert"
                    aria-labelledby={ids.dup}
                    className="max-w-[460px]"
                >
                    <div className="grid gap-2">
                        <p
                            id={ids.dup}
                            data-ph-mask=""
                            className="text-[15px] font-semibold"
                        >
                            {resultLabel(f.dup.match)} has this number
                        </p>
                        <p data-ph-mask="" className="leading-[1.5]">
                            {f.dup.draft.phone} is already saved for{" "}
                            {resultLabel(f.dup.match)}. Is{" "}
                            {firstName(f.dup.draft.name)} the same person?
                        </p>
                        <div className="mt-1.5 grid gap-2 sm:flex">
                            <Button
                                type="button"
                                size="lg"
                                data-ph-mask=""
                                onClick={f.pickMatch}
                            >
                                Yes, book {resultLabel(f.dup.match)}
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                variant="outline"
                                data-ph-mask=""
                                onClick={f.addAnyway}
                            >
                                No, add {f.dup.draft.name}
                            </Button>
                        </div>
                    </div>
                </Notice>
            ) : null}

            {f.note ? (
                <p
                    role="status"
                    className="text-[12.5px] text-muted-foreground"
                >
                    {f.note}
                </p>
            ) : null}
        </div>
    );
}
