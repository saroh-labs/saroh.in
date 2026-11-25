"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { SendMessageInput, SetConsentInput } from "./service";
import {
    sendMessage as sendMessageApi,
    setConsent as setConsentApi,
} from "./service";

/**
 * Server Actions for lead messaging (S6-002). Thin wrappers that forward the
 * session cookie + active-org header to the S6-001 communications API (via the
 * service); the api resolves the caller from the session and enforces
 * `message:write` / `consent:write`, the consent gate, and provider state.
 * Client components call these — never the api or the DB directly. Each
 * takes the tab's business last (DEC-259, `writeAsOrg`).
 */

export async function sendMessage(input: SendMessageInput, orgId: string) {
    return writeAsOrg(orgId, () => sendMessageApi(input));
}

export async function setConsent(input: SetConsentInput, orgId: string) {
    return writeAsOrg(orgId, () => setConsentApi(input));
}
