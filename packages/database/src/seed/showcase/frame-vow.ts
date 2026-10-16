import type { Db } from "../helpers";
import { SHOWCASE_SEED } from "./data";
import { FV_KEY, fvSpec } from "./frame-vow-data";
import { addMinutes, earliest, hashKey, istAt, phoneNumber } from "./people";
import type { Rng } from "./random";
import { createRng } from "./random";
import type {
    DocLine,
    StudioContext,
    StudioDoc,
    StudioLead,
    StudioOrder,
    StudioOrderLine,
    StudioPerson,
} from "./studio";
import {
    Busy,
    DAY_MS,
    diaryRows,
    payment,
    planDiary,
    priceOf,
    studioId,
    writeContacts,
    writeDocs,
    writeInsights,
    writeLeads,
    writeOrders,
    writeStructure,
} from "./studio";
import { checkStudio } from "./studio-check";

export { FV_KEY } from "./frame-vow-data";

/**
 * Frame & Vow (`frame-vow-data.ts` for who it is and what it sells): the
 * dated world — its couples' jobs (a 25% advance to hold the date, the 75%
 * balance once the edit is delivered, one balance still being chased),
 * quotes not yet sent as invoices, the everyday diary of portrait sessions
 * paid online and free planning calls, prints and albums ordered by past
 * couples with their reviews, thirty wedding enquiries in the pipeline,
 * notes, and Insights traffic that rises into the season.
 */

const sid = studioId(FV_KEY);
const rngFor = (concern: string) =>
    createRng((SHOWCASE_SEED ^ hashKey(FV_KEY, concern)) >>> 0);

const CITIES = [
    { city: "Udaipur", state: "Rajasthan", pin: "313001", weight: 34 },
    { city: "Jaipur", state: "Rajasthan", pin: "302001", weight: 24 },
    { city: "Jodhpur", state: "Rajasthan", pin: "342001", weight: 6 },
    { city: "Ahmedabad", state: "Gujarat", pin: "380009", weight: 8 },
    { city: "New Delhi", state: "Delhi", pin: "110017", weight: 10 },
    { city: "Mumbai", state: "Maharashtra", pin: "400050", weight: 9 },
    { city: "Bengaluru", state: "Karnataka", pin: "560038", weight: 5 },
    { city: "Indore", state: "Madhya Pradesh", pin: "452001", weight: 4 },
] as const;

const WOMEN = [
    "Aanya", "Akanksha", "Anjali", "Bhavna", "Charu", "Deepika", "Divya", "Garima", "Gunjan", "Harshita",
    "Isha", "Jyoti", "Khushi", "Kritika", "Lavanya", "Mansi", "Megha", "Mitali", "Nidhi", "Nikita",
    "Palak", "Pallavi", "Prachi", "Priyanka", "Radhika", "Rashmi", "Ritika", "Ruchi", "Sakshi", "Shalini",
    "Shreya", "Shruti", "Sneha", "Sonal", "Swati", "Tanvi", "Trisha", "Vandana", "Vidhi", "Yashika",
] as const;
const MEN = [
    "Aakash", "Abhinav", "Aditya", "Akshay", "Ankit", "Anuj", "Ashish", "Gaurav", "Harsh", "Hemant",
    "Jatin", "Kartik", "Kshitij", "Lokesh", "Manish", "Mayank", "Mohit", "Naveen", "Pankaj", "Parth",
    "Prateek", "Rajat", "Rohit", "Sachin", "Saurabh", "Shivam", "Sumit", "Tarun", "Varun", "Vikas",
    "Vineet", "Vishal", "Yogesh",
] as const;
const SURNAMES = [
    "Agarwal", "Bhandari", "Chauhan", "Choudhary", "Dadhich", "Dave", "Gehlot", "Goyal", "Jain", "Joshi",
    "Kothari", "Lodha", "Maheshwari", "Mehta", "Mittal", "Nagar", "Paliwal", "Parmar", "Rathore", "Sanghvi",
    "Saxena", "Sharma", "Shah", "Singhvi", "Sisodia", "Soni", "Talesra", "Trivedi", "Vaishnav", "Vyas",
    "Kapoor", "Khanna", "Malhotra", "Bansal", "Gupta", "Arora", "Patel", "Desai", "Iyer", "Menon",
] as const;

/** One couple's job: the days we shoot, what they bought, how it was paid. */
interface Job {
    bride: string;
    groom: string;
    last: string;
    city: (typeof CITIES)[number]["city"];
    email: string;
    /** The wedding (or the job's main day) as a day offset from now. */
    day: number;
    /** Other days we shoot, as offsets from the main day. */
    days: readonly { service: "prewedding" | "haldi" | "engagement" | "wedding"; offset: number }[];
    /** When the advance was invoiced, days before the main day. */
    bookedBefore: number;
    /** Planning items: [product slug, variant index or null, quantity]. */
    decor?: readonly [string, number | null][];
    /** Billed on the final count after the event: [slug, variant, count]. */
    afterEvent?: readonly [string, number | null, number][];
    /** What became of the balance. */
    balance: "paid" | "chasing" | "not yet";
    /** The advance: paid, or invoiced and waiting. */
    advance: "paid" | "waiting";
    venue: string;
    note?: string;
}

