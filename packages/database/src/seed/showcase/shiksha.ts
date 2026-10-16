import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { bookingRows, planBookings, upsertServices } from "./appointments";
import type { BillingContext } from "./billing";
import { planCourses } from "./billing";
import { planLeads, upsertPipeline } from "./crm";
import { addMinutes, earliest, istAt } from "./people";
import {
    SA_CATEGORIES,
    SA_COURSES,
    SA_ENQUIRIES,
    SA_ENQUIRY_FIELDS,
    SA_FOOTER,
    SA_LEADS,
    SA_NAME,
    SA_NAMES,
    SA_PARENT_NAMES,
    SA_PATHS,
    SA_PIPELINE,
    SA_PLANS,
    SA_PRODUCTS,
    SA_PROGRAMME,
    SA_QR,
    SA_SAC,
    SA_SERVICE,
    SA_SERVICES,
    SA_SITE,
    SA_SPEC,
    SA_STAFF,
    SA_TIMELINE,
} from "./shiksha-data";
import { SA_POSTS } from "./shiksha-posts";
import type {
    Business,
    GstInvoiceSpec,
    MemberSpec,
    VerticalContext,
} from "./vertical";
import {
    asGst,
    bump,
    clearVolume,
    createInChunks,
    DAY,
    HOUR,
    lastDayOfMonth,
    makeCast,
    payment,
    planMemberships,
    planShop,
    requireStates,
    rngFor,
    setServiceGst,
    settleOldLeads,
    setupBusiness,
    upsertProducts,
    upsertStaff,
    writeGstInvoices,
    writePlans,
    writePosts,
    writeQrCodes,
    writeShop,
    writeTraffic,
    writeVerticalSite,
} from "./vertical";

export { SA_NAME } from "./shiksha-data";

/** People in the CRM: the admissions season's enquiries first, then students. */
const LEADS = 40;
const FORM_LEADS = 27;
const STUDENTS = 175;
/** Students on the yearly programme, paying in four instalments. */
const ON_INSTALMENTS = 42;

/**
 * Site traffic's shape: results day in mid-June (about 120 days back), the
 * crash course opening, and admissions for 2027–28 from 1 October.
 */
const extraTraffic = (now: Date) => {
    const results = lastDayOfMonth(now, 14, monthsBackTo(now, 5));
    const admissions = lastDayOfMonth(now, 1, monthsBackTo(now, 9));
    const results2 = bump(results, 2.4, 5);
    const crash = bump(-42, 0.35, 6);
    const open = bump(admissions, 0.9, 12);
    return (d: number) => results2(d) + crash(d) + open(d);
};

/** How many months back the latest `month` (0 = January) is. */
function monthsBackTo(now: Date, month: number): number {
    const local = new Date(now.getTime() + 330 * 60_000);
    return (local.getUTCMonth() - month + 12) % 12;
}

