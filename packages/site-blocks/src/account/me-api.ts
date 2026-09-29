import type { SignInApi } from "./api";
import type { AccountNote, AccountView } from "./model";

/**
 * What Me asks of the site's server (round-2 plan A, A5): its server
 * actions, handed in, since the page never calls the API itself.
 */

export type DetailsResult =
    { ok: true; account: AccountView } | { ok: false; message: string };

export type NoteResult =
    { ok: true; note: AccountNote } | { ok: false; message: string };

export interface MeApi {
    updateDetails: (input: {
        name: string;
        phone: string;
    }) => Promise<DetailsResult>;
    /** Code to the new address, then the change: the sign-in sheet's calls. */
    emailChange: SignInApi;
    addNote: (text: string) => Promise<NoteResult>;
    signOut: () => Promise<{ ok: boolean }>;
    signOutEverywhere: () => Promise<{ ok: boolean }>;
}