/** The couples. Days are offsets from today, so the season moves with the calendar. */
const JOBS: readonly Job[] = [
    {
        bride: "Aditi", groom: "Karan", last: "Rathore", city: "New Delhi", email: "aditi.rathore@example.com",
        day: -168, days: [{ service: "haldi", offset: -1 }, { service: "prewedding", offset: -62 }], bookedBefore: 240,
        decor: [["floral-mandap", 1], ["haldi-setup", 1], ["sangeet-stage", 1]],
        afterEvent: [["catering-per-plate", 1, 380], ["mehendi-artist", 0, 1], ["mehendi-artist", 1, 140], ["dj-sound-night", null, 1]],
        balance: "paid", advance: "paid", venue: "a lake palace on Pichola",
    },
    {
        bride: "Riya", groom: "Arjun", last: "Sharma", city: "Jaipur", email: "riya.sharma@example.com",
        day: -262, days: [{ service: "prewedding", offset: -1 }, { service: "haldi", offset: -2 }], bookedBefore: 330,
        balance: "paid", advance: "paid", venue: "the walled city, Jaipur",
    },
    {
        bride: "Neha", groom: "Siddharth", last: "Kothari", city: "Bengaluru", email: "neha.kothari@example.com",
        day: -125, days: [{ service: "haldi", offset: -1 }], bookedBefore: 150,
        decor: [["floral-mandap", 0], ["haldi-setup", 0]],
        afterEvent: [["catering-per-plate", 1, 100], ["mehendi-artist", 0, 1], ["mehendi-artist", 1, 70]],
        balance: "paid", advance: "paid", venue: "a haveli near Gangaur Ghat",
    },
    {
        bride: "Pooja", groom: "Nikhil", last: "Agarwal", city: "Jaipur", email: "pooja.agarwal@example.com",
        day: -152, days: [{ service: "haldi", offset: -1 }], bookedBefore: 200,
        balance: "paid", advance: "paid", venue: "Amer road, Jaipur",
    },
    {
        bride: "Meera", groom: "Rohan", last: "Iyer", city: "Mumbai", email: "meera.iyer@example.com",
        day: -144, days: [], bookedBefore: 180,
        balance: "paid", advance: "paid", venue: "Fateh Sagar, Udaipur",
    },
    {
        bride: "Sanya", groom: "Vivek", last: "Kapoor", city: "Udaipur", email: "sanya.kapoor@example.com",
        day: -75, days: [{ service: "haldi", offset: -1 }], bookedBefore: 120,
        decor: [["haldi-setup", 0]],
        afterEvent: [["catering-per-plate", 0, 112]],
        balance: "chasing", advance: "paid", venue: "the Bagore ki Haveli lanes",
        note: "Balance invoice sent after the gallery went out; reminded twice on WhatsApp. Album proof is ready but we hold printing until the balance clears.",
    },
    {
        bride: "Tanya", groom: "Kunal", last: "Bhatia", city: "Ahmedabad", email: "tanya.bhatia@example.com",
        day: 38, days: [{ service: "haldi", offset: -1 }, { service: "prewedding", offset: -58 }], bookedBefore: 160,
        decor: [["haldi-setup", 1], ["sangeet-stage", 0]],
        balance: "not yet", advance: "paid", venue: "a lakeside resort, Udaipur",
    },
    {
        bride: "Ishita", groom: "Varun", last: "Goyal", city: "Jaipur", email: "ishita.goyal@example.com",
        day: 55, days: [{ service: "haldi", offset: -1 }], bookedBefore: 150,
        balance: "not yet", advance: "paid", venue: "a heritage hotel, Jaipur",
    },
    {
        bride: "Nandini", groom: "Aman", last: "Singh", city: "Udaipur", email: "nandini.singh@example.com",
        day: 72, days: [{ service: "haldi", offset: -1 }], bookedBefore: 132,
        decor: [["floral-mandap", 1]],
        balance: "not yet", advance: "paid", venue: "a garden venue, Udaipur",
    },
    {
        bride: "Kavya", groom: "Ritvik", last: "Menon", city: "Bengaluru", email: "kavya.menon@example.com",
        day: 92, days: [{ service: "engagement", offset: -150 }], bookedBefore: 170,
        balance: "not yet", advance: "paid", venue: "the old city, Udaipur",
    },
    {
        bride: "Simran", groom: "Harshit", last: "Arora", city: "New Delhi", email: "simran.arora@example.com",
        day: 110, days: [], bookedBefore: 116,
        balance: "not yet", advance: "waiting", venue: "a palace hotel, Jaipur",
    },
    {
        bride: "Ananya", groom: "Rahul", last: "Vyas", city: "Udaipur", email: "ananya.vyas@example.com",
        day: 128, days: [{ service: "haldi", offset: -1 }], bookedBefore: 143,
        decor: [["floral-mandap", 0], ["haldi-setup", 0], ["sangeet-stage", 1]],
        balance: "not yet", advance: "paid", venue: "a lakeside haveli, Udaipur",
    },
    {
        bride: "Diya", groom: "Yash", last: "Chopra", city: "New Delhi", email: "diya.chopra@example.com",
        day: 176, days: [], bookedBefore: 186,
        balance: "not yet", advance: "paid", venue: "an island venue on Pichola",
    },
    // Not a wedding with us: a roka and a pre-wedding booked on their own.
    {
        bride: "Khushi", groom: "Abhishek", last: "Soni", city: "Udaipur", email: "khushi.soni@example.com",
        day: -48, days: [], bookedBefore: 40,
        balance: "paid", advance: "paid", venue: "at home, Udaipur",
    },
    {
        bride: "Ruchi", groom: "Mayank", last: "Mittal", city: "Ahmedabad", email: "ruchi.mittal@example.com",
        day: -22, days: [], bookedBefore: 51,
        balance: "paid", advance: "paid", venue: "Sajjangarh road, Udaipur",
    },
];

