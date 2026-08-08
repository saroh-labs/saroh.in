"use server";

import type { EnsureFormInput } from "./service";
import { ensureFormForSection as ensureFormForSectionApi } from "./service";

/**
 * Server Actions for enquiry Forms. A thin wrapper that forwards the session
 * cookie and active-org header to api.saroh.in (via the service); the api
 * resolves the caller from the session and enforces org membership + write
 * role. The site editor (a client component) calls this when saving a draft so
 * each enquiry section's backing Form stays in sync with its authored fields.
 */

export async function ensureFormForSection(input: EnsureFormInput) {
    return ensureFormForSectionApi(input);
}
