"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { navFor } from "@/components/console-nav";
import type { AdminPermission } from "@/lib/control-plane";

/**
 * Below 760px there is no rail, so the same nav arrives in a drawer. Same
 * source as the rail (`console-nav.tsx`), so the two cannot disagree about
 * what exists.
 */
export function ConsoleDrawer({
    permissions,
}: {
    permissions: AdminPermission[];
}) {
    const groups = navFor(permissions);
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="min-[760px]:hidden"
                    aria-label="Open the console menu"
                >
                    <Menu className="size-5" />
                </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[270px] p-0">
                <SheetHeader className="px-4 pb-2 pt-4 text-left">
                    <SheetTitle className="text-[15px]">Console</SheetTitle>
                    <SheetDescription className="text-[12.5px]">
                        The instance, not a business.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-5 px-3 pb-5">
                    {groups.map((group) => (
                        <div key={group.label} className="flex flex-col gap-1">
                            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                {group.label}
                            </p>
                            {group.items.map((item) => {
                                const on =
                                    item.href === "/"
                                        ? pathname === "/"
                                        : pathname.startsWith(item.href);
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={on ? "page" : undefined}
                                        // A navigation closes it. Without this
                                        // the drawer stays open over the page
                                        // it just took you to.
                                        onClick={() => setOpen(false)}
                                        className={cn(
                                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] coarse:min-h-11",
                                            on
                                                ? "bg-card font-semibold text-foreground"
                                                : "font-medium text-muted-foreground",
                                        )}
                                    >
                                        <Icon
                                            aria-hidden
                                            className="size-4 shrink-0"
                                        />
                                        <span className="min-w-0 truncate">
                                            {item.label}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    );
}
