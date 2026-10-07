/**
 * The trusted first-party origins, shared by the betterAuth config, the
 * api CSRF guard, the Next.js middleware, and the accounts app's
 * return-after-sign-in check (#222). Kept in its own Prisma-free module so
 * the Edge-runtime middleware — and anything else that must not pull in the
 * database client — can import it, which is why it is exported as its own
 * subpath (`@saroh/auth/origins`) rather than only through `./server`.
 *
 * SERVER-SIDE ONLY in practice: the list comes from
 * `BETTER_AUTH_TRUSTED_ORIGINS`, an env var the browser never sees, so a
 * client-side caller would silently fall back to the production list and
 * reject every development origin.
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
        "https://saroh.app",
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

/**
 * A destination worth following after sign-in, or **null** when none was given
 * or the one given cannot be trusted (#222).
 *
 * The auth middleware bounces an unauthenticated visitor to
 * `accounts/login?redirect=<the page they wanted>`. That parameter is
 * ATTACKER-CONTROLLABLE: anyone can send a Saroh user a link carrying
 * `redirect=https://evil.example/looks-like-saroh`, and following it after a
 * successful sign-in hands them someone who has just typed a password and is
 * primed to type it again. So a destination is followed only when it names a
 * trusted first-party origin.
 *
 * Null rather than a default, because callers disagree about the fallback: a
 * sign-in lands at the app launcher, a freshly verified account lands in
 * onboarding. Collapsing both here would send a new user to a grid of
 * products that all bounce them back.
 *
 * SERVER-SIDE, like everything else in this module: the trusted list comes
 * from an env var the browser never sees.
 */
export function safeDestination(
    redirect: string | string[] | undefined,
): string | null {
    // A repeated ?redirect= gives an array. Take the first rather than
    // guessing which one was meant.
    const value = Array.isArray(redirect) ? redirect[0] : redirect;
    if (typeof value !== "string" || value.trim() === "") return null;
    const candidate = value.trim();

    // A same-origin path, which cannot leave this origin. `//evil.example` is
    // NOT one: the browser reads it as protocol-relative and leaves.
    if (candidate.startsWith("/") && !candidate.startsWith("//")) {
        return candidate;
    }

    return isTrustedOrigin(candidate) ? candidate : null;
}

/**
 * The origin to put on a frontend's server-side call to the API (#50).
 *
 * The API refuses a state-changing request that carries neither `Origin` nor
 * `Referer` (`OriginGuard`). A browser always sends `Origin` on such a
 * request. A Next server action or route handler that relays it with `fetch`
 * does not, so it has to say where the request came from. That is the
 * incoming request's own `Origin` when there is one: a server action's browser
 * request always has it, and Next has already checked it against the host.
 * Otherwise it is the origin of the host this app is serving.
 *
 * The API still checks the value against its trusted list. A forwarded foreign
 * `Origin` is refused there. The host comes from the browser, which can't be
 * made to name a first-party host it isn't visiting.
 */
export function requestOrigin(headers: {
    get(name: string): string | null;
}): string | undefined {
    const origin = headers.get("origin")?.trim();
    if (origin && origin !== "null") return origin;
    const host = (headers.get("x-forwarded-host") ?? headers.get("host"))
        ?.split(",")[0]
        .trim();
    if (!host) return undefined;
    const forwarded = headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const proto =
        forwarded === undefined || forwarded === "" ? "https" : forwarded;
    return `${proto}://${host}`;
}

/**
 * Whether a destination ends at accepting a workspace invitation: the
 * workspace's `/join/:token` (UX-029). Sign-up and log-in speak to an
 * invitee then — they join someone else's business — and fix the address
 * to the invitation's, which accepting insists on. Pure; the destination
 * itself is vetted by {@link safeDestination}.
 */
export function isJoinDestination(
    destination: string | null | undefined,
): boolean {
    if (!destination) return false;
    try {
        const { pathname } = new URL(destination, "https://accounts.invalid");
        return /^\/join\/[^/]+\/?$/.test(pathname);
    } catch {
        return false;
    }
}
