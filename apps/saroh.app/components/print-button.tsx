"use client";

import { ctaClasses } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";

/** "Print or save as PDF": the browser's own print, for a receipt (A5). */
export function PrintButton() {
    return (
        <button
            type="button"
            onClick={() => window.print()}
            className={cn(ctaClasses("secondary"), "w-full print:hidden")}
        >
            Print or save as PDF
        </button>
    );
}
