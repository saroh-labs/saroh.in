"use client";

import { PayInstructionsCard, SiteThemeScope } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";

import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import { EmptyState } from "@saroh/ui/data-state";

/**
 * "What customers see": the customer's card in a merchant site's default
 * colours, drawn by the same block their pages use. Beside the rows it
 * shows what is saved; under the sheet's fields (`inSheet`) it follows
 * what is being typed.
 */
export function PayPreview({
    live,
    inSheet = false,
    businessName,
    preview,
}: {
    /** Drawn from a draft: say the preview shows the unsaved edit. */
    live: boolean;
    inSheet?: boolean;
    businessName: string;
    preview: PayInstructionsSettings;
}) {
    const any =
        !!preview.upiId ||
        !!(preview.bankAccountNumber && preview.bankIfsc) ||
        !!preview.note;
    return (
        <aside
            aria-label="What customers see"
            className={cn(
                "grid gap-2",
                inSheet
                    ? "mt-3 border-t border-border pt-4"
                    : "min-w-[260px] flex-[0_1_340px] self-start min-[1100px]:sticky min-[1100px]:top-4",
            )}
        >
            <div className="flex items-baseline gap-2">
                <span className="label">What customers see</span>
                {live ? (
                    <span className="text-[11.5px] text-foreground">
                        Showing your unsaved edit
                    </span>
                ) : null}
            </div>
            {any ? (
                <SiteThemeScope name={inSheet ? "pay-draft" : "pay-preview"}>
                    <PayInstructionsCard
                        instructions={preview}
                        businessName={businessName}
                        reference="Invoice INV-0001"
                    />
                </SiteThemeScope>
            ) : (
                <EmptyState
                    data-ph-mask=""
                    size="inline"
                    // One string: text split over lines here rendered with
                    // different whitespace on the server and the client, a
                    // hydration mismatch (UX-086).
                    title={`Nothing set yet. Customers see “Pay ${businessName} the way they've asked you to.”`}
                />
            )}
        </aside>
    );
}
