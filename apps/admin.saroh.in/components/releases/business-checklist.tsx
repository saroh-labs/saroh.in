"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

import { matchesBusiness } from "@/lib/releases";

/**
 * A searchable list of businesses to tick, read back from the form by
 * `name`. A business the search hides keeps its tick (it is hidden, not
 * removed), so narrowing the list never drops a choice already made.
 */
export function BusinessChecklist({
    name,
    options,
}: {
    name: string;
    /** `slug` (its web address) tells apart businesses that share a name. */
    options: { id: string; name: string; slug: string | null }[];
}) {
    const id = useId();
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<Set<string>>(new Set());

    return (
        <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Businesses</legend>
            <Label htmlFor={`${id}-search`} className="sr-only">
                Search businesses
            </Label>
            <Input
                id={`${id}-search`}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or web address"
                autoComplete="off"
            />
            <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-md border p-1">
                {options.map((option) => (
                    <li
                        key={option.id}
                        hidden={!matchesBusiness(option, query)}
                    >
                        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded px-2 py-1 text-sm hover:bg-muted">
                            <input
                                type="checkbox"
                                name={name}
                                value={option.id}
                                checked={picked.has(option.id)}
                                onChange={(e) => {
                                    const next = new Set(picked);
                                    if (e.target.checked) next.add(option.id);
                                    else next.delete(option.id);
                                    setPicked(next);
                                }}
                                className="size-4 accent-primary"
                                aria-label={option.name}
                                aria-describedby={
                                    option.slug
                                        ? `${id}-${option.id}-slug`
                                        : undefined
                                }
                            />
                            <span className="min-w-0">
                                <span className="block truncate">
                                    {option.name}
                                </span>
                                {option.slug && (
                                    <span
                                        id={`${id}-${option.id}-slug`}
                                        className="block truncate font-mono text-[12px] text-muted-foreground"
                                    >
                                        {option.slug}
                                    </span>
                                )}
                            </span>
                        </label>
                    </li>
                ))}
            </ul>
            <p className="text-xs text-muted-foreground" aria-live="polite">
                {picked.size === 0
                    ? "None picked yet."
                    : `${picked.size} picked.`}
            </p>
        </fieldset>
    );
}
