/**
 * Aarohan Academy's posts: nine Help pages, nine News items and nine
 * Articles, written for this seed. Every fact (batches, fees, dates, results)
 * matches the academy's showcase data; student names are fictional.
 *
 * Data only; the seed writes it.
 */

import type { DemoImage, DemoPost } from "./demo-content";
import { demoAsset, figure } from "./demo-content";
import { SA_PHOTOS } from "./shiksha-photos";

/** A picture the seed draws, 1600 × 1000. */
const drawn = (file: string, alt: string): DemoImage => ({
    url: demoAsset("aarohan-academy", file),
    alt,
    width: 1600,
    height: 1000,
    creditName: null,
    creditUrl: null,
});

const SA_DRAWN = {
    timetable: drawn(
        "timetable-neet-11.png",
        "Weekly timetable of the NEET Class 11 morning batch, Monday to Saturday, 7:00 to 10:00",
    ),
    results: drawn(
        "results-2026.png",
        "Aarohan Academy toppers 2026: NEET, JEE Main and IELTS scores",
    ),
    fees: drawn(
        "fee-instalments.png",
        "The ₹96,000 yearly fee in four instalments of ₹24,000, due 10 April, 10 July, 10 October and 10 January",
    ),
    tests: drawn(
        "test-calendar.png",
        "Calendar of Sunday tests and monthly Major Tests from October to December 2026",
    ),
    admissions: drawn(
        "admissions-steps.png",
        "Four admission steps: enquiry, counselling call, demo class, admission",
    ),
    ielts: drawn(
        "ielts-weekend.png",
        "Poster for the new IELTS weekend batch starting 14 November 2026",
    ),
} satisfies Record<string, DemoImage>;

const VIKRAM = "Vikram Choudhary";
const NEHA = "Neha Agarwal";
const SAURABH = "Saurabh Jain";
const AMIT = "Amit Meena";
const PRIYA = "Priya Rathore";
const FARHAN = "Farhan Qureshi";
const KAVITA = "Kavita Saini";

