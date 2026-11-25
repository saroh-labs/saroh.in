import { mcpAddress } from "@/lib/ai-connections/mcp-address";
import { DOCS_URL } from "@/lib/help/links";
import {
    activeBusinessZone,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

import { AiAppsContainer } from "./containers";

/**
 * The AI assistants tab's gate, the desk's default and the phone's `/ai`:
 * who is looking and what they may do; the connections load in the
 * browser (`/api/settings/developers/ai`).
 */
export async function AiTab() {
    const [session, org, zone] = await Promise.all([
        requireSession(),
        resolveActiveOrganization(),
        activeBusinessZone(),
    ]);
    return (
        <AiAppsContainer
            business={org?.name ?? "your business"}
            selfId={session.user.id}
            owner={
                org?.actions?.includes("apikey:manage") ?? org?.role === "OWNER"
            }
            canEditSite={org?.actions?.includes("section:write") ?? false}
            mcp={mcpAddress()}
            docs={DOCS_URL}
            zone={zone}
        />
    );
}