/** What each standalone job is: its main day's service. */
const MAIN_SERVICE: Record<number, "wedding" | "engagement" | "prewedding"> = { 13: "engagement", 14: "prewedding" };

const REVIEWS: Record<string, readonly string[]> = {
    "heirloom-wedding-album": [
        "We took three weeks choosing photographs and Kabir never once rushed us. The leather has that smell. Our families fight over who gets to hold it.",
        "The proof came back with two spreads we hadn't picked and they're now our favourite pages. Worth every rupee.",
        "Lay-flat really matters — the pheras run across two pages without a crease through anyone. Packed beautifully.",
    ],
    "parent-album": [
        "Ordered two for both sets of parents. My mother has shown it to every relative who has visited since.",
        "Same design as ours, just smaller. My father-in-law keeps it in the drawing room now.",
    ],
    "gallery-canvas": [
        "The 20×30 of our varmala is above the sofa. The colours are exactly as they were on screen, which I didn't expect.",
        "Arrived well packed, hook already on. Took five minutes to hang.",
        "Ordered a 16×24 of my grandparents for their 50th. Everyone cried.",
        "Good canvas, tight corners. They called to check the crop before printing — appreciated that.",
    ],
    "fine-art-print": [
        "The matte black-and-white prints look like they came out of a gallery. Ordering two more.",
        "Pearl finish on the 12×18 is lovely. Delivered flat with no bends.",
        "I'm fussy about prints. These are properly good — deep blacks, no banding.",
        "Got the 8×12s for my desk. Small but very well made.",
    ],
    "sheesham-frame": [
        "Solid wood, heavy, nicely finished. The mount makes the photo look expensive.",
        "Gifted the 12×15 to my parents on their anniversary. Lovely frame.",
        "Ordered three 8×10s for the staircase wall. All arrived in one piece.",
    ],
    "extra-edited-photographs": [
        "Wanted more of the haldi chaos. They were in our gallery in a week, edited the same way as the rest.",
        "Picked 100 more from the proofs. Same colour, same care. Quick too.",
    ],
    "keepsake-print-box": [
        "Bought this for my Nani with thirty photos of the family. She keeps it next to her bed.",
        "Beautiful box, our names on the lid. Perfect gift for grandparents.",
    ],
};
const REPLIES = [
    "Thank you! Enjoy it — Kabir",
    "So glad it reached safely. Thank you for ordering again.",
    "This made our day. Thank you for letting us photograph your family.",
];

