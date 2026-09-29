"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useId, useRef, useState } from "react";

import { findCustomers } from "@/lib/customers/actions";
import type { CustomerSearch } from "@/lib/customers/picker";
import { resultLabel } from "@/lib/customers/picker";

/** How long typing settles before the search runs. */
const SETTLE_MS = 200;
/** How many people are shown at once. */
const SHOWN = 8;

/**
 * "Merge with a duplicate…" from the More menu (C10): find the other record
 * by name, phone or email — for a pair no rule suggests. The search is the
 * customer picker's (`contacts/search`), which never finds a merged-away or
 * removed record; this record is left out of the results.
 */
export function MergeSearch({
    hereId,
    onPick,
}: {
    hereId: string;
    onPick: (picked: { contactId: string; name: string }) => void;
}) {
    const id = useId();
    const [query, setQuery] = useState("");
    const [found, setFound] = useState<{
        query: string;
        read: CustomerSearch;
    } | null>(null);
    const latest = useRef(0);
    const q = query.trim();

    useEffect(() => {
        if (!q) return;
        const ask = ++latest.current;
        const timer = setTimeout(() => {
            void findCustomers(q)
                .catch((): CustomerSearch => ({ ok: false, forbidden: false }))
                .then((read) => {
                    if (ask === latest.current) setFound({ query: q, read });
                });
        }, SETTLE_MS);
        return () => clearTimeout(timer);
    }, [q]);

    const settled = !!q && found?.query === q;
    const read = settled ? found.read : null;
    const results = read?.ok
        ? read.results.filter((r) => r.id !== hereId).slice(0, SHOWN)
        : [];

    let status: string | null = null;
    if (!q) status = "Type a name, phone or email.";
    else if (!read) status = "Searching…";
    else if (!read.ok)
        status = read.forbidden
            ? "Your role can't search customers."
            : "Couldn't search just now. Try again in a moment.";
    else if (results.length === 0) status = `No other customer matches “${q}”.`;

    return (
        <div className="mt-3.5 grid gap-1.5">
            <label htmlFor={id} className="text-[12.5px] font-medium">
                Find the other record
            </label>
            <Input
                id={id}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone or email"
                autoComplete="off"
                autoFocus
                aria-describedby={`${id}-status`}
                className="h-[38px] rounded-[9px] text-[14px]"
            />
            <p
                id={`${id}-status`}
                role="status"
                className={cn(
                    "text-[12px] text-muted-foreground",
                    !status && "sr-only",
                )}
            >
                {status ??
                    `${results.length} ${results.length === 1 ? "match" : "matches"}`}
            </p>
            {results.length > 0 ? (
                <ul className="grid gap-1" aria-label="Matching customers">
                    {results.map((r) => {
                        const name = resultLabel(r);
                        const reach = [r.email, r.phone]
                            .filter(Boolean)
                            .join(" · ");
                        return (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onPick({ contactId: r.id, name })
                                    }
                                    className="w-full min-w-0 cursor-pointer rounded-[8px] border border-border bg-card px-[9px] py-[7px] text-left text-[12.5px] transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent coarse:min-h-11"
                                >
                                    <span className="block truncate font-semibold">
                                        {name}
                                    </span>
                                    {reach ? (
                                        <span className="block truncate text-muted-foreground">
                                            {reach}
                                        </span>
                                    ) : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
