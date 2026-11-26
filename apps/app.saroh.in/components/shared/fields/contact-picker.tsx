"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { noMatchLine } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";

import { contactSearchRead, PICKER_RECENT } from "@/lib/contacts/queries";
import { useOrgId } from "@/lib/query/org";

export interface ContactOption {
    id: string;
    name: string;
    email: string;
}

/** How long typing settles before the search asks the API. */
const SETTLE_MS = 200;

/**
 * One person, found by typing — shadcn's combobox, the single-choice sibling
 * of `MultiSelect`.
 *
 * `contacts` is the most recent few (`contactPickerOptions`), never the
 * whole business: typing asks the API's contact search (`contactSearchRead`)
 * by name, email or phone, so anyone can be found. Each row shows the name
 * and the email, since two people can share a name. A form that already
 * holds someone not among `contacts` reads them by id, so their name still
 * shows; `onContact` hears each person picked or read that way, for a form
 * that names them elsewhere.
 */
export function ContactPicker({
    contacts,
    value,
    onValueChange,
    onContact,
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
    onContact?: (contact: ContactOption) => void;
    id?: string;
    disabled?: boolean;
    placeholder?: string;
    /** For a picker with no visible label of its own. */
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [settled, setSettled] = useState("");
    const [chosen, setChosen] = useState<ContactOption | null>(null);
    const picked =
        contacts.find((c) => c.id === value) ??
        (chosen?.id === value ? chosen : undefined);

    useEffect(() => {
        const timer = setTimeout(() => setSettled(query.trim()), SETTLE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    const choose = (c: ContactOption) => {
        setChosen(c);
        onContact?.(c);
        onValueChange(c.id);
        setOpen(false);
    };
    const typed = query.trim();
    const near = typed
        ? contacts.filter((c) =>
              `${c.name} ${c.email}`
                  .toLowerCase()
                  .includes(typed.toLowerCase()),
          )
        : contacts;

    return (
        // Modal, so the list scrolls with a wheel inside a dialog too: a
        // non-modal popover portalled out of a Dialog loses wheel events to
        // the dialog's scroll lock.
        <Popover open={open} onOpenChange={setOpen} modal>
            <PopoverTrigger asChild>
                <Button
                    data-ph-mask=""
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
                        "flex w-full min-w-0 justify-between bg-field font-normal",
                        !picked && "text-muted-foreground",
                    )}
                >
                    <span className="min-w-0 truncate">
                        {picked ? (
                            <Named contact={picked} />
                        ) : value ? (
                            <HeldContact
                                id={value}
                                placeholder={placeholder}
                                onFound={(c) => {
                                    setChosen(c);
                                    onContact?.(c);
                                }}
                            />
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
                {/* The rows are chosen here, not by cmdk: the recent
                    few as they stand, or what the search found. */}
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search by name, email or phone"
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList>
                        {settled && settled === typed ? (
                            <SearchedRows
                                q={settled}
                                near={near}
                                value={value}
                                onChoose={choose}
                            />
                        ) : (
                            <Rows
                                contacts={near}
                                value={value}
                                onChoose={choose}
                                empty={typed ? null : noMatchLine("contacts")}
                            />
                        )}
                    </CommandList>
                    {!typed && contacts.length >= PICKER_RECENT ? (
                        <p
                            data-ph-unmask=""
                            className="border-t px-3 py-2 text-[12px] text-muted-foreground"
                        >
                            The most recent. Type to find anyone else.
                        </p>
                    ) : null}
                </Command>
            </PopoverContent>
        </Popover>
    );
}

function Named({ contact }: { contact: ContactOption }) {
    return (
        <>
            {contact.name}
            {contact.email && contact.email !== contact.name ? (
                <span className="text-muted-foreground">
                    {" "}
                    · {contact.email}
                </span>
            ) : null}
        </>
    );
}

/** Who the API's search found for `q`; the recent ones that match until it answers. */
function SearchedRows({
    q,
    near,
    value,
    onChoose,
}: {
    q: string;
    near: readonly ContactOption[];
    value: string;
    onChoose: (c: ContactOption) => void;
}) {
    const orgId = useOrgId();
    const read = useQuery(contactSearchRead.options(orgId, { q }));
    return (
        <Rows
            contacts={read.data ?? near}
            value={value}
            onChoose={onChoose}
            empty={
                read.isError
                    ? "Couldn't search. Try again."
                    : read.data
                      ? noMatchLine("contacts", q)
                      : null
            }
        />
    );
}

/** The person a form already holds, read by id when not among the recent few. */
function HeldContact({
    id,
    placeholder,
    onFound,
}: {
    id: string;
    placeholder: string;
    onFound: (c: ContactOption) => void;
}) {
    const orgId = useOrgId();
    const read = useQuery(contactSearchRead.options(orgId, { id }));
    const found = read.data?.find((c) => c.id === id);
    useEffect(() => {
        if (found) onFound(found);
        // Once per person read, not on every render's new callback.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [found]);
    return found ? <Named contact={found} /> : <>{placeholder}</>;
}

function Rows({
    contacts,
    value,
    onChoose,
    empty,
}: {
    contacts: readonly ContactOption[];
    value: string;
    onChoose: (c: ContactOption) => void;
    /** What an empty list says; null says nothing yet. */
    empty: string | null;
}) {
    if (contacts.length === 0) {
        return empty ? <CommandEmpty>{empty}</CommandEmpty> : null;
    }
    return contacts.map((c) => (
        <CommandItem
            key={c.id}
            value={c.id}
            onSelect={() => onChoose(c)}
            className="min-h-11"
        >
            <Check
                aria-hidden
                className={cn(
                    "mr-2 size-4 shrink-0",
                    c.id === value ? "opacity-100" : "opacity-0",
                )}
            />
            <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                {c.email ? (
                    <span className="block truncate text-[12px] text-muted-foreground">
                        {c.email}
                    </span>
                ) : null}
            </span>
        </CommandItem>
    ));
}
