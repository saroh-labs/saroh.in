"use client";

import { Notice } from "@saroh/ui/notice";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/*
 * The editor shell's smaller pieces, after the Editor design: the saved
 * status beside the name, the read-only note and what opens once a new
 * product exists. Leaving with unsaved changes asks through the app's one
 * guard (`components/shared/use-leave-guard.tsx`).
 */

/** Under the header for someone who can't change (all of) the product. */
export function ReadOnlyNote({ children }: { children: ReactNode }) {
    return (
        <Notice layout="banner" icon={<Lock />}>
            {children}
        </Notice>
    );
}

/** While creating: what opens once the product exists, and that it stays here. */
export function NextSteps() {
    return (
        <section
            aria-label="After you create it"
            className="rounded-[12px] border border-dashed border-border-strong px-[18px] py-[15px]"
        >
            <h2 className="font-display text-[15px] font-semibold tracking-[-0.015em]">
                Next: variants and stock
            </h2>
            <p className="mt-1.5 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                Both are saved against the product, so they open here the moment
                it is created. You stay on this page.
            </p>
            <ol className="mt-[13px] flex flex-col gap-[9px]">
                <li className="flex items-start gap-2.5">
                    <span className="mt-px shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        1
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        <strong className="font-semibold text-foreground/75">
                            Variants
                        </strong>
                        : one per size, shade or colour. Each starts at the
                        product&apos;s price, and can have its own.
                    </span>
                </li>
                <li className="flex items-start gap-2.5">
                    <span className="mt-px shrink-0 font-mono text-[11px] text-muted-foreground/80">
                        2
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                        <strong className="font-semibold text-foreground/75">
                            Stock
                        </strong>
                        : how many you have, and when to warn you. With
                        variants, each keeps its own count.
                    </span>
                </li>
            </ol>
        </section>
    );
}
