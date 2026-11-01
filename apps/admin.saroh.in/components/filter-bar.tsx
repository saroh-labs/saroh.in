"use client";

import { Button, buttonVariants } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * A list screen's search and filters, as a GET form: the query string is
 * the state, so a filtered view is a link an operator can paste to a
 * colleague, and the back button works.
 *
 * A dropdown applies as it is picked and the search on Enter (admin audit
 * F8), the same as Billing; Apply stays for anyone who wants it, and is
 * what works with no script. Empty fields are left out of the address. On
 * a phone the search stays and the other fields fold behind "Filters (n)",
 * so the list is on the first screen (F13); every field stays.
 */
export function FilterBar({
    action,
    active,
    search,
    children,
}: {
    action: string;
    /** Whether anything is filtered — shows "Clear" when it is. */
    active: boolean;
    /** The list's search: shown on a phone without opening Filters. */
    search?: ReactNode;
    children: ReactNode;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);

    const submit = (form: HTMLFormElement) => {
        const params = new URLSearchParams();
        for (const [key, value] of new FormData(form)) {
            if (typeof value === "string" && value.trim() !== "")
                params.set(key, value.trim());
        }
        const query = params.toString();
        router.push(query ? `${action}?${query}` : action);
    };
    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        submit(event.currentTarget);
    };
    const onChange = (event: FormEvent<HTMLFormElement>) => {
        if (event.target instanceof HTMLSelectElement) {
            recount();
            submit(event.currentTarget);
        }
    };
    // How many dropdowns are set, for the phone's "Filters (n)".
    const recount = () =>
        setPicked(
            [...(formRef.current?.querySelectorAll("select") ?? [])].filter(
                (field) => field.value !== "",
            ).length,
        );
    useEffect(recount, []);

    return (
        <form
            action={action}
            onSubmit={onSubmit}
            onChange={onChange}
            ref={formRef}
            className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(160px,320px))]"
        >
            {search}
            <Button
                type="button"
                variant="outline"
                aria-expanded={open}
                onClick={() => setOpen((was) => !was)}
                className="sm:hidden"
            >
                {picked ? `Filters (${picked})` : "Filters"}
            </Button>
            <div
                className={cn(
                    "contents",
                    !open && "max-sm:[&>*:not([data-filter-actions])]:hidden",
                )}
            >
                {children}
                <div data-filter-actions="" className="flex items-end gap-2">
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
    anyLabel = "Any",
}: {
    label: string;
    name: string;
    defaultValue?: string;
    options: { value: string; label: string }[];
    /** What the empty choice says, when "Any" isn't what it shows. */
    anyLabel?: string;
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
                <option value="">{anyLabel}</option>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
