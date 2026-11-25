"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { Lock, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ASK_AI_SHOWN, openAskAi } from "./open";
import { planName } from "./words";

/**
 * The way into Ask AI (board 2): a labelled "Ask AI" button right of
 * Search on a desk, dark while the panel is open; a spark beside Search in
 * a phone's header. On a plan without it, a lock, and it still opens the
 * panel, which says why: never a dead click (board 8). Until the shell
 * has read Ask AI's state (`pending`) it is drawn in its place but can't
 * be pressed, so it never opens a panel that doesn't know the plan yet.
 */
export function AskAiButton({
    locked,
    upgradeTo,
    pending = false,
}: {
    locked: boolean;
    upgradeTo?: string | null;
    /** Ask AI's state isn't read yet: drawn, not pressable. */
    pending?: boolean;
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
            {/* AF boards: one dark Ask button, with its key, on every page. */}
            <Button
                type="button"
                size="sm"
                aria-expanded={open}
                aria-current={here ? "page" : undefined}
                aria-label={locked ? name : undefined}
                aria-keyshortcuts="Meta+J Control+J"
                disabled={pending}
                aria-busy={pending || undefined}
                data-on={on ? "" : undefined}
                onClick={openAskAi}
                className="hidden h-9 gap-[7px] rounded-[9px] px-3 text-[13.5px] min-[760px]:inline-flex"
            >
                <Sparkles className="size-4" aria-hidden />
                Ask AI
                <kbd
                    aria-hidden
                    className="ml-0.5 font-sans text-[11px] font-medium text-primary-foreground/70"
                >
                    ⌘J
                </kbd>
            </Button>
            <IconButton
                label={name}
                icon={locked ? <Lock /> : <Sparkles />}
                aria-expanded={open}
                disabled={pending}
                aria-busy={pending || undefined}
                onClick={openAskAi}
                className="min-[760px]:hidden"
            />
        </>
    );
}
