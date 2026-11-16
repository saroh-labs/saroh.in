import type { TradePage } from "./types";

/**
 * Fitness and lessons beyond the lead "gyms" page. Classes with places and
 * courses over several weeks; no memberships, renewals or bundles of
 * classes, which Global's Free plan doesn't sell.
 */
export const FITNESS: TradePage[] = [
    {
        slug: "personal-trainers",
        name: "Personal trainers",
        bar: "Trainer",
        longName: "Personal trainers",
        group: "fitness",
        way: "appointments",
        at: "06:00",
        moment: "Three clients before 9, and one has a sore knee today.",
        searchWords: "personal trainer pt coach fitness coach strength",
        phrase: "personal trainer booking software",
        seoTitle: "Personal trainer booking software for one-to-one",
        seoDescription:
            "Personal trainer booking software: clients book sessions into your free hours, injuries on file, and invoices for every block of sessions.",
        headline: "Your sessions, your clients and what they've paid.",
        sub: "Personal trainer booking software for trainers who work one to one, in a gym, a park or a client's home. Clients book into your free hours, their injuries and goals sit on their page, and you invoice each block of sessions.",
        home: {
            label: "A personal trainer's Home in Saroh at 5:45 am, an example: a client's note about her knee, an overdue invoice and three sessions before 9",
            clock: "5:45",
            place: "Personal training · early start",
            needs: [
                {
                    icon: "customer",
                    title: "Nadia R. left a note when booking",
                    line: "07:00 · “knee still sore after Sunday”",
                    warn: true,
                },
                {
                    icon: "doc",
                    title: "Overdue from Chris P.",
                    line: "Invoice 0026 · 10 sessions",
                },
            ],
            today: [
                { at: "06:00", line: "Chris P. · Strength, 60 min" },
                { at: "07:00", line: "Nadia R. · Mobility, 45 min" },
                { at: "08:00", line: "Ali H. · Park session, 60 min" },
            ],
        },
        changeTitle:
            "The problems every trainer knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“I spend Sunday night texting clients to set the week.”",
                title: "Clients book into your free hours",
                body: "Your booking page shows only the times you're free. Set the break after each session for travel between the gym and the park.",
            },
            {
                feature: "customers",
                pain: "“A client told me about her back three weeks ago, and I'd forgotten.”",
                title: "Injuries and goals on their page",
                body: "Note an injury once. It shows on their bookings and today's list, beside your notes from each session.",
            },
            {
                feature: "billing",
                pain: "“I can't remember who's paid for which ten sessions.”",
                title: "An invoice for each block of sessions",
                body: "Write a numbered invoice for ten sessions, in your currency. Record what's paid, and Home lists what's overdue.",
            },
            {
                feature: "bookings",
                label: "Bookings · Who came",
                pain: "“A client cancels at 6 am and I'm already at the gym.”",
                title: "See who keeps not coming",
                body: "Mark who came and who didn't. No-shows are counted on the client's page.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Consultation", detail: "30 min" },
                { name: "Personal training", detail: "60 min" },
                { name: "Mobility session", detail: "45 min" },
                { name: "Outdoor session", detail: "60 min" },
            ],
        },
        faq: [
            {
                q: "Can I train clients in different places?",
                a: "Yes. Each service has its own length and the break after it, so travel time stays free. Write the place in the service's name or your notes.",
            },
            {
                q: "Can I run a small group class too?",
                a: "Yes. Set how many places a class has, and people book until it's full.",
            },
        ],
        closer: "Start the week with every session booked.",
        related: ["gyms", "yoga-studios", "physiotherapists"],
        templates: "personal-trainer",
    },
    {
        slug: "yoga-studios",
        name: "Yoga studios",
        bar: "Yoga",
        longName: "Yoga teachers",
        group: "fitness",
        way: "classes",
        at: "07:00",
        moment: "The 7 am flow has two mats left, and a new student is coming.",
        searchWords: "yoga studio yoga teacher pilates meditation classes",
        phrase: "yoga class booking software",
        seoTitle: "Yoga class booking software for studios",
        seoDescription:
            "Yoga class booking software: students book a mat in each class, beginners' courses over several weeks, and injuries known before class.",
        headline: "Every mat booked, every student known.",
        sub: "Yoga class booking software for studios and teachers who hire a room. Students book a mat in the class they want, a beginners' course runs over six weeks, and an injury is known before they unroll their mat.",
        home: {
            label: "A yoga teacher's Home in Saroh at 6:30 am, an example: a new student's note about a back injury, and today's classes with places left",
            clock: "6:32",
            place: "Yoga studio · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Ines G. left a note when booking",
                    line: "07:00 · First class · “lower back injury”",
                    warn: true,
                },
            ],
            today: [
                { at: "07:00", line: "Morning flow · 10 of 12 booked" },
                { at: "12:15", line: "Lunchtime stretch · 6 of 12" },
                { at: "18:30", line: "Beginners' course · week 3" },
            ],
        },
        changeTitle:
            "The problems every yoga studio knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Classes",
                pain: "“Fourteen people turn up for twelve mats.”",
                title: "A class books up to its mats",
                body: "Set how many places each class has. Students book until it's full, and you see places left at a glance.",
            },
            {
                feature: "bookings",
                label: "Bookings · Courses",
                pain: "“The beginners' course is six weeks, and I track it on paper.”",
                title: "Courses over several weeks",
                body: "Run a course over six Tuesdays. Enrol people and see who's on it and who's paid.",
            },
            {
                feature: "customers",
                pain: "“A new student mentions her back injury halfway through class.”",
                title: "Injuries known before class",
                body: "Students answer “Anything we should know?” when they book. Add it to their record, and it shows on today's list.",
            },
            {
                feature: "website",
                pain: "“My timetable is a picture on Instagram, and it's always out of date.”",
                title: "Your timetable on your own site",
                body: "Your site shows each class with its time and places left, from the same diary students book from.",
            },
        ],
        starter: {
            kind: "classes",
            rows: [
                { name: "Morning flow", detail: "12 places · 60 min" },
                { name: "Yin yoga", detail: "10 places · 75 min" },
                { name: "Beginners' course", detail: "6 weeks" },
                { name: "Private session", detail: "One to one · 60 min" },
            ],
        },
        faq: [
            {
                q: "Can I run a course that lasts several weeks?",
                a: "Yes. A course runs for several weeks: enrol people and see who's on it and who's paid.",
            },
            {
                q: "Can I teach in a room I hire?",
                a: "Yes. Your classes are times in your diary wherever they happen. Say where in the class's name or on your site.",
            },
        ],
        closer: "Know who's on the mat tomorrow at 7.",
        related: ["gyms", "dance-classes", "physiotherapists"],
    },
    {
        slug: "martial-arts",
        name: "Martial arts",
        bar: "Martial arts",
        longName: "Martial arts schools",
        group: "fitness",
        way: "classes",
        at: "17:30",
        moment: "The kids' class at 5:30 is full, and a new family wants a trial.",
        searchWords:
            "martial arts karate judo taekwondo jiu jitsu kickboxing dojo",
        phrase: "martial arts class booking software",
        seoTitle: "Martial arts class booking software for clubs",
        seoDescription:
            "Martial arts class booking software: classes by age and grade with their places, courses for beginners and every student's record.",
        headline: "Classes by age and grade, never over the mat's size.",
        sub: "Martial arts class booking software for karate, judo, jiu-jitsu and taekwondo clubs. Each class has its places, a beginners' course runs over several weeks, and every student's grade and notes are on one page.",
        home: {
            label: "A martial arts club's Home in Saroh at 4 pm, an example: a parent's note about a child's asthma, an overdue invoice and tonight's classes",
            clock: "16:02",
            place: "Martial arts club · Tuesday",
            needs: [
                {
                    icon: "warn",
                    title: "Asthma: keeps an inhaler",
                    line: "Theo B. · 17:30 · Kids' class",
                    warn: true,
                },
                {
                    icon: "doc",
                    title: "Overdue from the Okafor family",
                    line: "Invoice 0102 · autumn term",
                },
            ],
            today: [
                { at: "17:30", line: "Kids, 6 to 9 · 16 of 16 booked" },
                { at: "18:30", line: "Juniors · 11 of 16" },
                { at: "19:30", line: "Adults · 9 of 20" },
            ],
        },
        changeTitle:
            "The problems every martial arts club knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Classes",
                pain: "“Too many kids on the mat, and it isn't safe.”",
                title: "Each class has its places",
                body: "Set the places for the kids', juniors' and adults' classes. Once it's full, no one else can book.",
            },
            {
                feature: "bookings",
                label: "Bookings · Courses",
                pain: "“Beginners start every term, and I enrol them on a clipboard.”",
                title: "A beginners' course for each term",
                body: "Run a course over the term's weeks. Enrol each student and see who's on it.",
            },
            {
                feature: "customers",
                pain: "“A parent tells me about asthma at the door, and the next coach doesn't know.”",
                title: "Health flags on every class list",
                body: "Note asthma or an allergy on the student once. It shows on their bookings and on today's list.",
            },
            {
                feature: "billing",
                pain: "“Term fees come in by bank transfer and I tick them off in a notebook.”",
                title: "Term fees invoiced and recorded",
                body: "Write a numbered invoice for each family's term. Record the transfer when it lands, and what's overdue is listed.",
            },
        ],
        starter: {
            kind: "classes",
            rows: [
                { name: "Kids, 6 to 9", detail: "16 places · 45 min" },
                { name: "Juniors", detail: "16 places · 60 min" },
                { name: "Adults", detail: "20 places · 90 min" },
                { name: "Beginners' course", detail: "8 weeks" },
            ],
        },
        faq: [
            {
                q: "Can a parent book for their child?",
                a: "Yes. The parent books the place, and writes the child's name and anything you should know when they book.",
            },
            {
                q: "Can I keep a student's grade?",
                a: "Yes. Write it in your notes on their page, with the date they graded.",
            },
        ],
        closer: "Know who's on the mat tonight before the first bow.",
        related: ["gyms", "dance-classes", "swim-schools"],
    },
    {
        slug: "dance-classes",
        name: "Dance classes",
        bar: "Dance",
        longName: "Dance teachers",
        group: "fitness",
        way: "classes",
        at: "18:00",
        moment: "Salsa beginners at 6 has three places left, and a newcomer books one of them.",
        searchWords: "dance school dance studio ballet salsa tap contemporary",
        phrase: "dance class booking software",
        seoTitle: "Dance class booking software for dance schools",
        seoDescription:
            "Dance class booking software: weekly classes with their places, terms run as courses, and every dancer's details in one place.",
        headline: "Every class, every term, every dancer.",
        sub: "Dance class booking software for dance schools and teachers. Weekly classes book up to the floor's size, a term runs as a course, and every dancer's level and notes are on their page.",
        home: {
            label: "A dance teacher's Home in Saroh at 3 pm, an example: a follow-up with a parent, an overdue term invoice and tonight's classes",
            clock: "15:04",
            place: "Dance school · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Follow up with Megan H.",
                    line: "Asked about ballet for her daughter",
                },
                {
                    icon: "doc",
                    title: "Overdue from Ayo S.",
                    line: "Invoice 0064 · tap, autumn term",
                    warn: true,
                },
            ],
            today: [
                { at: "16:30", line: "Junior ballet · 12 of 14 booked" },
                { at: "18:00", line: "Salsa beginners · 17 of 20" },
                { at: "19:15", line: "Contemporary · 9 of 14" },
            ],
        },
        changeTitle:
            "The problems every dance school knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Classes",
                pain: "“The beginners' class is packed one week and half empty the next.”",
                title: "Places you can see",
                body: "Set the places each class has. Open a class to see who's booked and how many places are left.",
            },
            {
                feature: "bookings",
                label: "Bookings · Courses",
                pain: "“Each term I rebuild the register from last term's.”",
                title: "A term as a course",
                body: "Run the term as a course over its weeks. Enrol each dancer and see who's on it and who's paid.",
            },
            {
                feature: "website",
                pain: "“Parents ask what age the ballet class is for.”",
                title: "Your classes on your own site",
                body: "Your site shows each class with its day, time and price. A form brings each question into your contacts, ready to follow up.",
            },
            {
                feature: "billing",
                pain: "“Term fees are the hardest money to chase.”",
                title: "See who's paid for the term",
                body: "Write a numbered invoice for each term. Record what's paid, and Home lists what's overdue.",
            },
        ],
        starter: {
            kind: "classes",
            rows: [
                { name: "Junior ballet", detail: "14 places · 45 min" },
                { name: "Salsa beginners", detail: "20 places · 60 min" },
                { name: "Contemporary", detail: "14 places · 75 min" },
                { name: "Autumn term, tap", detail: "10 weeks" },
            ],
        },
        faq: [
            {
                q: "Can I run a term as a course?",
                a: "Yes. A course runs for several weeks: enrol each dancer and see who's paid.",
            },
            {
                q: "Can someone book a single class to try it?",
                a: "Yes. Classes book one at a time, so a newcomer books one class before joining a term.",
            },
        ],
        closer: "Fill tomorrow's beginners' class.",
        related: ["yoga-studios", "music-lessons", "martial-arts"],
    },
    {
        slug: "swim-schools",
        name: "Swim schools",
        bar: "Swimming",
        longName: "Swim teachers",
        group: "fitness",
        way: "classes",
        at: "16:00",
        moment: "Four small swimmers at 4 pm, and one is still nervous of the deep end.",
        searchWords: "swimming lessons swim school swim teacher kids swimming",
        phrase: "swim school booking software",
        seoTitle: "Swim school booking software for swim lessons",
        seoDescription:
            "Swim school booking software: small classes by level with their places, lessons over a term and every swimmer's notes for the poolside.",
        headline: "Small classes, by level, never too many in the water.",
        sub: "Swim school booking software for swim teachers and small schools. Classes by level keep to their places, a term of lessons runs as a course, and each swimmer's notes are there at the poolside.",
        home: {
            label: "A swim teacher's Home in Saroh at 3:30 pm, an example: a parent's note about a nervous swimmer and this afternoon's classes",
            clock: "15:30",
            place: "Swim school · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Kemi A. left a note when booking",
                    line: "16:00 · “Ben is nervous in deep water”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Jack L.",
                    line: "Invoice 0145 · 10 lessons",
                },
            ],
            today: [
                { at: "16:00", line: "Starters · 4 of 4 booked" },
                { at: "16:30", line: "Level 2 · 5 of 6" },
                { at: "17:15", line: "Adult improvers · 3 of 6" },
            ],
        },
        changeTitle:
            "The problems every swim school knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Classes",
                pain: "“A parent books a fifth child into a class of four.”",
                title: "Each level keeps to its places",
                body: "Set four places for starters and six for improvers. A class stops taking bookings when it's full.",
            },
            {
                feature: "bookings",
                label: "Bookings · Courses",
                pain: "“The summer term fills in a day, and I keep the list on paper.”",
                title: "A term of lessons as a course",
                body: "Run ten weeks of lessons as a course. Enrol each swimmer and see who's on it and who's paid.",
            },
            {
                feature: "customers",
                pain: "“I can't remember which child is scared of the deep end.”",
                title: "Every swimmer's notes",
                body: "Their level, your notes and anything a parent told you, on one page and on today's list.",
            },
            {
                feature: "bookings",
                label: "Bookings · Your booking page",
                pain: "“Adults want a lesson at 7 am, before work.”",
                title: "Adults book their own lessons",
                body: "Your booking page shows one-to-one lessons in the times you're free, beside your classes.",
            },
        ],
        starter: {
            kind: "classes",
            rows: [
                { name: "Starters", detail: "4 places · 30 min" },
                { name: "Level 2", detail: "6 places · 30 min" },
                { name: "Adult improvers", detail: "6 places · 45 min" },
                { name: "Private lesson", detail: "One to one · 30 min" },
            ],
        },
        faq: [
            {
                q: "Can a parent book for their child?",
                a: "Yes. The parent books the place and tells you the child's name and anything you should know when they book.",
            },
            {
                q: "Can I teach in a pool I hire?",
                a: "Yes. Your classes are times in your diary wherever they happen. Say which pool in the class's name or on your site.",
            },
        ],
        closer: "Know every swimmer before they reach the poolside.",
        related: ["martial-arts", "dance-classes", "tutors"],
    },
    {
        slug: "music-lessons",
        name: "Music lessons",
        bar: "Music",
        longName: "Music teachers",
        group: "fitness",
        way: "appointments",
        at: "15:30",
        moment: "Piano at 3:30, guitar at 4:15, and a grade exam in three weeks.",
        searchWords:
            "music teacher piano lessons guitar lessons singing violin",
        phrase: "music lesson booking software",
        seoTitle: "Music lesson booking software for teachers",
        seoDescription:
            "Music lesson booking software: students book lessons into your free times, notes on what they're practising, and an invoice for each term.",
        headline: "Every lesson in its place, and what they're practising.",
        sub: "Music lesson booking software for piano, guitar, singing and violin teachers. Students book lessons into your free times, your notes on each one follow them from week to week, and parents get an invoice for the term.",
        home: {
            label: "A music teacher's Home in Saroh at 3 pm, an example: a parent's note before a lesson, an overdue term invoice and the afternoon's lessons",
            clock: "15:01",
            place: "Music lessons · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Ruth P. left a note when booking",
                    line: "16:15 · “Ella has her Grade 3 on the 5th”",
                },
                {
                    icon: "doc",
                    title: "Overdue from Ruth P.",
                    line: "Invoice 0039 · autumn term",
                    warn: true,
                },
            ],
            today: [
                { at: "15:30", line: "Max T. · Piano, 30 min" },
                { at: "16:15", line: "Ella P. · Piano, 45 min" },
                { at: "17:00", line: "Sana Q. · Guitar, 30 min" },
            ],
        },
        changeTitle:
            "The problems every music teacher knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Rearranging one lesson takes ten messages with a parent.”",
                title: "Students book your free times",
                body: "Your booking page shows only the times you're free, at the length each lesson runs.",
            },
            {
                feature: "customers",
                pain: "“I can't remember which piece she was meant to practise.”",
                title: "Your notes, week to week",
                body: "Write what they're working on after each lesson. It's on their page when they sit down next week.",
            },
            {
                feature: "billing",
                pain: "“Term fees are awkward to ask for in person.”",
                title: "An invoice for each term",
                body: "Write a numbered invoice for ten lessons, in your currency. Record what's paid, and Home lists what's overdue.",
            },
            {
                feature: "bookings",
                label: "Bookings · Online lessons",
                pain: "“Some students come to me, some only learn on a video call.”",
                title: "At your place or on a call",
                body: "Set a lesson as in person, by video or either, and the student chooses when they book.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Piano lesson", detail: "30 min" },
                { name: "Piano lesson", detail: "45 min" },
                { name: "Guitar lesson", detail: "30 min" },
                { name: "Singing lesson", detail: "45 min" },
            ],
        },
        faq: [
            {
                q: "Can I teach online as well?",
                a: "Yes. Set a lesson as in person, by video or either, and the student chooses when they book.",
            },
            {
                q: "Can I run a group class, like a choir?",
                a: "Yes. Set how many places a class has, and people book until it's full.",
            },
        ],
        closer: "Know tomorrow's lessons, and what each student is playing.",
        related: ["tutors", "art-classes", "dance-classes"],
    },
    {
        slug: "art-classes",
        name: "Art classes",
        bar: "Art",
        longName: "Art teachers",
        group: "fitness",
        way: "classes",
        at: "10:00",
        moment: "The Saturday watercolour class has eight easels, and seven are booked.",
        searchWords: "art class art school painting drawing pottery workshop",
        phrase: "art class booking software",
        seoTitle: "Art class booking software for workshops",
        seoDescription:
            "Art class booking software: classes and one-off workshops with their places, courses over several weeks and materials you can count.",
        headline: "Every easel booked, every workshop full.",
        sub: "Art class booking software for painting, drawing and pottery teachers. Classes and one-off workshops book up to their places, a six-week course has its own list, and the materials you sell are counted.",
        home: {
            label: "An art teacher's Home in Saroh at 9 am, an example: a student's note about her hand, sketchbooks short for orders and today's classes",
            clock: "9:02",
            place: "Art classes · Saturday",
            needs: [
                {
                    icon: "customer",
                    title: "June F. left a note when booking",
                    line: "10:00 · “arthritis in my right hand”",
                },
                {
                    icon: "stock",
                    title: "A4 sketchbooks are short for orders",
                    line: "6 ordered, 4 left",
                },
            ],
            today: [
                { at: "10:00", line: "Watercolour · 7 of 8 booked" },
                { at: "13:30", line: "Life drawing · 10 of 12" },
                { at: "16:00", line: "Kids' clay · 6 of 8" },
            ],
        },
        changeTitle:
            "The problems every art teacher knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                label: "Bookings · Classes",
                pain: "“I have eight easels, and ten people say they're coming.”",
                title: "Each class books up to its easels",
                body: "Set the places a class has, and booking stops when it's full. Open a class to see who's coming.",
            },
            {
                feature: "bookings",
                label: "Bookings · Courses",
                pain: "“A six-week course needs a list I can see every week.”",
                title: "Courses with their own list",
                body: "Run a course over six weeks. Enrol people and see who's on it and who's paid.",
            },
            {
                feature: "products",
                pain: "“Students buy sketchbooks and brushes from me, and I lose count.”",
                title: "Materials you sell, counted",
                body: "Add each one with its price and count. Each sale takes it off, and Home shows what's short.",
            },
            {
                feature: "website",
                pain: "“People ask what's on next month.”",
                title: "What's on, on your own site",
                body: "Your site shows each class and workshop with its date and places left, from the same diary people book from.",
            },
        ],
        starter: {
            kind: "classes",
            rows: [
                { name: "Watercolour", detail: "8 places · 2 hr" },
                { name: "Life drawing", detail: "12 places · 2 hr" },
                { name: "Kids' clay", detail: "8 places · 90 min" },
                { name: "Oil painting course", detail: "6 weeks" },
            ],
        },
        faq: [
            {
                q: "Can I run a one-off workshop?",
                a: "Yes. Add it as a class on its date with its places, and people book until it's full.",
            },
            {
                q: "Can I sell materials as well?",
                a: "Yes. Add them as products with a price and a count, and sell them at the class.",
            },
        ],
        closer: "Fill Saturday's class by Wednesday.",
        related: ["music-lessons", "dance-classes", "tutors"],
    },
    {
        slug: "tutors",
        name: "Tutors",
        bar: "Tutor",
        longName: "Tutors",
        group: "fitness",
        way: "appointments",
        at: "16:30",
        moment: "Maths at 4:30 on a call, and the exam is in six weeks.",
        searchWords: "tutor tutoring private tutor maths english exam prep",
        phrase: "tutoring booking software",
        seoTitle: "Tutoring booking software for private tutors",
        seoDescription:
            "Tutoring booking software: sessions booked into your free times, in person or on a call, notes on every student and an invoice for each month.",
        headline: "Sessions booked, notes kept, the month invoiced.",
        sub: "Tutoring booking software for private tutors, at home, at the student's or on a call. Parents book sessions into your free times, your notes on each student carry on week to week, and every month gets one invoice.",
        home: {
            label: "A tutor's Home in Saroh at 3:30 pm, an example: a parent's note about an exam date, an overdue invoice and the afternoon's sessions",
            clock: "15:32",
            place: "Tutoring · Tuesday",
            needs: [
                {
                    icon: "customer",
                    title: "Priya N. left a note when booking",
                    line: "16:30 · “mock exam moved to Monday”",
                },
                {
                    icon: "doc",
                    title: "Overdue from the Clarke family",
                    line: "Invoice 0072 · October",
                    warn: true,
                },
            ],
            today: [
                { at: "16:30", line: "Arjun N. · Maths, video call" },
                { at: "17:30", line: "Lily C. · English, 60 min" },
                { at: "18:45", line: "Omar F. · Chemistry, 60 min" },
            ],
        },
        changeTitle:
            "The problems every tutor knows, and what Saroh does about each.",
        problems: [
            {
                feature: "bookings",
                pain: "“Parents message all week to move a session.”",
                title: "Parents book your free times",
                body: "Your booking page shows only the times you're free. Set the break after each session for travel between homes.",
            },
            {
                feature: "bookings",
                label: "Bookings · Online sessions",
                pain: "“Some students I see at home, some only on a video call.”",
                title: "In person or on a call",
                body: "Set a session as in person, by video or either, and the parent chooses when they book.",
            },
            {
                feature: "customers",
                pain: "“I forget where we got to with fractions last week.”",
                title: "Where you got to, on their page",
                body: "Write what you covered and what's next after each session. It's there when you open the next booking.",
            },
            {
                feature: "billing",
                pain: "“I invoice twelve families by hand at the end of each month.”",
                title: "One invoice a month for each family",
                body: "Write a numbered invoice for the month's sessions. Record what's paid, and Home lists what's overdue.",
            },
        ],
        starter: {
            kind: "services",
            rows: [
                { name: "Maths tutoring", detail: "60 min" },
                { name: "English tutoring", detail: "60 min" },
                { name: "Exam preparation", detail: "90 min" },
                { name: "First meeting", detail: "20 min" },
            ],
        },
        faq: [
            {
                q: "Can I tutor online?",
                a: "Yes. Set a session as in person, by video or either, and the parent chooses when they book.",
            },
            {
                q: "Can I run a small group for exam revision?",
                a: "Yes. Set how many places a class has, and students book until it's full.",
            },
        ],
        closer: "Know tomorrow's students, and where you got to with each.",
        related: ["music-lessons", "art-classes", "consultants"],
        templates: "tutor",
    },
];
