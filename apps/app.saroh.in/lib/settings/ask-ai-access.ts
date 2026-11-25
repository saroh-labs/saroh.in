import "server-only";

import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { getAskAiState } from "@/lib/ask-ai/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";

import { getAskAiPeopleUsage, getAskAiSettingsWithUsage } from "./ask-ai-usage";
import type { AskAiScreen, NoAsk } from "./queries";
import { askAiSettingsRead } from "./queries";

/** Ask AI's settings: Owner and Admin (`module:manage`), while its switch is on. */
export async function mayReadAskAiSettings(): Promise<boolean> {
    if (!askAiOn()) return false;
    const org = await activeOrganizationOnce();
    return org?.actions?.includes("module:manage") ?? false;
}

export const askAiSettingsServer: ServerRead<NoAsk, AskAiScreen> = {
    read: askAiSettingsRead,
    service: async () => {
        const [state, settings, people] = await Promise.all([
            getAskAiState(),
            getAskAiSettingsWithUsage(),
            getAskAiPeopleUsage(),
        ]);
        return {
            state,
            // The settings' total stays while the switch is off; the
            // panel's state drops it then.
            usage: settings?.usage ?? state?.usage ?? null,
            people,
        };
    },
};
