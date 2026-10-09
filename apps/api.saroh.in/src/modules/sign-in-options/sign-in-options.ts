import { env } from "../../env";

/** The social sign-in providers the auth server registers. */
export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

type Keys = Partial<
    Record<
        | "AUTH_GOOGLE_ID"
        | "AUTH_GOOGLE_SECRET"
        | "AUTH_GITHUB_ID"
        | "AUTH_GITHUB_SECRET",
        string | undefined
    >
>;

const KEYS: Record<SocialProvider, [keyof Keys, keyof Keys]> = {
    google: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
    github: ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
};

/**
 * The providers that can actually sign someone in here: both of its keys set.
 * `packages/auth` registers every provider whatever its keys, and one without
 * them fails at the round-trip, so the sign-in pages offer only these (owner,
 * 9 Oct). Setting a provider's keys brings its button back; nothing else.
 */
export function configuredProviders(keys: Keys = env): SocialProvider[] {
    return SOCIAL_PROVIDERS.filter((p) =>
        KEYS[p].every((k) => (keys[k] ?? "").trim() !== ""),
    );
}