const HELP: DemoPost[] = [
    {
        slug: "how-admission-works",
        title: "How admission works, step by step",
        category: "help",
        excerpt:
            "From your first enquiry to the first day of class: a counselling call, a free demo class, then admission. Here is what happens at each step.",
        daysAgo: 16,
        author: KAVITA,
        cover: SA_DRAWN.admissions,
        featured: true,
        body: `<p>Most families reach us with the same question: <em>what do we actually have to do?</em> Admission at Aarohan Academy is four steps, and nobody is asked to pay anything until the last one.</p>
<h2>1. Enquiry</h2>
<p>Fill in the enquiry form on this site, call the front desk, or walk in to the 3rd floor of Laxmi Complex, Gopalpura Bypass. Tell us the student's class, board and the exam they are aiming for. That is enough to start.</p>
<h2>2. Counselling call (30 minutes, free)</h2>
<p>I call you back, or you book a slot online: Monday to Saturday, 11:00–13:00 or 17:00–19:00. We talk through the student's current marks, the programme that fits (NEET, JEE, Class 9–10 Foundation, Spoken English or IELTS), the batch timing and the fees. Parents are welcome on the call and usually ask the best questions.</p>
${figure(SA_PHOTOS.counselling, "A counselling call is a conversation, not a sales pitch. Bring your questions.")}
<h2>3. Free demo class (60 minutes)</h2>
<p>The student sits a real class with Vikram Choudhary, our director, on Saturday 16:00–17:00 or Sunday 11:00–12:00. Book it online or ask me to book it for you. Sitting one class tells a student more than any brochure.</p>
<h2>4. Admission</h2>
<ul>
<li>Fill in the admission form and bring the documents on our checklist: Aadhaar, last marksheet, photographs and a parent's ID.</li>
<li>Pay the ₹2,000 registration fee and the first instalment or first month.</li>
<li>Collect your timetable, study modules and test-series schedule at the front desk.</li>
</ul>
<p>You get a GST invoice by email for every payment. Admissions for the 2027–28 session opened on 1 October, and families who join by 30 November get ₹5,000 off the first instalment.</p>`,
    },
    {
        slug: "paying-fees-in-instalments",
        title: "Paying fees in instalments or monthly",
        category: "help",
        excerpt:
            "The two-year NEET/JEE programme is ₹96,000 a year in four instalments of ₹24,000, or monthly if that suits your family better. Fees include 18% GST.",
        daysAgo: 40,
        author: KAVITA,
        cover: SA_PHOTOS.parents,
        body: `<p>We would rather a family pays comfortably on time than stretches for one big cheque. So there are two ways to pay, and you can tell us which you prefer at admission.</p>
<h2>Four instalments a year</h2>
<p>The two-year NEET and JEE classroom programme is ₹96,000 a year, paid in four instalments of ₹24,000.</p>
<table>
<thead><tr><th>Instalment</th><th>Due date</th><th>Amount</th></tr></thead>
<tbody>
<tr><td>First</td><td>10 April</td><td>₹24,000</td></tr>
<tr><td>Second</td><td>10 July</td><td>₹24,000</td></tr>
<tr><td>Third</td><td>10 October</td><td>₹24,000</td></tr>
<tr><td>Fourth</td><td>10 January</td><td>₹24,000</td></tr>
</tbody>
</table>
${figure(SA_DRAWN.fees, "The yearly fee, split into four equal instalments.")}
<h2>Paying monthly</h2>
<ul>
<li>Class 11–12 (NEET or JEE): ₹8,500 a month</li>
<li>Class 9–10 Foundation: ₹3,500 a month</li>
<li>Spoken English: ₹2,500 a month</li>
</ul>
<p>Monthly fees are due by the 10th of each month.</p>
<h2>Good to know</h2>
<ul>
<li>A one-time registration fee of ₹2,000 is paid at admission.</li>
<li>Every fee we quote already includes 18% GST.</li>
<li>Pay by UPI, card, bank transfer or cash at the front desk.</li>
<li>Every payment gets a GST invoice and receipt by email, so keep the address you give us up to date.</li>
</ul>
<p>If a due date is going to be hard one month, speak to Kavita Saini before the 10th. We can usually work something out.</p>`,
    },
    {
        slug: "booking-the-free-demo-class",
        title: "Booking the free demo class",
        category: "help",
        excerpt:
            "Sit a real 60-minute class with our director before you decide. Saturdays 16:00–17:00 and Sundays 11:00–12:00, booked online or with Kavita.",
        daysAgo: 22,
        author: VIKRAM,
        cover: SA_PHOTOS.classroom,
        body: `<p>I teach the demo class myself, and I would like every student to sit one before joining. It costs nothing and it is the honest way to judge a coaching centre.</p>
<h2>When it runs</h2>
<ul>
<li><strong>Saturday</strong>, 16:00–17:00</li>
<li><strong>Sunday</strong>, 11:00–12:00</li>
</ul>
<p>Each class is 60 minutes, IST, at our centre on the 3rd floor of Laxmi Complex, Gopalpura Bypass.</p>
<h2>How to book</h2>
<ol>
<li>Pick a Saturday or Sunday slot on the booking page of this site, or call Kavita Saini at the front desk.</li>
<li>Give the student's name, class and the exam they are preparing for.</li>
<li>You get a confirmation with the date and time. Arrive ten minutes early.</li>
</ol>
${figure(SA_PHOTOS.whiteboard, "A demo class is a normal lesson: a concept, worked problems, and questions from the room.")}
<h2>What happens in the class</h2>
<p>We take one topic from the Class 11 or 12 syllabus, usually Physics, and work through it properly: the idea, two or three problems in NEET or JEE style, and a short quiz at the end. Students ask questions; I ask them too. Parents can sit at the back if they wish.</p>
<h2>After the class</h2>
<p>There is no pressure to sign up on the spot. Kavita will call in a day or two to answer anything left over. If you want to talk it through in more detail, book a free 30-minute counselling call with her.</p>
<p>Bring a notebook and a pen. That is all.</p>`,
    },
    {
        slug: "changing-your-batch",
        title: "Changing your batch",
        category: "help",
        excerpt:
            "Morning batch clashing with school? You can change batch once, free, in your first month. After that, ask us and we will see what has room.",
        daysAgo: 55,
        author: KAVITA,
        cover: SA_PHOTOS.attentive,
        body: `<p>School timings change, travel gets harder, a student finds they concentrate better in the evening. Batches can be changed, within a few simple rules.</p>
<h2>The rule</h2>
<p><strong>One batch change is free in the first month after joining.</strong> After the first month, a change depends on seats being free in the batch you want to move to.</p>
<h2>Which batches you can move between</h2>
<table>
<thead><tr><th>Batch</th><th>Days</th><th>Time</th></tr></thead>
<tbody>
<tr><td>NEET Foundation, Class 11 Morning</td><td>Mon–Sat</td><td>7:00–10:00</td></tr>
<tr><td>NEET Class 12 Evening</td><td>Mon–Sat</td><td>16:00–19:00</td></tr>
<tr><td>JEE Foundation, Class 11 Evening</td><td>Mon–Sat</td><td>16:00–19:00</td></tr>
<tr><td>Class 9–10 Foundation</td><td>Sat &amp; Sun</td><td>9:00–12:00</td></tr>
<tr><td>Spoken English</td><td>Mon, Wed, Fri</td><td>19:00–20:30</td></tr>
<tr><td>IELTS weekend</td><td>Sat &amp; Sun</td><td>10:00–12:00</td></tr>
</tbody>
</table>
${figure(SA_DRAWN.timetable, "The NEET Class 11 morning batch timetable. Every batch has its own weekly plan.")}
<h2>How to ask</h2>
<ol>
<li>Speak to Kavita Saini at the front desk or call during office hours.</li>
<li>Tell us which batch you want and why. A student moving from NEET to JEE track also needs a short talk with the subject teachers.</li>
<li>We confirm the new timetable, usually within two working days. Fees stay the same.</li>
</ol>
<p>The morning NEET batch has 40 seats and fills first, so ask early if that is the one you want.</p>`,
    },
    {
        slug: "refund-policy",
        title: "Our refund policy",
        category: "help",
        excerpt:
            "Full refund less the ₹2,000 registration fee before the batch starts, pro-rata in the first 30 days, none after that. Here is how it works.",
        daysAgo: 70,
        author: KAVITA,
        cover: SA_PHOTOS.notes,
        body: `<p>Plans change. A family moves city, a student decides coaching is not for them. Our refund policy is short so that everyone knows where they stand.</p>
<h2>Q: We paid but the batch has not started. Can we cancel?</h2>
<p>Yes. You get a full refund of what you paid, <strong>less the ₹2,000 registration fee</strong>.</p>
<h2>Q: The batch started two weeks ago. What happens?</h2>
<p>Within the first 30 days of the batch you get a <strong>pro-rata refund</strong>: we keep the fee for the days the batch has run, plus the registration fee, and return the rest.</p>
<h2>Q: And after 30 days?</h2>
<p>After 30 days we do not refund fees already paid. If you pay by instalment or monthly, you simply stop paying future instalments once you withdraw.</p>
${figure(SA_PHOTOS.books, "Printed study modules are yours to keep and are not refunded once handed over.")}
<h2>Q: Is changing batch a better option?</h2>
<p>Often, yes. One batch change is free in the first month. Many students who ask for a refund really need a different timing.</p>
<h2>Q: How do we ask for a refund?</h2>
<ol>
<li>Write to us or tell Kavita Saini at the front desk, with the student's name and batch.</li>
<li>We confirm the amount by email within three working days.</li>
<li>The refund goes back the way you paid: UPI, card or bank transfer. Cash payments are refunded by bank transfer.</li>
</ol>
<p>Study material, test-series books, T-shirts and lab coats bought from the front desk or the shop are not part of the course fee and are not refunded once used.</p>`,
    },
    {
        slug: "how-we-keep-parents-informed",
        title: "How we keep parents informed",
        category: "help",
        excerpt:
            "No app, no portal: fee invoices by email, attendance and test marks on WhatsApp from our counsellor, and a parent–teacher meeting every month.",
        daysAgo: 33,
        author: VIKRAM,
        cover: SA_PHOTOS.parentHelp,
        body: `<p>Parents often ask whether we have an app or a login where they can see their child's attendance live. We do not, and I want to be straight about that. What we do have is simple and it works.</p>
<h2>What you receive</h2>
<ul>
<li><strong>Fee invoices and receipts by email.</strong> Every payment, by any method, gets a GST invoice to the email address on the admission form.</li>
<li><strong>Attendance and test marks on WhatsApp.</strong> Kavita Saini, our admissions counsellor, sends each family the week's attendance and the Sunday test marks. The Major Test result comes with the rank in the batch.</li>
<li><strong>A parent–teacher meeting every month</strong>, on the second Saturday. You meet the subject teachers, see the answer sheets and talk about what to work on next.</li>
</ul>
${figure(SA_PHOTOS.parents, "The best conversations about a student's progress happen with the family in the room.")}
<h2>What we do not offer</h2>
<p>There is no parent portal and no live attendance tracking. If a student is absent without notice, Kavita calls the parent the same day. That phone call has always worked better than a notification.</p>
<h2>When you want to talk sooner</h2>
<p>You do not have to wait for the monthly meeting. Call the front desk and ask for a time with the subject teacher or with me. Mornings before 11:00 are hard because of the morning batch; afternoons between 13:00 and 15:30 are easiest.</p>
<h2>Keep your number current</h2>
<p>If your WhatsApp number or email changes, tell the front desk. Everything we send relies on it.</p>`,
    },
    {
        slug: "sunday-tests-and-omr-practice",
        title: "Sunday tests and OMR practice",
        category: "help",
        excerpt:
            "A weekly test every Sunday on the NEET/JEE pattern with OMR sheets, and a full-length Major Test on the last Sunday of each month.",
        daysAgo: 27,
        author: SAURABH,
        cover: SA_PHOTOS.omr,
        body: `<p>Students do not lose marks in NEET or JEE only because they do not know the answer. They lose them to bad time management, careless bubbling and panic. The Sunday test is how we practise all three.</p>
<h2>The weekly Sunday test</h2>
<ul>
<li>Every Sunday, for Class 11 and 12 NEET and JEE students.</li>
<li>Covers the past week's chapters plus a few questions from earlier ones.</li>
<li>NEET or JEE pattern, with negative marking, answered on an OMR sheet.</li>
<li>Marks reach parents on WhatsApp by Monday evening.</li>
</ul>
<h2>The monthly Major Test</h2>
<p>On the last Sunday of each month, the weekly test is replaced by a full-length Major Test: the full paper, the full time, the full syllabus covered so far. For the rest of 2026 that is 25 October, 29 November and 27 December. There is no test on 8 November, when the centre is closed for Diwali.</p>
${figure(SA_DRAWN.tests, "Sunday tests and Major Tests, October to December 2026.")}
<h2>Practising with OMR sheets</h2>
<ol>
<li>Use a black ballpoint pen. Fill the bubble completely; a tick or dot is not read.</li>
<li>Bubble as you go, in blocks of ten questions, not all at the end.</li>
<li>Leave a question blank rather than guessing wildly. Negative marks add up.</li>
<li>Check your roll number and test booklet code before you start. Every month someone forgets.</li>
</ol>
<p>The front desk sells an OMR practice pack of 50 sheets for home practice. Students who do two timed papers a week at home on OMR improve their accuracy faster than those who only practise in a notebook.</p>`,
    },
    {
        slug: "documents-needed-at-admission",
        title: "Documents needed at admission",
        category: "help",
        excerpt:
            "Bring these to the front desk on admission day: the student's Aadhaar, last marksheet, photographs and a parent's ID. A short checklist.",
        daysAgo: 85,
        author: KAVITA,
        cover: SA_PHOTOS.notebook,
        body: `<p>Admission takes about twenty minutes if you bring everything at once. Here is the checklist.</p>
<h2>For the student</h2>
<ul>
<li>Aadhaar card (original to see, one photocopy to keep)</li>
<li>Last marksheet: Class 10 for Class 11 admission, Class 11 for Class 12, Class 8 or 9 for the Foundation programme</li>
<li>School ID card or a bonafide certificate from the school</li>
<li>Two recent passport-size photographs</li>
</ul>
<h2>For the parent or guardian</h2>
<ul>
<li>One photo ID: Aadhaar, PAN, passport or driving licence</li>
<li>A mobile number on WhatsApp, for attendance and test marks</li>
<li>An email address, for fee invoices and receipts</li>
</ul>
<h2>For Spoken English and IELTS</h2>
<p>Adults joining Spoken English or IELTS need only their own photo ID and one photograph. IELTS students should also bring their passport number, since you will need it to register for the exam.</p>
${figure(SA_PHOTOS.counselling, "Kavita checks the documents and fills the form with you at the front desk.")}
<h2>If something is missing</h2>
<p>Do not postpone the admission for one missing photocopy. We can take the form and fee on the day, and you can bring the missing document within a week.</p>
<h2>Students from outside Jaipur</h2>
<p>We do not run a hostel, but we keep a list of verified PG accommodation in Gopalpura and Triveni Nagar, including a girls' PG run by one of our parents. Ask for it on admission day.</p>`,
    },
    {
        slug: "study-material-uniform-and-lab-coats",
        title: "Study material, T-shirts and lab coats: what to buy and where",
        category: "help",
        excerpt:
            "Printed modules by subject in Hindi or English medium, test-series books, academy T-shirts and lab coats: all at the front desk and in our online shop.",
        daysAgo: 48,
        author: SAURABH,
        cover: SA_PHOTOS.books,
        body: `<p>New students always ask what they need to buy. The short answer: less than you think. Here is what we sell, and what is actually required.</p>
<h2>Study material</h2>
<ul>
<li><strong>Printed study modules</strong> for Physics, Chemistry, Biology and Mathematics, in Hindi or English medium. Each module follows our teaching order chapter by chapter.</li>
<li><strong>Test-series books</strong> by subject, with chapter-wise questions in NEET and JEE pattern and full solutions.</li>
<li><strong>Formula handbook</strong>, pocket-sized, for last-minute revision.</li>
<li><strong>OMR practice pack</strong>, 50 sheets, for timed practice at home.</li>
</ul>
<p>The modules are required for classroom students; the rest are optional. NCERT textbooks are not sold here, buy them from any bookshop.</p>
<h2>Uniform and lab wear</h2>
<ul>
<li><strong>Academy T-shirt</strong>, navy or white, sizes S to XXL. Worn on Sunday test days and for events.</li>
<li><strong>Lab coat</strong>, sizes S to XL. Required for practical sessions in the chemistry and biology lab.</li>
</ul>
${figure(SA_PHOTOS.labWork, "A lab coat is required for every practical session in the lab.")}
<h2>Where to buy</h2>
<p>Everything is at the front desk, and you can order from the shop on this site and collect at the centre. Pay by UPI, card or cash; you get a GST invoice either way.</p>
<h2>Sizes and exchanges</h2>
<p>Try T-shirts and lab coats on at the front desk before buying. Unworn items with the tag on can be exchanged for another size within 15 days.</p>`,
    },
];

