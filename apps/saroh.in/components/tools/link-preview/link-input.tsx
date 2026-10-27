"use client";

import { linkPreview as copy } from "@/content/link-preview";
import { splitScheme } from "@/lib/link-preview";
import { Button } from "../../shared/buttons/button";
import { fieldClasses } from "../../shared/fields/field-classes";

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
                className={fieldClasses({
                    bare: true,
                    className: "px-2 font-mono",
                })}
            />
            {/* Joined to the box: no radius, as tall as the box. */}
            <Button
                type="submit"
                disabled={busy}
                className="h-auto rounded-none px-[30px] focus-visible:outline-none active:scale-100 max-[420px]:px-4"
            >
                {copy.submit}
            </Button>
        </form>
    );
}