export async function seedFrameVow(ctx: StudioContext): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now } = ctx;
    const spec = fvSpec();
    const world = await writeStructure(ctx, spec);
    const rng = rngFor("people");

    // --- people: the couples first, then everyone else the studio knows
    const people: StudioPerson[] = [];
    const usedEmails = new Set<string>();
    const cityOf = (name: string) => CITIES.find((c) => c.city === name) ?? CITIES[0];
    for (const j of JOBS) {
        const c = cityOf(j.city);
        usedEmails.add(j.email);
        people.push({
            first: j.bride, last: j.last, email: j.email, phone: `+91 ${phoneNumber(rng)}`, company: null,
            city: c.city, state: c.state, postalCode: c.pin, source: "WEBSITE",
            createdAt: istAt(now, j.day - j.bookedBefore - rng.int(4, 20), rng.int(10 * 60, 21 * 60)),
        });
    }
    const POOL = 230;
    while (people.length < JOBS.length + POOL) {
        const woman = rng.chance(0.62);
        const first = woman ? rng.pick(WOMEN) : rng.pick(MEN);
        const last = rng.pick(SURNAMES);
        let email = `${first}.${last}@example.com`.toLowerCase();
        for (let n = 2; usedEmails.has(email); n++) email = `${first}.${last}${n}@example.com`.toLowerCase();
        usedEmails.add(email);
        const c = rng.weighted(CITIES, (x) => x.weight);
        people.push({
            first, last, email, phone: `+91 ${phoneNumber(rng)}`, company: null,
            city: c.city, state: c.state, postalCode: c.pin,
            source: rng.pick(["INSTAGRAM", "INSTAGRAM", "REFERRAL", "WEBSITE", "GOOGLE", "WALK_IN"]),
            createdAt: istAt(now, -rng.int(5, 240), rng.int(10 * 60, 21 * 60)),
        });
    }
    const contacts = people.map((p, n) => ({
        id: sid("contact", n),
        name: `${p.first} ${p.last}`,
        first: p.first,
        last: p.last,
        email: p.email,
        phone: p.phone,
        company: p.company,
        city: p.city,
        state: p.state,
        postalCode: p.postalCode,
        address: `${10 + (n % 80)}, ${["Shastri Circle", "Hiran Magri Sector 4", "Fateh Pura", "Malviya Nagar", "C-Scheme", "Vaishali Nagar", "Navrangpura", "Saket", "Bandra West"][n % 9]}`,
    }));
    const firstSeen = people.map((p) => p.createdAt);
    const seen = (n: number, at: Date) => {
        firstSeen[n] = earliest(firstSeen[n], new Date(at.getTime() - 3_600_000));
    };

    // --- the couples' days: before the everyday diary, so nobody is double-booked
    const busy = new Busy();
    const docs: StudioDoc[] = [];
    const jobBookings: Parameters<typeof diaryRows>[2][number][] = [];
    const team = { owner: ctx.demoUserId, meher: ctx.memberUserId };
    const payRng = rngFor("payments");
    JOBS.forEach((j, n) => {
        const main = MAIN_SERVICE[n] ?? "wedding";
        const shoots = [{ service: main, offset: 0 }, ...j.days];
        const advanceAt = istAt(now, j.day - j.bookedBefore, 12 * 60 + 30);
        seen(n, advanceAt);
        const photoLines: { service: (typeof shoots)[number]["service"]; when: Date; price: number }[] = [];
        for (const s of shoots) {
            const service = spec.services.find((x) => x.key === s.service)!;
            const startMinute = { wedding: 8 * 60, haldi: 8 * 60, prewedding: 13 * 60, engagement: 16 * 60 }[s.service];
            const when = istAt(now, j.day + s.offset, startMinute);
            const end = addMinutes(when, service.minutes);
            const staff = s.service === "prewedding" && n % 2 === 1 ? "ishaan" : "kabir";
            busy.take(staff, when, end);
            // The second shooter is there on the big days too.
            if (s.service === "wedding" || s.service === "haldi") busy.take("ishaan", when, end);
            photoLines.push({ service: s.service, when, price: service.pricePaise });
            const booked = earliest(advanceAt, new Date(when.getTime() - DAY_MS));
            if (booked > now) continue;
            jobBookings.push({
                service: s.service, staff, contact: n, startAt: when, createdAt: booked,
                status: "CONFIRMED", outcome: end < now ? "ATTENDED" : null, cancelledAt: null,
                online: false, locationType: "IN_PERSON", paidWith: null,
                note: `${j.bride} & ${j.groom} — ${j.venue}`,
            });
        }
        const label = (when: Date) =>
            when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
        const serviceName = (key: string) => spec.services.find((s) => s.key === key)!.name;
        const decorLines = (j.decor ?? []).map(([slug, variant]) => ({
            name: variantName(spec, slug, variant),
            price: priceOf(spec, { product: slug, variant, quantity: 1 }),
        }));
        const quarter = (p: number) => Math.round(p / 400) * 100;

        // The advance: 25% of each day and each décor item.
        const advanceLines: DocLine[] = [
            ...photoLines.map((l) => ({
                description: `Advance (25%) — ${serviceName(l.service)}, ${label(l.when)}`,
                quantity: 1, unitPaise: quarter(l.price), sac: "998385",
            })),
            ...decorLines.map((d) => ({
                description: `Advance (25%) — ${d.name}`,
                quantity: 1, unitPaise: quarter(d.price), sac: "998596",
            })),
        ];
        const advanceDue = new Date(advanceAt.getTime() + 7 * DAY_MS);
        const advancePaid = j.advance === "paid"
            ? payment(payRng, new Date(advanceAt.getTime() + payRng.int(2, 60) * 3_600_000), payRng.chance(0.6) ? "UPI" : "BANK_TRANSFER")
            : null;
        docs.push({
            id: sid("invoice", "advance", n), contact: n, createdAt: advanceAt, issuedAt: advanceAt, dueAt: advanceDue,
            lines: advanceLines, source: "MANUAL", createdByUserId: team.meher, paid: advancePaid,
            paymentNote: advancePaid ? "Advance to hold the date" : undefined,
        });

        // The balance, once the edit is delivered (about five weeks on).
        const lastShoot = Math.max(...photoLines.map((l) => l.when.getTime()));
        const balanceAt = istAt(now, j.day + 36, 11 * 60);
        if (j.balance !== "not yet" && balanceAt < now) {
            const lines: DocLine[] = [
                ...photoLines.map((l) => ({
                    description: `Balance (75%) — ${serviceName(l.service)}, ${label(l.when)}`,
                    quantity: 1, unitPaise: l.price - quarter(l.price), sac: "998385",
                })),
                ...decorLines.map((d) => ({
                    description: `Balance (75%) — ${d.name}`,
                    quantity: 1, unitPaise: d.price - quarter(d.price), sac: "998596",
                })),
                ...(j.afterEvent ?? []).map(([slug, variant, count]) => ({
                    description: count > 1
                        ? `${variantName(spec, slug, variant)} — final count ${count}`
                        : variantName(spec, slug, variant),
                    quantity: count,
                    unitPaise: priceOf(spec, { product: slug, variant, quantity: 1 }),
                    sac: "998596",
                })),
            ];
            const paid = j.balance === "paid"
                ? payment(payRng, new Date(balanceAt.getTime() + payRng.int(2, 12) * DAY_MS), "BANK_TRANSFER")
                : null;
            docs.push({
                id: sid("invoice", "balance", n), contact: n, createdAt: balanceAt, issuedAt: balanceAt,
                dueAt: new Date(balanceAt.getTime() + 7 * DAY_MS), lines, source: "MANUAL",
                createdByUserId: team.owner, paid: paid && paid.at < now ? paid : null,
            });
        }
        void lastShoot;
    });

    // --- quotes not yet sent: drafts for the leads at "Quote sent"
    const QUOTES: readonly { contact: number; lines: readonly [string, number | null, number][]; shoots: readonly string[] }[] = [
        { contact: JOBS.length + 11, shoots: ["wedding", "haldi"], lines: [["floral-mandap", 0, 1], ["catering-per-plate", 1, 250]] },
        { contact: JOBS.length + 12, shoots: ["wedding", "prewedding"], lines: [] },
        { contact: JOBS.length + 13, shoots: ["wedding", "haldi", "prewedding"], lines: [["sangeet-stage", 1, 1], ["dj-sound-night", null, 1], ["catering-per-plate", 3, 320]] },
    ];
    QUOTES.forEach((q, k) => {
        const at = istAt(now, -(3 + k * 4), 17 * 60);
        docs.push({
            id: sid("invoice", "quote", k), contact: q.contact, createdAt: at, issuedAt: null, dueAt: null,
            lines: [
                ...q.shoots.map((s) => {
                    const svc = spec.services.find((x) => x.key === s)!;
                    return { description: `Quote — ${svc.name}`, quantity: 1, unitPaise: svc.pricePaise, sac: "998385" };
                }),
                ...q.lines.map(([slug, variant, count]) => ({
                    description: count > 1
                        ? `Quote — ${variantName(spec, slug, variant)} (estimate ${count})`
                        : `Quote — ${variantName(spec, slug, variant)}`,
                    quantity: count,
                    unitPaise: priceOf(spec, { product: slug, variant, quantity: 1 }),
                    sac: "998596",
                })),
            ],
            source: "MANUAL", createdByUserId: team.meher, paid: null,
        });
    });

    // --- leads: every couple above, and the season's other enquiries
    const LEAD_FROM = JOBS.length;
    const leadSpecs = planLeads(rngFor("leads"), now, LEAD_FROM, people, team);
    const leads: StudioLead[] = [
        ...JOBS.map((j, n): StudioLead => {
            const done = j.day < 0 && j.balance !== "not yet";
            const createdAt = earliest(people[n].createdAt, istAt(now, j.day - j.bookedBefore - 3, 18 * 60));
            return {
                contact: n,
                title: `${j.bride} & ${j.groom} — ${MAIN_SERVICE[n] ? "pre-wedding / roka" : "wedding"}, ${j.venue}`,
                valuePaise: Math.round(packageValue(spec, j, n) / 100) * 100,
                fromForm: n % 3 === 0 ? { message: `We're getting married ${j.day < 0 ? "this season" : "soon"} at ${j.venue}. Looking for photographs and film${j.decor ? ", and help with décor" : ""}.`, extra: { venue: j.venue, guests: String(80 + ((n * 47) % 300)) } } : null,
                createdAt,
                stage: done ? 5 : j.advance === "waiting" ? 2 : n % 2 === 0 ? 4 : 3,
                status: done || (j.advance === "paid" && n % 2 === 0) ? "WON" : "OPEN",
                notes: j.note
                    ? ["Call done — dates and venue confirmed, sent the estimate on WhatsApp.", "Advance received, date blocked in the diary.", j.note]
                    : [
                        "Call done — dates and venue confirmed, sent the estimate on WhatsApp.",
                        j.advance === "waiting" ? "Advance invoice sent. They are deciding between us and a Delhi studio." : "Advance received, date blocked in the diary.",
                    ],
                task: j.balance === "chasing"
                    ? { body: "Call Sanya about the balance before the album goes to print", dueDays: -2, done: false }
                    : j.advance === "waiting"
                      ? { body: "Follow up on the advance invoice", dueDays: 2, done: false }
                      : j.day > 0
                        ? { body: "Send the run-sheet draft for sign-off", dueDays: Math.min(20, Math.max(3, Math.round(j.day / 4))), done: false }
                        : null,
                actor: n % 2 === 0 ? team.meher : team.owner,
            };
        }),
        ...leadSpecs,
    ];
    for (const l of leads) seen(l.contact, l.createdAt);

    // --- the everyday diary
    const prospects = leadSpecs.map((l) => l.contact);
    const diaryRng = rngFor("diary");
    const random = planDiary(diaryRng, spec, {
        now,
        fromDay: -120,
        toDay: 45,
        busy,
        createdFloor: world.createdAt,
        weekday: [1.5, 0.8, 0.9, 0.9, 1, 1.1, 1.6],
        contactFor: (service, r) =>
            service.pay === "free" && r.chance(0.6)
                ? r.pick(prospects)
                : JOBS.length + 20 + r.skewed(POOL - 20, 1.6),
    });
    const diaryList = [...jobBookings, ...random];
    for (const b of diaryList) seen(b.contact, b.createdAt);
    const actor = (b: { staff: string }) => (b.staff === "meher" ? team.meher : team.owner);
    const diary = diaryRows(spec, world, diaryList, {
        now, contacts, actor, bookingId: (n) => sid("booking", n),
    });

    // Sessions paid on the booking page carry their paid invoice; the
    // corporate half day is billed afterwards.
    diaryList.forEach((b, n) => {
        if (!b.paidWith) return;
        const service = spec.services.find((s) => s.key === b.service)!;
        const bookingId = sid("booking", n);
        if (b.paidWith === "PAID") {
            docs.push({
                id: sid("invoice", "booking", n), contact: b.contact, createdAt: b.createdAt, issuedAt: b.createdAt,
                dueAt: b.createdAt, lines: [{ description: `${service.name} — ${labelOf(b.startAt)}`, quantity: 1, unitPaise: service.pricePaise, sac: service.sac }],
                source: "BOOKING", bookingId, createdByUserId: null,
                paid: payment(payRng, b.createdAt, payRng.chance(0.7) ? "UPI" : "CARD"),
            });
        } else if (b.outcome === "ATTENDED") {
            const at = addMinutes(b.startAt, service.minutes + 18 * 60);
            if (at > now) return;
            const paidAt = new Date(at.getTime() + payRng.int(1, 14) * DAY_MS);
            docs.push({
                id: sid("invoice", "booking", n), contact: b.contact, createdAt: at, issuedAt: at,
                dueAt: new Date(at.getTime() + 15 * DAY_MS),
                lines: [{ description: `${service.name} — ${labelOf(b.startAt)}`, quantity: 1, unitPaise: service.pricePaise, sac: service.sac }],
                source: "BOOKING", bookingId, createdByUserId: team.owner,
                paid: paidAt < now ? payment(payRng, paidAt, "BANK_TRANSFER") : null,
            });
        }
    });

    // --- prints and albums
    const orders = planOrders(rngFor("orders"), now, spec, people.length);
    for (const o of orders) seen(o.customer, o.placedAt);

    // --- write it all
    await writeContacts(prisma, world.orgId, (n) => sid("contact", n), people.map((p, n) => ({ ...p, createdAt: earliest(firstSeen[n], now) })));
    const leadCounts = await writeLeads(prisma, spec, world, now, leads, contacts);
    await prisma.booking.createMany({ data: diary.bookings });
    await prisma.bookingEvent.createMany({ data: diary.events });
    const orderCounts = await writeOrders(prisma, spec, world, orders, contacts);
    const docCounts = await writeDocs(prisma, spec, world, docs, contacts);
    await prisma.contactNote.createMany({
        data: [
            [5, "Balance outstanding since the gallery went out. Vivek handles payments — call him, not Sanya."],
            [0, "Nana uses a wheelchair: ramp boat booked for every crossing. Wants a print of the family photo for his room."],
            [6, "Tanya is vegetarian, Kunal's side is not: two menus at the reception. Prefers WhatsApp voice notes."],
            [JOBS.length + 11, "Asked for a quote with and without the sangeet stage. Budget is tight; don't push the LED wall."],
            [11, "Wants the haldi setup in yellow and white only — no pink. Sent Tanvi her Pinterest board."],
        ].map(([n, body], k) => ({
            id: sid("note", k),
            organizationId: world.orgId,
            contactId: sid("contact", n as number),
            body: body as string,
            createdByUserId: k % 2 ? team.owner : team.meher,
            createdAt: istAt(now, -(4 + k * 6), 15 * 60),
            updatedAt: istAt(now, -(4 + k * 6), 15 * 60),
        })),
    });
    const aggs = await writeInsights(prisma, spec, world, now, {
        paths: [
            { path: "/", weight: 0.28 },
            { path: "/portfolio", weight: 0.17 },
            { path: "/packages", weight: 0.13 },
            { path: "/planning", weight: 0.08 },
            { path: "/enquire", weight: 0.07 },
            { path: "/book", weight: 0.06 },
            { path: "/blog/aditi-and-karan-at-the-lake-palace", weight: 0.07 },
            { path: "/blog/per-plate-catering-explained", weight: 0.05 },
            { path: "/blog/how-we-price-a-wedding-album", weight: 0.05 },
            { path: "/about", weight: 0.04 },
        ],
        trendBase: 140,
        trendSlope: 1.4,
        weekendFactor: 1.2,
    });

    console.log(
        `[showcase] ${spec.name}: ${people.length} contacts, ${leadCounts.leads} leads (${leadCounts.entries} from the site), ` +
            `${diary.bookings.length} bookings, ${orderCounts.orders} orders (${orderCounts.reviews} reviews), ` +
            `${docCounts.issued} invoices + ${docCounts.drafts} quotes, ${spec.posts.length} posts, ${aggs} insight rows`,
    );
    return { id: world.orgId, name: spec.name, prefix: sid("") };
}