export async function seedShiksha(
    ctx: VerticalContext,
): Promise<{ id: string; name: string; prefix: string }> {
    const { prisma, now } = ctx;
    const b = await setupBusiness(ctx, SA_SPEC);
    const { sid, orgId } = b;

    const services = await upsertServices(prisma, {
        orgId,
        services: SA_SERVICES,
        serviceId: (i) => sid("service", i),
        ruleId: (i, k) => sid("rule", i, k),
        createdAt: b.createdAt,
    });
    const staffIds = await upsertStaff(prisma, b, SA_STAFF, services);
    const staffOfService = new Map<string, string>();
    for (const s of SA_STAFF) {
        for (const i of s.services) {
            staffOfService.set(services[i].id, staffIds[s.key]);
        }
    }
    const pipelineId = sid("pipeline");
    const stageIds = await upsertPipeline(prisma, {
        orgId,
        pipelineId,
        stageId: (i) => sid("stage", i),
        name: SA_PIPELINE.name,
        stages: SA_PIPELINE.stages,
    });

    await clearVolume(prisma, b);

    // --- the site, its posts, the shop and the QR codes
    const { siteId, formId } = await writeVerticalSite(prisma, b, {
        now,
        site: SA_SITE,
        footer: SA_FOOTER,
        pipelineId,
        services,
    });
    await setServiceGst(
        prisma,
        services,
        SA_SERVICES.map((s) => ({ sac: s.sac, rate: 18, shown: s.shown })),
        siteId,
    );
    const posts = await writePosts(prisma, b, {
        now,
        siteId,
        posts: SA_POSTS,
        authors: {
            "Vikram Choudhary": b.users.vikram,
            "Kavita Saini": b.users.kavita,
        },
    });
    const products = await upsertProducts(
        prisma,
        b,
        SA_CATEGORIES,
        SA_PRODUCTS,
    );
    const extra = extraTraffic(now);
    const qrIds = await writeQrCodes(prisma, b, {
        now,
        siteId,
        codes: SA_QR,
        weekendFactor: 1.2,
        dayWeight: (d) => 1 + extra(d),
    });

    // --- people: enquiries first, then students
    const people = makeCast(
        rngFor(sid(""), "people"),
        LEADS + STUDENTS,
        SA_NAMES,
    );
    const contacts = people.map((person, i) => ({
        id: sid("contact", i),
        person,
        name: `${person.first} ${person.last}`,
        email: person.email,
    }));
    const students = people.map((_, i) => i).filter((i) => i >= LEADS);
    const team = [b.users.owner, b.users.vikram, b.users.kavita];
    const seen: { contact: number; at: Date }[] = [];

    // --- leads: the admissions season, most since admissions opened
    const leadRng = rngFor(sid(""), "leads");
    const leadAt = Array.from({ length: LEADS }, (_, i) =>
        istAt(
            now,
            -(i < 24 ? leadRng.int(1, 16) : leadRng.int(17, 70)),
            leadRng.int(9 * 60, 21 * 60),
        ),
    );
    const form = { id: formId(5, 2), name: "Admissions enquiry" };
    const specs = leadAt.map((createdAt, i) => {
        const template = SA_LEADS[i % SA_LEADS.length];
        return {
            contactId: contacts[i].id,
            title: `${template.title} — ${people[i].first} ${people[i].last}`,
            value: i < FORM_LEADS ? null : template.value,
            formId: i < FORM_LEADS ? form.id : null,
            createdAt: earliest(createdAt, addMinutes(now, -120)),
            course: template.course,
        };
    });
    const { leads, activities } = planLeads(leadRng, specs, {
        now,
        orgId,
        pipelineId,
        stageIds,
        stageNames: SA_PIPELINE.stages,
        actorUserIds: [b.users.kavita, b.users.kavita, b.users.vikram],
        notes: SA_TIMELINE.notes,
        tasks: SA_TIMELINE.tasks,
        wonShare: 0.55,
        lostShare: 0.15,
        leadId: (n) => sid("lead", n),
        activityId: (n, k) => sid("activity", n, k),
    });
    settleOldLeads(
        leadRng,
        { leads, activities },
        {
            now,
            days: 21,
            stageIds,
            stageNames: SA_PIPELINE.stages,
            actor: b.users.kavita,
            wonShare: 0.55,
            lostShare: 0.25,
            activityId: (n, k) => sid("activity", n, k),
        },
    );
    specs.forEach((s, i) => seen.push({ contact: i, at: s.createdAt }));
    const submissions: Prisma.SubmissionCreateManyInput[] = specs
        .slice(0, FORM_LEADS)
        .map((s, i) => ({
            id: sid("submission", i),
            organizationId: orgId,
            formId: form.id,
            contactId: contacts[i].id,
            leadId: sid("lead", i),
            data: {
                name: contacts[i].name,
                email: contacts[i].email,
                phone: people[i].phone,
                course: s.course,
                message: SA_ENQUIRIES[i % SA_ENQUIRIES.length],
            },
            createdAt: s.createdAt,
        }));
    if (!SA_ENQUIRY_FIELDS.some((f) => f.name === "course")) {
        throw new Error("The admissions form has no course field");
    }

    // --- courses first: their sessions take places in the diary
    const billing: BillingContext = {
        now,
        orgId,
        id: (...parts) => sid(...parts),
        rng: (concern) => rngFor(sid(""), concern),
        services,
        contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.person.phone,
            company: null,
        })),
        pool: students,
        staff: team,
        invoicing: true,
        seller: {
            sellerName: SA_NAME,
            sellerLegalName: b.seller.sellerLegalName,
            sellerEmail: b.seller.sellerEmail,
            sellerAddress: b.seller.sellerAddress,
        },
    };
    const courses = planCourses(billing, SA_COURSES);
    seen.push(...courses.seen);

    // --- the diary: demo classes and counselling calls, by new families
    const prospects = [
        ...Array.from({ length: LEADS }, (_, i) => i),
        ...students.slice(0, 40),
    ];
    const planned = planBookings(rngFor(sid(""), "bookings"), {
        now,
        services: SA_SERVICES,
        target: 105,
        fromDay: -90,
        toDay: 14,
        contacts: people.length,
        prospects,
        prospectServices: [SA_SERVICE.demo, SA_SERVICE.counselling],
        weekdayWeights: [1.4, 0.8, 0.9, 0.9, 0.9, 1, 1.5],
        reserved: courses.reserved,
        busy: courses.busy,
    });
    const diary = bookingRows(planned, {
        now,
        orgId,
        services,
        contacts: contacts.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.person.phone,
        })),
        staffUserIds: [b.users.kavita, b.users.vikram],
        bookingId: (n) => sid("booking", n),
        eventId: (n, kind) => sid("bookingevent", n, kind),
    });
    const qrRng = rngFor(sid(""), "booking-source");
    const bookings = [...diary.bookings, ...courses.bookings].map((row) => ({
        ...row,
        staffId: staffOfService.get(row.serviceId) ?? null,
        bookedOnline: !row.courseEnrollmentId,
        sourceCode:
            !row.courseEnrollmentId && qrRng.chance(0.12) ? qrIds[1] : null,
    }));
    for (const p of diary.placed)
        seen.push({ contact: p.contact, at: p.createdAt });

    // --- monthly fee plans: about fifty on one now, as many who have left
    const memberRng = rngFor(sid(""), "members");
    const pool = [...students];
    const take = () => {
        const k = memberRng.int(0, pool.length - 1);
        return pool.splice(k, 1)[0];
    };
    const members: MemberSpec[] = [];
    const active: [number, number][] = [
        [0, 22],
        [1, 15],
        [2, 6],
        [3, 9],
    ];
    for (const [plan, count] of active) {
        for (let k = 0; k < count; k++) {
            const fate =
                (plan === 0 && k < 2) || (plan === 1 && k === 0)
                    ? "FAILED"
                    : (plan === 0 && k === 2) || (plan === 3 && k === 0)
                      ? "ENDING"
                      : plan === 1 && k === 1
                        ? "PAUSED"
                        : "ACTIVE";
            members.push({
                plan,
                contact: take(),
                fate,
                startDaysAgo:
                    fate === "FAILED"
                        ? 30 * memberRng.int(1, 5) + 12
                        : plan === 0 || plan === 1
                          ? memberRng.chance(0.6)
                              ? memberRng.int(182, 196)
                              : memberRng.int(25, 170)
                          : memberRng.int(12, 150),
                slow: memberRng.chance(0.12),
            });
        }
    }
    const ended: [number, number][] = [
        [0, 21],
        [1, 13],
        [2, 9],
        [3, 6],
    ];
    for (const [plan, count] of ended) {
        for (let k = 0; k < count; k++) {
            // Most finished with the session in March; some left part-way.
            const sessionEnd = memberRng.chance(0.6);
            const startDaysAgo = sessionEnd
                ? memberRng.int(300, 420)
                : memberRng.int(60, 300);
            const endDaysAgo = sessionEnd
                ? memberRng.int(190, 205)
                : memberRng.int(4, Math.max(5, startDaysAgo - 35));
            members.push({
                plan,
                contact: take(),
                fate: "CANCELLED",
                startDaysAgo,
                endDaysAgo: Math.min(endDaysAgo, startDaysAgo - 20),
            });
        }
    }
    const memberships = planMemberships(memberRng, b, {
        now,
        plans: SA_PLANS,
        members,
        contacts,
        staff: [b.users.kavita, b.users.owner],
        planCreatedAt: b.createdAt,
    });
    seen.push(...memberships.seen);

    // --- the yearly programme's instalments, raised on the 1st of the quarter
    const instRng = rngFor(sid(""), "instalments");
    const onProgramme = pool.splice(0, ON_INSTALMENTS);
    const invoices: GstInvoiceSpec[] = [
        ...memberships.invoices,
        ...courses.invoices.map((spec) => asGst(spec, SA_SAC)),
    ];
    const quarters = instalmentQuarters(now, 3);
    onProgramme.forEach((contact, s) => {
        const secondYear = s % 2 === 1;
        const scholarship = s === 5;
        quarters.forEach((q, k) => {
            const issuedAt = istAt(
                now,
                q.issueDay,
                instRng.int(10 * 60, 12 * 60),
            );
            const dueAt = istAt(now, q.dueDay, 23 * 60 + 59);
            const latest = k === 0;
            const id = sid("invoice", "instalment", s, k);
            const startYear = secondYear ? q.sessionYear - 1 : q.sessionYear;
            const amount =
                scholarship && latest
                    ? 1_800_000
                    : SA_PROGRAMME.instalmentPaise;
            const line = {
                description: `${SA_PROGRAMME.name} ${startYear}–${String((startYear + 2) % 100).padStart(2, "0")} · Year ${secondYear ? 2 : 1}, instalment ${q.number} of 4 (${q.label})${scholarship && latest ? " · 25% scholarship" : ""}`,
                quantity: 1,
                unitPaise: amount,
                sac: SA_SAC,
                rate: 18,
            };
            if (scholarship && latest) {
                // The counsellor is revising it after the scholarship test.
                invoices.push({
                    id,
                    contact,
                    createdAt: addMinutes(now, -instRng.int(120, 2000)),
                    issuedAt: null,
                    dueAt: null,
                    lines: [line],
                    source: "MANUAL",
                    createdByUserId: b.users.kavita,
                    paid: null,
                    voided: null,
                });
                return;
            }
            const passed = dueAt.getTime() < now.getTime();
            const roll = instRng.next();
            const behind =
                (latest && passed && roll < 0.14) ||
                (k === 1 && s === 11) ||
                (latest && !passed && roll < 0.45);
            const late = !behind && instRng.chance(0.15);
            const paidAt = behind
                ? null
                : earliest(
                      addMinutes(
                          late ? dueAt : issuedAt,
                          instRng.int(60, (late ? 12 : 8) * 24 * 60),
                      ),
                      addMinutes(now, -30),
                  );
            invoices.push({
                id,
                contact,
                createdAt: issuedAt,
                issuedAt,
                dueAt,
                lines: [line],
                source: "MANUAL",
                createdByUserId: b.users.kavita,
                paid:
                    paidAt && paidAt > issuedAt
                        ? payment(instRng, paidAt)
                        : null,
                voided: null,
                note:
                    k === 1 && s === 11
                        ? "Father asked for time till the harvest money comes in. Call on the 20th."
                        : undefined,
            });
        });
        seen.push({
            contact,
            at: istAt(
                now,
                quarters[quarters.length - 1].issueDay - 10,
                11 * 60,
            ),
        });
    });
    // Issued to the wrong student and voided the same day.
    {
        const q = quarters[0];
        const issuedAt = istAt(now, q.issueDay, 10 * 60 + 5);
        invoices.push({
            id: sid("invoice", "instalment", "void"),
            contact: onProgramme[3],
            createdAt: issuedAt,
            issuedAt,
            dueAt: istAt(now, q.dueDay, 23 * 60 + 59),
            lines: [
                {
                    description: `${SA_PROGRAMME.name} · instalment ${q.number} of 4 (${q.label})`,
                    quantity: 1,
                    unitPaise: SA_PROGRAMME.instalmentPaise,
                    sac: SA_SAC,
                    rate: 18,
                },
            ],
            source: "MANUAL",
            createdByUserId: b.users.kavita,
            paid: null,
            voided: {
                at: addMinutes(issuedAt, 50),
                reason: "Raised for the wrong student — same name in another batch",
            },
        });
    }
    // Registration fees from the families who joined this season.
    leads.forEach((lead, n) => {
        if (lead.status !== "WON") return;
        const at = earliest(
            new Date(new Date(lead.updatedAt ?? now).getTime() + 2 * HOUR),
            addMinutes(now, -45),
        );
        invoices.push({
            id: sid("invoice", "registration", n),
            contact: n,
            createdAt: at,
            issuedAt: at,
            dueAt: new Date(at.getTime() + 7 * DAY),
            lines: [
                {
                    description: "Registration fee — admission 2027–28",
                    quantity: 1,
                    unitPaise: SA_PROGRAMME.registrationPaise,
                    sac: SA_SAC,
                    rate: 18,
                },
            ],
            source: "MANUAL",
            createdByUserId: b.users.kavita,
            paid: payment(instRng, addMinutes(at, 10)),
            voided: null,
        });
    });

    // --- the shop: study material and uniforms at the front desk
    const shop = planShop(rngFor(sid(""), "shop"), b, {
        now,
        count: 205,
        days: 92,
        products,
        contacts,
        buyers: students,
        weekdayWeights: [0.6, 1.1, 1, 1, 1, 1, 1.3],
        dayWeight: (d) => 1 + extra(d) * 0.6,
        openMinute: 7 * 60 + 15,
        closeMinute: 20 * 60,
        lineWeights: [60, 28, 12],
        orderPrefix: "SA-",
        staff: team,
        qr: { ids: [qrIds[2]], share: 0.15 },
    });
    seen.push(...shop.seen);

    // --- contacts, from the first thing each did
    const contactRng = rngFor(sid(""), "contacts");
    const firstSeen = people.map(() =>
        istAt(now, -contactRng.int(20, 400), contactRng.int(10 * 60, 19 * 60)),
    );
    for (const s of seen) {
        firstSeen[s.contact] = earliest(
            firstSeen[s.contact],
            new Date(s.at.getTime() - (s.contact < FORM_LEADS ? 0 : DAY)),
        );
    }
    const sources = [
        "WALK_IN",
        "REFERRAL",
        "WHATSAPP",
        "INSTAGRAM",
        "GOOGLE",
        "WEBSITE",
    ];
    await createInChunks(
        contacts.map((c, i) => ({
            id: c.id,
            organizationId: orgId,
            email: c.email,
            firstName: c.person.first,
            lastName: c.person.last,
            phone: c.person.phone,
            source:
                i < FORM_LEADS
                    ? "WEBSITE"
                    : contactRng.weighted(sources, (s) =>
                          s === "WALK_IN" || s === "REFERRAL" ? 3 : 1,
                      ),
            createdAt: earliest(firstSeen[i], now),
            updatedAt: earliest(firstSeen[i], now),
        })),
        (data) => prisma.contact.createMany({ data }),
    );

    // --- parents, on the student's record (there is no parent login)
    const notes = parentNotes(b, now, students, people, firstSeen);
    await prisma.lead.createMany({ data: leads });
    await prisma.activity.createMany({ data: activities });
    await prisma.submission.createMany({ data: submissions });
    await prisma.course.createMany({ data: courses.courses });
    await prisma.courseSession.createMany({ data: courses.sessions });
    await prisma.courseEnrollment.createMany({ data: courses.enrollments });
    await writePlans(prisma, memberships.plans);
    await createInChunks(memberships.subscriptions, (data) =>
        prisma.customerSubscription.createMany({ data }),
    );
    await createInChunks(bookings, (data) =>
        prisma.booking.createMany({ data }),
    );
    await createInChunks([...diary.events, ...courses.events], (data) =>
        prisma.bookingEvent.createMany({ data }),
    );
    await writeShop(prisma, shop);
    const written = await writeGstInvoices(
        prisma,
        b,
        SA_SPEC.gst.prefix,
        contacts,
        invoices,
    );
    await createInChunks(notes, (data) =>
        prisma.contactNote.createMany({ data }),
    );
    const traffic = await writeTraffic(prisma, b, {
        now,
        days: 125,
        paths: SA_PATHS,
        trendBase: 150,
        trendSlope: 0.25,
        weekendFactor: 0.8,
        dayWeight: extra,
    });

    console.log(
        `[showcase] ${SA_NAME}: ${people.length} contacts (${STUDENTS} students), ` +
            `${leads.length} leads, ${bookings.length} bookings, ` +
            `${courses.enrollments.length} enrolments, ${memberships.subscriptions.length} fee plans, ` +
            `${shop.orders.length} orders, ${written.issued} invoices issued, ${notes.length} notes, ` +
            `${posts} posts, ${traffic} traffic rows`,
    );
    return { id: orgId, name: SA_NAME, prefix: sid("") };
}

