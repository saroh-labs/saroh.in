import { Transform } from "class-transformer";
import { IsString, MaxLength } from "class-validator";

const trimLower = ({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value;

/**
 * Change the business's web address (DEC-069, plan L2). Only the type and a
 * generous length are checked here: the address rules (shape, `--`, reserved
 * words, the 57-character cap) are `addressProblem`'s, answered by the
 * service in the same words setup and site creation use.
 */
export class ChangeWebAddressDto {
    @Transform(trimLower)
    @IsString({ message: "Enter a web address" })
    @MaxLength(100, { message: "That web address is too long" })
    address!: string;
}

/** A web address the business held before, while it is still held. */
export interface PreviousWebAddress {
    address: string;
    /** Until when it forwards to the site. Null: held, but never forwards. */
    redirectUntil: string | null;
    /** Until when nobody else can take it. */
    reservedUntil: string;
}

/**
 * The business's web address and its links (DEC-069, KTD-8): the one read
 * Settings and every share button use, so none of them builds
 * `<address>.saroh.app` itself.
 */
export interface WebAddressView {
    /** The address: the site's subdomain, else the one reserved at setup. */
    address: string;
    /** Where customers go: the verified custom domain, else the address. */
    origin: string;
    /** `https://<address>.saroh.app`, which still works with a domain. */
    platformOrigin: string;
    /** The verified custom domain's hostname, or null. */
    customDomain: string | null;
    /** Each link only while that page is live; null otherwise. */
    links: {
        site: string | null;
        shop: string | null;
        book: string | null;
    };
    /** Addresses still held for the business, soonest released first. */
    previous: PreviousWebAddress[];
    /** Whether changing is switched on for this business (the rollout). */
    changeAvailable: boolean;
    /** Whether this person may change it now: the owner, with it on. */
    canChange: boolean;
}

/** The answer to "can I have this address?" as the dialog types it. */
export interface WebAddressAvailability {
    address: string;
    ok: boolean;
    /** Why not, in the merchant's words. Null when ok. */
    reason: string | null;
    /** A free address like it, when this one is taken. */
    suggestion: string | null;
}