const NEWS: DemoPost[] = [
    {
        slug: "diwali-break-2026",
        title: "Diwali break: centre closed 7 to 11 November",
        category: "news",
        excerpt:
            "Happy Diwali from all of us. The centre is closed from Saturday 7 to Wednesday 11 November; classes resume on Thursday 12 November.",
        daysAgo: 2,
        author: VIKRAM,
        cover: SA_PHOTOS.jaipur,
        body: `<p>Diwali falls on Sunday 8 November this year, and the whole city will be lit up for the week. We are giving students and staff a proper break.</p>
<ul>
<li><strong>Centre closed:</strong> Saturday 7 November to Wednesday 11 November</li>
<li><strong>Classes resume:</strong> Thursday 12 November, at normal batch timings</li>
<li><strong>No Sunday test on 8 November.</strong> The November Major Test stays on Sunday 29 November.</li>
<li><strong>Parent–teacher meeting:</strong> Saturday 14 November, the second Saturday of the month</li>
</ul>
${figure(SA_PHOTOS.friends, "Rest well. Five days off is enough to recharge, not enough to forget.")}
<p>A word to Class 12 students: take Diwali off, genuinely. Then, from 10 November, put in two hours a day on revision so that the first week back is not a shock. Your teachers will set a short revision sheet before the break.</p>
<p>The new IELTS weekend batch starts after the break, on Saturday 14 November, as planned. Fee instalments are not affected.</p>
<p>Happy Diwali to every family at Aarohan Academy.</p>`,
    },
    {
        slug: "parent-teacher-meeting-october-2026",
        title: "What we heard at the October parent–teacher meeting",
        category: "news",
        excerpt:
            "Over 90 families came on Saturday 10 October. The main themes: Sunday test marks, sleep, and how to use the Diwali break.",
        daysAgo: 4,
        author: VIKRAM,
        cover: SA_PHOTOS.seminar,
        body: `<p>Thank you to the families who came to the parent–teacher meeting on Saturday 10 October. It was our busiest this year, and the questions were good ones.</p>
<h2>Three things that came up again and again</h2>
<ol>
<li><strong>Falling Sunday test marks in Class 11.</strong> This is normal in October. The syllabus gets harder (rotational motion, chemical bonding) and marks dip before they recover. Look at the trend over three months, not one week.</li>
<li><strong>Sleep.</strong> Many Class 12 students are studying past 1 a.m. Neha Agarwal made the case for a fixed bedtime, and we will write about it on this site.</li>
<li><strong>Diwali.</strong> Families asked how much to study during the break. Our answer: rest fully over the festival, then light revision from 10 November.</li>
</ol>
${figure(SA_PHOTOS.parents, "Parents and students together usually reach the useful answer faster.")}
<p>Several parents asked whether we could start an app for attendance. We have chosen not to. Kavita Saini will keep sending attendance and Sunday test marks on WhatsApp each week, and she calls the same day if a student is absent without notice.</p>
<p>The next meeting is on Saturday 14 November, the second Saturday of the month.</p>`,
    },
    {
        slug: "new-ielts-weekend-batch-14-november",
        title: "New IELTS weekend batch starts 14 November",
        category: "news",
        excerpt:
            "An 8-week IELTS course on Saturdays and Sundays, 10:00–12:00, with Priya Rathore. Starts Saturday 14 November; fee ₹14,000.",
        daysAgo: 5,
        author: PRIYA,
        cover: SA_DRAWN.ielts,
        body: `<p>We are opening a new IELTS weekend batch for students and working professionals who cannot make a weekday class.</p>
<table>
<thead><tr><th>Course</th><th>IELTS, 8 weeks</th></tr></thead>
<tbody>
<tr><td>Starts</td><td>Saturday 14 November 2026, right after the Diwali break</td></tr>
<tr><td>Classes</td><td>Saturday and Sunday, 10:00–12:00</td></tr>
<tr><td>First class</td><td>A diagnostic test in all four modules, so we know where each student starts</td></tr>
<tr><td>Fee</td><td>₹14,000, including GST</td></tr>
<tr><td>Trainer</td><td>Priya Rathore</td></tr>
</tbody>
</table>
${figure(SA_PHOTOS.english, "Speaking practice happens in every class, in front of the group.")}
<p>The course covers all four modules: Listening, Reading, Writing and Speaking, with four full mock tests marked to the official band descriptors. Every student gets two one-to-one speaking mocks with me.</p>
<p>This year Simran Kaur scored band 8.0 and Arjun Rathi band 7.5 after our course. Both started around band 6.</p>
<p>Seats are limited to 20. Book a place with Kavita Saini at the front desk or on this site.</p>`,
    },
    {
        slug: "october-major-test-25-october",
        title: "October Major Test on Sunday 25 October",
        category: "news",
        excerpt:
            "The full-length Major Test for October is on Sunday 25 October. Timings, syllabus and what to bring.",
        daysAgo: 9,
        author: SAURABH,
        cover: SA_PHOTOS.exam,
        body: `<p>The October Major Test is on <strong>Sunday 25 October</strong>, the last Sunday of the month. It replaces that day's weekly test.</p>
<h2>Timings</h2>
<ul>
<li>NEET students (Class 11 and 12): 9:00–12:20, full NEET paper</li>
<li>JEE students (Class 11): 9:00–12:00, full JEE Main paper</li>
<li>Reporting time: 8:30. Doors close at 8:50.</li>
</ul>
<h2>Syllabus</h2>
<p>Everything taught up to Friday 23 October. Class 12 NEET students are also tested on the whole of Class 11 Biology.</p>
${figure(SA_DRAWN.tests, "The test calendar for the rest of 2026.")}
<h2>What to bring</h2>
<p>Admit slip, two black ballpoint pens, a water bottle and your academy T-shirt. No calculators, phones or smartwatches in the hall.</p>
<p>Results and rank lists will be shared with parents on WhatsApp by Tuesday 27 October. The November Major Test is on 29 November; there is no test on 8 November because of the Diwali break.</p>`,
    },
    {
        slug: "early-admissions-2027-28-open",
        title: "Early admissions for 2027–28 are open",
        category: "news",
        excerpt:
            "Admissions for the 2027–28 session opened on 1 October. Join by 30 November and get ₹5,000 off your first instalment.",
        daysAgo: 14,
        author: KAVITA,
        cover: SA_PHOTOS.group,
        body: `<p>Admissions for the 2027–28 session are now open, for NEET and JEE Class 11 and 12 and the Class 9–10 Foundation programme.</p>
<h2>Early-bird offer</h2>
<p>Families who complete admission by <strong>30 November 2026</strong> get <strong>₹5,000 off the first instalment</strong>. The yearly fee for the two-year NEET/JEE programme stays ₹96,000, in four instalments of ₹24,000.</p>
<h2>Why apply early</h2>
<ul>
<li>The NEET Class 11 morning batch has 40 seats and fills first.</li>
<li>Early students get the Class 10 bridge sessions in February and March, free.</li>
<li>You can sit the free demo class and counselling call without rushing.</li>
</ul>
${figure(SA_DRAWN.admissions, "Four steps from enquiry to admission.")}
<p>To start, book a free 30-minute counselling call with me (Monday to Saturday, 11:00–13:00 or 17:00–19:00), or book the free demo class with Vikram Choudhary on a Saturday or Sunday.</p>`,
    },
    {
        slug: "new-chemistry-and-biology-lab",
        title: "Our new chemistry and biology lab is open",
        category: "news",
        excerpt:
            "The new lab on the 3rd floor has twelve workstations, microscopes and a fume cupboard. Practical sessions start for all Class 11 batches.",
        daysAgo: 19,
        author: SAURABH,
        cover: SA_PHOTOS.lab,
        body: `<p>After two months of work over the summer, our new chemistry and biology lab opened on Saturday 26 September.</p>
<p>It has twelve workstations for pairs of students, eight compound microscopes, a fume cupboard and a proper store for chemicals. Every Class 11 batch now has one practical session every fortnight, built around the NCERT practicals and the questions NEET and JEE ask about them: titrations, salt analysis, slide preparation, osmosis.</p>
${figure(SA_PHOTOS.labWork, "Students work in pairs at each station.")}
<p>Why spend on a lab when the exams are on paper? Because students who have actually seen a precipitate form or watched a cell under a microscope remember the theory better, and lose fewer marks on practical-based questions.</p>
<p>A lab coat is required for every session. Coats are sold at the front desk and in our shop in sizes S to XL.</p>`,
    },
    {
        slug: "jee-main-crash-course-starts",
        title: "JEE Main Crash Course starts tomorrow",
        category: "news",
        excerpt:
            "Twelve weeks of focused JEE Main practice with Vikram Choudhary: Tuesday and Thursday evenings and Saturday afternoons. ₹18,000.",
        daysAgo: 45,
        author: VIKRAM,
        cover: SA_PHOTOS.equations,
        body: `<p>Our JEE Main Crash Course begins tomorrow, Tuesday 1 September. It is for Class 12 students and repeaters who know the syllabus but need to turn it into marks.</p>
<ul>
<li><strong>Length:</strong> 12 weeks</li>
<li><strong>Timings:</strong> Tuesday and Thursday 19:00–21:00, Saturday 17:00–19:00</li>
<li><strong>Fee:</strong> ₹18,000, including GST</li>
<li><strong>Taught by:</strong> Vikram Choudhary</li>
</ul>
${figure(SA_PHOTOS.whiteboard, "Every class ends with a timed problem set.")}
<p>Each week covers one high-weight unit in Physics, Chemistry and Mathematics, followed by a timed set of previous-year questions. There are three full mock papers and a one-to-one review after each.</p>
<p>A few seats are still free. Speak to Kavita Saini at the front desk if you want to join in the first week.</p>`,
    },
    {
        slug: "guest-lecture-life-of-a-doctor",
        title: "Guest lecture: what a doctor's day is really like",
        category: "news",
        excerpt:
            "Dr Meenakshi Bhatt, a paediatrician in Jaipur, spoke to our NEET students about medical college, internship and why she would choose it again.",
        daysAgo: 75,
        author: NEHA,
        cover: SA_PHOTOS.seminar,
        body: `<p>On Saturday 1 August, Dr Meenakshi Bhatt, a paediatrician who practises in Jaipur, spent two hours with our NEET Class 11 and 12 students.</p>
<p>She did not talk about ranks. She talked about the first week of anatomy dissection, about night duty in internship, about the parent who brought a baby with a high fever at 3 a.m. and the relief on his face at 6. She was honest that the road is long: five and a half years of MBBS, then three more for a specialisation.</p>
${figure(SA_PHOTOS.graduate, "Medicine is a long road. It helps to hear about it from someone who walked it.")}
<p>The questions from students were the best part. Was it worth it? Yes. Did she ever think of quitting? Twice. What would she tell a Class 11 student? <em>Read NCERT Biology properly and sleep enough.</em> I could not have said it better.</p>
<p>We will host one guest lecture each term. The next is planned for January, for JEE students.</p>`,
    },
    {
        slug: "results-2026-neet-jee-ielts",
        title: "Results 2026: our NEET, JEE Main and IELTS toppers",
        category: "news",
        excerpt:
            "Ananya Sharma scored 682/720 in NEET 2026, and 47 of our 112 NEET students crossed 550. Kunal Agarwal reached the 99.71 percentile in JEE Main.",
        daysAgo: 118,
        author: VIKRAM,
        cover: SA_DRAWN.results,
        featured: true,
        body: `<p>NEET 2026 results came out this week, and I am proud of every student who sat the paper. Some numbers first.</p>
<h2>NEET 2026</h2>
<table>
<thead><tr><th>Student</th><th>Score</th></tr></thead>
<tbody>
<tr><td>Ananya Sharma</td><td>682 / 720</td></tr>
<tr><td>Mohit Kumawat</td><td>664 / 720</td></tr>
<tr><td>Sneha Choudhary</td><td>651 / 720</td></tr>
<tr><td>Aditya Saini</td><td>640 / 720</td></tr>
</tbody>
</table>
<p><strong>47 of our 112 NEET students scored above 550.</strong></p>
<h2>JEE Main 2026</h2>
<p>Kunal Agarwal, 99.71 percentile; Ritika Jain, 99.12; Harsh Meena, 98.64.</p>
<h2>IELTS</h2>
<p>Simran Kaur, band 8.0; Arjun Rathi, band 7.5.</p>
${figure(SA_PHOTOS.celebration, "Two years of Sunday tests, and this is what they were for.")}
<p>These results belong to the students and their families first. Ananya told me her secret was boring: NCERT Biology read four times and every Sunday test taken seriously. Mohit sat in the front row of the morning batch for two years and never missed one.</p>
<p>To the students who did not get the score they wanted: one exam does not define you. Come and talk to us about the options.</p>`,
    },
];

