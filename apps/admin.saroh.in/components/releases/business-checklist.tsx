"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { useId, useState } from "react";

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
    options: { id: string; name: string }[];
}) {
    const id = useId();
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const q = query.trim().toLowerCase();

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
                placeholder="Search businesses"
                autoComplete="off"
            />
            <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-md border p-1">
                {options.map((option) => (
                    <li
                        key={option.id}
                        hidden={
                            q.length > 0 &&
                            !option.name.toLowerCase().includes(q)
                        }
                    >
                        <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded px-2 text-sm hover:bg-muted">
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
                            />
                            <span className="truncate">{option.name}</span>
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
