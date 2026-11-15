"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Lock, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ASK_AI_SHOWN, openAskAi } from "./open";
import { planName } from "./words";

/**
 * The way into Ask AI (board 2): a labelled "Ask AI" button right of
 * Search on a desk, dark while the panel is open; a spark beside Search in
 * a phone's header. On a plan without it, a lock, and it still opens the
 * panel, which says why: never a dead click (board 8).
 */
export function AskAiButton({
    locked,
    upgradeTo,
}: {
    locked: boolean;
    upgradeTo?: string | null;
}) {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const on = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
        window.addEventListener(ASK_AI_SHOWN, on);
        return () => window.removeEventListener(ASK_AI_SHOWN, on);
    }, []);
    // On the full page Ask AI is the screen, so the button shows it on.
    const here = usePathname() === "/ask";
    const on = open || here;
    const name = locked ? `Ask AI, on ${planName(upgradeTo)}` : "Ask AI";
    return (
        <>
            <Button
                type="button"
                variant={on ? "default" : "outline"}
                size="sm"
                aria-expanded={open}
                aria-current={here ? "page" : undefined}
                aria-label={locked ? name : undefined}
                onClick={openAskAi}
                className={cn(
                    "hidden h-9 gap-[7px] rounded-[9px] px-3 text-[13.5px] min-[760px]:inline-flex",
                    locked && !on && "text-neutral-700 dark:text-foreground",
                )}
            >
                {locked ? (
                    <Lock
                        className="size-[15px] text-muted-foreground"
                        aria-hidden
                    />
                ) : (
                    <Sparkles className="size-4" aria-hidden />
                )}
                Ask AI
            </Button>
            <IconButton
                label={name}
                icon={locked ? <Lock /> : <Sparkles />}
                aria-expanded={open}
                onClick={openAskAi}
                className="min-[760px]:hidden"
            />
        </>
    );
}