function labelOf(when: Date) {
    return when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function variantName(spec: ReturnType<typeof fvSpec>, slug: string, variant: number | null) {
    const p = spec.products.find((x) => x.slug === slug);
    if (!p) throw new Error(`Frame & Vow has no product "${slug}"`);
    return variant === null ? p.name : `${p.name} · ${p.option!.variants[variant].title}`;
}

function packageValue(spec: ReturnType<typeof fvSpec>, j: Job, n: number) {
    const main = MAIN_SERVICE[n] ?? "wedding";
    const svc = (k: string) => spec.services.find((s) => s.key === k)!.pricePaise;
    return (
        svc(main) +
        j.days.reduce((s, d) => s + svc(d.service), 0) +
        (j.decor ?? []).reduce((s, [slug, v]) => s + priceOf(spec, { product: slug, variant: v, quantity: 1 }), 0) +
        (j.afterEvent ?? []).reduce((s, [slug, v, c]) => s + priceOf(spec, { product: slug, variant: v, quantity: 1 }) * c, 0)
    );
}

/** The season's other enquiries: new, called, quoted, and a few lost. */
function planLeads(
    rng: Rng,
    now: Date,
    from: number,
    people: readonly StudioPerson[],
    team: { owner: string; meher: string },
): StudioLead[] {
    const MONTHS = ["November", "December", "January", "February", "late April"];
    const VENUES = ["Udaipur", "Jaipur", "a lake venue in Udaipur", "a fort hotel near Jaipur", "Kumbhalgarh", "Pushkar", "Jodhpur"];
    const stages = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 1, 3, 0, 1];
    const NOTES: Record<number, readonly string[]> = {
        0: ["Sent the packages PDF on WhatsApp.", "Asked about drone permission at the venue — checking."],
        1: ["Call done: 250 guests, three functions, wants photo + film and haldi décor.", "Call done: small wedding, 80 guests, photographs only.", "Call done by video from Bengaluru. Parents joining the next call."],
        2: ["Quote sent with two options — with and without the sangeet stage.", "Quote sent; they are comparing with a Jaipur studio."],
        3: ["Advance received."],
    };
    const TASKS: Record<number, readonly string[]> = {
        0: ["Call back — asked for an evening call", "Reply with available dates in December"],
        1: ["Send the estimate", "Share three full wedding galleries"],
        2: ["Follow up on the quote", "Check the date against the diary before they confirm"],
        3: ["Send the run-sheet template"],
    };
    const LOST = [
        "Lost — date clash: we already have a wedding on their day.",
        "Lost — went with a family friend's photographer.",
        "Lost — wedding postponed to next year; asked us to stay in touch.",
    ];
    const out: StudioLead[] = [];
    stages.forEach((stage, k) => {
        const contact = from + k;
        const p = people[contact];
        const partner = rng.pick(MEN);
        const month = rng.pick(MONTHS);
        const venue = rng.pick(VENUES);
        const guests = rng.int(6, 40) * 10;
        const lost = k >= stages.length - 3;
        const createdAt = istAt(now, -rng.int(stage === 0 ? 1 : 6, stage === 0 ? 12 : 55), rng.int(9 * 60, 22 * 60));
        const fromForm = rng.chance(0.65);
        const value = stage === 0 ? null : (rng.int(28, 75) * 10_000) * 100;
        const notes = lost ? [...(NOTES[stage] ?? []).slice(0, 1), LOST[k - (stages.length - 3)]] : (NOTES[stage] ?? []).slice(0, rng.int(1, 2));
        const taskList = TASKS[stage] ?? TASKS[0];
        const r = rng.next();
        out.push({
            contact,
            title: `${p.first} & ${partner} — wedding, ${month}, ${venue}`,
            valuePaise: fromForm && stage === 0 ? null : value ?? (rng.int(28, 60) * 10_000) * 100,
            fromForm: fromForm
                ? {
                      message: rng.pick([
                          `Hi! We're getting married in ${month} in ${venue}, around ${guests} guests. Do you have the dates? Looking for photos and film, maybe décor.`,
                          `Saw Aditi and Karan's wedding on your Instagram. Our wedding is in ${month} at ${venue}. Can we get on a call?`,
                          `My daughter's wedding is in ${month}. Three functions, ${guests} guests. Please share packages.`,
                          `Looking for a photographer for a small wedding in ${venue}, ${month}. Is the pre-wedding shoot separate?`,
                      ]),
                      extra: { date: month, venue, guests: String(guests) },
                  }
                : null,
            createdAt,
            stage,
            status: lost ? "LOST" : "OPEN",
            notes,
            task: lost
                ? null
                : {
                      body: rng.pick(taskList),
                      dueDays: r < 0.35 ? -rng.int(1, 6) : r < 0.85 ? rng.int(1, 9) : -rng.int(1, 3),
                      done: r >= 0.85,
                  },
            actor: rng.chance(0.7) ? team.meher : team.owner,
        });
    });
    return out;
}

