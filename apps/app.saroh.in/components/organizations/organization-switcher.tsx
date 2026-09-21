"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { showError } from "@saroh/ui/toast";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setActiveOrganization } from "@/lib/organizations/actions";
import type {
    Organization,
    OrganizationRole,
} from "@/lib/organizations/service";

const ROLE_LABEL: Record<OrganizationRole, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MEMBER: "Member",
    REVIEWER: "Reviewer",
};

/** A business's first letter on a tile: Ink when it is the one you are in. */
function BusinessTile({
    name,
    active,
    size,
}: {
    name: string;
    active: boolean;
    size: 26 | 30;
}) {
    return (
        <span
            aria-hidden
            className={cn(
                "flex shrink-0 items-center justify-center font-display font-semibold",
                size === 30
                    ? "size-[30px] rounded-lg text-[12.5px]"
                    : "size-[26px] rounded-md text-[11px]",
                active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-neutral-700 dark:text-foreground",
            )}
        >
            {name.trim().charAt(0).toUpperCase()}
        </span>
    );
}

/**
 * The business switcher, in the top bar beside the mark (the "Saroh Products
 * Screen" design). The business is the only scope above a screen, so it is
 * said once, here — the business's tile, its name, and your role in it.
 *
 * Businesses you own are listed apart from the ones you were invited to,
 * because leaving the second kind is a different act from closing the first.
 * Selecting one persists the `active_org` cookie through a membership-guarded
 * server action and refreshes, so every server component re-reads under the
 * new tenant.
 */
export function OrganizationSwitcher({
    organizations,
    activeOrgId,
}: {
    organizations: Organization[];
    activeOrgId: string;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const active =
        organizations.find((o) => o.id === activeOrgId) ?? organizations.at(0);
    if (!active) return null;

    function onSelect(organizationId: string) {
        // No early return when the id already matches: `active` may be the
        // fallback for a missing or stale cookie, and re-selecting it is the
        // only way to write the cookie back. The action is membership-guarded.
        startTransition(async () => {
            const res = await setActiveOrganization(organizationId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setOpen(false);
            setQuery("");
            router.refresh();
        });
    }

    const q = query.trim().toLowerCase();
    const matches = organizations.filter(
        (o) => !q || o.name.toLowerCase().includes(q),
    );
    const owned = matches.filter((o) => o.role === "OWNER");
    const guest = matches.filter((o) => o.role !== "OWNER");

    const row = (org: Organization) => {
        const on = org.id === active.id;
        return (
            <button
                key={org.id}
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => onSelect(org.id)}
                disabled={pending}
                className={cn(
                    "flex w-full items-center gap-[9px] rounded-lg px-[9px] py-[7px] text-left transition-colors duration-fast hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    on && "bg-foreground/[0.03]",
                )}
            >
                <BusinessTile name={org.name} active={on} size={26} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                        {org.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                        {org.roleLabel ?? ROLE_LABEL[org.role]}
                    </span>
                </span>
                {on ? <Check aria-hidden className="size-4 shrink-0" /> : null}
            </button>
        );
    };

    const heading = (label: string, first: boolean) => (
        <p
            className={cn(
                "px-[9px] pb-[5px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
                first ? "pt-1" : "mt-[5px] border-t border-muted pt-2.5",
            )}
        >
            {label}
        </p>
    );

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQuery("");
            }}
        >
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={pending}
                    aria-label={`Change business — currently ${active.name}`}
                    className="flex min-w-0 items-center gap-[9px] rounded-lg px-[9px] py-1.5 text-left transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 coarse:min-h-11"
                >
                    <BusinessTile name={active.name} active size={30} />
                    <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[13.5px] font-semibold">
                            {active.name}
                        </span>
                        <span className="hidden whitespace-nowrap text-[11px] font-medium text-muted-foreground sm:inline">
                            {active.roleLabel ?? ROLE_LABEL[active.role]}
                        </span>
                    </span>
                    <ChevronsUpDown
                        aria-hidden
                        className="size-[13px] shrink-0 text-muted-foreground"
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
                className="w-[268px] rounded-[11px] p-[7px]"
                aria-label="Change business"
            >
                <div className="px-1 pb-[7px] pt-[3px]">
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Find a business"
                        aria-label="Find a business"
                        className="h-8 text-[12.5px]"
                    />
                </div>
                {owned.length > 0 ? (
                    <>
                        {heading("Your businesses", true)}
                        {owned.map(row)}
                    </>
                ) : null}
                {guest.length > 0 ? (
                    <>
                        {heading("Invited to", owned.length === 0)}
                        {guest.map(row)}
                    </>
                ) : null}
                {matches.length === 0 ? (
                    <p className="px-[9px] py-3.5 text-[12.5px] text-muted-foreground">
                        No business matches that.
                    </p>
                ) : null}
                <div className="mt-1.5 border-t border-muted pt-1.5">
                    <Link
                        href="/onboarding"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-[9px] rounded-lg px-[9px] py-2 text-[12.5px] text-neutral-600 transition-colors duration-fast hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:text-muted-foreground"
                    >
                        <Plus aria-hidden className="size-4" />
                        New business
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    );
}
