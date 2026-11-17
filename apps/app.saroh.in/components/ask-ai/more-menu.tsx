"use client";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { Ellipsis, Settings } from "lucide-react";
import Link from "next/link";

const SETTINGS_HREF = "/settings/developers/ask-ai";
const SETTINGS_LINE = "Owner and Admin: switch, usage, who can use it";

/** ⋯: Ask AI settings, for Owner and Admin (board 17), desk and phone. */
export function MoreMenu({ className }: { className: string }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label="More, Ask AI settings"
                    icon={<Ellipsis />}
                    size="md"
                    className={className}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px] p-1.5">
                <DropdownMenuItem
                    asChild
                    className="items-start gap-2.5 py-[9px]"
                >
                    <Link href={SETTINGS_HREF}>
                        <Settings
                            className="mt-px size-[17px] text-muted-foreground"
                            aria-hidden
                        />
                        <span>
                            Ask AI settings
                            <small className="mt-px block text-xs leading-[1.4] text-muted-foreground">
                                {SETTINGS_LINE}
                            </small>
                        </span>
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
