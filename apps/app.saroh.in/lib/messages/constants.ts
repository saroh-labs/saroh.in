/**
 * Pure messaging constants + types shared by the S6-002 server data layer and
 * the client composer/consent components. No server imports (no next/headers),
 * so a client component can import the `MESSAGE_CHANNELS` value without pulling
 * the server-only HTTP plumbing into the browser bundle.
 */

export type MessageChannel = "EMAIL" | "WHATSAPP";
export type ConsentStatus = "GRANTED" | "REVOKED";

/** The channels an org can message a contact on (mirrors the API). */
export const MESSAGE_CHANNELS: MessageChannel[] = ["EMAIL", "WHATSAPP"];
