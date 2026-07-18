"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setActiveOrganization } from "@/lib/organizations/actions";
import type { Organization } from "@/lib/organizations/service";

/**
 * Organization switcher for the dashboard chrome. Lists the user's orgs with
 * the active one marked; selecting one persists the `active_org` cookie via a
 * server action and refreshes so every server component re-fetches under the
 * new tenant. A guarded action means picking an org you don't belong to is
 * rejected rather than silently 403-ing downstream.
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

    const active =
        organizations.find((o) => o.id === activeOrgId) ?? organizations[0];

    function onSelect(organizationId: string) {
        if (organizationId === active.id) return;
        startTransition(async () => {
            const res = await setActiveOrganization(organizationId);
            if (!res.ok) {
                toast.error(res.error);
                return;
            }
            setOpen(false);
            router.refresh();
        });
    }

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    aria-label="Switch organization"
                    className="max-w-[16rem] justify-between gap-2"
                >
                    <span className="truncate">{active.name}</span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={active.id}
                    onValueChange={onSelect}
                >
                    {organizations.map((org) => (
                        <DropdownMenuRadioItem
                            key={org.id}
                            value={org.id}
                            className="gap-2"
                        >
                            <span className="flex-1 truncate">{org.name}</span>
                            <span className="text-xs uppercase text-muted-foreground">
                                {org.role}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/onboarding" className="cursor-pointer gap-2">
                        <Plus className="size-4" />
                        Create organization
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
