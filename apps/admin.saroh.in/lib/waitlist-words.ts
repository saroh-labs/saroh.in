/** The waitlist's words, client-safe (no server import). */

/** The form's kinds of business (U30), as the console names them. */
export const WAITLIST_KIND_LABELS: Record<string, string> = {
    salon: "Salon or beauty",
    gym: "Gym or studio",
    clinic: "Clinic",
    coach: "Dietician or coach",
    food: "Bakery or food",
    shop: "Shop",
    creator: "Creator",
    other: "Something else",
};

export function kindLabel(kind: string | null): string {
    if (!kind) return "Not recorded";
    return WAITLIST_KIND_LABELS[kind] ?? kind;
}
