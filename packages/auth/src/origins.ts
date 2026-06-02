/**
 * The trusted `*.saroh.in` origins, shared by the betterAuth config, the
 * api CSRF guard, and the Next.js middleware. Kept in its own Prisma-free
 * module so the Edge-runtime middleware can import it without pulling in
 * the database client.
 */
export function getTrustedOrigins(): string[] {
    const fromEnv = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
    if (fromEnv) {
        return fromEnv
            .split(",")
            .map((o) => o.trim())
            .filter(Boolean);
    }
    return [
        "https://accounts.saroh.in",
        "https://api.saroh.in",
        "https://app.saroh.in",
        "https://admin.saroh.in",
        "https://sites.saroh.in",
        "https://templates.saroh.in",
        "https://docs.saroh.in",
        "https://help.saroh.in",
        "https://ui.saroh.in",
        "https://saroh.in",
    ];
}

/** True when `origin` (an Origin/Referer header value) matches a trusted origin. */
export function isTrustedOrigin(origin: string): boolean {
    let candidate: string;
    try {
        candidate = new URL(origin).origin;
    } catch {
        return false;
    }
    return getTrustedOrigins().some((trusted) => {
        try {
            return new URL(trusted).origin === candidate;
        } catch {
            return false;
        }
    });
}