/**
 * The last `count` instalment quarters (April, July, October, January),
 * newest first: raised on the 1st, due on the 10th.
 */
function instalmentQuarters(now: Date, count: number) {
    const local = new Date(now.getTime() + 330 * 60_000);
    const today = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
    );
    const MONTHS = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    const out: {
        issueDay: number;
        dueDay: number;
        number: number;
        label: string;
        sessionYear: number;
    }[] = [];
    let year = local.getUTCFullYear();
    let month = local.getUTCMonth();
    while (out.length < count) {
        if (SA_PROGRAMME.months.includes(month)) {
            const issue = Date.UTC(year, month, 1);
            out.push({
                issueDay: Math.round((issue - today) / DAY),
                dueDay: Math.round(
                    (Date.UTC(year, month, SA_PROGRAMME.dueDay) - today) / DAY,
                ),
                number: SA_PROGRAMME.months.indexOf(month) + 1,
                label: `${MONTHS[month]} ${year}`,
                sessionYear: month >= 3 ? year : year - 1,
            });
        }
        month -= 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }
    return out;
}

/** One note per student naming the parent who pays and how to reach them. */
function parentNotes(
    b: Business,
    now: Date,
    students: readonly number[],
    people: readonly { first: string; last: string }[],
    firstSeen: readonly Date[],
): Prisma.ContactNoteCreateManyInput[] {
    const rng = rngFor(b.sid(""), "parents");
    const prefs = [
        "prefers WhatsApp",
        "call after 7 pm",
        "pays the fees; wants receipts by email",
        "comes to every parent–teacher meeting",
        "works in Dubai — mother handles day to day",
        "Hindi preferred on calls",
    ];
    const notes: Prisma.ContactNoteCreateManyInput[] = students.map((i) => {
        const father = rng.chance(0.65);
        const parent = `${rng.pick(father ? SA_PARENT_NAMES.father : SA_PARENT_NAMES.mother)} ${people[i].last}`;
        const phone = `+91 ${rng.pick(["94140", "98290", "99280", "97848", "88750"])} ${rng.int(10000, 99999)}`;
        const at = earliest(
            addMinutes(firstSeen[i], rng.int(20, 600)),
            addMinutes(now, -60),
        );
        return {
            id: b.sid("note", "parent", i),
            organizationId: b.orgId,
            contactId: b.sid("contact", i),
            body: `Parent: ${parent} (${father ? "father" : "mother"}), ${phone} — ${rng.pick(prefs)}.`,
            createdByUserId: b.users.kavita,
            updatedByUserId: b.users.kavita,
            createdAt: at,
            updatedAt: at,
        };
    });
    const extras = [
        "Stays at a PG in Triveni Nagar (Shree Ganesh Girls' PG). Local guardian: maternal uncle.",
        "Scholarship 25% on instalments 3 and 4 — 94% in Class 10 boards. Approved by Vikram sir.",
        "Missed 4 Sunday tests in a row. Spoke to the mother; grandfather unwell. Review next month.",
        "Wants to shift from the evening to the morning batch after Diwali (school timing changed).",
        "Asked for test marks to go to both parents. Added the father's number to the WhatsApp list.",
    ];
    extras.forEach((body, k) => {
        const i = students[k * 7 + 3];
        const at = earliest(
            addMinutes(firstSeen[i], 3 * 24 * 60 + k * 90),
            addMinutes(now, -(k + 1) * 24 * 60),
        );
        notes.push({
            id: b.sid("note", "extra", k),
            organizationId: b.orgId,
            contactId: b.sid("contact", i),
            body,
            createdByUserId: k === 1 ? b.users.vikram : b.users.kavita,
            updatedByUserId: k === 1 ? b.users.vikram : b.users.kavita,
            createdAt: at,
            updatedAt: at,
        });
    });
    return notes;
}

