/**
 * Pulse Fitness's booking rules and the people on its diary, with their
 * weekly hours: structure only, so the demo gym (`backfill/demo-businesses.ts`)
 * reads them without the showcase's planner. `pulse.ts` writes the rest.
 */

/** The business's booking rules (the design's Availability sample). */
export const PULSE_RULES = {
    bookAheadDays: 21,
    latestBookingMinutes: 120,
    freeCancelHours: 12,
} as const;

interface Window {
    days: readonly number[];
    from: string;
    to: string;
}

export interface StaffFixture {
    key: string;
    name: string;
    title: string;
    /** The demo owner, who trains too: linked to their Membership. */
    owner?: boolean;
    /**
     * Indexes into Pulse's services: 0 personal training, 1 HIIT, 2 yoga,
     * 3 free trial, 4 strength foundations, 5 fitness assessment.
     */
    services: readonly number[];
    hours: readonly Window[];
}

/**
 * Four people, hours deliberately uneven — a split shift, a late starter, a
 * weekend teacher — so the Availability screen has something to show.
 * Only the owner signs in; the trainers are on the diary without accounts.
 */
export const PULSE_STAFF: readonly StaffFixture[] = [
    {
        key: "karan",
        name: "Karan Mehta",
        title: "Owner · Head coach",
        owner: true,
        services: [0, 5, 3],
        hours: [
            { days: [1, 2, 3, 4, 5], from: "06:00", to: "11:00" },
            { days: [6], from: "07:00", to: "11:00" },
        ],
    },
    {
        key: "ritu",
        name: "Ritu Kapoor",
        title: "Trainer",
        services: [1, 0, 4],
        hours: [
            { days: [1, 3, 5], from: "06:00", to: "10:00" },
            { days: [1, 2, 3, 4, 5], from: "17:00", to: "21:00" },
        ],
    },
    {
        key: "sameer",
        name: "Sameer Khan",
        title: "Trainer",
        services: [1, 0, 5, 4],
        hours: [
            { days: [2, 4], from: "06:00", to: "12:00" },
            { days: [1, 3, 5], from: "16:00", to: "20:00" },
            { days: [6], from: "07:00", to: "12:00" },
        ],
    },
    {
        key: "ananya",
        name: "Ananya Iyer",
        title: "Yoga teacher",
        services: [2, 3],
        hours: [
            { days: [2, 4, 6], from: "06:30", to: "09:00" },
            { days: [2, 4], from: "19:00", to: "21:00" },
            { days: [0], from: "07:30", to: "09:30" },
            { days: [1, 3, 5], from: "10:00", to: "12:00" },
            { days: [1, 3, 5], from: "16:00", to: "17:30" },
        ],
    },
];
