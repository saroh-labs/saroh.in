"use client";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_GROUPS, filterNavGroups } from "./nav-items";

const OPEN_EVENT = "saroh:open-command";

/** Open the command palette from anywhere (e.g. the top-bar search button). */
export function openCommandMenu() {
    window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Global ⌘K / Ctrl-K command palette for fast navigation — wires the previously
 * unused `command` primitive. Rendered once in the shell; every authenticated
 * page gets keyboard-driven jump-to-anywhere, the fastest "one product"
 * navigation affordance.
 */
export function CommandMenu({
    moduleKeys = null,
}: {
    moduleKeys?: string[] | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const groups = filterNavGroups(NAV_GROUPS, moduleKeys);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        const onOpen = () => setOpen(true);
        document.addEventListener("keydown", onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            document.removeEventListener("keydown", onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, []);

    const go = (href: string) => {
        setOpen(false);
        router.push(href);
    };

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Search or jump to…" />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                {groups.map((group, i) => (
                    <CommandGroup key={i} heading={group.label ?? "Go to"}>
                        {group.items.map((item) => {
                            const Icon = item.icon;
                            return (
                                <CommandItem
                                    key={item.href}
                                    value={item.label}
                                    onSelect={() => go(item.href)}
                                >
                                    <Icon className="mr-2 h-4 w-4" />
                                    {item.label}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ))}
            </CommandList>
        </CommandDialog>
    );
}
