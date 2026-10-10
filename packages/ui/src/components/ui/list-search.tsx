"use client";

import { Search } from "lucide-react";
import * as React from "react";
import { useDebouncedCallback } from "use-debounce";
import { cn } from "../../lib/utils";

/**
 * The same 180ms the command menu uses for its search, so the product has
 * one answer to "how long after I stop typing".
 */
export const SEARCH_DEBOUNCE_MS = 180;

export interface ListSearchProps {
    /**
     * Required, and always "Search {things}": "Search orders". Add what is
     * searched only where it helps ("Search customers by name, phone or
     * email"). It is the field's accessible name too.
     */
    placeholder: string;
    /** Called with the term once typing has paused, or at once on clear. */
    onSearch: (term: string) => void;
    /**
     * The term the list is showing now (from the address, say). The field
     * starts on it, and follows it when it changes from outside (Clear
     * search, the back button), but never over what someone is typing.
     */
    defaultValue?: string;
    /** True while the list is being read for the term: says "Searching…". */
    searching?: boolean;
    /** "/" anywhere on the page focuses this field. One per screen. */
    shortcut?: boolean;
    /** Form field name, for a search that submits with a form. */
    name?: string;
    className?: string;
    id?: string;
}

function isTyping(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
    );
}

/**
 * The one list search: an icon, one height, left under the tabs, the full
 * width on a phone.
 *
 * It owns the text it shows, so typing re-renders this field and nothing
 * else; the term reaches the list only once typing pauses (180ms) or the
 * field is left. Escape clears it and tells the list at once. "/" focuses
 * it from anywhere on the page. While the list is being read it says
 * "Searching…" inside the field, to the eye and to a screen reader.
 *
 * To clear it from outside (an empty state's "Clear search"), change its
 * `key`.
 */
export const ListSearch = React.forwardRef<HTMLInputElement, ListSearchProps>(
    function ListSearch(
        {
            placeholder,
            onSearch,
            defaultValue = "",
            searching = false,
            shortcut = true,
            name,
            className,
            id,
        },
        forwarded,
    ) {
        const [text, setText] = React.useState(defaultValue);
        const settle = useDebouncedCallback(
            // Spaces at either end are never part of the term.
            (term: string) => onSearch(term.trim()),
            SEARCH_DEBOUNCE_MS,
        );
        const input = React.useRef<HTMLInputElement | null>(null);

        React.useEffect(() => {
            if (document.activeElement !== input.current) {
                // The address moved under a field nobody is typing in.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setText(defaultValue);
            }
        }, [defaultValue]);

        React.useEffect(() => {
            if (!shortcut) return;
            const onKey = (e: KeyboardEvent) => {
                if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
                if (isTyping(e.target)) return;
                // A dialog or sheet over the list owns the keyboard.
                if (document.querySelector('[role="dialog"]')) return;
                e.preventDefault();
                input.current?.focus();
                input.current?.select();
            };
            document.addEventListener("keydown", onKey);
            return () => document.removeEventListener("keydown", onKey);
        }, [shortcut]);

        return (
            <div
                data-list-search=""
                className={cn("relative w-full sm:max-w-[320px]", className)}
            >
                <Search
                    aria-hidden
                    className="pointer-events-none absolute left-[11px] top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <input
                    ref={(el) => {
                        input.current = el;
                        if (typeof forwarded === "function") forwarded(el);
                        else if (forwarded) forwarded.current = el;
                    }}
                    id={id}
                    name={name}
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    value={text}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    aria-keyshortcuts={shortcut ? "/" : undefined}
                    onChange={(e) => {
                        setText(e.target.value);
                        settle(e.target.value);
                    }}
                    // A pause is what the timer waits for, and leaving the
                    // field is a longer pause than any timer.
                    onBlur={() => settle.flush()}
                    onKeyDown={(e) => {
                        if (e.key === "Escape" && text !== "") {
                            // Clearing is this field's; a sheet behind it
                            // must not close on the same press.
                            e.preventDefault();
                            e.stopPropagation();
                            setText("");
                            settle.cancel();
                            onSearch("");
                        } else if (e.key === "Enter") {
                            settle.flush();
                        }
                    }}
                    // 16px under a thumb: iOS zooms the page on a smaller field.
                    className="flex h-[38px] w-full rounded-md border border-input bg-field py-2 pl-[34px] pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11 coarse:text-base [&::-webkit-search-cancel-button]:appearance-none"
                />
                {searching && text !== "" ? (
                    <span
                        role="status"
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 bg-field pl-2 text-xs text-muted-foreground"
                    >
                        Searching…
                    </span>
                ) : shortcut && text === "" ? (
                    <kbd
                        aria-hidden
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-sans text-[11px] leading-[18px] text-muted-foreground coarse:hidden"
                    >
                        /
                    </kbd>
                ) : null}
            </div>
        );
    },
);
