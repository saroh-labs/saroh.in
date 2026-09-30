/**
 * What a test release says when a flow reaches the point where it would
 * become real (DEC-071, R4; plan T6). Server-safe, with no "use client": the
 * site's server actions answer in these words too.
 *
 * A test host refuses every order, booking, payment, plan, pack, waitlist,
 * enquiry and sign-in twice: the blocks stop before they call anything
 * (`TestReleaseStop`), and the site's server actions and the API refuse on
 * their own. Either way the visitor reads what would have happened, never a
 * generic failure.
 */

/** The reason every refusal on a test host carries. */
export const TEST_RELEASE_REASON = "test-release";

/** The API's `details.code` on a write refused from a test host (T4). */
export const TEST_RELEASE_CODE = "TEST_RELEASE";

/** The sentence a refusal carries where there is no richer one to show. */
export const TEST_RELEASE_MESSAGE =
    "This is a test release. Nothing here is ordered, booked or paid.";

/** The sign-in sheet on a test host (KTD-9). */
export const SIGN_IN_OFF_TEXT =
    "Signing in is off on a test release. On the live site, a code goes to this address.";

/** A write refused because the page is a test release. */
export interface TestReleaseRefusal {
    ok: false;
    reason: typeof TEST_RELEASE_REASON;
    message: string;
}

export const TEST_RELEASE_REFUSAL: TestReleaseRefusal = {
    ok: false,
    reason: TEST_RELEASE_REASON,
    message: TEST_RELEASE_MESSAGE,
};

/**
 * Whether an API answer is the test-host write guard's refusal: a 409 whose
 * `details.code` is `TEST_RELEASE`, in the API's envelope
 * (`{ error: { details } }`) or bare (`{ details }`).
 */
export function isTestReleaseRefusal(status: number, body: unknown): boolean {
    if (status !== 409 || typeof body !== "object" || body === null) {
        return false;
    }
    const b = body as {
        details?: { code?: unknown };
        error?: { details?: { code?: unknown } };
    };
    const code = b.error?.details?.code ?? b.details?.code;
    return code === TEST_RELEASE_CODE;
}

/** "3 items", "1 item". */
export function itemsText(count: number): string {
    return `${count} ${count === 1 ? "item" : "items"}`;
}
