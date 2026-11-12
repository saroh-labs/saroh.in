import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { imitatesKnownName } from "./ai-apps";

/**
 * The front of Better Auth's OAuth routes for AI apps (U9), run on every
 * `/api/auth/*` request before Better Auth sees it:
 *
 * - while `API_MCP` is off, every OAuth route and document is 404;
 * - `/oauth2/continue` and `/oauth2/consent` are only ever called by the
 *   API itself (`oauth-flow.service.ts`), which checks the business and the
 *   app's name and writes the audit event first, so from outside they 404;
 * - a registration, a signed-in create or a rename whose name imitates
 *   Saroh, Claude, ChatGPT or OpenAI is refused.
 *
 * Null: let Better Auth answer.
 */
const OAUTH_PATH = /^\/api\/auth\/(oauth2\/|jwks$|\.well-known\/)/;
const INTERNAL_ONLY = /^\/api\/auth\/oauth2\/(continue|consent)$/;
/** Where an app gets or changes its name: dynamic registration, or by a signed-in person. */
const NAMES_A_CLIENT =
    /^\/api\/auth\/oauth2\/(register|create-client|update-client)$/;

const notFound = () =>
    Response.json({ statusCode: 404, message: "Not found" }, { status: 404 });

export async function oauthGate(
    request: Request,
    flags: Pick<FeatureFlagService, "isEnabled"> = new FeatureFlagService(),
): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (!OAUTH_PATH.test(path)) return null;
    if (!(await flags.isEnabled(FlagKey.API_MCP))) return notFound();
    if (INTERNAL_ONLY.test(path)) return notFound();
    if (NAMES_A_CLIENT.test(path) && request.method === "POST") {
        let name: unknown;
        try {
            const body = (await request.clone().json()) as {
                client_name?: unknown;
                update?: { client_name?: unknown };
            };
            name = body.client_name ?? body.update?.client_name;
        } catch {
            return null; // Better Auth refuses a body it can't read.
        }
        if (typeof name === "string" && imitatesKnownName(name)) {
            return Response.json(
                {
                    error: "invalid_client_metadata",
                    error_description:
                        "This app name is reserved. Choose a name that is your own.",
                },
                { status: 400 },
            );
        }
    }
    return null;
}