/**
 * Prints and albums ordered online: from the past four months, busier
 * after each wedding's gallery goes out; albums and parent albums from the
 * couples whose weddings are done. Older ones delivered (some reviewed),
 * recent ones being printed, framed or with the courier.
 */
function planOrders(rng: Rng, now: Date, spec: ReturnType<typeof fvSpec>, contacts: number): StudioOrder[] {
    const orders: StudioOrder[] = [];
    const sellable = spec.products.filter((p) => p.demand > 0);
    const reviewsLeft: Record<string, string[]> = Object.fromEntries(
        Object.entries(REVIEWS).map(([k, v]) => [k, [...v]]),
    );
    const add = (customer: number, placedAt: Date, lines: StudioOrderLine[]) => {
        const ageDays = (now.getTime() - placedAt.getTime()) / DAY_MS;
        const product = spec.products.find((p) => p.slug === lines[0].product)!;
        const digital = lines.every((l) => spec.products.find((p) => p.slug === l.product)!.fulfilment === "DIGITAL");
        const pickup = !digital && rng.chance(0.25);
        const makeDays = product.slug.includes("album") ? 24 : 6;
        const unpaid = ageDays < 1.5 && rng.chance(0.4);
        let status: StudioOrder["status"];
        let stage: StudioOrder["stage"];
        if (rng.chance(0.03) && ageDays > 5) {
            status = "CANCELLED"; stage = "NEW";
        } else if (digital) {
            status = ageDays < 2 ? "PROCESSING" : "DELIVERED"; stage = ageDays < 2 ? "PREPARING" : "SENT";
        } else if (ageDays < 1.5) {
            status = "PENDING"; stage = "NEW";
        } else if (ageDays < makeDays) {
            status = "PROCESSING"; stage = "PREPARING";
        } else if (ageDays < makeDays + 4) {
            status = pickup ? "PROCESSING" : "SHIPPED"; stage = pickup ? "READY" : "HANDED_TO_COURIER";
        } else {
            status = "DELIVERED"; stage = pickup ? "COLLECTED" : "DELIVERED";
        }
        const paymentStatus: StudioOrder["paymentStatus"] =
            status === "CANCELLED" ? (rng.chance(0.5) ? "REFUNDED" : "UNPAID") : unpaid ? "UNPAID" : "PAID";
        const paidAt = paymentStatus === "UNPAID" ? null : new Date(placedAt.getTime() + rng.int(1, 30) * 60_000);
        const updatedAt = earliest(now, new Date(placedAt.getTime() + Math.min(ageDays, makeDays + 6) * DAY_MS));
        let review: StudioOrder["review"];
        const pool = reviewsLeft[product.slug];
        if (status === "DELIVERED" && pool?.length && ageDays > makeDays + 10 && rng.chance(0.55)) {
            const at = earliest(new Date(now.getTime() - 3_600_000), new Date(placedAt.getTime() + (makeDays + rng.int(6, 12)) * DAY_MS));
            review = { rating: rng.chance(0.8) ? 5 : 4, body: pool.shift()!, reply: rng.chance(0.5) ? rng.pick(REPLIES) : undefined, at };
        }
        orders.push({
            customer, placedAt, lines, status, paymentStatus, stage,
            fulfilment: digital ? "DIGITAL" : pickup ? "PICKUP" : "SHIPPING",
            online: true, paidAt, updatedAt,
            trackingNumber: stage === "HANDED_TO_COURIER" || (stage === "DELIVERED" && !pickup) ? `BD${rng.int(10_000_000, 99_999_999)}IN` : undefined,
            review,
        });
    };

    // Albums from the couples whose galleries are out.
    const albumOf: [number, number, number][] = [
        // [couple, album variant, parent albums]
        [0, 13, 2], // Aditi & Karan: 12×15 · Leather · 40 pages
        [1, 22, 2], // Riya & Arjun: 12×18 · Leather · 40 pages
        [2, 13, 2], // Neha & Siddharth: 12×15 · Leather · 40 pages
        [3, 4, 1],
        [4, 17, 0],
    ];
    for (const [couple, variant, parents] of albumOf) {
        const j = JOBS[couple];
        const at = istAt(now, Math.min(-3, j.day + 50 + rng.int(0, 12)), rng.int(11 * 60, 22 * 60));
        const lines: StudioOrderLine[] = [{ product: "heirloom-wedding-album", variant, quantity: 1 }];
        if (parents) lines.push({ product: "parent-album", variant: 1, quantity: parents });
        add(couple, at, lines);
    }

    // Everyone else: about 45 a month over four months, weekends busier.
    const target = 175;
    for (let k = 0; k < target; k++) {
        const daysAgo = Math.floor(Math.pow(rng.next(), 1.15) * 120);
        const at = istAt(now, -daysAgo, rng.int(9 * 60, 23 * 60 - 1));
        if (at > now) continue;
        const customer = JOBS.length + 20 + rng.skewed(contacts - JOBS.length - 20, 1.4);
        const first = rng.weighted(sellable, (p) => p.demand);
        const pick = (p: typeof first): StudioOrderLine => ({
            product: p.slug,
            variant: p.option ? rng.int(0, Math.min(p.option.variants.length, p.slug === "heirloom-wedding-album" ? 9 : 99) - 1) : null,
            quantity: p.slug === "fine-art-print" || p.slug === "sheesham-frame" ? rng.weighted([1, 2, 3], (q) => (q === 1 ? 6 : q === 2 ? 3 : 1)) : 1,
        });
        const lines = [pick(first)];
        if (rng.chance(0.18)) {
            const second = rng.weighted(sellable.filter((p) => p.slug !== first.slug), (p) => p.demand);
            lines.push(pick(second));
        }
        add(customer, at, lines);
    }
    return orders;
}

