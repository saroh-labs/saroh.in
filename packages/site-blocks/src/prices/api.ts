import type {
    SignedInCustomer,
    SignInApi,
    SignInOptions,
} from "../account/api";
import type { PacksApi } from "../account/packs-api";
import type { PaymentHandoff } from "../booking-flow/api";

/**
 * What the Prices page's Join and Buy ask of the site (round-2 G20). The
 * blocks never call the API themselves: the site's server does, with the
 * signed relay and the customer's session from its host-only cookie. So the
 * page passes its server actions in, and they answer in these shapes —
 * plain data and the page's own words, never the API's text.
 */

/** A started join: what is being paid, and the provider's window to open. */
export interface PlanJoinStarted {
    /** The attempt's ref, to ask how it stands. */
    ref: string;
    plan: { name: string; interval: string };
    total: string;
    currency: string;
    payment: PaymentHandoff;
}

/** How a started join stands. */
export interface PlanJoinAttempt {
    state: "paying" | "joined" | "closed";
    plan: { name: string };
}

/**
 * Why a join couldn't start, with the sentence for it.
 * - signed-out: the session ended since the page loaded; sign in again.
 * - ask: the business can't take the payment online now.
 * - error: anything else, said in words.
 */
export type JoinProblem = "signed-out" | "ask" | "error";

export type JoinResult<T> =
    { ok: true; data: T } | { ok: false; reason: JoinProblem; message: string };

/** The site's server actions for joining a plan. */
export interface JoinApi {
    /** Start paying to join; the same key replays the same payment. */
    join(
        ref: string,
        idempotencyKey: string,
    ): Promise<JoinResult<PlanJoinStarted>>;
    /** How a started join stands. */
    standing(ref: string): Promise<JoinResult<PlanJoinAttempt>>;
}

/**
 * Everything the site hands the Plans and Class packs blocks so a customer
 * can Join and Buy: who is signed in, how to sign in (always on, no guest
 * path), and the actions. Absent: the blocks offer "Ask about…" instead.
 */
export interface PricesActions {
    businessName: string;
    customer: SignedInCustomer | null;
    signInOptions: SignInOptions;
    signIn: SignInApi;
    join: JoinApi;
    packs: PacksApi;
    /** The account's Plan tab, where a new plan or pack shows. */
    accountHref: string;
}

/** Said when the site's server couldn't be reached. */
export const PRICES_OFFLINE =
    "We couldn't reach the business. Try again in a moment.";

/** Said once a plan is joined, as the design flashes it. */
export function joinedMessage(name: string): string {
    return `You're on ${name}. Welcome.`;
}

/** A key for one start: letters, digits, - and _ only. */
export function priceKey(prefix: "join" | "pack"): string {
    const random =
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${random}`.replace(/[^A-Za-z0-9_-]/g, "");
}
