/**
 * The sign-up hand-off (DEC-127). Sign-up happens on accounts.saroh.in,
 * which loads no advertising tag and can't read what a visitor answered in
 * saroh.in's cookie notice. So a newly verified account is sent through
 * `/welcome` here for a moment, with where it is going next (`next`) and
 * when it was sent (`at`), and this page counts the sign-up only if the
 * visitor accepted advertising cookies on saroh.in, then sends them on.
 * accounts builds the address in `apps/accounts.saroh.in/lib/signup-welcome.ts`.
 */
export const WELCOME_PATH = "/welcome";

/** How long after accounts sent it a visit still counts as that sign-up. */
export const WELCOME_FRESH_MS = 10 * 60 * 1000;

/**
 * The only places `/welcome` sends anyone: accounts, and the workspace
 * beside it (`accounts.saroh.in` → `app.saroh.in`, and the same on the dev
 * and local domains). Anything else in `next` is ignored, so the page can't
 * be used to bounce a visitor to someone else's site.
 */
export function welcomeOrigins(accountsUrl: string): string[] {
    let accounts: URL;
    try {
        accounts = new URL(accountsUrl);
    } catch {
        return [];
    }
    const origins = [accounts.origin];
    if (accounts.hostname.startsWith("accounts.")) {
        const app = new URL(accounts.origin);
        app.hostname = `app.${accounts.hostname.slice("accounts.".length)}`;
        origins.push(app.origin);
    }
    return origins;
}

export interface Welcome {
    /** Where the visitor goes next; always one of {@link welcomeOrigins}. */
    next: string;
    /**
     * The sign-up's stamp when this visit is one accounts just sent, else
     * null: a bookmark, the back button or an address typed by hand counts
     * nothing.
     */
    id: string | null;
}

/** Reads `/welcome`'s address. `now` is the browser's clock, as `at` was. */
export function readWelcome(
    search: string,
    accountsUrl: string,
    now: number,
): Welcome {
    const query = new URLSearchParams(search);
    const origins = welcomeOrigins(accountsUrl);
    let next = `${origins[0] ?? "https://accounts.saroh.in"}/apps`;
    try {
        const asked = new URL(query.get("next") ?? "");
        if (asked.protocol === "https:" && origins.includes(asked.origin))
            next = asked.toString();
    } catch {
        // No destination, or not an address: the app launcher.
    }
    const at = query.get("at") ?? "";
    const age = /^\d{13}$/.test(at) ? now - Number(at) : Number.NaN;
    const fresh = age >= -60_000 && age <= WELCOME_FRESH_MS;
    return { next, id: fresh ? at : null };
}