const ARTICLES: DemoPost[] = [
    {
        slug: "last-100-days-before-neet",
        title: "How to plan the last 100 days before NEET",
        category: "articles",
        excerpt:
            "Three phases, one rule: no new books. A day-by-day shape for the final 100 days, from someone who has watched hundreds of students do it.",
        daysAgo: 12,
        author: NEHA,
        cover: SA_PHOTOS.selfStudy,
        featured: true,
        body: `<p>Every year in late January, Class 12 students start asking me the same thing: <em>Ma'am, how many days are left, and what do I do with them?</em> NEET is usually held on the first Sunday of May, which leaves roughly 100 days from the end of January. Here is how I would use them.</p>
<h2>The one rule: no new books</h2>
<p>The final 100 days are not for discovering a new reference book a senior swears by. Everything you need is already on your desk: NCERT, your class notes, our modules and your Sunday test papers. Every new source costs time you do not have and adds doubt you do not need.</p>
<h2>Phase 1: days 100 to 61, finish and fix</h2>
<p>Use these forty days to close the gaps.</p>
<ul>
<li>Make a list of every chapter you rate below 6 out of 10. Be honest; your test papers will tell you.</li>
<li>Do two weak chapters a week, one from Physics or Chemistry and one from Biology.</li>
<li>Keep taking the Sunday tests. Do not skip them to "study more".</li>
<li>Read NCERT Biology once more, line by line, with a pencil.</li>
</ul>
<h2>Phase 2: days 60 to 21, papers and patterns</h2>
<p>Now the work turns to full papers.</p>
<ul>
<li>Three full-length papers a week, at 14:00, the actual NEET time slot, so your brain is used to being sharp then.</li>
<li>For every paper, spend as long analysing it as you spent writing it. Mark each wrong answer as a concept gap, a silly mistake or a time problem.</li>
<li>Keep a single "mistakes notebook". By April it is the most valuable book you own.</li>
</ul>
${figure(SA_PHOTOS.studying, "Write by hand. Your mistakes notebook only works if you wrote it yourself.")}
<h2>Phase 3: the last 20 days, revise and rest</h2>
<p>The last three weeks are for consolidation, not heroics.</p>
<ol>
<li>One full paper every alternate day, never two in one day.</li>
<li>Revise from your own notes, your mistakes notebook and NCERT highlights.</li>
<li>Go through NCERT diagrams and tables in Biology: they keep appearing as direct questions.</li>
<li>Sleep seven hours. Every year a student ignores this and every year it shows on the day.</li>
</ol>
<h2>A sample day in Phase 2</h2>
<table>
<thead><tr><th>Time</th><th>What</th></tr></thead>
<tbody>
<tr><td>6:30–9:00</td><td>Biology: NCERT reading and notes</td></tr>
<tr><td>9:30–12:30</td><td>Physics or Chemistry: weak chapter, problems</td></tr>
<tr><td>14:00–17:20</td><td>Full paper on OMR</td></tr>
<tr><td>18:00–20:00</td><td>Paper analysis, mistakes notebook</td></tr>
<tr><td>20:30–22:00</td><td>Light revision, then lights out by 22:30</td></tr>
</tbody>
</table>
<h2>Subject by subject</h2>
<h3>Biology</h3>
<p>Biology is half the paper and the most reliable marks you have. Read NCERT Biology at least twice more in these 100 days. Genetics, human physiology, plant physiology and ecology together carry a large share of questions every year.</p>
<h3>Chemistry</h3>
<p>Inorganic Chemistry is almost entirely NCERT and memory: make one-page sheets for each block of the periodic table and read them every week. In Organic, practise reaction mechanisms and named reactions until you can write them without looking. Physical Chemistry is numericals; do twenty a day.</p>
<h3>Physics</h3>
<p>Physics is where most NEET students lose rank. Do not try to master every chapter. Pick the high-weight ones (mechanics, electrostatics, current electricity, optics, modern physics) and solve previous-year questions from each until the patterns feel familiar.</p>
<h2>What parents can do</h2>
<p>Keep the house calm, keep meals regular and keep relatives' questions about ranks to a minimum. If your child wants to talk, listen more than you advise.</p>
<p>And to students: the last 100 days do not decide everything. The two years before them already did most of the work. Your job now is to show it.</p>`,
    },
    {
        slug: "ncert-first-biology",
        title: "NCERT first: why we teach Biology from the textbook out",
        category: "articles",
        excerpt:
            "More than 85% of NEET Biology can be traced to NCERT lines. How to read the textbook properly, and when to reach for anything else.",
        daysAgo: 38,
        author: NEHA,
        cover: SA_PHOTOS.notebook,
        body: `<p>When a new Class 11 student walks into my first Biology class, I ask them to put every reference book back in their bag. For the first three months we use one book: the NCERT textbook.</p>
<p>This is not nostalgia. Look at any recent NEET paper and try tracing each Biology question to a line, diagram or table in NCERT. In most years you will find the source for more than 85 of every 100 questions. Many are almost word for word.</p>
<h2>Reading NCERT is a skill</h2>
<p>Most students read NCERT once, like a story, and think they have done it. That is not reading. Here is how we do it in class:</p>
<ol>
<li><strong>First read:</strong> understand the chapter. Mark what you did not follow with a question mark.</li>
<li><strong>Second read:</strong> underline facts: numbers, names, examples, exceptions.</li>
<li><strong>Third read:</strong> read the diagrams, their labels and the captions under them. Questions come from here more than students expect.</li>
<li><strong>Fourth read:</strong> close the book and write the chapter's key points from memory, then check.</li>
</ol>
${figure(SA_PHOTOS.notes, "Your own notes, made from NCERT, are worth more than any bought summary.")}
<h2>The lines that get missed</h2>
<ul>
<li>Examples in brackets: the plant or animal named as an example is often the whole question.</li>
<li>Tables, for instance the comparison of mitosis and meiosis, or the list of hormones.</li>
<li>The "summary" at the end of each chapter, which students skip because it looks repetitive.</li>
<li>Boxed text and small-font notes in Human Physiology.</li>
</ul>
<h2>When to reach for something else</h2>
<p>After NCERT is solid, use our module for practice questions and the test-series books for timed sets. A reference book is useful for one thing: understanding a concept NCERT explains briefly, such as the details of the electron transport chain. Use it to understand, then come back to NCERT to remember.</p>
<h2>Hindi medium students</h2>
<p>The Hindi NCERT is a faithful translation, and our modules are printed in both Hindi and English medium. Some technical terms are easier to remember in English; learn both names for key terms, because the exam paper offers both.</p>
<h2>How we use NCERT in class</h2>
<p>In our NEET batches every Biology class starts with ten minutes of NCERT lines: I read a sentence with a word missing and the class fills it in. It sounds simple. It builds the habit of noticing exact wording, which is what NEET rewards. Every Sunday test then has at least fifteen Biology questions lifted straight from the chapters we covered that week, so students see the link between reading and marks for themselves.</p>
<p>Before each Major Test, students make a one-page sheet for every chapter on the syllabus, written from NCERT and nothing else. By Class 12 they have a file of eighty or so pages, and that file, not a thick reference book, is what they revise from in the last month.</p>
<h2>A test you can do tonight</h2>
<p>Take any chapter you have "finished". Open the NCERT at a random page and cover the text. Can you say what is on that page? If not, it is not finished yet. That is not a failure; it is a list of what to do next week.</p>`,
    },
    {
        slug: "jee-maths-practice-habits",
        title: "Five practice habits for JEE Mathematics",
        category: "articles",
        excerpt:
            "JEE Maths rewards speed built on understanding. Five habits our toppers share, from timed sets to a separate notebook for mistakes.",
        daysAgo: 29,
        author: AMIT,
        cover: SA_PHOTOS.boardWork,
        body: `<p>Every year students ask how many questions they should solve for JEE Mathematics. The honest answer is that the number matters less than the way you solve them. Kunal Agarwal, who reached the 99.71 percentile this year, solved fewer problems than some of his batchmates. He solved them better. These are the habits I see in students who do well.</p>
<h2>1. Attempt before you look</h2>
<p>Give every problem a real attempt, at least eight to ten minutes, before you look at the solution. If you look too early you learn the solution, not the method. Struggle is where the learning happens.</p>
<h2>2. Time yourself, always</h2>
<p>JEE Main gives you roughly two minutes per Mathematics question. Practise in sets of ten with a timer from the first month of Class 11. You will be slow at first; that is the point. Speed comes from repeated timed practice, not from tricks.</p>
<h2>3. Keep a mistakes notebook</h2>
<p>Every wrong answer goes into a notebook with three columns: the question, what you did, and what you should have done. Before every Sunday test, read the last month of entries. Most students make the same five or six mistakes all year; this notebook is how you stop.</p>
${figure(SA_PHOTOS.equations, "Write the full working. Shortcuts come later, once the method is automatic.")}
<h2>4. Revisit topics on a schedule</h2>
<p>Do not finish a chapter and leave it until December. Use a simple cycle:</p>
<ul>
<li>One day after the class: ten problems from the chapter.</li>
<li>One week later: ten more, timed.</li>
<li>One month later: a mixed set with older chapters.</li>
</ul>
<p>Calculus, coordinate geometry and algebra carry the most weight. Keep them warm all year.</p>
<h2>5. Learn the formula, then forget the formula sheet</h2>
<p>Our formula handbook is useful for revision, but a formula you have to look up is a formula you do not know. Derive the important ones once, by hand. Then test yourself: write every formula in a chapter from memory on a blank page.</p>
<h2>In the exam itself</h2>
<p>Practice habits only pay off if the exam is approached the same way. In the Mathematics section:</p>
<ul>
<li>Make a first pass and solve everything you can do in under two minutes. Mark the rest.</li>
<li>On the second pass, take the marked questions you have a method for.</li>
<li>Leave the questions you cannot start. Negative marking punishes guesses more than students think.</li>
<li>Keep ten minutes at the end to check the numerical-answer questions, where a slip in arithmetic costs the whole mark.</li>
</ul>
<p>We practise this pass-by-pass approach in every Sunday test, so that by the real exam it is automatic rather than a plan you try to remember under pressure.</p>
<h2>A weekly plan that works</h2>
<table>
<thead><tr><th>Day</th><th>Mathematics practice (outside class)</th></tr></thead>
<tbody>
<tr><td>Mon, Wed, Fri</td><td>20 problems from the current chapter, timed</td></tr>
<tr><td>Tue, Thu</td><td>15 problems from older chapters, mixed</td></tr>
<tr><td>Sat</td><td>Mistakes notebook review, 45 minutes</td></tr>
<tr><td>Sun</td><td>Sunday test, then analysis</td></tr>
</tbody>
</table>
<p>That is about ninety minutes a day, on top of class. It is enough, if you do it every day.</p>`,
    },
    {
        slug: "class-11-to-12-jump",
        title: "Surviving the jump from Class 11 to Class 12",
        category: "articles",
        excerpt:
            "Class 12 is two exams at once: the board and NEET or JEE. What changes, why Class 11 chapters come back to haunt you, and how to keep up.",
        daysAgo: 62,
        author: VIKRAM,
        cover: SA_PHOTOS.hero,
        body: `<p>I have taught the move from Class 11 to Class 12 for twelve years at Aarohan Academy, and it surprises students every time. The syllabus does not just get harder. The whole year changes shape.</p>
<h2>What changes</h2>
<ul>
<li><strong>Two exams at once.</strong> Your board exam is in February or March; NEET or JEE follows a few weeks later. You prepare for both from April.</li>
<li><strong>Less time.</strong> Schools finish the syllabus by November and then run pre-boards, practicals and projects. The real study year is about seven months.</li>
<li><strong>Class 11 comes back.</strong> Around half of NEET and JEE questions come from the Class 11 syllabus. Students who drifted through Class 11 feel it now.</li>
</ul>
${figure(SA_DRAWN.timetable, "A fixed weekly timetable is the backbone of the year. Ours runs Monday to Saturday.")}
<h2>The weak-chapter problem</h2>
<p>Almost every Class 12 student has three or four Class 11 chapters they never really understood. Rotational motion, thermodynamics and organic chemistry basics are the usual suspects. The mistake is to hope they will not come up. They will.</p>
<p>Make a list in April. Give each weak chapter two weekends between April and August. Our Sunday tests for Class 12 include Class 11 questions every week for exactly this reason.</p>
<h2>Balancing boards and entrance prep</h2>
<p>Students ask whether to focus on boards or on NEET/JEE. The answer is both, but differently.</p>
<ol>
<li>From April to November, prepare for the entrance exam. Concept depth here makes boards easy.</li>
<li>In December and January, give a few hours a day to board-style writing: long answers, derivations, diagrams.</li>
<li>After boards, go straight back to timed entrance papers. Do not take a two-week holiday.</li>
</ol>
<h2>Habits that carry you through</h2>
<ul>
<li>Attend every Sunday test, including the ones you feel unprepared for.</li>
<li>Revise the week's classes on Saturday evening, before the test.</li>
<li>Sleep seven hours. Late nights make you slower the next morning, every time.</li>
<li>Keep one hour a day free of the phone. Notifications are the biggest thief of Class 12 time.</li>
</ul>
<h2>The first month of Class 12</h2>
<p>April and May decide how the year goes. Students who start Class 12 strong usually stay strong; students who drift through the first month spend the rest of the year catching up. In the first month:</p>
<ul>
<li>Buy nothing new. Organise what you have: Class 11 notes, modules and test papers in one place.</li>
<li>Set a fixed daily timetable around your batch and school, and keep it for four weeks before changing anything.</li>
<li>Take the first Major Test seriously and analyse every wrong answer with your teachers.</li>
</ul>
<p>The summer break is the only long stretch of free time in Class 12. Use it to clear the Class 11 backlog, not to rest.</p>
<h2>For parents</h2>
<p>This is the year your child most needs calm at home. Watch the trend in Sunday test marks across months, not a single week. If marks fall two months running, call us and we will talk through it at the next parent–teacher meeting, or sooner.</p>
<p>Class 12 is hard, but it is also the year most students discover they can work harder than they thought. Most of ours come out of it proud.</p>`,
    },
    {
        slug: "supporting-your-child-without-pressure",
        title: "Supporting your child without adding pressure",
        category: "articles",
        excerpt:
            "A coaching director's advice to parents: what helps, what quietly hurts, and a sensible approach to phones and screen time.",
        daysAgo: 52,
        author: VIKRAM,
        cover: SA_PHOTOS.parentHelp,
        body: `<p>In twelve years of parent–teacher meetings I have learnt that almost every parent wants the same thing: for their child to do well and to be all right. The trouble is that some of what we do out of love makes the second part harder. This piece is for parents of NEET and JEE students, written as one parent to another.</p>
<h2>What quietly hurts</h2>
<ul>
<li><strong>Comparisons.</strong> "Sharma ji's son scored 650." Your child already knows where they stand. Comparisons make them hide marks, not improve them.</li>
<li><strong>Talking only about ranks.</strong> If every conversation at dinner is about tests, the house stops being a place to rest.</li>
<li><strong>Treating one bad test as a crisis.</strong> Sunday test marks go up and down. Look at three months together.</li>
<li><strong>Telling relatives the target.</strong> Every visiting aunt asking "kitna aaya?" adds weight your child carries into the exam hall.</li>
</ul>
<h2>What really helps</h2>
<ul>
<li>Regular meals and a quiet corner to study, with good light.</li>
<li>Asking "what did you learn this week?" instead of "how many marks?"</li>
<li>Coming to the monthly parent–teacher meeting, on the second Saturday, and listening to the teachers.</li>
<li>Noticing effort out loud. "You have been at the desk every evening this week" means more than you think.</li>
</ul>
${figure(SA_PHOTOS.parents, "A family that talks about more than marks is a family a student can come home to.")}
<h2>Phones and screen time</h2>
<p>Banning phones entirely rarely works; students need them for study groups, doubts and our WhatsApp updates. What works is structure agreed together:</p>
<ol>
<li>The phone stays outside the study room during study blocks.</li>
<li>No phone in the bedroom after 22:30. Buy an ordinary alarm clock.</li>
<li>Social media and games after the day's study, with a time limit both of you agree on.</li>
<li>Parents follow the same rule at dinner. Children copy what we do, not what we say.</li>
</ol>
<h2>Food, sleep and the morning batch</h2>
<p>Students in our morning batch leave home before 7:00. A proper breakfast, even a simple one like poha, an egg or a banana with milk, makes a visible difference to their concentration by 9:30. Pack a small snack for the break. In the evening, an early dinner and a fixed bedtime matter more than one extra hour of study.</p>
<p>During the board exam months, keep visitors and family functions to a minimum where you can, and explain to relatives why. Most will understand, and your child will notice that you protected their time.</p>
<h2>Signs to watch for</h2>
<p>Withdrawal from friends, not eating, trouble sleeping for weeks, or talk of being a burden are not normal exam stress. Talk to your child, talk to us, and do not hesitate to see a doctor or counsellor. No exam is worth more than your child's health.</p>
<h2>How we keep you informed</h2>
<p>We do not run a parent app or portal. Kavita Saini sends attendance and Sunday test marks on WhatsApp each week, fee invoices come by email, and we meet every month. If you are worried in between, call the front desk and ask for a time with me.</p>`,
    },
    {
        slug: "ielts-writing-task-2-tips",
        title: "IELTS Writing Task 2: a plan you can use every time",
        category: "articles",
        excerpt:
            "A four-paragraph plan, a 40-minute timetable and the mistakes that keep good writers at band 6.5. From our IELTS trainer.",
        daysAgo: 20,
        author: PRIYA,
        cover: SA_PHOTOS.notebook,
        body: `<p>Task 2 is worth twice as much as Task 1 in the IELTS Writing module, and it is where most of my students lose their band. Not because their English is weak, but because they start writing before they have decided what to say.</p>
<h2>The 40-minute timetable</h2>
<table>
<thead><tr><th>Minutes</th><th>What to do</th></tr></thead>
<tbody>
<tr><td>0–5</td><td>Read the question twice, underline the task words, decide your position, plan</td></tr>
<tr><td>5–35</td><td>Write four paragraphs, 260–290 words</td></tr>
<tr><td>35–40</td><td>Check: articles, verb tense, plurals, spelling</td></tr>
</tbody>
</table>
<h2>A four-paragraph plan</h2>
<ol>
<li><strong>Introduction (2 sentences):</strong> paraphrase the question, then state your answer clearly.</li>
<li><strong>Body 1:</strong> your main reason, explained, with one specific example.</li>
<li><strong>Body 2:</strong> a second reason, or the other side and why you disagree with it.</li>
<li><strong>Conclusion (2 sentences):</strong> restate your position in new words. No new ideas.</li>
</ol>
${figure(SA_PHOTOS.english, "Read your answer aloud in practice. If a sentence is hard to say, it is hard to read.")}
<h2>What keeps writers at band 6.5</h2>
<ul>
<li><strong>Not answering the actual question.</strong> "Discuss both views and give your opinion" has three parts. Miss one and Task Response drops.</li>
<li><strong>Memorised phrases.</strong> Examiners recognise "In this contemporary era" from a distance. Plain, accurate English scores better.</li>
<li><strong>Examples that are too general.</strong> "Many people think" is not an example. "In Jaipur, the metro has cut travel time from Mansarovar to the city centre" is.</li>
<li><strong>Articles.</strong> Indian English speakers often drop "the" and "a". Check every noun in your final five minutes.</li>
<li><strong>Long sentences.</strong> One idea per sentence is fine. Accuracy beats complexity.</li>
</ul>
<h2>A sample introduction</h2>
<p>Question: <em>Some people believe that children should start learning a foreign language at primary school. Others think it is better to wait until secondary school. Discuss both views and give your opinion.</em></p>
<blockquote>Opinions differ on whether a second language should be introduced in the early years of school or a few years later. While there are reasonable arguments for waiting, I believe that starting at primary school gives children a clear and lasting advantage.</blockquote>
<p>Notice what it does: it paraphrases the question without copying it, it mentions both views, and it states a clear position in the second sentence. The examiner knows exactly what the rest of the essay will argue. That clarity alone lifts Coherence and Cohesion.</p>
<p>Avoid starting with a dictionary definition, a quotation or a sweeping sentence about "the modern world". Get to the point in the first line.</p>
<h2>How to practise</h2>
<p>Write one Task 2 essay every two days, by hand, in 40 minutes. Then rewrite only the weakest paragraph the next morning. In our course, every essay is marked against the four band descriptors: Task Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy.</p>
<p>Simran Kaur, who scored band 8.0 this year, wrote 34 practice essays over eight weeks. Her first one was a 6. Writing improves with volume and feedback, not with tips alone, including these.</p>
<p>Our next IELTS weekend batch starts on Saturday 14 November, with classes on Saturdays and Sundays from 10:00 to 12:00.</p>`,
    },
    {
        slug: "sleep-and-exam-anxiety",
        title: "Sleep, nerves and the night before a test",
        category: "articles",
        excerpt:
            "Students who sleep seven hours score better than those who stay up. Why, and what to do when nerves keep you awake anyway.",
        daysAgo: 90,
        author: NEHA,
        cover: SA_PHOTOS.lateNight,
        body: `<p>As a Biology teacher, I find it odd that students who can explain the sleep–wake cycle in detail are the same ones studying until 2 a.m. the night before a Sunday test. So let us talk about sleep, and about nerves, practically.</p>
<h2>Why sleep is study</h2>
<p>While you sleep, the brain sorts the day's learning and stores what matters. Cut sleep short and you cut that sorting short. The result is familiar: you studied a chapter, you remember studying it, but in the test the details will not come.</p>
<p>In our own Sunday tests, students who tell us they slept seven hours or more consistently make fewer careless mistakes than those who slept five. We see it every month.</p>
<h2>A sleep routine that works for a student</h2>
<ul>
<li>A fixed time to sleep and wake, even on Sundays. For the morning batch, 22:30 to 6:00 works well.</li>
<li>No phone in the bed. Charge it in another room.</li>
<li>No tea or coffee after 17:00.</li>
<li>Stop new study 45 minutes before bed. Read your notes lightly, or nothing at all.</li>
<li>A 20-minute nap after school is fine. A two-hour one will wreck the night.</li>
</ul>
${figure(SA_PHOTOS.friends, "Time with friends is not wasted time. It is part of staying well for two years.")}
<h2>The morning batch problem</h2>
<p>Our NEET Class 11 morning batch starts at 7:00, which means waking around 6:00. A student who sleeps at midnight is running on six hours, every day, for two years. That debt shows up in the Sunday test, usually as silly mistakes in questions they knew.</p>
<p>If you are in the morning batch, move your study hours earlier rather than later: revise the morning's classes straight after school, finish problem practice by 21:30, and be in bed by 22:30. It feels like losing study time. In practice, students who make this change study less and score more within a month.</p>
<h2>When nerves keep you awake</h2>
<p>Some anxiety before a test is normal and even useful. It sharpens you. When it stops you sleeping or eating, try these:</p>
<ol>
<li><strong>Write it down.</strong> Before bed, write the three things you are worried about on paper. It moves them out of your head.</li>
<li><strong>Breathe slowly.</strong> Breathe in for four counts, hold for four, out for six. Ten rounds.</li>
<li><strong>Prepare the morning.</strong> Pack your bag, admit slip and pens the night before so there is nothing to remember.</li>
<li><strong>Talk to someone.</strong> A friend, a parent, any of us at the academy. Saying "I am scared about Physics" out loud makes it smaller.</li>
</ol>
<h2>In the exam hall</h2>
<p>If you freeze, put the pen down, take three slow breaths and go to a question you know you can do. Confidence comes back with the first correct answer.</p>
<h2>When to ask for help</h2>
<p>If you have not slept properly for more than two weeks, or anxiety is stopping you from eating or going out, please tell your parents and tell us. It is not weakness, and it is not something to push through alone.</p>`,
    },
    {
        slug: "neet-or-jee-choosing-in-class-10",
        title: "NEET or JEE? Choosing in Class 10",
        category: "articles",
        excerpt:
            "Biology or Mathematics, doctor or engineer: how to make the choice in Class 10 for the right reasons, and what to do if you are unsure.",
        daysAgo: 100,
        author: FARHAN,
        cover: SA_PHOTOS.pair,
        body: `<p>I teach Physics and Maths in our Class 9–10 Foundation programme, and every year from October onwards my students start asking each other one question: <em>PCB or PCM?</em> It is a big decision to make at fifteen. Here is how I suggest thinking about it.</p>
<h2>Start with the subjects, not the job title</h2>
<p>"Doctor" and "engineer" are what relatives ask about. But for the next two years you will live with the subjects: Biology for NEET, Mathematics for JEE. Ask yourself honestly:</p>
<ul>
<li>Do I enjoy learning and remembering a lot of detail, diagrams and processes? That is Biology.</li>
<li>Do I enjoy problems where I get stuck, think for twenty minutes and then crack it? That is JEE Mathematics.</li>
<li>Which subject do I study first when I have a free evening?</li>
</ul>
<h2>Look at your marks, carefully</h2>
<p>Class 9 and 10 marks are a useful signal, but school Maths is not JEE Maths. A student with 95 in Class 10 Maths may still find JEE problems hard, and a student with 80 may love them. Our Foundation programme's Sunday tests include Olympiad-style questions; how you feel about those tells you more than your marksheet.</p>
${figure(SA_PHOTOS.counselling, "Talk it through with someone who has seen many students make this choice.")}
<h2>Think about the road, not just the exam</h2>
<table>
<thead><tr><th></th><th>NEET (PCB)</th><th>JEE (PCM)</th></tr></thead>
<tbody>
<tr><td>Main subject</td><td>Biology, half the paper</td><td>Mathematics, a third of the paper</td></tr>
<tr><td>Study after</td><td>MBBS, five and a half years, then specialisation</td><td>B.Tech, four years</td></tr>
<tr><td>Other options</td><td>BDS, nursing, pharmacy, biotechnology, research</td><td>Science, architecture, data, design, many more</td></tr>
</tbody>
</table>
<p>Medicine is a long road with a lot of reading and responsibility early on. Engineering opens many doors but asks for comfort with mathematics. Neither is the "safe" option.</p>
<h2>Reasons that are not good reasons</h2>
<ul>
<li><strong>"My friends are taking it."</strong> Your friends will not sit your exam for you, and many will change their minds by Class 11.</li>
<li><strong>"There is more money in it."</strong> Both paths have people who earn very well and people who struggle. Interest keeps you going for two years; salary figures do not.</li>
<li><strong>"I am weak in Maths, so I will take Biology."</strong> NEET Physics is full of mathematics too. Avoiding one subject is not a reason to choose another.</li>
<li><strong>"Everyone in my family is a doctor."</strong> That is a good reason to talk to them about the work, not a reason on its own.</li>
</ul>
<h2>If you are still unsure</h2>
<ol>
<li>Sit a free demo class in each: a NEET Biology class and a JEE Maths class.</li>
<li>Book a counselling call with Kavita Saini, and bring your parents.</li>
<li>Talk to a doctor and an engineer you know about their actual day.</li>
<li>Remember that some students take PCMB in Class 11 to keep both doors open for a year. It is more work, but it is possible.</li>
</ol>
<h2>One last thing</h2>
<p>Choose for yourself. Your parents' advice matters, and so does what you enjoy. Students who chose their stream themselves are the ones I see still smiling in Class 12, even on the hard days.</p>`,
    },
    {
        slug: "ielts-speaking-test-tips",
        title: "IELTS Speaking: how to sound natural, not rehearsed",
        category: "articles",
        excerpt:
            "The Speaking test rewards real conversation. How to handle all three parts, use the one-minute preparation, and stop worrying about your accent.",
        daysAgo: 140,
        author: PRIYA,
        cover: SA_PHOTOS.english,
        body: `<p>Most students I meet are more afraid of the IELTS Speaking test than of the other three modules put together. It is eleven to fourteen minutes with an examiner, and it is the module where nerves cost the most. The good news is that it is also the one where practice pays off fastest.</p>
<h2>What the examiner is listening for</h2>
<ul>
<li><strong>Fluency and coherence:</strong> can you keep talking, and does it make sense?</li>
<li><strong>Lexical resource:</strong> do you have the words for everyday and less familiar topics?</li>
<li><strong>Grammatical range and accuracy.</strong></li>
<li><strong>Pronunciation:</strong> can you be understood easily? This is not about sounding British or American.</li>
</ul>
<p>Your Indian accent is not a problem. Clarity is what counts: clear word endings, sensible stress and not rushing.</p>
<h2>Part 1: everyday questions</h2>
<p>Questions about your home, studies, work or hobbies. Answer in two or three sentences: an answer, a reason, a small detail. "Yes, I live in Jaipur, in Malviya Nagar. I like it because everything is close, though the traffic near the bypass is terrible in the evening."</p>
<h2>Part 2: the long turn</h2>
<p>You get a topic card and one minute to prepare, then speak for up to two minutes. Use the minute well:</p>
<ol>
<li>Write four or five keywords, not sentences.</li>
<li>Choose a real memory. Real stories have details; invented ones run out after 40 seconds.</li>
<li>Follow the order on the card, then add how you felt about it.</li>
</ol>
${figure(SA_PHOTOS.groupStudy, "Practise with a partner: one speaks for two minutes, the other times and notes what was unclear.")}
<h2>Part 3: discussion</h2>
<p>Longer, more abstract questions linked to Part 2. Give an opinion, a reason, an example and, if you can, the other side. It is fine to say "That's an interesting question, I haven't thought about it before, but I'd say..." It buys you a few seconds and sounds natural.</p>
<h2>Common mistakes we hear in mock tests</h2>
<ul>
<li>Answering Part 1 questions with a single word, then waiting. Always add a reason.</li>
<li>Stopping after one minute in Part 2. Keep going until the examiner stops you; add how you felt, what you learnt or what you would do differently.</li>
<li>Speaking too fast because of nerves. Slower speech is clearer and gives you time to choose words.</li>
<li>Using "very" for everything. "Very good" can become "excellent", "very big" can become "huge".</li>
<li>Asking the examiner whether an answer was right. They will not tell you, and it breaks your flow.</li>
</ul>
<h2>Habits that raise your band</h2>
<ul>
<li>Speak English for 20 minutes every day, with anyone, about anything.</li>
<li>Record yourself answering a Part 2 card on your phone, then listen once. It is uncomfortable, and it works.</li>
<li>Learn topic vocabulary in phrases, not single words: "a tight-knit neighbourhood", "a hectic schedule".</li>
<li>Never memorise full answers. Examiners are trained to spot them and will move you on.</li>
</ul>
<p>Arjun Rathi, who scored band 7.5 this year, spent his first two weeks with us answering Part 1 questions in under five words. By week six he was telling stories. Nothing changed but practice and feedback.</p>`,
    },
];

export const SA_POSTS: readonly DemoPost[] = [...HELP, ...NEWS, ...ARTICLES];
