"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { ArrowUpRight, LayoutGrid } from "lucide-react";

import type { InstanceApps } from "@/lib/sibling-apps";

/**
 * Go to another app on this instance. The menu names the instance, which is
 * how an operator with two consoles open tells them apart.
 */
export function AppsMenu({ instance }: { instance: InstanceApps }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Other apps on this instance"
                >
                    <LayoutGrid className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="grid gap-0.5">
                    <span>Other apps</span>
                    <span className="font-mono text-[12px] font-normal text-muted-foreground">
                        {instance.domain}
                    </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {instance.apps.map((app) => (
                    <DropdownMenuItem key={app.key} asChild>
                        <a
                            href={app.href}
                            className="flex items-start gap-3 py-2"
                        >
                            <span className="grid min-w-0 flex-1 gap-0.5">
                                <span className="text-sm font-medium">
                                    {app.name}
                                </span>
                                <span className="text-[12.5px] leading-snug text-muted-foreground">
                                    {app.description}
                                </span>
                            </span>
                            <ArrowUpRight
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                        </a>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
