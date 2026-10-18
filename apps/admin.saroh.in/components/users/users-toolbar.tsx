"use client";

import { Chip } from "@saroh/ui/chip";
import { ListSearch } from "@saroh/ui/list-search";
import { ListToolbar } from "@saroh/ui/list-toolbar";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { UserListQuery } from "@/lib/user-filters";
import {
    narrowedBy,
    toggleChip,
    USER_CHIP_LABEL,
    USER_CHIPS,
    userListHref,
} from "@/lib/user-filters";

/**
 * The Users list's toolbar (admin console U9, R13): the search, then the
 * chips, each a toggle (`aria-pressed`) and any number on at once, then
 * Clear while anything narrows the list. The address holds the choice
 * (`lib/user-filters.ts`), so the server reads it and a view can be shared.
 */
export function UsersToolbar({
    query,
    count,
}: {
    query: UserListQuery;
    count?: string;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const go = (next: UserListQuery) =>
        startTransition(() =>
            router.replace(userListHref(next), { scroll: false }),
        );
    const narrowed = narrowedBy(query);

    return (
        <ListToolbar
            search={
                <ListSearch
                    placeholder="Search users"
                    describe="By email, name or account id"
                    defaultValue={query.q}
                    searching={pending}
                    shortcut
                    onSearch={(term) => go({ ...query, q: term.trim() })}
                />
            }
            filters={
                <div
                    role="group"
                    aria-label="Show only"
                    className="flex flex-wrap gap-2"
                >
                    {USER_CHIPS.map((chip) => (
                        <Chip
                            key={chip}
                            as="toggle"
                            on={query.chips.includes(chip)}
                            onClick={() => go(toggleChip(query, chip))}
                        >
                            {USER_CHIP_LABEL[chip]}
                        </Chip>
                    ))}
                </div>
            }
            onClear={narrowed ? () => go({ q: "", chips: [] }) : undefined}
            clearLabel={
                narrowed === "search" ? "Clear search" : "Clear filters"
            }
            count={count}
        />
    );
}
