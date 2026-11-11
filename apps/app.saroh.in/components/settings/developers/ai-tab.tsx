import { mcpAddress } from "@/lib/ai-connections/mcp-address";
import { listAiConnections } from "@/lib/ai-connections/service";
import { DOCS_URL } from "@/lib/help/links";
import {
    activeBusinessZone,
    resolveActiveOrganization,
} from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { AiApps } from "./ai-apps";

/** The AI assistants tab, read on the server; the desk's default and the phone's `/ai`. */
export async function AiTab() {
    const [session, org, connections, zone] = await Promise.all([
        requireSession(),
        resolveActiveOrganization(),
        listAiConnections(),
        activeBusinessZone(),
    ]);
    return (
        <AiApps
            connections={connections}
            business={org?.name ?? "your business"}
            selfId={session.user.id}
            owner={
                org?.actions?.includes("apikey:manage") ?? org?.role === "OWNER"
            }
            mcp={mcpAddress()}
            docs={DOCS_URL}
            zone={zone}
        />
    );
}