/** What Frame & Vow's films and walkthroughs need, checked in the database. */
export async function checkFrameVow(prisma: Db, orgId: string, now: Date) {
    return checkStudio(prisma, orgId, now, {
        name: "Frame & Vow",
        gstPrefix: "FV",
        sac: ["998385", "998386", "998596"],
        minimum: {
            products: 17,
            variantsOnOneProduct: 27,
            services: 10,
            staff: 4,
            leads: 30,
            stages: 6,
            entries: 12,
            ordersLast90: 120,
            payingContacts: 100,
            reviews: 20,
            invoices: 150,
            drafts: 2,
            bookingsUpcoming: 20,
            posts: 24,
            postsPerCategory: 8,
            insightDays: 85,
            subscriptionsLive: 0,
            subscriptionsEnded: 0,
        },
        extra: async (fail) => {
            // A couple billed twice: the advance and, after the edit, the balance.
            const pairs = await prisma.$queryRaw<{ n: bigint }[]>`
                SELECT COUNT(*) AS n FROM (
                    SELECT "contactId" FROM "Invoice" i
                    JOIN "InvoiceLine" l ON l."invoiceId" = i.id AND l.position = 0
                    WHERE i."organizationId" = ${orgId} AND i.status <> 'DRAFT'
                    GROUP BY "contactId"
                    HAVING bool_or(l.description LIKE 'Advance (25%%)%%') AND bool_or(l.description LIKE 'Balance (75%%)%%')
                ) x`;
            if (Number(pairs[0]?.n ?? 0) < 5) fail(`couples with an advance and a balance: ${Number(pairs[0]?.n ?? 0)}`);
            const chasing = await prisma.$queryRaw<{ n: bigint }[]>`
                SELECT COUNT(*) AS n FROM "Invoice" i
                JOIN "InvoiceLine" l ON l."invoiceId" = i.id AND l.position = 0
                WHERE i."organizationId" = ${orgId} AND i.status = 'ISSUED'
                  AND i."dueAt" < ${now.toISOString()}::timestamp AND l.description LIKE 'Balance%%'`;
            if (Number(chasing[0]?.n ?? 0) < 1) fail("no overdue balance being chased after a shoot");
            const catering = await prisma.$queryRaw<{ n: bigint }[]>`
                SELECT COUNT(*) AS n FROM "InvoiceLine" l JOIN "Invoice" i ON i.id = l."invoiceId"
                WHERE i."organizationId" = ${orgId} AND l.description LIKE 'Catering, per plate%%' AND l.quantity >= 100`;
            if (Number(catering[0]?.n ?? 0) < 2) fail("no catering billed by the plate");
            const upcomingWedding = await prisma.booking.count({
                where: { organizationId: orgId, startAt: { gt: now }, service: { name: "Wedding day photo + film" } },
            });
            if (upcomingWedding < 4) fail(`upcoming weddings in the diary: ${upcomingWedding}`);
        },
    });
}
