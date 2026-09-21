import { env } from "@/env";

/** Sign in, for someone already invited into a business. */
export const SIGN_IN_URL = `${env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in"}/login`;

/**
 * The one ask while signup is gated (#261, PRODUCT.md): every "start" button on
 * the site points at the waitlist card that closes each page.
 */
export const WAITLIST_HREF = "#waitlist";
