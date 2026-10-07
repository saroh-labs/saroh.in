"use client";

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { FIELD } from "../plans/fields";

const ICON_BUTTON =
    "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground active:bg-accent-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * A row group's heading in the Modules matrix: open or close it, and, for
 * someone who can edit, rename it in place, add a module to it, or remove
 * it once it's empty (the Plans console audit: groups couldn't be made or
 * changed anywhere). The name is the pricing page's section heading.
 */
export function GroupHead({
    name,
    open,
    count,
    changed,
    canEdit,
    canRemove,
    onToggle,
    onRename,
    onAddModule,
    onRemove,
}: {
    name: string;
    open: boolean;
    count: number;
    changed: number;
    canEdit: boolean;
    /** Only an empty group can go, and only a real one (not "No group"). */
    canRemove: boolean;
    onToggle: () => void;
    onRename: ((name: string) => void) | null;
    onAddModule: (() => void) | null;
    onRemove: () => void;
}) {
    const inputId = useId();
    const [renaming, setRenaming] = useState(false);
    const [text, setText] = useState(name);

    function finish(save: boolean) {
        const next = text.trim();
        if (save && next && next !== name) onRename?.(next);
        setText(save && next ? next : name);
        setRenaming(false);
    }

    return (
        <div className="flex items-center gap-1 pr-2.5">
            {renaming ? (
                <form
                    className="flex min-w-0 flex-1 items-center gap-2 px-3.5 pb-2 pt-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        finish(true);
                    }}
                >
                    <label className="sr-only" htmlFor={inputId}>
                        Group name
                    </label>
                    <input
                        id={inputId}
                        autoFocus
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onBlur={() => finish(true)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape") {
                                e.preventDefault();
                                finish(false);
                            }
                        }}
                        className={`${FIELD} h-8 max-w-[280px] text-[13px]`}
                    />
                </form>
            ) : (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={onToggle}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3.5 pb-2 pt-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-highlight-subtle-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active"
                >
                    {open ? (
                        <ChevronDown
                            aria-hidden
                            className="size-3 text-muted-foreground"
                        />
                    ) : (
                        <ChevronRight
                            aria-hidden
                            className="size-3 text-muted-foreground"
                        />
                    )}
                    {name}
                    <span className="font-medium normal-case tracking-normal text-muted-foreground">
                        {count === 0
                            ? "Empty"
                            : `${count} ${count === 1 ? "module" : "modules"}`}
                        {changed ? ` · ${changed} changed` : ""}
                    </span>
                </button>
            )}
            {canEdit && !renaming && (
                <span className="flex items-center gap-0.5 pt-1.5">
                    {onAddModule && (
                        <button
                            type="button"
                            aria-label={`Add a module to ${name}`}
                            title="Add a module here"
                            onClick={onAddModule}
                            className={ICON_BUTTON}
                        >
                            <Plus aria-hidden className="size-3.5" />
                        </button>
                    )}
                    {onRename && (
                        <button
                            type="button"
                            aria-label={`Rename ${name}`}
                            title="Rename"
                            onClick={() => {
                                setText(name);
                                setRenaming(true);
                            }}
                            className={ICON_BUTTON}
                        >
                            <Pencil aria-hidden className="size-3.5" />
                        </button>
                    )}
                    {canRemove && (
                        <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            title="Remove this empty group"
                            onClick={onRemove}
                            className={`${ICON_BUTTON} hover:text-destructive`}
                        >
                            <Trash2 aria-hidden className="size-3.5" />
                        </button>
                    )}
                </span>
            )}
        </div>
    );
}
