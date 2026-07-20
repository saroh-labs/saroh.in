"use client";

import { Button } from "@saroh/ui/button";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Mobile/tablet primary navigation (< lg). The desktop `AppHeader` nav is
 * `hidden lg:flex`, so without this drawer authenticated users on phones/most
 * tablets could not reach any product area. Reuses the same nav array as the
 * desktop nav and closes on selection.
 */
export function MobileNav({
    items,
}: {
    items: readonly { href: string; label: string }[];
}) {
    const [open, setOpen] = useState(false);
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
                <nav className="mt-6 flex flex-col gap-1">
                    {items.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                            {item.label}
                        </Link>
                    ))}
                    <Link
                        href="/notifications"
                        onClick={() => setOpen(false)}
                        className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        Notifications
                    </Link>
                </nav>
            </SheetContent>
        </Sheet>
    );
}
