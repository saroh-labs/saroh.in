"use client";

import { authClient } from "@saroh/auth/client";
import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { CircleHelp, LogOut, SunMoon, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";

import { accountsLoginUrl } from "@/lib/accounts";
import { HELP_URL } from "@/lib/help/links";

/**
 * All three, including System. Appearance lives only here since the top
 * bar lost its light/dark toggle (the "Saroh Settings" design, 2026-09-25).
 */
const APPEARANCE = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
] as const;

/**
 * The account menu, at the right of the top bar (the "Saroh Settings"
 * design): your monogram and first name, then what is YOURS rather than the
 * business's — your profile, appearance and help — and signing out. The
 * design keeps only Your profile; appearance and help moved here when the
 * top bar lost them, so neither went missing.
 *
 * Business settings are not here on purpose. They belong to the business you
 * are in and live in the rail; this menu follows you into every business you
 * belong to. Account settings LINK out, because identity is owned by
 * accounts.saroh.in and a different origin is not a route.
 */
export function UserMenu({
    name,
    email,
    businessName,
}: {
    name?: string | null;
    email: string;
    /** For the note that says these settings are not the business's. */
    businessName?: string;
}) {
    const { theme = "system", setTheme } = useTheme();
    // An empty-string name is as good as absent.
    const displayName = name?.trim() ?? "";
    const firstName = displayName.split(/\s+/).at(0) ?? "";
    const monogram = avatarInitials(displayName, email);
    const appearance =
        APPEARANCE.find((a) => a.value === theme)?.label ?? "System";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Your account — ${displayName || email}`}
                    className="ml-0.5 flex items-center gap-2 rounded-full py-1 pl-1 pr-[9px] transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background coarse:min-h-11"
                >
                    <Avatar className="size-[26px] text-[11px]">
                        <AvatarFallback>{monogram}</AvatarFallback>
                    </Avatar>
                    <span className="hidden max-w-[8rem] truncate text-[12.5px] text-neutral-700 dark:text-foreground sm:inline">
                        {firstName || email}
                    </span>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="w-[252px] rounded-[11px] p-[7px]"
            >
                <DropdownMenuLabel className="mb-1.5 flex items-center gap-2.5 border-b border-muted px-[9px] pb-[11px] pt-[7px] font-normal">
                    <Avatar size="list">
                        <AvatarFallback>{monogram}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold">
                            {displayName || "Your account"}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                            {email}
                        </span>
                    </span>
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                    {/* Your login and alerts; identity edits link on from
                        there to accounts.saroh.in. */}
                    <Link href="/settings/profile">
                        <UserRound />
                        <span className="flex-1">Your profile</span>
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2.5 rounded-[7px] px-[9px] py-[7px] text-[13px] [&>svg]:size-4">
                        <SunMoon />
                        <span className="flex-1">Appearance</span>
                        <span className="text-[11.5px] text-muted-foreground">
                            {appearance}
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="rounded-[10px] p-1.5">
                        <DropdownMenuRadioGroup
                            value={theme}
                            onValueChange={setTheme}
                        >
                            {APPEARANCE.map((a) => (
                                <DropdownMenuRadioItem
                                    key={a.value}
                                    value={a.value}
                                    className="text-[13px]"
                                >
                                    {a.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem asChild>
                    <a href={HELP_URL} target="_blank" rel="noreferrer">
                        <CircleHelp />
                        <span className="flex-1">Help centre</span>
                    </a>
                </DropdownMenuItem>
                <p className="px-[9px] pb-1 pt-2 text-[11px] leading-[1.45] text-muted-foreground">
                    These are yours, not {businessName ?? "the business"}
                    &apos;s. They follow you into every business you belong to.
                </p>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    // The only row here that commits rather than navigates.
                    className="wk-press"
                    onSelect={() => {
                        void authClient.signOut().then(() => {
                            window.location.href = accountsLoginUrl;
                        });
                    }}
                >
                    <LogOut />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
