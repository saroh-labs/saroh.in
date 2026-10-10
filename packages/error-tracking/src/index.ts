/**
 * `@saroh/error-tracking`: the scrubber and the names every app shares when
 * it reports an error (DEC-125). Nothing in this entry touches the network.
 *
 *  - `@saroh/error-tracking/server` posts an exception to PostHog with
 *    `fetch` (Workers, Next's server, the merchant sites' server side).
 *  - `@saroh/error-tracking/browser` drives the browser SDK an app hands it.
 *    Merchant sites never import it.
 */
export * from "./exception-event";
export * from "./names";
export * from "./scrub";
