/**
 * A failed API call, carrying the status the API actually returned.
 *
 * The data layer used to throw `new Error("GET /x failed: 403")`. The status
 * was in the message, which means it was readable by a human and by nothing
 * else — so every failure reached the segment error boundary as the same
 * anonymous `Error` and was rendered as "Couldn't load this".
 *
 * That is wrong for a denial. PRODUCT_STRATEGY §30 asks for permission denial
 * to be EXPLAINED rather than presented as a breakage: a MEMBER who opens a
 * page their role does not cover has not hit a bug, and telling them to "try
 * again" sends them round a loop that cannot end. The boundary can only tell
 * the two apart if the status survives the throw.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly path: string;

    constructor(status: number, path: string, message?: string) {
        super(message ?? `${path} failed: ${status}`);
        this.name = "ApiError";
        this.status = status;
        this.path = path;
    }

    /** The caller is not signed in, or the session has expired. */
    get isUnauthorized(): boolean {
        return this.status === 401;
    }

    /** Signed in, but not allowed — a role or capability decision. */
    get isForbidden(): boolean {
        return this.status === 403;
    }

    get isNotFound(): boolean {
        return this.status === 404;
    }

    /** Ours, not theirs. The only class of failure worth offering a retry for. */
    get isServerError(): boolean {
        return this.status >= 500;
    }
}

/**
 * Recover an {@link ApiError} from whatever reached an error boundary.
 *
 * Next.js does not hand a client `error.tsx` the original object: it serializes
 * the error and replaces the message in production with a digest. So the
 * boundary cannot use `instanceof`, and reading a status off the message is the
 * only thing left — which is why {@link ApiError} keeps the status IN the
 * message rather than only on the instance.
 */
export function statusFromError(error: unknown): number | null {
    if (error instanceof ApiError) return error.status;

    // Only an Error carries a message worth parsing. Stringifying anything
    // else yields "[object Object]", which never matches and only invites the
    // reader to think it might.
    if (!(error instanceof Error)) return null;
    const message = error.message;
    const match = /\bfailed:\s*(\d{3})\b/.exec(message);
    if (!match) return null;

    const status = Number(match[1]);
    return Number.isFinite(status) ? status : null;
}

/** True when the failure is a permission decision rather than a breakage. */
export function isDenial(error: unknown): boolean {
    const status = statusFromError(error);
    return status === 401 || status === 403;
}
