import type { NextFunction, Request, Response } from "express";

/** app.saroh.in's `GATE_EPOCH_COOKIE` (`lib/access/gate-epoch.ts`). */
export const GATE_EPOCH_COOKIE = "gate_epoch";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A write a browser sends straight here (its session cookie on it) sets a
 * new gate epoch, so app.saroh.in's kept membership and modules answers
 * (`lib/access/gate-memo.ts`) miss for that browser from its next request.
 * The app's own saves go server to server and bump it in the browser
 * themselves. A nonce, not a secret: a forged or stale one only costs a
 * miss. A customer's write on a merchant site or a sign-in never touches
 * the gate.
 */
export function gateEpochMiddleware(
    /** The session cookies' domain (`sessionCookieDomain`), or host-only. */
    domain: string | null,
    secure: boolean,
) {
    const attrs = [
        "Path=/",
        "SameSite=Lax",
        domain ? `Domain=${domain}` : "",
        secure ? "Secure" : "",
    ]
        .filter(Boolean)
        .join("; ");
    return (req: Request, res: Response, next: NextFunction): void => {
        const path = (req.originalUrl || req.url || "").split("?")[0] ?? "";
        if (
            !SAFE.has(req.method) &&
            (req.headers.cookie ?? "").includes(".session_token=") &&
            !path.startsWith("/public/") &&
            !path.startsWith("/api/auth/")
        ) {
            res.append(
                "Set-Cookie",
                `${GATE_EPOCH_COOKIE}=${Date.now().toString(36)}; ${attrs}`,
            );
        }
        next();
    };
}
