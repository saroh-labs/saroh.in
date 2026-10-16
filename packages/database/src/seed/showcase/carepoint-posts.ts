import type { JournalPost } from "./journal";
import { figure, photo } from "./journal";

/**
 * CarePoint Clinic's journal: Help for patients, clinic News and longer
 * Articles. General information only — every article sends readers to a
 * doctor for anything specific, and nothing promises a cure.
 */

// Photos — free-licence Unsplash, each one looked at before use.
const DOC_RED = photo(
    "photo-1532938911079-1b06ac7ceec7",
    "A doctor in a white coat with arms folded, holding a red stethoscope",
    "Online Marketing",
    "https://unsplash.com/@impulsq",
);
const LAPTOP_STETH = photo(
    "photo-1576091160550-2173dba999ef",
    "Hands typing on a laptop with a stethoscope lying beside it",
    "National Cancer Institute",
    "https://unsplash.com/@nci",
);
const DOC_TALK = photo(
    "photo-1631217868264-e5b90bb7e133",
    "A smiling doctor in a white coat talking with a patient in a clinic room",
    "National Cancer Institute",
    "https://unsplash.com/@nci",
);
const DOC_GLASSES = photo(
    "photo-1612349317150-e413f6a5b16d",
    "A young doctor with glasses and a stethoscope, arms folded",
    "Usman Yousaf",
    "https://unsplash.com/@usmanyousaf",
);
const DOC_GREY = photo(
    "photo-1612349316228-5942a9b489c2",
    "A doctor in a white coat with a stethoscope against a grey wall",
    "Usman Yousaf",
    "https://unsplash.com/@usmanyousaf",
);
const DOC_TABLET = photo(
    "photo-1631217873436-b0fa88e71f0a",
    "A doctor showing an older couple something on a tablet",
    "National Cancer Institute",
    "https://unsplash.com/@nci",
);
const RECEPTION = photo(
    "photo-1764727291644-5dcb0b1a0375",
    "An empty clinic reception desk under a Reception sign",
    "Malcolm Choong",
    "https://unsplash.com/@malcolm_choong",
);
const CONSULT_ROOM = photo(
    "photo-1778151270886-f227700b0eba",
    "A bright, empty consultation room with a desk, chairs and a computer",
    "Irshad Pathan",
    "https://unsplash.com/@alrighthospital",
);
const STETH_BLUE = photo(
    "photo-1655313719493-16ebe4906441",
    "A black stethoscope on a light blue background",
    "Etactics Inc",
    "https://unsplash.com/@etactics",
);
const STETH_YELLOW = photo(
    "photo-1655313719612-8248b2c4d1e7",
    "A black stethoscope on a yellow background",
    "Etactics Inc",
    "https://unsplash.com/@etactics",
);
const THERMO_GLASS = photo(
    "photo-1580917922805-f8f57e08c0ae",
    "Close-up of a thermometer scale reading around 37 degrees",
    "Matteo Fusco",
    "https://unsplash.com/@matteofusco",
);
const THERMO_HAND = photo(
    "photo-1594790628624-9e563bea851d",
    "A digital thermometer resting in an open palm",
    "Winel Sutanto",
    "https://unsplash.com/@weenail",
);
const THERMO_GREY = photo(
    "photo-1609725236589-d987ffc8133a",
    "A digital thermometer with a yellow tip on a grey surface",
    "Edgar Soto",
    "https://unsplash.com/@edgardo1987",
);
const THERMO_IR = photo(
    "photo-1688224821110-e0e45cb718d0",
    "A hand holding an infrared forehead thermometer showing a reading",
    "Julian Hochgesang",
    "https://unsplash.com/@julianhochgesang",
);
const MOSQ_SKIN = photo(
    "photo-1707943768453-7850f916ebde",
    "A striped mosquito on human skin",
    "National Institute of Allergy and Infectious Diseases",
    "https://unsplash.com/@niaid",
);
const RAIN_STREET = photo(
    "photo-1672850385838-77e37a588424",
    "A wet city street in the rain, with a cyclist and old buildings",
    "SAYAN Bhaskar",
    "https://unsplash.com/@sayan099",
);
const FLOOD_RICKSHAW = photo(
    "photo-1635351234600-4e0f0e2bc56b",
    "A man pushing a cycle rickshaw through a waterlogged street",
    "Dibakar Roy",
    "https://unsplash.com/@dibakar16roy",
);
const UMBRELLA_NIGHT = photo(
    "photo-1519692933481-e162a57d6721",
    "A person under an umbrella on a rainy city street at night",
    "Osman Rana",
    "https://unsplash.com/@osmanrana",
);
const SYRINGE = photo(
    "photo-1611694449252-02453c27856a",
    "Gloved hands drawing a vaccine from a vial into a syringe",
    "Mufid Majnun",
    "https://unsplash.com/@mufidpwt",
);
const INJECT_ARM = photo(
    "photo-1631941618536-2979d565b726",
    "A gloved health worker giving an injection in a person's upper arm",
    "Ed Us",
    "https://unsplash.com/@edussaurus",
);
const INJECT_BLUE = photo(
    "photo-1584515979956-d9f6e5d09982",
    "A health worker in blue gloves giving an injection in the upper arm",
    "National Cancer Institute",
    "https://unsplash.com/@nci",
);
const DRINKING = photo(
    "photo-1624948465121-96e87ae34a87",
    "A woman drinking a glass of water",
    "engin akyurt",
    "https://unsplash.com/@enginakyurt",
);
const GLASS_TABLE = photo(
    "photo-1534616042650-80f5c9b61f09",
    "A glass of water on a table in soft light",
    "manu schwendener",
    "https://unsplash.com/@manuschwendener",
);
const SUN_ORANGE = photo(
    "photo-1594315590298-329f49c8dcb9",
    "A bright white sun in an orange sky",
    "Rajiv Bajaj",
    "https://unsplash.com/@rajiv63",
);
const PAED_BABY = photo(
    "photo-1632053002928-1919605ee6f7",
    "A doctor smiling at a baby sitting on its mother's lap",
    "CDC",
    "https://unsplash.com/@cdc",
);
const PAED_HIFIVE = photo(
    "photo-1708687045030-26702e62fc65",
    "A doctor giving a young boy a high five on an examination couch",
    "Ortopediatri Çocuk Ortopedi Akademisi",
    "https://unsplash.com/@ortopediatri",
);
const PAED_EXAM = photo(
    "photo-1632052999447-e542d08d4f7d",
    "A doctor listening to a baby's chest with a stethoscope",
    "CDC",
    "https://unsplash.com/@cdc",
);
const CHILD_SLEEP = photo(
    "photo-1517912707202-5dd698d629a8",
    "A child asleep on a pillow, in black and white",
    "Annie Spratt",
    "https://unsplash.com/@anniespratt",
);
const CREAM = photo(
    "photo-1608068811588-3a67006b7489",
    "A smear of white cream on a plain white background",
    "Jocelyn Morales",
    "https://unsplash.com/@molnj",
);
const CREAM_TUBE = photo(
    "photo-1638609927040-8a7e97cd9d6a",
    "A plain white tube of cream on a white plate",
    "Birgith Roosipuu",
    "https://unsplash.com/@msbirgith",
);
const FACE_CREAM = photo(
    "photo-1728727267814-792db55ce678",
    "A smiling woman with a dab of cream on her cheek",
    "Look Studio",
    "https://unsplash.com/@lookphoto",
);
const TUBE_LAB = photo(
    "photo-1639772823849-6efbd173043c",
    "A gloved hand holding a sample tube in a laboratory",
    "Akram Huseyn",
    "https://unsplash.com/@akramhuseyn",
);
const TUBES_ROWS = photo(
    "photo-1606206591513-adbfbdd7a177",
    "Rows of blood collection tubes with coloured caps in a rack",
    "Testalize.me",
    "https://unsplash.com/@testalizeme",
);
const TUBES = photo(
    "photo-1581594693702-fbdc51b2763b",
    "Blood sample tubes with purple and red caps standing in a yellow rack",
    "National Cancer Institute",
    "https://unsplash.com/@nci",
);
const BP_DIGITAL = photo(
    "photo-1615486511484-92e172cc4fe0",
    "A digital blood pressure monitor and its cuff on an arm",
    "Mockup Graphics",
    "https://unsplash.com/@mockupgraphics",
);
const BP_MANUAL = photo(
    "photo-1631815587646-b85a1bb027e1",
    "A health worker checking a patient's blood pressure with a cuff and gauge",
    "CDC",
    "https://unsplash.com/@cdc",
);
const GLUCO_FINGER = photo(
    "photo-1685485276223-0bb0226dcca8",
    "A person pricking a fingertip with a lancet beside a glucose meter",
    "isens usa",
    "https://unsplash.com/@isensusa",
);
const GLUCO = photo(
    "photo-1685485276219-cbdf9309be1a",
    "Hands preparing a blood sugar test with a glucose meter and test strip",
    "isens usa",
    "https://unsplash.com/@isensusa",
);
const PILLS_HAND = photo(
    "photo-1563213126-a4273aed2016",
    "A hand taking a tablet from a weekly pill organiser",
    "Laurynas Me",
    "https://unsplash.com/@laurynasm",
);
const PILLS_WEEK = photo(
    "photo-1666887360688-4f16bbe23947",
    "A weekly pill organiser on a wooden table",
    "Nappy",
    "https://unsplash.com/@nappystudio",
);
const SLEEP = photo(
    "photo-1531353826977-0941b4779a1c",
    "A woman asleep under blankets in soft morning light",
    "Greg Pappas",
    "https://unsplash.com/@vagabondage",
);
const SLEEP_MASK = photo(
    "photo-1666934209818-cd6a6d08bd8d",
    "A woman asleep in bed wearing an eye mask",
    "Dmitry Ganin",
    "https://unsplash.com/@ganinph",
);
const BED = photo(
    "photo-1564019472231-4586c552dc27",
    "White pillows and a rumpled duvet on a bed",
    "Priscilla Du Preez",
    "https://unsplash.com/@priscilladupreez",
);
const SMOG = photo(
    "photo-1532300481631-0bc14f3b7699",
    "High-rise buildings seen from above in thick haze",
    "Photoholgic",
    "https://unsplash.com/@photoholgic",
);
const COUGH_SHAWL = photo(
    "photo-1626697556342-2310dbc55428",
    "A man wrapped in a shawl coughing into his hand",
    "Towfiqu barbhuiya",
    "https://unsplash.com/@towfiqu999999",
);
const DOC_PHONE_LAPTOP = photo(
    "photo-1758691462848-31a39258dbd8",
    "A doctor on the phone while working at a laptop",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const DOC_PHONE = photo(
    "photo-1758691463607-c1220b77aaaa",
    "A doctor at his desk talking on the phone",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const VIDEO = photo(
    "photo-1758691463620-188ca7c1a04f",
    "A doctor on a video call with a patient shown on his computer screen",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const CALENDAR = photo(
    "photo-1633526543814-9718c8922b7a",
    "A calendar with red pins marking several dates",
    "Towfiqu barbhuiya",
    "https://unsplash.com/@towfiqu999999",
);
const PLANNER = photo(
    "photo-1435527173128-983b87201f4d",
    "An open monthly planner on a desk",
    "Eric Rothermel",
    "https://unsplash.com/@erothermel",
);
const DESK_CAL = photo(
    "photo-1611988615248-5d4f0b9ac31e",
    "A small white desk calendar showing the 1st",
    "Kyrie kim",
    "https://unsplash.com/@kyrie3",
);
const ON_PHONE = photo(
    "photo-1516055619834-586f8c75d1de",
    "A man talking on his phone in bright light",
    "Hassan OUAJBIR",
    "https://unsplash.com/@hazardos",
);
const TWO_WHEELERS = photo(
    "photo-1657821324132-eec6e5355104",
    "Scooters and motorcycles parked along a busy city street",
    "Prayag Tejwani",
    "https://unsplash.com/@prayagtejwani",
);
const STREET_ABOVE = photo(
    "photo-1630202450315-36c89112f503",
    "A tree-lined city street with taxis and cars, seen from above",
    "Harsh Aryan",
    "https://unsplash.com/@harsh_aryan",
);
const DIYAS = photo(
    "photo-1577083753695-e010191bacb5",
    "Lit clay diyas on a tray scattered with flower petals",
    "Udayaditya Barua",
    "https://unsplash.com/@nookscribe",
);
const DIYA_ONE = photo(
    "photo-1605302977545-3a09913be1dd",
    "A single lit clay diya against a dark background",
    "Jyoti Singh",
    "https://unsplash.com/@econut",
);
const NURSE = photo(
    "photo-1584432810601-6c7f27d2362b",
    "A nurse in uniform with a stethoscope, hands clasped",
    "JESHOOTS.COM",
    "https://unsplash.com/@jeshoots",
);
const TENDER = photo(
    "photo-1617611140379-0e0ec17cc45f",
    "A tender coconut with a straw on a wooden table",
    "Xiaoyu Li",
    "https://unsplash.com/@xiaoyulifish",
);
const ECG = photo(
    "photo-1682706841281-f723c5bfcd83",
    "ECG traces running across a monitor screen",
    "Joshua Chehov",
    "https://unsplash.com/@joshua_chehov",
);
const HANDS_WATER = photo(
    "photo-1574482620811-1aa16ffe3c82",
    "Hands held under a stream of running water",
    "Nathan Dumlao",
    "https://unsplash.com/@nate_dumlao",
);
const HANDWASH = photo(
    "photo-1591610160225-861405867ba3",
    "Soapy hands being washed at a steel sink",
    "Sean Horsburgh",
    "https://unsplash.com/@seanhorsburgh",
);
const READ_PAPER = photo(
    "photo-1625980344922-a4df108b2bd0",
    "Hands holding a printed sheet of paper beside a phone",
    "Chanhee Lee",
    "https://unsplash.com/@jjik_da",
);
const RECEIPT = photo(
    "photo-1723725776967-78606a070730",
    "A hand holding a printed receipt",
    "Kayven",
    "https://unsplash.com/@shotbykayven",
);
const CITY_DUSK = photo(
    "photo-1596176530529-78163a4f7af2",
    "A city at dusk seen from above, with its lights coming on",
    "satyaprakash kumawat",
    "https://unsplash.com/@sprakashk",
);
const VACCINE_MASK = photo(
    "photo-1612277795421-9bc7706a4a34",
    "A health worker giving a vaccine to a young man wearing a mask",
    "CDC",
    "https://unsplash.com/@cdc",
);
const PLASTER = photo(
    "photo-1691139600731-7232eaa980c3",
    "A health worker putting a plaster on a woman's upper arm after an injection",
    "CDC",
    "https://unsplash.com/@cdc",
);
const MASK = photo(
    "photo-1597440658768-f3ffdf64223c",
    "A disposable face mask on a pale blue background",
    "Pam Mene",
    "https://unsplash.com/@pamslens",
);
const NOTEBOOK = photo(
    "photo-1511871893393-82e9c16b81e3",
    "An open diary with a pencil lying across it",
    "JESHOOTS.COM",
    "https://unsplash.com/@jeshoots",
);

export const CAREPOINT_POSTS: readonly JournalPost[] = [
    // ── Help ────────────────────────────────────────────────────────────
    {
        slug: "how-to-book-a-consultation",
        title: "How to book a consultation",
        category: "help",
        excerpt:
            "Pick a doctor and a time on the booking page, or call the desk. Here is what happens after you press Book.",
        cover: CONSULT_ROOM,
        daysAgo: 168,
        body: `
<p>Most patients book online, and it takes about a minute. If you would rather speak to someone, Pooja and the front desk team answer the phone through clinic hours.</p>
<h2>Booking online</h2>
<ol>
<li>Open the <a href="/appointments">booking page</a> on this site.</li>
<li>Choose the appointment you need — a general consultation, paediatrics, dermatology, a teleconsultation, the annual health check or a follow-up.</li>
<li>Pick a day and a time that is shown as free. Times that are already taken simply do not appear.</li>
<li>Enter your name, phone number and email. If you are booking for someone else, put <em>their</em> name, so the doctor greets the right person.</li>
<li>Pay now, or choose to pay at the desk after your visit.</li>
</ol>
<p>You will get a confirmation email straight away, and a reminder the day before.</p>
${figure(CALENDAR, "A booked time is held for you — no queue on the day")}
<h2>Booking by phone</h2>
<p>Call the desk and tell us who the appointment is for, what it is about in a word or two, and which days suit you. We will read out the free times and book one while you are on the line. The same confirmation email follows.</p>
<h2>On the day</h2>
<p>Please arrive ten minutes early so the desk can check you in. If you are running late, call us — we will do our best, but a fifteen-minute consultation that starts late can push everyone after you.</p>
<p><strong>Not for emergencies.</strong> If someone has chest pain, trouble breathing, a seizure or a serious injury, call 108 or go to the nearest emergency department. Do not wait for an appointment.</p>
`,
    },
    {
        slug: "choosing-the-right-doctor",
        title: "Which doctor should I book?",
        category: "help",
        excerpt:
            "A quick guide to our three doctors and the appointment that fits what you need.",
        cover: DOC_TALK,
        daysAgo: 152,
        body: `
<p>If you are not sure, book a general consultation. Dr. Meera Nair sees adults for anything new and will refer you on, inside or outside the clinic, if someone else should take a look.</p>
<h2>Dr. Meera Nair — general physician</h2>
<p>Fever, coughs and colds, stomach upsets, aches and pains, blood pressure, sugar, thyroid, and anything you cannot quite name. Weekday and Saturday mornings, and weekday evenings. A general consultation is fifteen minutes and costs ₹600.</p>
<h2>Dr. Arjun Rao — paediatrics</h2>
<p>Babies, children and teenagers: illnesses, growth checks and vaccination schedules. Monday, Wednesday and Friday mornings, and Saturday mornings. Twenty minutes, ₹800.</p>
<h2>Dr. Sara Thomas — dermatology</h2>
<p>Skin, hair and nails: rashes, acne, eczema, fungal infections, hair fall, moles you want looked at. Tuesday and Thursday evenings and Saturday mornings. Twenty minutes, ₹900. Bring any creams or lotions you are using.</p>
${figure(DOC_GLASSES, "If in doubt, start with a general consultation")}
<h2>Other appointments</h2>
<ul>
<li><strong>Teleconsultation</strong> (₹500) — a video call for a follow-up or a question that does not need an examination.</li>
<li><strong>Follow-up visit</strong> (₹300) — ten minutes to review results or a treatment, within two weeks of a consultation.</li>
<li><strong>Annual health check</strong> (₹3,500) — an hour in the morning, with blood tests, an ECG and a doctor to go through it all.</li>
</ul>
<p>Still unsure? Send a message from the <a href="/contact">contact page</a> or call the desk, and we will point you to the right appointment.</p>
`,
    },
    {
        slug: "paying-and-getting-your-bill",
        title: "Paying for your visit and getting your bill",
        category: "help",
        excerpt:
            "Pay online when you book or at the desk after your visit. Either way, a bill comes to your email.",
        cover: RECEIPT,
        daysAgo: 124,
        body: `
<p>You can pay in whichever way suits you. Nothing changes about your appointment either way.</p>
<h2>Two ways to pay</h2>
<ul>
<li><strong>Online, when you book.</strong> Pay by UPI or card on the booking page. Your appointment is confirmed and paid in one step.</li>
<li><strong>At the desk, after your visit.</strong> Pay by UPI, card or cash once you have seen the doctor.</li>
</ul>
<h2>Your bill</h2>
<p>Every visit gets a bill, sent to the email address you booked with. It shows the appointment, the doctor, the date and what you paid. Keep it for your records or an insurance claim.</p>
${figure(READ_PAPER, "Your bill arrives by email after every visit")}
<h2>Questions we get asked</h2>
<h3>Is there GST on a consultation?</h3>
<p>No. Healthcare consultations carry no GST, so the price you see is the price you pay.</p>
<h3>Can I get a bill in someone else's name?</h3>
<p>The bill is made out to the patient. If a family member paid, tell the desk and we can note it.</p>
<h3>I cannot find the email.</h3>
<p>Check your spam or promotions folder first. You can also sign in to your account on this site, where every bill is listed. If it is still missing, the desk will resend it.</p>
<h3>Do you do cashless insurance?</h3>
<p>Not at present. Pay as usual and claim from your insurer with the bill; ask your insurer what else they need from you.</p>
`,
    },
    {
        slug: "what-your-patient-account-shows",
        title: "What your patient account shows",
        category: "help",
        excerpt:
            "Sign in with your email to see your upcoming visits, past visits and bills. Here is what is there — and what is not.",
        cover: LAPTOP_STETH,
        daysAgo: 98,
        body: `
<p>Every patient who books with an email address has an account on this site. There is no password to remember: you sign in with your email and a code we send to it.</p>
<h2>What you will find</h2>
<ul>
<li><strong>Upcoming visits</strong> — the date, time, doctor and appointment type, with options to reschedule or cancel.</li>
<li><strong>Past visits</strong> — a simple list of when you came in and whom you saw.</li>
<li><strong>Bills</strong> — every bill we have sent you, to open or download again.</li>
<li><strong>Teleconsultation links</strong> — for a video appointment, the link sits with the booking.</li>
</ul>
${figure(PLANNER, "Your visits, past and upcoming, in one place")}
<h2>What you will not find</h2>
<p>We do not put medical reports, test results or prescriptions online. They are handed to you at your visit, on paper, and the doctor goes through them with you. If you need a copy of a report, ask the desk and we will print one for you to collect.</p>
<p>This is deliberate. Results make the most sense with a doctor beside you, and we would rather you did not read a worrying number alone at midnight.</p>
<h2>Family members</h2>
<p>If you book for a child or a parent with your own email, their visits and bills show in your account. If an adult family member would like their own account, book their next visit with their email address.</p>
`,
    },
    {
        slug: "rescheduling-or-cancelling",
        title: "Rescheduling or cancelling an appointment",
        category: "help",
        excerpt:
            "Plans change. You can move or cancel a visit from your confirmation email or your account — free up to a few hours before.",
        cover: DESK_CAL,
        daysAgo: 82,
        body: `
<p>If you cannot make it, please tell us. Someone else on the waiting list is usually glad of the time.</p>
<h2>From your confirmation email</h2>
<p>Every confirmation email has two links at the bottom: <em>Reschedule</em> and <em>Cancel</em>. Reschedule shows the free times for the same appointment; pick one and you are done. Cancel asks you to confirm once.</p>
<h2>From your account</h2>
<p>Sign in on this site with your email. Your upcoming visits are listed first, each with the same two options.</p>
${figure(ON_PHONE, "Or simply call the desk")}
<h2>By phone</h2>
<p>Call the desk and we will move or cancel it for you while you are on the line.</p>
<h2>Is there a charge?</h2>
<p>Cancelling or rescheduling is free up to a few hours before your appointment; the exact cut-off is shown in your confirmation email. If you paid online and cancel in time, the money goes back to the card or UPI account you paid from. Banks usually take five to seven working days to show it.</p>
<p>If something comes up at the last minute — a sick child, a flooded road in the monsoon — call us anyway. We understand.</p>
`,
    },
    {
        slug: "preparing-for-your-annual-health-check",
        title: "Preparing for your annual health check",
        category: "help",
        excerpt:
            "Come fasting, bring your medicines list, and leave an hour free. A short checklist for the morning.",
        cover: TUBES_ROWS,
        daysAgo: 63,
        body: `
<p>The annual health check runs between 7:30 and 9:30 in the morning and takes about an hour. It includes blood tests, an ECG and time with a doctor to go through the results.</p>
<h2>The night before</h2>
<ul>
<li>Have a light, ordinary dinner. Skip the late-night biryani if you can.</li>
<li>Do not eat or drink anything except plain water after dinner. Most fasting blood tests need around ten to twelve hours without food; your confirmation email gives the exact time.</li>
<li>Avoid alcohol the day before.</li>
</ul>
<h2>On the morning</h2>
<ul>
<li>Plain water is fine, and helps the blood test go smoothly. No tea, coffee, milk or juice until after the sample.</li>
<li><strong>Medicines:</strong> ask your doctor in advance whether to take your usual morning medicines before the test. If you take medicine for diabetes, do not skip food or medicine without asking — that can cause low sugar.</li>
<li>Wear a top with sleeves that roll up easily.</li>
<li>Bring a snack for after the blood test. Many people bring idli or a banana.</li>
</ul>
${figure(GLASS_TABLE, "Plain water is fine on the morning of the test")}
<h2>What to bring</h2>
<p>Your list of medicines, any reports from the last year or two, and your glasses if you need them to read.</p>
<p>If you feel unwell on the morning — a fever, a bad stomach — call the desk and move the check to another day. Results are more useful when you are well.</p>
`,
    },
    {
        slug: "what-to-bring-to-your-visit",
        title: "What to bring to your visit",
        category: "help",
        excerpt:
            "Fifteen minutes goes further when the doctor has the full picture. A short list of what helps.",
        cover: PILLS_HAND,
        daysAgo: 142,
        body: `
<p>A consultation is short, so it helps to come prepared. You do not need everything on this list — just what applies to you.</p>
<h2>Bring</h2>
<ul>
<li><strong>Your medicines</strong>, or a photo of the strips. Include anything you take regularly: tablets, inhalers, vitamins, ayurvedic or homeopathic remedies.</li>
<li><strong>Recent reports</strong> — blood tests, scans, discharge summaries — especially from another clinic or hospital.</li>
<li><strong>A short note</strong> of what is bothering you, when it started, and what makes it better or worse. It is easy to forget something once you sit down.</li>
<li><strong>Your temperature or sugar readings</strong>, if you have been checking at home.</li>
<li><strong>For a skin visit</strong>, the creams and lotions you are using.</li>
<li><strong>For a child</strong>, the vaccination card.</li>
</ul>
${figure(NOTEBOOK, "A few lines written down before you come in")}
<h2>Leave at home</h2>
<p>Large bags if you can, and any worry that your question is too small. Doctors would rather hear about it.</p>
<h2>Someone with you?</h2>
<p>You are welcome to bring a family member or friend into the room. For older parents, a second pair of ears helps — they can take notes while you talk.</p>
`,
    },
    {
        slug: "teleconsultation-how-to",
        title: "How a teleconsultation works",
        category: "help",
        excerpt:
            "A fifteen-minute video call with a doctor, for follow-ups and questions that do not need an examination.",
        cover: VIDEO,
        daysAgo: 112,
        body: `
<p>A teleconsultation is a video call with one of our doctors. It costs ₹500 and suits follow-ups, questions about a treatment, or going over how you are getting on. It is not suitable for anything that needs an examination, and never for an emergency.</p>
<h2>Before the call</h2>
<ol>
<li>Book a teleconsultation on the <a href="/appointments">booking page</a>. The video link comes in your confirmation email and sits with the booking in your account.</li>
<li>Use a phone or laptop with a camera, in a quiet, well-lit spot. Sit facing a window rather than with it behind you.</li>
<li>Test the link a few minutes early. It opens in the browser; there is nothing to install.</li>
<li>Keep your medicines, recent reports and a pen nearby.</li>
</ol>
${figure(DOC_PHONE_LAPTOP, "The doctor joins at your booked time")}
<h2>During the call</h2>
<p>The doctor joins at your booked time. If the line drops, open the link again; if it will not reconnect, the doctor will call your phone number.</p>
<h2>After the call</h2>
<p>If the doctor needs to see you in person, they will tell you, and the desk can book the visit. Any prescription or written advice is arranged with the desk; we do not post it online.</p>
<p><strong>Book an in-person visit instead</strong> if you have a high fever that will not come down, chest pain, breathlessness, a new lump, or anything the doctor would need to see or touch.</p>
`,
    },
    {
        slug: "bringing-your-child",
        title: "Bringing your child to the clinic",
        category: "help",
        excerpt:
            "Dr. Arjun Rao's appointments are twenty minutes, so there is time for questions. A few tips for a calmer visit.",
        cover: PAED_BABY,
        daysAgo: 72,
        body: `
<p>Paediatric appointments with Dr. Arjun Rao are twenty minutes and cost ₹800. He sees children on Monday, Wednesday and Friday mornings, and Saturday mornings.</p>
<h2>Before you come</h2>
<ul>
<li>Book in the child's name, not yours, so the record is right.</li>
<li>Bring the vaccination card, and any medicines the child is taking.</li>
<li>Note the temperature readings and times if they have had a fever.</li>
<li>For a baby, bring a spare nappy, a change of clothes and a feed.</li>
</ul>
${figure(PAED_EXAM, "Dr. Rao takes his time with the little ones")}
<h2>In the room</h2>
<p>Most children are calmer on a parent's lap. Dress them in something easy to open at the front. Older children often like to be asked the questions themselves — let them answer first, then add what they leave out.</p>
<h2>Vaccinations</h2>
<p>If your child is due for a vaccine, mention it when you book. Dr. Rao will check the card and talk you through what is due; ask him which vaccines your child needs and when.</p>
<h2>Come straight away, do not wait for an appointment</h2>
<p>Call 108 or go to an emergency department if your child is struggling to breathe, is unusually drowsy or hard to wake, has a fit, has a rash that does not fade when you press a glass against it, or a baby under three months has a fever.</p>
`,
    },
    {
        slug: "follow-up-visits",
        title: "Follow-up visits within two weeks",
        category: "help",
        excerpt:
            "A ten-minute visit for ₹300 to go over results or see how a treatment is working.",
        cover: STETH_BLUE,
        daysAgo: 38,
        body: `
<p>After a consultation, the doctor sometimes asks you to come back: to look at a blood test, to check that a treatment is working, or to see whether a cough has settled. That is what the follow-up visit is for.</p>
<h2>How it works</h2>
<ul>
<li>Ten minutes, ₹300.</li>
<li>Within two weeks of your consultation, with the same doctor.</li>
<li>Weekdays between 12 noon and 1pm, or as a teleconsultation if an examination is not needed.</li>
</ul>
${figure(DOC_TABLET, "Bring any results so the doctor can go through them with you")}
<h2>When it is not a follow-up</h2>
<p>If it has been more than two weeks, or you have a new problem, book a regular consultation instead. Ten minutes is enough to review one thing properly, not to start on something new.</p>
<h2>Bring</h2>
<p>Your test results, the medicines you were given (and whether you have been taking them), and a note of how things have changed since your visit.</p>
<p>If you get worse before your follow-up is due, do not wait for it. Call the desk, or for anything urgent, call 108.</p>
`,
    },

    // ── News ────────────────────────────────────────────────────────────
    {
        slug: "weekday-evenings-now-until-830",
        title: "Weekday evenings now open until 8:30pm",
        category: "news",
        excerpt:
            "From Monday 5 October, general consultations run until 8:30pm on weekdays.",
        cover: CITY_DUSK,
        daysAgo: 21,
        body: `
<p>Many of you have told us that 8pm is too early once you have fought your way home through Bengaluru traffic. So from <strong>Monday 5 October</strong>, weekday evening consultations with Dr. Meera Nair run until <strong>8:30pm</strong>.</p>
<p>The last appointment you can book is at 8:15pm. Morning hours and Saturdays stay as they are.</p>
${figure(DOC_PHONE, "The desk stays open until the last patient leaves")}
<p>The front desk stays until the last patient has paid and left, so you can settle your bill at the desk as usual. The new times are already showing on the <a href="/appointments">booking page</a>.</p>
<p>Evening slots open on the booking page two weeks ahead, like every other slot. If you need a later time for a follow-up, ask the desk.</p>
`,
    },
    {
        slug: "saturday-dermatology-clinic",
        title: "Saturday morning dermatology clinic",
        category: "news",
        excerpt:
            "Dr. Sara Thomas now sees patients on Saturday mornings, from 9am to 12 noon.",
        cover: FACE_CREAM,
        daysAgo: 42,
        body: `
<p>Skin appointments have been the hardest to get, with only two evenings a week. From <strong>Saturday 12 September</strong>, Dr. Sara Thomas also sees patients on <strong>Saturday mornings, 9am to 12 noon</strong>.</p>
<p>Appointments are twenty minutes and cost ₹900, the same as on weekday evenings.</p>
${figure(CREAM_TUBE, "Bring the creams you are using to your appointment")}
<p>A reminder for skin visits: bring every cream, lotion and face wash you are using, even the ones you have stopped. If a rash comes and goes, a clear photo on your phone from a bad day helps.</p>
<p>Book on the <a href="/appointments">booking page</a> or call the desk.</p>
<p>Saturday slots fill quickly, so book a week or two ahead if you can. Bring any creams or medicines you are using to the appointment.</p>
`,
    },
    {
        slug: "flu-shot-season",
        title: "Flu vaccines are in for the season",
        category: "news",
        excerpt:
            "This season's flu vaccine has arrived. Ask your doctor whether it is right for you.",
        cover: VACCINE_MASK,
        daysAgo: 12,
        body: `
<p>This season's flu vaccine has arrived at the clinic.</p>
<p>Flu is not the same as a common cold. It can knock a healthy adult off their feet for a week, and it is harder on older people, pregnant women, young children and anyone with a long-term condition such as diabetes, asthma or heart disease.</p>
${figure(PLASTER, "A quick visit, and a plaster for the arm")}
<h2>How to get it</h2>
<ul>
<li>Book a general consultation with Dr. Meera Nair, or for children, a paediatrics appointment with Dr. Arjun Rao.</li>
<li>Mention the flu vaccine when you book, so we keep a dose aside.</li>
<li>The doctor will check whether it suits you, and the vaccine is billed separately; the desk can tell you the cost.</li>
</ul>
<p>Not sure whether you need it? Ask your doctor at your next visit. If you have had a reaction to a vaccine before, tell us when you book.</p>
`,
    },
    {
        slug: "monsoon-fever-clinic",
        title: "Monsoon fever clinic: extra morning slots",
        category: "news",
        excerpt:
            "From 1 July to 30 September, we are adding early slots for fevers every weekday.",
        cover: UMBRELLA_NIGHT,
        daysAgo: 116,
        body: `
<p>Every monsoon, the number of people coming in with fever goes up sharply — dengue, viral fevers, typhoid and more. To keep waits short, we are running a <strong>monsoon fever clinic</strong> from <strong>1 July to 30 September</strong>.</p>
<ul>
<li>Extra fifteen-minute slots with Dr. Meera Nair, weekdays from 8am to 9am.</li>
<li>Book them as a general consultation (₹600) on the booking page.</li>
<li>If the doctor asks for a blood test, the sample can usually be taken the same morning.</li>
</ul>
${figure(THERMO_IR, "Note your readings and the times before you come in")}
<p>Please bring a note of your temperature readings and any medicines you have taken. Do not wait at home with a fever that has lasted more than two or three days — come in.</p>
<p>For severe stomach pain, bleeding gums, vomiting that will not stop, or fainting, go to an emergency department or call 108.</p>
`,
    },
    {
        slug: "diwali-holiday-hours",
        title: "Diwali holiday hours",
        category: "news",
        excerpt:
            "The clinic keeps shorter hours around Diwali. Here are the dates.",
        cover: DIYAS,
        daysAgo: 4,
        featured: true,
        body: `
<p>Wishing all our patients a happy and safe Diwali. The clinic keeps shorter hours over the festival:</p>
<ul>
<li><strong>Saturday 7 November</strong> — morning only, 9am to 1pm.</li>
<li><strong>Sunday 8 November (Diwali)</strong> — closed, as on every Sunday.</li>
<li><strong>Monday 9 November</strong> — general consultations 9am to 1pm only. No paediatrics, dermatology or health checks.</li>
<li><strong>Tuesday 10 November</strong> — back to normal hours.</li>
</ul>
${figure(DIYA_ONE, "A safe and happy Diwali from all of us")}
<p>A gentle reminder from Dr. Meera Nair: keep burns cream and clean water to hand, keep children well back from crackers, and if smoke sets off your asthma, stay indoors with the windows shut. For a burn larger than your palm, a burn on the face, or any eye injury, go straight to an emergency department or call 108.</p>
`,
    },
    {
        slug: "new-check-in-at-the-desk",
        title: "A new nurse, and a quicker check-in",
        category: "news",
        excerpt:
            "Sister Anita D'Souza has joined us, and your blood pressure and weight are now taken before you see the doctor.",
        cover: NURSE,
        daysAgo: 31,
        body: `
<p>We are glad to welcome <strong>Sister Anita D'Souza</strong>, who joins CarePoint as our clinic nurse after eleven years on hospital wards in Bengaluru.</p>
<h2>What changes for you</h2>
<p>When you arrive, Pooja at the desk checks you in as before. Then, before you go in to the doctor, Sister Anita takes your blood pressure, pulse, temperature and weight. It takes a few minutes and means the doctor can spend your consultation on what you came in for.</p>
${figure(RECEPTION, "Check in at the desk, then a quick check with Sister Anita")}
<p>That is why we ask you to arrive ten minutes before your time. If you are running late, call the desk and we will fit the checks in where we can.</p>
`,
    },
    {
        slug: "annual-health-check-now-includes-review",
        title: "The annual health check now includes a review visit",
        category: "news",
        excerpt:
            "A follow-up visit within two weeks is now part of the health check, at no extra cost.",
        cover: ECG,
        daysAgo: 25,
        body: `
<p>Some test results come back after you have gone home, and some questions only occur to you a few days later. So the <strong>annual health check</strong> (₹3,500) now includes a <strong>follow-up visit within two weeks</strong> with the same doctor, at no extra cost.</p>
<p>Use it to go over any results that came in later, to talk through changes to your diet or exercise, or to ask the questions you thought of on the way home. Book it as a follow-up visit and tell the desk it is part of your health check.</p>
${figure(BP_DIGITAL, "Blood pressure is part of every health check")}
<p>Everything else stays the same: blood tests, an ECG, and time with a doctor on the morning. Your reports are handed to you on paper, and the doctor goes through them with you.</p>
`,
    },
    {
        slug: "more-teleconsultation-slots",
        title: "Evening teleconsultation slots added",
        category: "news",
        excerpt:
            "Video appointments are now also available on weekday evenings, from 19 October.",
        cover: DOC_GREY,
        daysAgo: 15,
        body: `
<p>Teleconsultations have been popular for follow-ups, but the afternoon slots do not suit everyone at work. From <strong>Monday 19 October</strong>, we are adding teleconsultations on <strong>weekday evenings from 7:30pm to 8:30pm</strong>, alongside the existing afternoon slots.</p>
<ul>
<li>Fifteen minutes on video, ₹500.</li>
<li>The link comes in your confirmation email.</li>
<li>Best for follow-ups and questions that do not need an examination.</li>
</ul>
${figure(STETH_YELLOW, "Some things still need a visit in person")}
<p>If you are not sure whether video will do, book it anyway — the doctor will tell you on the call if they need to see you in person, and the desk will book that visit.</p>
<p>A teleconsultation is not for emergencies. If you have severe symptoms, go to the nearest emergency department or call 108.</p>
`,
    },
    {
        slug: "parking-near-the-clinic",
        title: "Getting here: parking in Malleshwaram",
        category: "news",
        excerpt:
            "Street parking around 5th Cross is hard to find. Here is what works best for our patients.",
        cover: TWO_WHEELERS,
        daysAgo: 52,
        body: `
<p>Parking near the clinic has become harder since the footpath works on Sampige Road began. A few things that help:</p>
<ul>
<li><strong>Drop off at the gate.</strong> Drivers can stop briefly at the clinic gate to let a patient out. The desk can bring a wheelchair down — call ahead.</li>
<li><strong>Pay-and-park.</strong> The paid parking nearby usually has space before 10am and after 6pm.</li>
<li><strong>Metro.</strong> Mantri Square Sampige Road station is a short walk away, and is often quicker than driving in the evening.</li>
<li><strong>Two-wheelers</strong> can park in the marked bay to the side of the building.</li>
</ul>
${figure(STREET_ABOVE, "Leave a little extra time in the evening rush")}
<p>If you are bringing an older parent or someone who finds walking hard, tell us when you book. We will make sure someone is at the gate to help.</p>
`,
    },

    // ── Articles ────────────────────────────────────────────────────────
    {
        slug: "when-to-see-a-doctor-for-a-fever",
        title: "When to see a doctor for a fever",
        category: "articles",
        excerpt:
            "Most fevers settle on their own. Some need a doctor the same day. How to tell the difference.",
        cover: THERMO_HAND,
        daysAgo: 46,
        featured: true,
        body: `
<p>A fever is not an illness in itself. It is the body raising its temperature, usually because it is fighting an infection. Most fevers in adults are caused by viruses and settle within a few days with rest and fluids. But in Bengaluru, especially through the monsoon and the months after it, a fever can also be the first sign of dengue, malaria or typhoid — and those need a doctor.</p>
<p>This article is general information. It cannot replace an examination, and if you are worried, the right answer is always to call a doctor.</p>
<h2>What counts as a fever</h2>
<p>For most adults, a temperature of 100.4°F (38°C) or more, measured with a thermometer, is a fever. Feeling hot to the touch is not reliable. A digital thermometer under the tongue or in the armpit is cheap and good enough for home use; wait a few minutes after a hot drink before measuring.</p>
${figure(THERMO_GLASS, "Write down each reading and the time you took it")}
<h2>Looking after a mild fever at home</h2>
<ul>
<li>Rest, and do not push through a workday if you can avoid it.</li>
<li>Drink plenty: water, buttermilk, tender coconut water, clear soups, rice kanji.</li>
<li>Wear light clothes and keep the room comfortable. Heavy blankets trap heat.</li>
<li>Take fever medicine only as your doctor advises, and read the label for the maximum dose. Do not combine several cold-and-flu products, which often contain the same medicine.</li>
<li>Note your temperature morning and evening.</li>
</ul>
<h2>See a doctor within a day or two if</h2>
<ul>
<li>The fever lasts more than two or three days.</li>
<li>It keeps coming back, or comes with shivering and chills at set times.</li>
<li>You have a bad headache, pain behind the eyes, or severe body and joint aches — common in dengue.</li>
<li>You have a burning feeling when passing urine, a painful ear or sinus, or a cough with coloured phlegm.</li>
<li>You have diabetes, a heart or kidney condition, are pregnant, are over 65, or take medicine that lowers immunity.</li>
<li>You have travelled recently, or been wading through floodwater.</li>
</ul>
${figure(DOC_RED, "A doctor can examine you and decide whether tests are needed")}
<h2>Go to an emergency department or call 108 if</h2>
<ul>
<li>You feel confused, very drowsy or hard to wake.</li>
<li>You have a stiff neck, or a rash that does not fade when pressed with a glass.</li>
<li>You are breathless, or have chest pain.</li>
<li>You are vomiting repeatedly and cannot keep fluids down.</li>
<li>You have bleeding gums or nose, black stools, or severe stomach pain — warning signs in dengue, often a day or two after the fever drops.</li>
<li>You have had a fit.</li>
</ul>
<h2>Why not just take an antibiotic?</h2>
<p>Most fevers are viral, and antibiotics do nothing for viruses. Taking them "just in case" can hide the signs a doctor needs, cause side effects, and add to antibiotic resistance. Please do not use leftover tablets from a previous illness or a neighbour's prescription.</p>
<blockquote>"The single most useful thing a patient can bring me is a list of temperatures with times. It tells me more than 'I had fever since Tuesday'." — Dr. Meera Nair</blockquote>
<h2>When you come in</h2>
<p>Bring your readings, the medicines you have taken and when, and a note of any other symptoms. The doctor may examine you and ask for a blood test; for many fevers that is a simple sample taken the same morning.</p>
`,
    },
    {
        slug: "monsoon-infections-what-to-watch-for",
        title: "Monsoon infections: what to watch for",
        category: "articles",
        excerpt:
            "Dengue, malaria, typhoid and leptospirosis all rise with the rains. The signs, simple prevention, and when to come in.",
        cover: FLOOD_RICKSHAW,
        daysAgo: 102,
        featured: true,
        body: `
<p>Bengaluru's monsoon brings cooler days and relief from the heat — and, every year, a rise in infections. Standing water lets mosquitoes breed; flooded roads and overflowing drains carry germs; and street food and water are harder to keep safe. Here is a short guide to the four infections we see most from June to October.</p>
<p>This is general information. Many of these illnesses start the same way, with fever and aches, and only a doctor and sometimes a blood test can tell them apart.</p>
<h2>Dengue</h2>
<p>Spread by the <em>Aedes</em> mosquito, which bites in the daytime and breeds in clean standing water — flower-pot trays, buckets, old tyres, water coolers.</p>
<ul>
<li><strong>Signs:</strong> sudden high fever, severe headache, pain behind the eyes, body and joint aches, sometimes a rash.</li>
<li><strong>Watch out:</strong> the risky phase often comes as the fever falls, around days three to seven. Severe stomach pain, repeated vomiting, bleeding gums or nose, black stools, or feeling faint and restless need emergency care.</li>
</ul>
${figure(MOSQ_SKIN, "The dengue mosquito bites in the daytime, not only at dusk")}
<h2>Malaria</h2>
<p>Spread by the <em>Anopheles</em> mosquito, mostly from dusk to dawn.</p>
<ul>
<li><strong>Signs:</strong> fever with shivering and chills, often coming and going, sweating, headache, tiredness.</li>
<li>Malaria needs a blood test to confirm and treatment from a doctor. Do not self-treat.</li>
</ul>
<h2>Typhoid</h2>
<p>Spread through contaminated food and water.</p>
<ul>
<li><strong>Signs:</strong> a fever that climbs over several days, headache, weakness, stomach pain, constipation or diarrhoea, loss of appetite.</li>
<li>Ask your doctor whether the typhoid vaccine suits you, especially if you eat out often.</li>
</ul>
<h2>Leptospirosis</h2>
<p>Spread through water or soil contaminated by the urine of infected animals, often rats. It enters through cuts or the eyes and mouth — a real risk after wading through floodwater.</p>
<ul>
<li><strong>Signs:</strong> fever, headache, muscle pain (often in the calves), red eyes, sometimes yellowing of the skin.</li>
<li>If you have waded through floodwater and develop a fever within the next two or three weeks, tell your doctor about it.</li>
</ul>
<h2>Prevention that works</h2>
<ul>
<li><strong>Empty standing water</strong> around your home once a week: plant trays, coolers, buckets, coconut shells, tyres.</li>
<li><strong>Cover up</strong> with long sleeves and use mosquito repellent, including during the day.</li>
<li><strong>Use nets or screens</strong> on windows, especially for children's rooms.</li>
<li><strong>Drink boiled or purified water</strong>, and be careful with cut fruit and chutneys from street stalls in the rains.</li>
<li><strong>Avoid wading</strong> through floodwater, and wash and cover any cuts if you must.</li>
<li><strong>Wash hands</strong> with soap before eating and after using the toilet.</li>
</ul>
${figure(HANDWASH, "Soap and water before every meal")}
<h2>When to come in</h2>
<p>See a doctor if a fever lasts more than two days, if it comes with severe aches, chills, red eyes or a rash, or if you have waded through floodwater recently. Do not take painkillers other than those your doctor advises during a fever in the monsoon — some common painkillers are unsafe if the fever turns out to be dengue.</p>
<blockquote>"Come in early. Most monsoon fevers do well with care; the trouble usually comes from waiting too long at home." — Dr. Meera Nair</blockquote>
`,
    },
    {
        slug: "vaccines-for-adults",
        title: "Vaccines aren't just for children",
        category: "articles",
        excerpt:
            "Flu, tetanus, hepatitis B, pneumonia, shingles — a plain guide to adult vaccines, and why to ask your doctor which you need.",
        cover: SYRINGE,
        daysAgo: 57,
        body: `
<p>Most of us finished our vaccinations at school and never thought about them again. But some protection fades, some vaccines are meant for adulthood, and a few matter much more once you pass fifty or live with a long-term condition. This guide covers the common ones in plain terms. It is not a schedule: the right vaccines depend on your age, health, work and travel, and only your doctor can tell you which you need.</p>
<h2>The ones adults most often ask about</h2>
<h3>Flu (influenza)</h3>
<p>Flu viruses change, so the vaccine is updated and given each season. It is often recommended for older adults, pregnant women, people with diabetes, asthma, heart or kidney disease, and health workers.</p>
<h3>Tetanus and diphtheria</h3>
<p>Tetanus enters through wounds — a nail, a garden cut, a road fall. Protection from childhood shots fades, so adults usually need boosters, and your doctor may suggest one after a deep or dirty wound.</p>
${figure(INJECT_BLUE, "Most adult vaccines are a quick injection in the upper arm")}
<h3>Hepatitis B</h3>
<p>Spread through blood and body fluids. Many adults born before it became routine were never vaccinated. A blood test can show whether you are already protected.</p>
<h3>Hepatitis A and typhoid</h3>
<p>Both spread through contaminated food and water. Your doctor may suggest them if you eat out often or travel.</p>
<h3>Pneumococcal (pneumonia)</h3>
<p>Protects against a common cause of pneumonia. Often discussed for people over 65 and for younger adults with certain conditions.</p>
<h3>Shingles</h3>
<p>Shingles is a painful rash caused by the chickenpox virus waking up later in life. A vaccine is available for older adults; ask whether it suits you.</p>
<h3>HPV</h3>
<p>Protects against the virus behind most cervical cancers and some other cancers. Best given young, but your doctor can tell you whether it is still worthwhile for you.</p>
<h3>Chickenpox and MMR</h3>
<p>If you never had chickenpox or were never vaccinated for measles, mumps and rubella, ask about these — particularly before planning a pregnancy.</p>
<h2>Before a vaccine</h2>
<ul>
<li>Tell the doctor about any allergies, and any reaction to a vaccine before.</li>
<li>Mention if you are pregnant or planning a pregnancy, or take medicine that affects immunity.</li>
<li>If you have a high fever on the day, the vaccine may be put off for a few days.</li>
</ul>
${figure(INJECT_ARM, "A sore arm for a day or two is common")}
<h2>After a vaccine</h2>
<p>A sore arm, mild fever or tiredness for a day or two is common. Wait at the clinic for a short while after any vaccine, as advised. Seek help straight away for swelling of the face or throat, difficulty breathing, or a widespread rash.</p>
<h2>Keep a record</h2>
<p>Keep a note of each vaccine, the date and where you had it — a page in a diary or a photo of the card works. It saves guesswork years later.</p>
<blockquote>"Bring whatever records you have, even an old school card. Together we can work out what you have had and what is still worth doing." — Dr. Meera Nair</blockquote>
<p>To talk it through, book a general consultation and mention vaccines when you book.</p>
`,
    },
    {
        slug: "heat-and-hydration",
        title: "Heat, hydration and staying well in summer",
        category: "articles",
        excerpt:
            "Bengaluru's summers are getting hotter. How much to drink, what heat exhaustion looks like, and who needs extra care.",
        cover: SUN_ORANGE,
        daysAgo: 179,
        body: `
<p>Bengaluru used to be the city where nobody needed a fan. Not any more. April and May now bring days in the mid-thirties, and the heat can catch out people who are not used to it. Here is how to stay well, and what to watch for.</p>
<h2>How much to drink</h2>
<p>There is no single number. A useful guide is the colour of your urine: pale straw is good, dark yellow means drink more. You will need more if you are outdoors, travelling by two-wheeler, exercising, or unwell with fever or loose motions.</p>
<ul>
<li>Sip through the day rather than gulping a litre at once.</li>
<li>Water, buttermilk, tender coconut water, nimbu pani with a pinch of salt, and kokum or jeera drinks all help.</li>
<li>Go easy on sugary sodas and packaged juices; they add sugar without helping much.</li>
<li>Tea and coffee are fine in moderation. Alcohol dehydrates.</li>
</ul>
${figure(DRINKING, "Sip through the day, not all at once")}
<h2>People who need extra care</h2>
<ul>
<li><strong>Older adults</strong> often feel less thirsty even when they need water.</li>
<li><strong>Babies and young children</strong> lose fluid quickly.</li>
<li><strong>People with heart or kidney conditions</strong> may have been told to limit fluids — follow your doctor's advice, not general tips.</li>
<li><strong>People on certain medicines</strong>, including some for blood pressure, can be more affected by heat. Ask your doctor.</li>
<li><strong>Outdoor workers</strong> — delivery riders, security guards, construction workers — need shade and water breaks.</li>
</ul>
<h2>Heat exhaustion: the warning signs</h2>
<p>Heavy sweating, cold clammy skin, dizziness, headache, nausea, muscle cramps and weakness. If you notice these:</p>
<ol>
<li>Move to a cool, shaded place.</li>
<li>Loosen clothing and lie down with feet raised.</li>
<li>Sip water or an oral rehydration solution.</li>
<li>Cool the skin with wet cloths and a fan.</li>
</ol>
<p>If you do not feel better within half an hour, see a doctor.</p>
${figure(TENDER, "Tender coconut water — a good choice on a hot afternoon")}
<h2>Heatstroke is an emergency</h2>
<p>Call 108 if someone has a very high body temperature with hot, dry skin, confusion, slurred speech, fainting or a fit. Cool them while you wait: shade, wet cloths, a fan.</p>
<h2>Simple habits</h2>
<ul>
<li>Plan errands and walks for early morning or after sunset.</li>
<li>Wear loose cotton in light colours, and a cap or umbrella in the sun.</li>
<li>Carry a water bottle in the car and on the scooter.</li>
<li>Eat lighter meals; curd rice and fruit sit better than heavy fried food in the heat.</li>
<li>Never leave children or pets in a parked car, even briefly.</li>
</ul>
<p>If you have a long-term condition and are unsure how the heat affects your medicines, book a consultation before the hottest weeks begin.</p>
`,
    },
    {
        slug: "childhood-fevers-when-to-worry",
        title: "Childhood fevers: when to worry",
        category: "articles",
        excerpt:
            "Fevers are common in children and usually harmless. Dr. Arjun Rao on what to watch, what to do, and when to come in fast.",
        cover: CHILD_SLEEP,
        daysAgo: 88,
        body: `
<p>Few things worry parents more than a hot, miserable child at two in the morning. The good news is that most childhood fevers are caused by common viruses and pass in a few days. The fever itself is the body fighting back. What matters more than the number on the thermometer is how your child looks and behaves.</p>
<p>This is general guidance. Every child is different, and if you are worried, call a doctor — that is always the right call.</p>
<h2>Measuring it</h2>
<p>Use a digital thermometer. For babies and young children, the armpit is easiest: hold the arm down gently for the full time. A temperature of 100.4°F (38°C) or above is a fever.</p>
${figure(THERMO_GREY, "A simple digital thermometer is all you need at home")}
<h2>Caring for a child with fever at home</h2>
<ul>
<li><strong>Fluids first.</strong> Offer breast milk, formula, water, dilute juice or ORS often, in small amounts.</li>
<li><strong>Light clothing.</strong> Do not wrap a feverish child in blankets.</li>
<li><strong>Rest.</strong> Let them sleep if they want to; they do not have to eat much for a day or two, as long as they drink.</li>
<li><strong>Fever medicine</strong> only as your doctor advises, measured carefully with the syringe or cup that comes with it — never a kitchen spoon. Children's doses go by weight.</li>
<li><strong>No cold baths or ice.</strong> A lukewarm sponge is fine if it comforts them.</li>
<li>Never give aspirin to children unless a doctor specifically tells you to.</li>
</ul>
<h2>Book a visit with a doctor if</h2>
<ul>
<li>The fever lasts more than two or three days.</li>
<li>Your child is eating and drinking much less than usual, or has fewer wet nappies.</li>
<li>They have ear pain, a sore throat, pain when passing urine, or a cough that is getting worse.</li>
<li>The fever went away and came back.</li>
<li>Your instinct says something is not right.</li>
</ul>
${figure(PAED_HIFIVE, "Most children are back to themselves in a few days")}
<h2>Go to an emergency department or call 108 if</h2>
<ul>
<li>A baby <strong>under three months</strong> has any fever.</li>
<li>Your child is unusually drowsy, floppy, or hard to wake.</li>
<li>They are breathing fast, grunting, or the skin between the ribs sucks in.</li>
<li>They have a rash that does not fade when you press a glass against it.</li>
<li>They have a stiff neck, or a bulging soft spot on a baby's head.</li>
<li>They have a fit. Lay them on their side, stay with them, and get help.</li>
<li>They show signs of dehydration: no urine for many hours, a dry mouth, no tears when crying.</li>
</ul>
<h2>A note on fits with fever</h2>
<p>Some young children have a short fit when their temperature rises quickly. It is frightening to watch. Most are brief and do no lasting harm, but every first fit needs to be seen by a doctor the same day.</p>
<blockquote>"Watch the child, not the thermometer. A child with a high fever who is playing and drinking worries me far less than a quiet, floppy one with a lower number." — Dr. Arjun Rao</blockquote>
<p>Dr. Rao sees children on Monday, Wednesday and Friday mornings and Saturday mornings. For a fever, book the earliest slot you can.</p>
`,
    },
    {
        slug: "skin-in-humid-weather",
        title: "Looking after your skin in humid weather",
        category: "articles",
        excerpt:
            "Monsoon humidity brings fungal rashes, prickly heat and breakouts. Dr. Sara Thomas on simple care, and when to have a rash looked at.",
        cover: CREAM,
        daysAgo: 92,
        body: `
<p>From June to September, Bengaluru's air hangs heavy with moisture. Clothes take days to dry, shoes stay damp, and skin that was fine in winter starts to itch. Our dermatology appointments fill up every monsoon with the same handful of problems.</p>
<h2>The common monsoon skin problems</h2>
<h3>Fungal infections</h3>
<p>Ringworm and similar infections love warm, damp skin folds — the groin, under the breasts, between the toes, the waistline. They show up as itchy, red, often ring-shaped patches.</p>
<h3>Prickly heat</h3>
<p>Tiny itchy bumps where sweat gets trapped, often on the neck, back and chest.</p>
<h3>Acne and breakouts</h3>
<p>Sweat, oil and heavy products can block pores.</p>
<h3>Athlete's foot and nail infections</h3>
<p>From wet shoes and socks worn all day.</p>
${figure(RAIN_STREET, "Wet days mean damp shoes and clothes that stay on too long")}
<h2>Simple habits that help</h2>
<ul>
<li><strong>Dry off properly</strong> after a bath or getting caught in rain, especially skin folds and between the toes.</li>
<li><strong>Change out of damp clothes</strong> as soon as you can. Carry a spare pair of socks.</li>
<li><strong>Choose loose cotton</strong> over tight synthetics.</li>
<li><strong>Let shoes dry</strong> between wears; alternate two pairs if you can. Wear open footwear when it pours.</li>
<li><strong>Keep towels personal</strong> and dry them in the sun when it appears.</li>
<li><strong>Use a light moisturiser</strong> — gel-based rather than heavy cream — and keep using sunscreen. Cloudy days still carry UV.</li>
<li><strong>Wash gently</strong> once or twice a day. Scrubbing hard makes irritation worse.</li>
</ul>
${figure(HANDS_WATER, "A gentle wash is better than a hard scrub")}
<h2>What not to do</h2>
<p>Please do not buy combination creams over the counter for an itchy rash. Many contain a steroid mixed with an antifungal and an antibiotic. They may calm the itch for a few days, but on a fungal infection the steroid can make it spread and become much harder to treat. We see this every week.</p>
<blockquote>"Bring every cream you have tried, even the ones you threw away. It tells me what the skin has been through." — Dr. Sara Thomas</blockquote>
<h2>When to see a dermatologist</h2>
<ul>
<li>A rash that has not improved after a week or two of simple care.</li>
<li>A rash that keeps coming back, or is spreading.</li>
<li>Itching that keeps you awake.</li>
<li>Painful, pus-filled or hot, swollen areas.</li>
<li>A mole that has changed shape, size or colour, or bleeds.</li>
</ul>
<p>See a doctor the same day for a rash with fever, a rash that spreads quickly, or swelling of the face or lips. Dr. Sara Thomas sees patients on Tuesday and Thursday evenings and Saturday mornings.</p>
<p>If a rash spreads quickly, blisters, or comes with a fever, don't wait for it to settle — see a doctor the same day.</p>
`,
    },
    {
        slug: "reading-your-blood-test-report",
        title: "Reading your blood test report",
        category: "articles",
        excerpt:
            "What the columns mean, why a number outside the range is not always a problem, and why the doctor should go through it with you.",
        cover: TUBES,
        daysAgo: 66,
        body: `
<p>A blood test report can look like a page of codes. It is tempting to search every flagged number online and assume the worst. This article explains how a report is laid out, so you can follow along when your doctor goes through it. It does not tell you what your own results mean — only a doctor who knows you can do that.</p>
<h2>How a report is laid out</h2>
<p>Most reports have four columns:</p>
<ol>
<li><strong>Test</strong> — the name of what was measured, such as haemoglobin or fasting glucose.</li>
<li><strong>Result</strong> — your number.</li>
<li><strong>Unit</strong> — such as mg/dL or g/dL. The same test can be reported in different units by different labs, so compare like with like.</li>
<li><strong>Reference range</strong> — the range seen in most healthy people. Results outside it are often marked H (high) or L (low), or printed in bold.</li>
</ol>
${figure(TUBE_LAB, "Every lab sets its own reference ranges")}
<h2>Why "out of range" is not always a problem</h2>
<ul>
<li><strong>Ranges are statistical.</strong> They cover most healthy people, not all. A few healthy people will always sit just outside.</li>
<li><strong>Context matters.</strong> Age, sex, pregnancy, medicines, a recent illness, exercise the day before, or not fasting properly can all shift a result.</li>
<li><strong>Trends matter more than one value.</strong> A number that has been the same for five years means something different from one that has jumped.</li>
<li><strong>Labs differ.</strong> Each lab sets its ranges, so a result from one lab is best compared with that lab's range.</li>
</ul>
<h2>Common panels you might see</h2>
<ul>
<li><strong>Complete blood count</strong> — red cells, white cells and platelets.</li>
<li><strong>Blood sugar</strong> — fasting glucose, and sometimes HbA1c, which reflects the average over the past few months.</li>
<li><strong>Lipid profile</strong> — cholesterol and triglycerides.</li>
<li><strong>Kidney and liver tests</strong> — how well these organs are working.</li>
<li><strong>Thyroid tests</strong> — usually TSH first.</li>
</ul>
${figure(GLUCO, "Home sugar readings are useful to bring along")}
<h2>Questions worth asking your doctor</h2>
<ul>
<li>Which results matter most for me, and why?</li>
<li>Is this result new, or has it been like this before?</li>
<li>Do I need to repeat it, and when?</li>
<li>Is there anything I should change — food, activity, medicines?</li>
</ul>
<blockquote>"I would much rather go through a report with you than have you read it alone at night. A single flagged number very often has a simple explanation." — Dr. Meera Nair</blockquote>
<h2>At CarePoint</h2>
<p>We hand your reports to you on paper at your visit, and the doctor goes through them with you. We do not put results online. If a result comes back after you have left, book a follow-up visit within two weeks (₹300) to go over it. Keep your old reports in one folder; they make the next conversation much more useful.</p>
`,
    },
    {
        slug: "managing-a-long-term-condition",
        title: "Living well with a long-term condition between visits",
        category: "articles",
        excerpt:
            "Diabetes, blood pressure, thyroid, asthma: most of the work happens at home. Practical habits that make each visit count.",
        cover: BP_MANUAL,
        daysAgo: 133,
        body: `
<p>If you live with diabetes, high blood pressure, a thyroid condition or asthma, you might see a doctor for fifteen minutes every few months. The rest of the time — thousands of hours — you are the one managing it. These habits help, and they make each consultation far more useful.</p>
<h2>Know your medicines</h2>
<ul>
<li>Keep an up-to-date list: name, strength, how many times a day, and what it is for.</li>
<li>Take them as your doctor advises, even when you feel well. Many long-term conditions have no symptoms until something goes wrong.</li>
<li>Do not stop or change a dose on your own. If you think a medicine is causing side effects, talk to your doctor.</li>
<li>A weekly pill box helps you see at a glance whether you took today's dose.</li>
<li>Check before adding anything new, including ayurvedic preparations and supplements; some interact with prescribed medicines.</li>
</ul>
${figure(PILLS_WEEK, "A weekly pill box makes a missed dose easy to spot")}
<h2>Keep simple records</h2>
<p>If your doctor has asked you to check your sugar or blood pressure at home, write down the readings with the date and time. A small notebook or a notes app is enough. Note anything unusual alongside: a late dinner, a wedding, a bad night's sleep, a missed dose.</p>
${figure(GLUCO_FINGER, "Write each reading down with the date and time")}
<h2>Food, movement and sleep</h2>
<ul>
<li><strong>Food:</strong> regular meals, plenty of vegetables and dal, less fried food and sweets, and watch portion sizes of rice and rotis. Festivals are not the time to be perfect — but go back to your routine afterwards.</li>
<li><strong>Movement:</strong> a brisk walk most days helps blood pressure, sugar and mood. Start where you are; ten minutes is better than none.</li>
<li><strong>Sleep:</strong> poor sleep can push up sugar and blood pressure. Loud snoring with daytime sleepiness is worth mentioning to your doctor.</li>
<li><strong>Tobacco and alcohol:</strong> if you smoke, stopping is one of the best things you can do. Ask us for help.</li>
</ul>
<h2>Before each visit</h2>
<ol>
<li>Bring your readings and your medicines list.</li>
<li>Write down your top two or three questions.</li>
<li>Note any new symptoms, however small.</li>
<li>Mention if you have seen another doctor or been to hospital.</li>
</ol>
<h2>Know the warning signs</h2>
<p>Ask your doctor what danger signs apply to your condition, and write them down. As a general rule, seek urgent help for chest pain, sudden weakness on one side, slurred speech, severe breathlessness, fainting, or confusion. Call 108.</p>
<blockquote>"The patients who do best are not the ones who never slip. They are the ones who come back and tell me honestly what happened." — Dr. Meera Nair</blockquote>
<p>A teleconsultation (₹500) works well for a quick review of home readings between in-person visits.</p>
`,
    },
    {
        slug: "sleep-why-it-matters",
        title: "Sleep: why it matters and how to get more of it",
        category: "articles",
        excerpt:
            "Late screens, early commutes and noisy streets cost us sleep. Simple habits that help, and when poor sleep needs a doctor.",
        cover: SLEEP,
        daysAgo: 148,
        body: `
<p>Ask a room of Bengaluru professionals how they slept, and most will laugh. Late meetings with other time zones, long commutes, a phone in bed and an early school run do not leave much room for rest. Yet sleep affects almost everything doctors care about: blood pressure, blood sugar, weight, mood, memory, and how well you fight off infections.</p>
<h2>How much is enough</h2>
<p>Most adults need around seven to nine hours. Teenagers need more, and so do younger children. If you need an alarm every day and still feel tired, or fall asleep the moment you sit down in the afternoon, you are probably not getting enough.</p>
<h2>Habits that help</h2>
<ul>
<li><strong>Keep regular times.</strong> Go to bed and get up at roughly the same time every day, weekends included.</li>
<li><strong>Morning light.</strong> Ten minutes outside in daylight soon after waking helps set your body clock.</li>
<li><strong>Cut caffeine after lunch.</strong> Filter coffee at 5pm can still be in your system at midnight.</li>
<li><strong>Eat dinner earlier and lighter.</strong> A heavy late meal makes for restless sleep and heartburn.</li>
<li><strong>Screens out of bed.</strong> Put the phone to charge away from the bed, or at least turn the brightness down and stop scrolling an hour before sleep.</li>
<li><strong>Dark, cool and quiet.</strong> Heavy curtains, a fan, and earplugs or an eye mask if the street is noisy.</li>
<li><strong>Wind down.</strong> A bath, a book, light stretching, or simply sitting quietly.</li>
<li><strong>Go easy on alcohol.</strong> It may help you fall asleep but makes sleep lighter and more broken.</li>
</ul>
${figure(SLEEP_MASK, "An eye mask helps when the street lights stay on")}
<h2>If you cannot sleep</h2>
<p>Lying awake getting frustrated makes it worse. If you have been awake for what feels like twenty minutes, get up, go to another room with dim light, and do something calm until you feel sleepy. Then go back to bed.</p>
<p>Please do not start sleeping tablets on your own, or take someone else's. Many are habit-forming and can make you drowsy the next day, which is risky on the road.</p>
${figure(BED, "Keep the bed for sleep, not work")}
<h2>When to see a doctor</h2>
<ul>
<li>Trouble sleeping most nights for more than a few weeks.</li>
<li>Loud snoring, gasping or pauses in breathing that someone else has noticed — sometimes a sign of sleep apnoea.</li>
<li>Falling asleep while driving or at work.</li>
<li>Low mood, worry or racing thoughts keeping you up.</li>
<li>Waking often to pass urine.</li>
<li>Restless, uncomfortable legs at night.</li>
</ul>
<blockquote>"Poor sleep is often a symptom, not the problem itself. It is worth finding out what is behind it." — Dr. Meera Nair</blockquote>
<p>Book a general consultation, and if you can, keep a simple sleep diary for a week or two before: when you went to bed, roughly when you fell asleep, how often you woke and when you got up.</p>
`,
    },
    {
        slug: "air-quality-and-winter-coughs",
        title: "Air quality and winter coughs",
        category: "articles",
        excerpt:
            "As the air cools, smoke, dust and traffic fumes linger. How to look after your lungs, and when a cough needs a doctor.",
        cover: SMOG,
        daysAgo: 9,
        body: `
<p>Bengaluru's air is usually better than many Indian cities, but from November to February it often turns hazy. Cooler, still air traps traffic fumes and construction dust close to the ground, and festival smoke adds to it. Every winter we see more coughs that linger, more asthma flare-ups, and more people who simply feel their chest is tight.</p>
<h2>Who is most affected</h2>
<ul>
<li>People with asthma or COPD.</li>
<li>Young children, whose lungs are still growing.</li>
<li>Older adults and people with heart disease.</li>
<li>Anyone who spends long hours outdoors: riders, traffic police, street vendors.</li>
</ul>
<h2>Simple ways to reduce your exposure</h2>
<ul>
<li><strong>Check the air quality</strong> on a reliable app or website before outdoor exercise. On bad days, walk indoors or later in the day when it often improves.</li>
<li><strong>Avoid busy roads</strong> for walks and runs; parks and side streets are better.</li>
<li><strong>Keep windows closed</strong> during peak traffic and on smoky festival nights; air the house when it clears.</li>
<li><strong>Do not burn leaves or rubbish</strong>, and avoid mosquito coils in closed rooms.</li>
<li><strong>A well-fitted mask</strong> of the right standard can cut what you breathe in on a two-wheeler. A loose cloth mask does little.</li>
<li><strong>If you smoke, stop</strong> — and keep homes and cars smoke-free.</li>
</ul>
${figure(MASK, "A well-fitted mask on bad-air days")}
<h2>If you have asthma</h2>
<p>Keep your reliever inhaler with you, use your preventer exactly as your doctor advises, and ask for a written action plan that says what to do when symptoms worsen. Come in before winter if your inhalers have not been reviewed in a year.</p>
<h2>When a cough needs a doctor</h2>
<p>Most coughs after a cold settle within two or three weeks. See a doctor if:</p>
<ul>
<li>A cough has lasted more than three weeks.</li>
<li>You are coughing up blood, or coloured phlegm with a fever.</li>
<li>You are losing weight without trying, or sweating at night.</li>
<li>You are wheezing or breathless doing things that used to be easy.</li>
<li>A child has a barking cough, or noisy breathing.</li>
</ul>
${figure(COUGH_SHAWL, "A cough that lasts more than three weeks needs a check")}
<p><strong>Call 108</strong> for severe breathlessness, lips turning blue, chest pain, or an asthma attack where the reliever is not helping.</p>
<blockquote>"A cough that lasts beyond three weeks always deserves a proper look. Usually it is something simple, but we do not guess." — Dr. Meera Nair</blockquote>
<p>Please do not take cough syrups or antibiotics without a doctor's advice; many coughs do not need them, and some syrups are unsuitable for children.</p>
<p>If you have asthma or a long-term lung condition, keep your inhaler plan up to date before winter and ask your doctor what to do if your symptoms change.</p>
`,
    },
];
