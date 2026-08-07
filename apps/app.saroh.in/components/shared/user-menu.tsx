"use client";

import { authClient } from "@saroh/auth/client";
import { Avatar, AvatarFallback } from "@saroh/ui/avatar";
import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Building2, LogOut, UserCog } from "lucide-react";
import Link from "next/link";

import { accountsLoginUrl, accountsUrl } from "@/lib/accounts";

/** Initials for the avatar fallback: "Dev Owner" → "DO", "dev@x.io" → "D". */
function initials(displayName: string, email: string): string {
    if (displayName) {
        return displayName
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("");
    }
    const first = email.charAt(0);
    return first ? first.toUpperCase() : "?";
}

/**
 * The header identity menu.
 *
 * Two problems it solves. It shows WHO is signed in — before this the chrome had
 * a bare "Sign out" button and no way to tell which account you were using,
 * which matters as soon as someone has a personal and a work account. And it is
 * the route to account settings, which live in accounts.saroh.in: identity is
 * owned by the identity provider, so this LINKS out rather than duplicating any
 * of it here (hence a plain anchor — it is a different origin, not a route).
 */
export function UserMenu({
    name,
    email,
    showOrganizationSettings = true,
}: {
    name?: string | null;
    email: string;
    showOrganizationSettings?: boolean;
}) {
    // An empty-string name is as good as absent, so normalise once here rather
    // than falling back at each use site.
    const displayName = name?.trim() ?? "";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Your account"
                    className="gap-2 px-1.5"
                >
                    <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                            {initials(displayName, email)}
                        </AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[10rem] truncate text-sm sm:inline">
                        {displayName ? displayName : email}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="grid gap-0.5">
                    <span className="truncate text-sm font-medium">
                        {displayName ? displayName : "Your account"}
                    </span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                        {email}
                    </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    {/* Cross-origin: accounts.saroh.in owns identity. */}
                    <a href={`${accountsUrl}/account`}>
                        <UserCog className="size-4" />
                        Account settings
                    </a>
                </DropdownMenuItem>
                {showOrganizationSettings && (
                    <DropdownMenuItem asChild>
                        <Link href="/settings/organization">
                            <Building2 className="size-4" />
                            Organization settings
                        </Link>
                    </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    // The only row in this menu that COMMITS rather than
                    // navigates, so it is the only one that gets press
                    // feedback (workspace.css).
                    className="wk-press"
                    onSelect={() => {
                        void authClient.signOut().then(() => {
                            window.location.href = accountsLoginUrl;
                        });
                    }}
                >
                    <LogOut className="size-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
