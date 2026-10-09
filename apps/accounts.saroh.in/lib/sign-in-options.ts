import { env } from "@/env";

/** The social sign-in providers the sign-in pages can draw. */
export type SocialProvider = "google" | "github";

const KNOWN: readonly SocialProvider[] = ["google", "github"];

function apiBase(): string {
    if (env.NEXT_PUBLIC_BETTER_AUTH_URL) {
        return new URL(env.NEXT_PUBLIC_BETTER_AUTH_URL).origin;
    }
    return env.NODE_ENV === "production"
        ? "https://api.saroh.in"
        : "https://api.saroh.localhost";
}

/** Only names this app knows, in the API's order. */
export function knownProviders(value: unknown): SocialProvider[] {
    const list =
        value && typeof value === "object" && "providers" in value
            ? value.providers
            : null;
    if (!Array.isArray(list)) return [];
    return list.filter((p): p is SocialProvider =>
        KNOWN.includes(p as SocialProvider),
    );
}

/**
 * The social providers whose keys are set on the API, so a button is only
 * drawn when it can sign someone in (owner, 9 Oct: a provider without keys
 * failed at the round-trip on the live sign-in page). Setting a provider's
 * keys brings its button back within a few minutes. The API unreachable, or
 * any doubt: none — email and password always work.
 */
export async function signInProviders(): Promise<SocialProvider[]> {
    try {
        const response = await fetch(`${apiBase()}/public/sign-in-options`, {
            next: { revalidate: 300 },
        });
        if (!response.ok) return [];
        return knownProviders(await response.json());
    } catch {
        return [];
    }
}
