import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AtSign, Flag, Instagram } from "lucide-react";

import type { ChannelKind } from "@/lib/social/saroh-social-types";

/** Each channel's mark, as the locked "Post to" already draws them (BPostDesk). */
export const CHANNEL_ICONS: Record<ChannelKind, LucideIcon> = {
    INSTAGRAM: Instagram,
    FACEBOOK: Flag,
    THREADS: AtSign,
};

/** A channel's mark in its rounded tile (BSocialDesk `.b-ch .ico`). */
export function ChannelIcon({
    kind,
    className,
}: {
    kind: ChannelKind;
    className?: string;
}) {
    const Icon = CHANNEL_ICONS[kind];
    return (
        <span
            className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-muted text-foreground",
                className,
            )}
        >
            <Icon aria-hidden className="size-4" />
        </span>
    );
}
