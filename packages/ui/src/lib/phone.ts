/**
 * The phone rule (#1036), for an app that reaches it through `@saroh/ui`:
 * `@saroh/block-contract`'s `phone.ts`, the same code the API runs.
 * Callable on the server.
 */
export {
    E164,
    PHONE_EXAMPLE,
    joinPhone,
    normalisePhoneNumber,
    phoneE164,
    phoneLabel,
    phoneNumberProblem,
    splitPhone,
} from "@saroh/block-contract";
