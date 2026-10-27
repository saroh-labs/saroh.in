"use client";

import { linkPreview as copy } from "@/content/link-preview";
import { splitScheme } from "@/lib/link-preview";

/**
 * The address field (design 1b): "https://" drawn before it, so whatever is
 * typed or pasted has its own scheme taken off and never doubles (R19). A
 * pasted "http://" is kept, and the label before the field says so.
 */
export function LinkInput({
    value,
    scheme,
    onChange,
    onSubmit,
    busy,
}: {
    value: string;
    scheme: "https" | "http";
    onChange: (next: { rest: string; scheme: "https" | "http" }) => void;
    onSubmit: () => void;
    busy: boolean;
}) {
    return (
        <form
            role="search"
            aria-label={copy.title}
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                onSubmit();
            }}
            className="flex h-[60px] overflow-hidden rounded-[14px] border-2 border-foreground bg-card focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500 focus-within:[outline-style:solid]"
        >
            <span
                aria-hidden
                data-scheme
                className="flex items-center pl-[18px] font-mono text-[15px] text-muted-foreground"
            >
                {scheme}://
            </span>
            <input
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label="Web address"
                placeholder={copy.placeholder}
                value={value}
                onChange={(event) => {
                    const split = splitScheme(event.target.value);
                    onChange({
                        rest:
                            split.rest === event.target.value.trim()
                                ? event.target.value
                                : split.rest,
                        scheme: split.scheme ?? scheme,
                    });
                }}
                className="min-w-0 flex-1 border-none bg-transparent px-2 font-mono text-base text-foreground outline-none placeholder:text-mk-hint"
            />
            <button
                type="submit"
                disabled={busy}
                className="shrink-0 cursor-pointer border-none bg-foreground px-[30px] text-base font-semibold text-background transition-colors duration-fast ease-out hover:bg-mk-ink-hover active:bg-mk-on-ink-hover disabled:cursor-progress max-[420px]:px-4"
            >
                {copy.submit}
            </button>
        </form>
    );
}
