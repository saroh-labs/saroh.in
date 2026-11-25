import { PermissionDeniedState } from "@saroh/ui/data-state";

import { whoCanChange } from "@/components/shared/states/who-can-change";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { freeNoteShown } from "@/lib/saroh-billing/global-free";
import { requireSession } from "@/lib/session";

import { AskAiContainer } from "./containers";

/**
 * Settings › API and AI apps › Ask AI (DEC-220, plan 2026-11-13-001 U11;
 * "AI Settings" boards): Owner and Admin (`module:manage`) only. Someone
 * else who reaches the address is told who can; the switch and counts load
 * in the browser (`/api/settings/developers/ask-ai`), and a plan without
 * Ask AI keeps the tab and says which plan has it.
 */
export async function AskAiTab() {
    await requireSession();
    const org = await resolveActiveOrganization();
    if (!(org?.actions?.includes("module:manage") ?? false)) {
        return <PermissionDeniedState {...whoCanChange({ thing: "Ask AI" })} />;
    }
    return (
        <AskAiContainer
            business={org?.name ?? "your business"}
            beforePaidPlans={freeNoteShown()}
        />
    );
}
