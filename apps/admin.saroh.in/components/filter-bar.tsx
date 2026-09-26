import { Button, buttonVariants } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A list screen's search and filters, as a plain GET form: the query string
 * is the state, so a filtered view is a link an operator can paste to a
 * colleague, and the back button works. No client script needed.
 */
export function FilterBar({
    action,
    active,
    children,
}: {
    action: string;
    /** Whether anything is filtered — shows "Clear" when it is. */
    active: boolean;
    children: ReactNode;
}) {
    return (
        <form
            action={action}
            className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]"
        >
            {children}
            <div className="flex items-end gap-2">
                <Button type="submit" className="flex-1 sm:flex-none">
                    Apply
                </Button>
                {active && (
                    <Link
                        href={action}
                        className={buttonVariants({ variant: "ghost" })}
                    >
                        Clear
                    </Link>
                )}
            </div>
        </form>
    );
}

export function FilterText({
    label,
    name,
    defaultValue,
    placeholder,
}: {
    label: string;
    name: string;
    defaultValue?: string;
    placeholder?: string;
}) {
    return (
        <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`filter-${name}`} className="text-muted-foreground">
                {label}
            </Label>
            <Input
                id={`filter-${name}`}
                type="search"
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                className="min-w-0"
            />
        </div>
    );
}

/** A native select, dressed as an input: it works with no script at all. */
export function FilterSelect({
    label,
    name,
    defaultValue,
    options,
}: {
    label: string;
    name: string;
    defaultValue?: string;
    options: { value: string; label: string }[];
}) {
    return (
        <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`filter-${name}`} className="text-muted-foreground">
                {label}
            </Label>
            <select
                id={`filter-${name}`}
                name={name}
                defaultValue={defaultValue ?? ""}
                className="h-[38px] w-full min-w-0 rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
            >
                <option value="">Any</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
