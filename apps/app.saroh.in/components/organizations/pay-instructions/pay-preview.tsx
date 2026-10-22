import { PayInstructionsCard, SiteThemeScope } from "@saroh/site-blocks";

import { PreviewPanel } from "@/components/organizations/business-settings/preview-panel";
import type { PayInstructionsSettings } from "@/lib/organizations/pay-instructions";
import { EmptyState } from "@saroh/ui/data-state";

/**
 * "What customers see": the customer's card in a merchant site's default
 * colours, drawn by the same block their pages use. Beside the rows it
 * shows what is saved; under the sheet's fields (`in-sheet`) it follows
 * what is being typed.
 */
export function PayPreview({
    live,
    placement = "beside",
    businessName,
    preview,
}: {
    /** Drawn from a draft: say the preview shows the unsaved edit. */
    live: boolean;
    placement?: "beside" | "in-sheet";
    businessName: string;
    preview: PayInstructionsSettings;
}) {
    const any =
        !!preview.upiId ||
        !!(preview.bankAccountNumber && preview.bankIfsc) ||
        !!preview.note;
    return (
        <PreviewPanel
            label="What customers see"
            live={live}
            placement={placement}
            className="flex-[0_1_340px]"
        >
            {any ? (
                <SiteThemeScope
                    name={
                        placement === "in-sheet" ? "pay-draft" : "pay-preview"
                    }
                >
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
        </PreviewPanel>
    );
}
