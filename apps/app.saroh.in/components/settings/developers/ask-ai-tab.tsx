import { PermissionDeniedState } from "@saroh/ui/data-state";

import { whoCanChange } from "@/components/shared/states/who-can-change";
import { getAskAiState } from "@/lib/ask-ai/service";
import { upgradeHref } from "@/lib/billing/access";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { requireSession } from "@/lib/session";

import { AskAiSettingsView } from "./ask-ai-settings";
import { DevelopersLocked } from "./locked";

/**
 * Settings › API and AI apps › Ask AI (DEC-220, plan 2026-11-13-001 U11;
 * "AI Settings" boards), read on the server: Owner and Admin
 * (`module:manage`) only. Someone else who reaches the address is told
 * who can; a plan without Ask AI keeps the tab and says which plan has it.
 */
export async function AskAiTab() {
    await requireSession();
    const org = await resolveActiveOrganization();
    if (!(org?.actions?.includes("module:manage") ?? false)) {
        return <PermissionDeniedState {...whoCanChange({ thing: "Ask AI" })} />;
    }
    const business = org?.name ?? "your business";
    const state = await getAskAiState();
    if (state?.reason === "locked") {
        return (
            <DevelopersLocked
                name="Ask AI"
                what={`Ask questions about ${business} and get answers inside Saroh.`}
                // "" (no plan has it) reads as none there.
                plan={state.upgradeTo}
                href={upgradeHref()}
                beforePaidPlans={freeNoteShown()}
            />
        );
    }
    return <AskAiSettingsView business={business} state={state} />;
}
