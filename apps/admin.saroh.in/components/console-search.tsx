"use client";

import { cn } from "@saroh/ui/lib/utils";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { searchConsoleAction } from "@/lib/search-actions";
import type { ConsoleSearch, ConsoleSearchResult } from "@/lib/search-words";
import {
    NOTE_WORDS,
    resultHref,
    resultWords,
    SEARCH_DEBOUNCE_MS,
    SEARCH_MIN_LENGTH,
} from "@/lib/search-words";

type SearchRead = (
    term: string,
) => Promise<{ ok: true; data: ConsoleSearch } | { ok: false }>;

type State =
    | { kind: "idle" }
    | { kind: "searching" }
    | { kind: "done"; term: string; data: ConsoleSearch }
    | { kind: "failed" };

/**
 * The header search (admin console redesign U10, R15): one box that finds a
 * business, a user or the business behind a Razorpay id. A combobox: typing
 * searches after a short pause and says "Searching…", the arrow keys move
 * through the answers, Enter opens the one marked, Esc closes the list (and
 * a second Esc clears the box). It takes no "/" shortcut: "/" belongs to
 * each page's own list search. ⌘K or Ctrl K comes here from anywhere.
 *
 * What it finds is the API's to decide (`GET /admin/search`): each kind only
 * under the permission of the screen it opens.
 */
export function ConsoleSearch({
    search = searchConsoleAction,
}: {
    /** The read, for a test. */
    search?: SearchRead;
}) {
    const router = useRouter();
    const id = useId();
    const listId = `${id}-results`;
    const input = useRef<HTMLInputElement>(null);
    const [term, setTerm] = useState("");
    const [state, setState] = useState<State>({ kind: "idle" });
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);

    const q = term.trim();
    const results = state.kind === "done" ? state.data.results : [];

    // Search once typing pauses. A later answer always wins: an answer to a
    // term since changed is dropped.
    useEffect(() => {
        if (q.length < SEARCH_MIN_LENGTH) return;
        let live = true;
        const timer = setTimeout(() => {
            void search(q).then((answer) => {
                if (!live) return;
                if (!answer.ok) {
                    setState({ kind: "failed" });
                    setActive(-1);
                    return;
                }
                setState({ kind: "done", term: q, data: answer.data });
                setActive(answer.data.results.length > 0 ? 0 : -1);
            });
        }, SEARCH_DEBOUNCE_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [q, search]);

    /** A new term: "Searching…" at once when it is long enough, else idle. */
    function changeTerm(value: string) {
        setTerm(value);
        const next = value.trim();
        if (next === q) return;
        setActive(-1);
        setState(
            next.length < SEARCH_MIN_LENGTH
                ? { kind: "idle" }
                : { kind: "searching" },
        );
    }

    // ⌘K / Ctrl K from anywhere on the page. Never "/".
    useEffect(() => {
        function onKey(event: globalThis.KeyboardEvent) {
            if ((event.metaKey || event.ctrlKey) && event.key === "k") {
                event.preventDefault();
                input.current?.focus();
                input.current?.select();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const showList = open && q.length >= SEARCH_MIN_LENGTH;

    function go(result: ConsoleSearchResult) {
        const href = resultHref(result, state.kind === "done" ? state.term : q);
        setOpen(false);
        changeTerm("");
        input.current?.blur();
        router.push(href);
    }

    function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (results.length === 0) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((at) =>
                at < 0
                    ? step > 0
                        ? 0
                        : results.length - 1
                    : (at + step + results.length) % results.length,
            );
            return;
        }
        if (event.key === "Enter") {
            if (showList && active >= 0 && active < results.length) {
                event.preventDefault();
                go(results[active]);
            }
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            if (showList) setOpen(false);
            else changeTerm("");
        }
    }

    const optionId = (index: number) => `${id}-result-${index}`;

    return (
        <div className="relative min-w-0 flex-1 sm:max-w-[560px]">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
                <Search aria-hidden className="size-4 shrink-0" />
                <input
                    ref={input}
                    type="text"
                    role="combobox"
                    aria-label="Search the console"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        showList && active >= 0 ? optionId(active) : undefined
                    }
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Find a business, user or Razorpay id"
                    value={term}
                    onChange={(event) => {
                        changeTerm(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onKeyDown={onKeyDown}
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden shrink-0 font-mono text-[11.5px] md:inline">
                    ⌘K
                </kbd>
            </label>

            {showList && (
                <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
                    <ul
                        id={listId}
                        role="listbox"
                        aria-label="Search results"
                        className="max-h-[min(60vh,420px)] overflow-y-auto py-1"
                    >
                        {results.map((result, index) => {
                            const words = resultWords(result);
                            return (
                                <li
                                    key={`${result.kind}-${result.id}`}
                                    id={optionId(index)}
                                    role="option"
                                    aria-selected={index === active}
                                    // Before the input's blur closes the list.
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => go(result)}
                                    className={cn(
                                        "flex cursor-pointer items-baseline gap-3 px-3 py-2 text-[13.5px] coarse:min-h-11",
                                        index === active && "bg-muted",
                                    )}
                                >
                                    <span className="w-24 shrink-0 text-[12px] text-muted-foreground">
                                        {words.kind}
                                    </span>
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate font-medium">
                                            {words.title}
                                        </span>
                                        <span className="truncate text-[12.5px] text-muted-foreground">
                                            {words.detail}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    <SearchStatus state={state} />
                </div>
            )}
        </div>
    );
}

/** What the search is doing, read out as it changes. */
function SearchStatus({ state }: { state: State }) {
    let line: string | null = null;
    let note: string | null = null;
    if (state.kind === "searching") line = "Searching…";
    if (state.kind === "failed") line = "Search didn't finish. Try again.";
    if (state.kind === "done" && state.data.results.length === 0) {
        line = "Nothing found";
        note = state.data.note ? NOTE_WORDS[state.data.note] : null;
    }
    return (
        <div
            role="status"
            className={cn(
                "text-[13px] text-muted-foreground",
                line && "px-3 pb-2.5 pt-1.5",
            )}
        >
            {line && <p>{line}</p>}
            {note && <p className="mt-0.5 text-[12.5px]">{note}</p>}
        </div>
    );
}
