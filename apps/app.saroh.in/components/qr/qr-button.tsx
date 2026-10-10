"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { QrCode } from "lucide-react";
import { useState } from "react";

import { useNarrow } from "@/lib/hooks/use-narrow";
import type { QrLink, QrPanelRead } from "@/lib/qr/panel";

import type { DownloadEnv } from "./qr-download";
import { hasCode, QrPanel } from "./qr-panel";

/**
 * "QR code" beside a link the workspace already shows or copies (plan U7):
 * one button, one panel (`qr-panel.tsx`), wherever a customer-facing link
 * is. The caller draws it only where there is such a link, so it is
 * absent, never broken, while the shop is closed or there is no site.
 *
 * The panel is a popover at a desk and a sheet from the foot on a phone,
 * in thumb's reach. Either way focus goes back to the button on close.
 *
 * `compact` keeps it from crowding a header: `always` is the icon alone,
 * `phone` drops the words below `sm`. The icon alone still has its name,
 * and grows to 44px under a finger (`coarse:`, the Button's own).
 */
export function QrButton({
    link,
    compact = "never",
    variant = "outline",
    className,
    env,
}: {
    link: QrLink;
    compact?: "always" | "phone" | "never";
    variant?: "outline" | "ghost";
    className?: string;
    /** Replaced in tests; the browser's own otherwise. */
    env?: DownloadEnv;
}) {
    const narrow = useNarrow();
    const [open, setOpen] = useState(false);
    // The code a first open found or made, so the next open is at once.
    const [known, setKnown] = useState<QrPanelRead | null>(null);
    const name = `QR code for ${link.what}`;

    const trigger = (
        <Button
            type="button"
            variant={variant}
            size={compact === "always" ? "icon" : "sm"}
            aria-label={name}
            data-qr-button={link.mode}
            className={cn(
                "shrink-0",
                compact === "always" && "size-8 coarse:size-11",
                compact === "phone" && "max-sm:px-2.5",
                className,
            )}
        >
            <QrCode aria-hidden className="size-4" />
            {compact === "always" ? null : (
                <span className={cn(compact === "phone" && "max-sm:sr-only")}>
                    QR code
                </span>
            )}
        </Button>
    );
    const panel = (
        <QrPanel
            link={link}
            known={known}
            onKnown={(read) => setKnown(hasCode(read) ? read : null)}
            env={env}
        />
    );
    const title = `QR code for ${link.what}`;

    if (narrow) {
        return (
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>{trigger}</SheetTrigger>
                <SheetContent
                    side="bottom"
                    className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
                >
                    <SheetHeader className="mb-3 text-left">
                        <SheetTitle className="font-display text-[17px] tracking-[-0.02em] [overflow-wrap:anywhere]">
                            {title}
                        </SheetTitle>
                        <SheetDescription className="sr-only">
                            The code, its link and its files.
                        </SheetDescription>
                    </SheetHeader>
                    {panel}
                </SheetContent>
            </Sheet>
        );
    }
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent
                align="end"
                role="dialog"
                aria-label={title}
                className="w-[320px] max-w-[calc(100vw-2rem)]"
            >
                <p className="mb-3 font-display text-[15px] font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
                    {title}
                </p>
                {panel}
            </PopoverContent>
        </Popover>
    );
}