// --- Check ------------------------------------------------------------------

export interface ShikshaCounts {
    students: number;
    leads: string;
    bookingsUpcoming: number;
    courses: string;
    feePlans: string;
    failedRenewals: number;
    overdueInstalments: number;
    orders90: number;
    moneyEvents90: number;
    payingContacts: number;
    products: string;
    posts: string;
    parentNotes: number;
}

type Row = Record<string, unknown>;
const one = (rows: Row[]) => Number(rows[0]?.n ?? 0);

/** Every state the coaching centre's demo shows; the run stops if one is missing. */
export async function checkShiksha(
    prisma: Db,
    orgId: string,
    now: Date,
): Promise<ShikshaCounts> {
    const at = now.toISOString();
    const since = new Date(now.getTime() - 90 * DAY).toISOString();
    const where = { organizationId: orgId };
    const [leadRows, courseRows, subRows, productCount, variantCount] =
        await Promise.all([
            prisma.lead.groupBy({ by: ["status"], where, _count: true }),
            prisma.$queryRaw<Row[]>`
                SELECT c.name, c.status,
                       MIN(s."startAt") AS first, MAX(s."startAt") AS last,
                       (SELECT COUNT(*) FROM "CourseEnrollment" e WHERE e."courseId" = c.id) AS people
                FROM "Course" c JOIN "CourseSession" s ON s."courseId" = c.id
                WHERE c."organizationId" = ${orgId} GROUP BY c.id`,
            prisma.customerSubscription.groupBy({
                by: ["status"],
                where,
                _count: true,
            }),
            prisma.product.count({ where }),
            prisma.productVariant.count({ where: { product: where } }),
        ]);
    const leadStages = await prisma.$queryRaw<Row[]>`
        SELECT COUNT(DISTINCT "stageId") AS n FROM "Lead" WHERE "organizationId" = ${orgId}`;
    const counts: ShikshaCounts = {
        students: await prisma.contact.count({
            where: { ...where, notes: { some: {} } },
        }),
        leads: leadRows
            .map((r) => `${r._count} ${r.status.toLowerCase()}`)
            .join(", "),
        bookingsUpcoming: await prisma.booking.count({
            where: {
                ...where,
                status: "CONFIRMED",
                startAt: { gt: now },
                service: { name: "Free demo class" },
            },
        }),
        courses: courseRows
            .map((r) => `${String(r.status).toLowerCase()} ${Number(r.people)}`)
            .join(", "),
        feePlans: subRows
            .map((r) => `${r._count} ${r.status.toLowerCase()}`)
            .join(", "),
        failedRenewals: one(
            await prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "CustomerSubscription" cs
            JOIN LATERAL (
                SELECT i.* FROM "Invoice" i
                WHERE i."subscriptionId" = cs.id AND i.status <> 'VOID'
                ORDER BY i."periodStart" DESC LIMIT 1
            ) latest ON true
            WHERE cs."organizationId" = ${orgId} AND cs.status = 'ACTIVE'
              AND latest.status = 'ISSUED' AND latest."dueAt" < ${at}::timestamp
              AND latest."createdByUserId" IS NULL`,
        ),
        overdueInstalments: one(
            await prisma.$queryRaw<Row[]>`
            SELECT COUNT(*) AS n FROM "Invoice" WHERE "organizationId" = ${orgId}
              AND source = 'MANUAL' AND status = 'ISSUED' AND "dueAt" < ${at}::timestamp`,
        ),
        orders90: await prisma.order.count({
            where: { ...where, createdAt: { gte: new Date(since) } },
        }),
        moneyEvents90: one(
            await prisma.$queryRaw<Row[]>`
            SELECT (SELECT COUNT(*) FROM "Order" WHERE "organizationId" = ${orgId}
                      AND "createdAt" >= ${since}::timestamp)
                 + (SELECT COUNT(*) FROM "Invoice" WHERE "organizationId" = ${orgId}
                      AND "issuedAt" >= ${since}::timestamp) AS n`,
        ),
        payingContacts: one(
            await prisma.$queryRaw<Row[]>`
            SELECT COUNT(DISTINCT c) AS n FROM (
                SELECT "contactId" AS c FROM "Invoice"
                WHERE "organizationId" = ${orgId} AND status = 'PAID'
                UNION
                SELECT l."contactId" FROM "CustomerIdentityLink" l
                JOIN "Order" o ON o."customerId" = l."customerId"
                WHERE l."organizationId" = ${orgId} AND o."paymentStatus" = 'PAID'
            ) x`,
        ),
        products: `${productCount} products, ${variantCount} variants`,
        posts: (
            await prisma.$queryRaw<Row[]>`
                SELECT pc.name, COUNT(*) AS n,
                       bool_and(p.content LIKE '%<img%') AS pictured
                FROM "Post" p JOIN "PostCategory" pc ON pc.id = p."categoryId"
                JOIN "Site" s ON s.id = p."siteId"
                WHERE s."organizationId" = ${orgId} AND p."currentPublicationId" IS NOT NULL
                GROUP BY pc.name ORDER BY pc.name`
        )
            .map(
                (r) =>
                    `${Number(r.n)} ${String(r.name).toLowerCase()}${r.pictured ? "" : " (one without a picture)"}`,
            )
            .join(", "),
        parentNotes: await prisma.contactNote.count({
            where: { ...where, body: { startsWith: "Parent: " } },
        }),
    };
    const courseState = (status: string, test: (r: Row) => boolean) =>
        courseRows.some((r) => r.status === status && test(r));
    const nowMs = now.getTime();
    const ms = (v: unknown) => (v as Date).getTime();
    const subs: Record<string, number | undefined> = Object.fromEntries(
        subRows.map((r) => [r.status, r._count]),
    );
    const postCounts = counts.posts.split(", ").map((p) => parseInt(p, 10));
    requireStates(SA_NAME, {
        "about 150 students": counts.students >= 150,
        "about 40 leads in the admissions season":
            leadRows.reduce((s, r) => s + r._count, 0) >= 38,
        "leads in every stage": one(leadStages) === SA_PIPELINE.stages.length,
        "admitted and lost leads":
            leadRows.some((r) => r.status === "WON") &&
            leadRows.some((r) => r.status === "LOST"),
        "an upcoming demo class": counts.bookingsUpcoming >= 1,
        "a course starting soon": courseState(
            "OPEN",
            (r) => ms(r.first) > nowMs,
        ),
        "a course running": courseState(
            "OPEN",
            (r) => ms(r.first) < nowMs && ms(r.last) > nowMs,
        ),
        "a course finished": courseState("CLOSED", (r) => ms(r.last) < nowMs),
        "about 50 on a monthly fee plan":
            (subs.ACTIVE ?? 0) + (subs.PAUSED ?? 0) >= 48,
        "about 50 who left a fee plan": (subs.CANCELLED ?? 0) >= 45,
        "a failed renewal": counts.failedRenewals >= 1,
        "an overdue instalment": counts.overdueInstalments >= 1,
        "about 150 sales a month": counts.moneyEvents90 >= 420,
        "about 100 paying customers": counts.payingContacts >= 100,
        "at most 40 products": productCount <= 40,
        "genuine variants": variantCount >= 25,
        "24–30 posts, 8 in each category, each with a picture":
            postCounts.length === 3 &&
            postCounts.every((n) => n >= 8) &&
            postCounts.reduce((s, n) => s + n, 0) >= 24 &&
            !counts.posts.includes("without"),
        "a parent on each student's record": counts.parentNotes >= 150,
        "weekly hours for the faculty":
            (await prisma.staffHours.count({ where })) > 20,
        "site traffic":
            (await prisma.analyticsDailyAggregate.count({ where })) > 200,
        "QR scans": (await prisma.qrScanDay.count({ where })) > 50,
    });
    return counts;
}
