"use client";

import { avatarInitials } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";
import { Toaster } from "@saroh/ui/sonner";
import { textLinkClass } from "@saroh/ui/text-link";
import { SarohSymbol } from "@saroh/ui/wordmark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { NAV_NOTE } from "@/lib/billing-profiles";

/**
 * The account area's frame (DEC-167 step 2, the "Billing profiles" design):
 * a top bar with the Saroh mark, "· Your account", Back to Saroh and the
 * person, and a menu of what is theirs rather than any business's —
 * Profile and sign-in, Billing profiles and Your businesses. On a phone the
 * menu is a row of tabs under the bar.
 *
 * Billing profiles is in the menu only for someone who owns a business or
 * a profile (`showBilling`); a teammate who opens its address reads why
 * there is nothing there.
 */
export interface AccountFrameProps {
    name: string | null;
    email: string;
    /** Saroh itself, for Back to Saroh. */
    appUrl: string;
    showBilling: boolean;
    children: ReactNode;
}

interface NavItem {
    href: string;
    label: string;
    /** The paths that count as this item. */
    match: (path: string) => boolean;
}

export const PROFILE_AND_SIGN_IN = "Profile and sign-in";
export const BILLING_PROFILES = "Billing profiles";
export const YOUR_BUSINESSES = "Your businesses";

export function navItems(showBilling: boolean): NavItem[] {
    return [
        {
            href: "/account",
            label: PROFILE_AND_SIGN_IN,
            match: (p) => p === "/account",
        },
        ...(showBilling
            ? [
                  {
                      href: "/account/billing-profiles",
                      label: BILLING_PROFILES,
                      match: (p: string) =>
                          p.startsWith("/account/billing-profiles"),
                  },
              ]
            : []),
        {
            href: "/businesses",
            label: YOUR_BUSINESSES,
            match: (p) => p.startsWith("/businesses"),
        },
    ];
}

const itemBase =
    "rounded-[9px] border px-3 py-[9px] text-[13.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const itemOn = "border-border bg-card font-semibold text-foreground";
const itemOff =
    "border-transparent text-neutral-700 hover:bg-card/60 hover:text-foreground dark:text-muted-foreground";

export function AccountFrame({
    name,
    email,
    appUrl,
    showBilling,
    children,
}: AccountFrameProps) {
    const path = usePathname();
    const items = navItems(showBilling);
    const displayName = name?.trim() ?? "";
    const firstName = displayName.split(/\s+/)[0] || email;
    const onList = path === "/account/billing-profiles";

    return (
        <div className="bg-background text-foreground flex min-h-screen flex-col">
            <header className="bg-card flex items-center gap-2 border-b px-4 py-3 md:gap-2.5 md:px-6">
                <SarohSymbol size={20} />
                <span className="font-display text-base font-semibold tracking-[-0.02em]">
                    Saroh
                </span>
                <span className="text-muted-foreground hidden text-[13px] sm:inline">
                    · Your account
                </span>
                <a
                    href={appUrl}
                    className={cn(
                        textLinkClass(),
                        "coarse:py-3 ml-auto text-[12.5px]",
                    )}
                >
                    Back to Saroh
                </a>
                <span
                    className="dark:text-muted-foreground flex items-center gap-2 text-[12.5px] text-neutral-700"
                    data-ph-mask=""
                >
                    <span
                        aria-hidden
                        className="bg-muted text-foreground flex size-[30px] items-center justify-center rounded-full text-[11px] font-semibold md:size-[26px]"
                    >
                        {avatarInitials(displayName, email)}
                    </span>
                    <span className="hidden max-w-[8rem] truncate md:inline">
                        {firstName}
                    </span>
                    <span className="sr-only md:hidden">{firstName}</span>
                </span>
            </header>

            <div className="flex flex-1 flex-col md:flex-row">
                <nav
                    aria-label="Your account"
                    className="flex gap-1 overflow-x-auto border-b px-4 py-2.5 md:w-[240px] md:shrink-0 md:flex-col md:gap-0.5 md:overflow-visible md:border-b-0 md:px-3.5 md:py-[22px]"
                >
                    {items.map((item) => {
                        const on = item.match(path);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    itemBase,
                                    "flex min-h-11 flex-none items-center text-[13px] md:min-h-0 md:text-[13.5px]",
                                    on ? itemOn : itemOff,
                                )}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                    {onList ? (
                        <span className="text-muted-foreground mt-3.5 hidden px-3 text-xs leading-normal md:block">
                            {NAV_NOTE}
                        </span>
                    ) : null}
                </nav>
                <main className="min-w-0 flex-1 px-4 pb-10 pt-4 md:px-[30px] md:pb-10 md:pt-[26px]">
                    {children}
                </main>
            </div>
            <Toaster />
        </div>
    );
}
