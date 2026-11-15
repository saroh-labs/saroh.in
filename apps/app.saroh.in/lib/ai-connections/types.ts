/**
 * One AI app a person signed in to Saroh with (U9), as
 * `GET organizations/:org/ai-connections` lists it
 * (`AiConnectionView`). Everyone sees their own; whoever holds
 * `apikey:manage` (the Owner) sees everyone's. A connection covers the
 * businesses ticked at sign-in; `otherBusinesses` counts the rest, never
 * naming them (an Owner doesn't learn a member's other businesses).
 * `DELETE …/ai-connections/:id` takes only this business off it.
 */
export interface AiConnection {
    id: string;
    app: { name: string | null; known: boolean };
    person: { id: string; name: string | null };
    scopes: string[];
    otherBusinesses: number;
    connectedAt: string | null;
    lastUsedAt: string | null;
}
