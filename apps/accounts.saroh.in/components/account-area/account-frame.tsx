"use client";

import { avatarInitials } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";
import type { SectionItem } from "@saroh/ui/section-list";
import { SectionList } from "@saroh/ui/section-list";
import { Toaster } from "@saroh/ui/sonner";
import { TabStrip } from "@saroh/ui/tabs";
import { textLinkClass } from "@saroh/ui/text-link";
import { SarohSymbol } from "@saroh/ui/wordmark";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { NAV_NOTE } from "@/lib/billing-profiles";

/**
 * The account area's frame (DEC-167 step 2, the "Billing profiles" design):
 * a top bar with the Saroh mark, "· Your account", Back to Saroh and the
 * person, and a menu of what is theirs rather than any business's —
 * Profile and sign-in, Billing profiles and Your businesses. At a desk the
 * menu is the app's SectionList; on a phone, its TabStrip (DEC-199).
 *
 * Billing profiles is in the menu only for someone who owns a business or
 * a profile (`showBilling`); a teammate who opens its address reads why
 * there is nothing there.
 */
export interface AccountFrameProps {
    name: string | null;
    /** Empty while the session can't be read: the person isn't drawn. */
    email: string;
    /** Saroh itself, for Back to Saroh. */
    appUrl: string;
    showBilling: boolean;
    children: ReactNode;
}

export const PROFILE_AND_SIGN_IN = "Profile and sign-in";
export const BILLING_PROFILES = "Billing profiles";
export const YOUR_BUSINESSES = "Your businesses";

/**
 * The menu. Billing profiles is in it for someone who owns a business or
 * a profile, and always while its page is open, so a teammate who opens
 * its address still sees where they are.
 */
export function navItems(showBilling: boolean, path = ""): SectionItem[] {
    const billing = path.startsWith("/account/billing-profiles");
    return [
        { value: "account", href: "/account", label: PROFILE_AND_SIGN_IN },
        ...(showBilling || billing
            ? [
                  {
                      value: "billing",
                      href: "/account/billing-profiles",
                      label: BILLING_PROFILES,
                  },
              ]
            : []),
        { value: "businesses", href: "/businesses", label: YOUR_BUSINESSES },
    ];
}

/** Which item the path is on. */
export function navValue(path: string): string | null {
    if (path === "/account") return "account";
    if (path.startsWith("/account/billing-profiles")) return "billing";
    if (path.startsWith("/businesses")) return "businesses";
    return null;
}

export function AccountFrame({
    name,
    email,
    appUrl,
    showBilling,
    children,
}: AccountFrameProps) {
    const path = usePathname();
    const items = navItems(showBilling, path);
    const value = navValue(path);
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
                {email ? (
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
                ) : null}
            </header>

            <div className="flex flex-1 flex-col min-[760px]:flex-row">
                {/* Phone: the app's tab look (TabStrip, one line in
                    ScrollX). Desk: the app's SectionList. */}
                <div className="border-b px-4 min-[760px]:hidden">
                    <TabStrip
                        label="Your account"
                        value={value ?? ""}
                        tabs={items.map((i) => ({
                            value: i.value,
                            label: i.label,
                            href: i.href,
                        }))}
                    />
                </div>
                <div className="hidden w-[240px] shrink-0 px-3.5 py-[22px] min-[760px]:block">
                    <SectionList
                        label="Your account"
                        items={items}
                        value={value}
                    />
                    {onList ? (
                        <p className="text-muted-foreground mt-3.5 px-3 text-xs leading-normal">
                            {NAV_NOTE}
                        </p>
                    ) : null}
                </div>
                <main className="min-w-0 flex-1 px-4 pb-10 pt-4 min-[760px]:px-[30px] min-[760px]:pt-[26px]">
                    {children}
                </main>
            </div>
            <Toaster />
        </div>
    );
}
