"use client";

import type { Catalog, CatalogModule } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { menuNote } from "../plans/catalog-edits";
import { FIELD, Field, SELECT } from "../plans/fields";

/**
 * "Module details" (plans catalogue U8): the inline row under a module in
 * the matrix, for its name, the row group it sits in on the pricing page,
 * what it does (the dashboard's upgrade panel says this), and which
 * dashboard menu it controls. Done closes it. A module that was never
 * published can be removed from here (with Undo); a live one is hidden on
 * the pricing page instead.
 */
export function ModuleDetails({
    module,
    groups,
    disabled,
    autoFocus,
    errors,
    onName,
    onGroup,
    onWhat,
    onDone,
    onRemove = null,
}: {
    module: CatalogModule;
    groups: Catalog["groups"];
    disabled: boolean;
    /** Just added: put the keyboard on its name. */
    autoFocus: boolean;
    errors: { name?: string; group?: string; what?: string };
    onName: (name: string) => void;
    onGroup: (group: string) => void;
    onWhat: (what: string) => void;
    onDone: () => void;
    onRemove?: (() => void) | null;
}) {
    const nameRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!autoFocus) return;
        nameRef.current?.focus();
        nameRef.current?.select();
    }, [autoFocus]);

    return (
        <section
            aria-label={`Module details: ${module.name}`}
            className="grid gap-3 rounded-[10px] border border-border-strong bg-muted px-4 py-3.5"
        >
            <div className="flex items-center gap-2.5">
                <h3 className="font-semibold">Module details</h3>
                {onRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onRemove}
                        className="ml-auto h-[30px] gap-1.5 rounded-[8px] px-3 text-[13px] text-destructive hover:text-destructive"
                    >
                        <Trash2 aria-hidden className="size-3.5" />
                        Remove module
                    </Button>
                )}
                <Button
                    type="button"
                    variant="outline"
                    onClick={onDone}
                    className={cn(
                        "h-[30px] rounded-[8px] border-border-strong px-3 text-[13px]",
                        !onRemove && "ml-auto",
                    )}
                >
                    Done
                </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                <Field label="Name" error={errors.name}>
                    {(a) => (
                        <input
                            {...a}
                            ref={nameRef}
                            value={module.name}
                            disabled={disabled}
                            onChange={(e) => onName(e.target.value)}
                            className={FIELD}
                        />
                    )}
                </Field>
                <Field
                    label="Row group on the pricing page"
                    error={errors.group}
                >
                    {(a) => (
                        <select
                            {...a}
                            value={module.group}
                            disabled={disabled}
                            onChange={(e) => onGroup(e.target.value)}
                            className={cn(FIELD, SELECT, "bg-card px-2")}
                        >
                            {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                    {g.name}
                                </option>
                            ))}
                        </select>
                    )}
                </Field>
                <Field
                    label="What it does (shown in the dashboard's upgrade panel)"
                    error={errors.what}
                    className="col-span-full"
                >
                    {(a) => (
                        <input
                            {...a}
                            value={module.what}
                            disabled={disabled}
                            onChange={(e) => onWhat(e.target.value)}
                            className={FIELD}
                        />
                    )}
                </Field>
            </div>
            <p className="text-[12px] text-muted-foreground">
                {menuNote(module)}
            </p>
        </section>
    );
}
