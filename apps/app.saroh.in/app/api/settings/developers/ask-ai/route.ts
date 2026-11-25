import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    askAiSettingsServer,
    mayReadAskAiSettings,
} from "@/lib/settings/ask-ai-access";

/** API and AI apps › Ask AI: the switch and counts, to module:manage (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(askAiSettingsServer, mayReadAskAiSettings);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;
