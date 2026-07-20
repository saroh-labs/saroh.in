"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
    NAV_GROUPS,
    NOTIFICATIONS_HREF,
    isNavItemActive,
} from "@/components/shared/nav-items";

/**
 * Mobile/tablet primary navigation (< lg). The desktop `AppSidebar` is
 * `hidden lg:flex`, so this drawer is the ONLY nav below `lg`. It mirrors the
 * sidebar exactly — same goal groups, icons, and active state — so switching
 * breakpoints never changes the mental model. Closes on selection.
 */
export function MobileNav({ unread = 0 }: { unread?: number }) {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation menu"
                    className="lg:hidden"
                >
                    <Menu className="h-5 w-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
                <SheetHeader>
                    <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <nav aria-label="Primary" className="mt-6 flex flex-col gap-6">
                    {NAV_GROUPS.map((group, index) => (
                        <div
                            key={group.label ?? `group-${index}`}
                            className="flex flex-col gap-1"
                        >
                            {group.label && (
                                <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    {group.label}
                                </p>
                            )}
                            {group.items.map((item) => {
                                const active = isNavItemActive(
                                    pathname,
                                    item.href,
                                );
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        aria-current={
                                            active ? "page" : undefined
                                        }
                                        className={cn(
                                            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                                            active
                                                ? "bg-accent font-medium text-foreground"
                                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                        )}
                                    >
                                        <Icon className="h-4 w-4 shrink-0" />
                                        <span className="flex-1">
                                            {item.label}
                                        </span>
                                        {item.href === NOTIFICATIONS_HREF &&
                                            unread > 0 && (
                                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                                                    {unread}
                                                </span>
                                            )}
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </SheetContent>
        </Sheet>
    );
}
