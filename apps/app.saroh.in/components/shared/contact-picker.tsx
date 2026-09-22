"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

export interface ContactOption {
    id: string;
    name: string;
    email: string;
}

/**
 * One person, found by typing — shadcn's combobox, the single-choice sibling
 * of `MultiSelect`.
 *
 * A business's contacts run to hundreds; a plain select made someone scroll
 * a 150-row menu to find the person standing in front of them. The search
 * matches the name and the email, and each row shows both, since two people
 * can share a name.
 */
export function ContactPicker({
    contacts,
    value,
    onValueChange,
    id,
    disabled,
    placeholder = "Choose someone…",
    "aria-label": label,
    "aria-describedby": describedBy,
    "aria-invalid": invalid,
}: {
    contacts: readonly ContactOption[];
    value: string;
    onValueChange: (id: string) => void;
    id?: string;
    disabled?: boolean;
    placeholder?: string;
    /** For a picker with no visible label of its own. */
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const picked = contacts.find((c) => c.id === value);

    return (
        // Modal, so the list scrolls with a wheel inside a dialog too: a
        // non-modal popover portalled out of a Dialog loses wheel events to
        // the dialog's scroll lock.
        <Popover open={open} onOpenChange={setOpen} modal>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={label}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    disabled={disabled}
                    className={cn(
                        "flex h-10 w-full min-w-0 justify-between bg-field font-normal",
                        !picked && "text-muted-foreground",
                    )}
                >
                    <span className="min-w-0 truncate">
                        {picked ? (
                            <>
                                {picked.name}
                                <span className="text-muted-foreground">
                                    {" "}
                                    · {picked.email}
                                </span>
                            </>
                        ) : (
                            placeholder
                        )}
                    </span>
                    <ChevronsUpDown
                        aria-hidden
                        className="size-4 shrink-0 opacity-50"
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] min-w-[280px] p-0"
                align="start"
            >
                {/* Contains, not cmdk's fuzzy default: "meera" should find
                    the Meeras, not every name with an m, e, r and a in it. */}
                <Command
                    filter={(value, search) =>
                        value
                            .toLowerCase()
                            .includes(search.trim().toLowerCase())
                            ? 1
                            : 0
                    }
                >
                    <CommandInput placeholder="Search by name or email" />
                    <CommandList>
                        <CommandEmpty>
                            No one by that name or email.
                        </CommandEmpty>
                        {contacts.map((c) => (
                            <CommandItem
                                key={c.id}
                                value={`${c.name} ${c.email} ${c.id}`}
                                onSelect={() => {
                                    onValueChange(c.id);
                                    setOpen(false);
                                }}
                                className="min-h-11"
                            >
                                <Check
                                    aria-hidden
                                    className={cn(
                                        "mr-2 size-4 shrink-0",
                                        c.id === value
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                <span className="min-w-0">
                                    <span className="block truncate">
                                        {c.name}
                                    </span>
                                    <span className="block truncate text-[12px] text-muted-foreground">
                                        {c.email}
                                    </span>
                                </span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
