import type { Edition } from "@saroh/edition";

import { githubKeysOf } from "../../common/auth/auth-address";
import { env } from "../../env";

/** The social sign-in providers the auth server registers. */
export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

type Keys = Partial<
    Record<
        | "AUTH_GOOGLE_ID"
        | "AUTH_GOOGLE_SECRET"
        | "AUTH_GITHUB_ID"
        | "AUTH_GITHUB_SECRET"
        | "AUTH_GITHUB_GLOBAL_ID"
        | "AUTH_GITHUB_GLOBAL_SECRET",
        string | undefined
    >
>;

const set = (value: string | undefined) => (value ?? "").trim() !== "";

/**
 * The providers that can actually sign someone in on an edition's address:
 * both of its keys set. One without them fails at the round-trip, so the
 * sign-in pages offer only these (owner, 9 Oct). Google is one client for
 * both editions; GitHub is a pair per edition (KTD5), and Global without
 * its pair has no GitHub at all.
 */
export function configuredProviders(
    keys: Keys = env,
    edition: Edition = "INDIA",
): SocialProvider[] {
    const on: Record<SocialProvider, boolean> = {
        google: set(keys.AUTH_GOOGLE_ID) && set(keys.AUTH_GOOGLE_SECRET),
        github: githubKeysOf(edition, keys).pair !== null,
    };
    return SOCIAL_PROVIDERS.filter((p) => on[p]);
}
