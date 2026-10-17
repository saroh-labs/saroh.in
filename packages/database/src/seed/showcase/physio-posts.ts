/**
 * Stride Physio's website journal: help pages, clinic news and longer
 * articles for the Indiranagar physiotherapy clinic in the showcase seed.
 * Every post agrees with the clinic's fact sheet (hours, prices, team,
 * home-visit area). Photos are free-licence Unsplash photos, credited by
 * photographer and hot-linked from images.unsplash.com.
 */
import type { DsImage, DsPost } from "./diary-shop-types";

const escapeAttr = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** An inline figure for a post body, credited in the caption. */
const fig = (image: DsImage, caption: string) =>
    `<figure><img src="${image.url}" alt="${escapeAttr(image.alt)}" width="${image.width}" height="${image.height}" /><figcaption>${caption} Photo: ${image.creditName} / Unsplash</figcaption></figure>`;

/** Every photograph the journal uses, each looked at before it was chosen. */
const ph = {
    H1c: {
        url: "https://images.unsplash.com/photo-1608979827489-2b855e79debe?w=1600&q=80&auto=format&fit=crop",
        alt: "A bright clinic reception with a white front desk",
        width: 1600,
        height: 1067,
        creditName: "Dr.Kanapon Phumratprapin",
        creditUrl: "https://unsplash.com/@dr_kanapon",
    },
    H1i: {
        url: "https://images.unsplash.com/photo-1764727291644-5dcb0b1a0375?w=1600&q=80&auto=format&fit=crop",
        alt: "A clean reception desk under a lit Reception sign",
        width: 1600,
        height: 2400,
        creditName: "Malcolm Choong 鍾声耀",
        creditUrl: "https://unsplash.com/@malcolm_choong",
    },
    H2c: {
        url: "https://images.unsplash.com/photo-1649751361457-01d3a696c7e6?w=1600&q=80&auto=format&fit=crop",
        alt: "A physiotherapist examining a patient's bent knee on a treatment table",
        width: 1600,
        height: 1067,
        creditName: "yury kirillov",
        creditUrl: "https://unsplash.com/@relievemassage",
    },
    H2i: {
        url: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1600&q=80&auto=format&fit=crop",
        alt: "A clinician holding up X-ray films to the light",
        width: 1600,
        height: 1067,
        creditName: "Jonathan Borba",
        creditUrl: "https://unsplash.com/@jonathanborba",
    },
    H3c: {
        url: "https://images.unsplash.com/photo-1645005513713-9e2b92a687d3?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio guiding a patient through an arm exercise with light dumbbells",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    H3i: {
        url: "https://images.unsplash.com/photo-1645005512942-a17817fb7c11?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio correcting a patient's position during a resistance band exercise",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    H4c: {
        url: "https://images.unsplash.com/photo-1762331658154-8aa265ca21e5?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman resting her hand on her knee as she sits on a ledge",
        width: 1600,
        height: 1067,
        creditName: "Zulfugar Karimov",
        creditUrl: "https://unsplash.com/@zulfugarkarimov",
    },
    H4i: {
        url: "https://images.unsplash.com/photo-1510278248113-c757b233ccbc?w=1600&q=80&auto=format&fit=crop",
        alt: "A man walking up a flight of outdoor steps",
        width: 1600,
        height: 1067,
        creditName: "Khiet Tam",
        creditUrl: "https://unsplash.com/@khiettam",
    },
    H5c: {
        url: "https://images.unsplash.com/photo-1723725776967-78606a070730?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand holding a paper receipt",
        width: 1600,
        height: 2133,
        creditName: "Kayven",
        creditUrl: "https://unsplash.com/@shotbykayven",
    },
    H5i: {
        url: "https://images.unsplash.com/photo-1626207887298-da2fc1f50e82?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand holding an itemised paper bill",
        width: 1600,
        height: 2400,
        creditName: "Ksenia Makagonova",
        creditUrl: "https://unsplash.com/@dearseymour",
    },
    H6c: {
        url: "https://images.unsplash.com/photo-1643467220785-49612855af5a?w=1600&q=80&auto=format&fit=crop",
        alt: "A metro train pulling into an elevated station",
        width: 1600,
        height: 1106,
        creditName: "Asif Ahmed",
        creditUrl: "https://unsplash.com/@asidahmed",
    },
    H6i: {
        url: "https://images.unsplash.com/photo-1613223352622-52cbeb8f6868?w=1600&q=80&auto=format&fit=crop",
        alt: "Two scooters parked against a wall in a covered parking area",
        width: 1600,
        height: 1067,
        creditName: "Kevin Woblick",
        creditUrl: "https://unsplash.com/@kovah",
    },
    H7c: {
        url: "https://images.unsplash.com/photo-1584797802294-190bd128cc83?w=1600&q=80&auto=format&fit=crop",
        alt: "An older couple walking out through a glass door, one with a walker",
        width: 1600,
        height: 1067,
        creditName: "Claudio Schwarz",
        creditUrl: "https://unsplash.com/@purzlbaum",
    },
    H7i: {
        url: "https://images.unsplash.com/photo-1708884831332-56f4e081fabe?w=1600&q=80&auto=format&fit=crop",
        alt: "A tree-lined Bengaluru road with an autorickshaw",
        width: 1600,
        height: 1200,
        creditName: "Zoshua Colah",
        creditUrl: "https://unsplash.com/@zoshuacolah",
    },
    H8c: {
        url: "https://images.unsplash.com/photo-1616587226960-4a03badbe8bf?w=1600&q=80&auto=format&fit=crop",
        alt: "A man on a video call at a laptop on his dining table",
        width: 1600,
        height: 1067,
        creditName: "LinkedIn Sales Solutions",
        creditUrl: "https://unsplash.com/@linkedinsalesnavigator",
    },
    H8i: {
        url: "https://images.unsplash.com/photo-1746796751590-a8c0f15d4900?w=1600&q=80&auto=format&fit=crop",
        alt: "An exercise mat with light dumbbells and a folded towel",
        width: 1600,
        height: 1200,
        creditName: "Andrea Stuart",
        creditUrl: "https://unsplash.com/@andreastuart",
    },
    H9c: {
        url: "https://images.unsplash.com/photo-1598555763574-dca77e10427e?w=1600&q=80&auto=format&fit=crop",
        alt: "Fine needles being placed in the muscles of a patient's back",
        width: 1600,
        height: 1035,
        creditName: "Katherine Hanlon",
        creditUrl: "https://unsplash.com/@tinymountain",
    },
    H9i: {
        url: "https://images.unsplash.com/photo-1627518788331-b3b7fdaa382f?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand signing a printed form with a pen",
        width: 1600,
        height: 1280,
        creditName: "Signature Pro",
        creditUrl: "https://unsplash.com/@signaturepro",
    },
    H10c: {
        url: "https://images.unsplash.com/photo-1418874586588-88661ed80c4a?w=1600&q=80&auto=format&fit=crop",
        alt: "A person in a red jacket out on an early-morning walk down a quiet road",
        width: 1600,
        height: 1066,
        creditName: "Jordan McQueen",
        creditUrl: "https://unsplash.com/@jordanfmcqueen",
    },
    H10i: {
        url: "https://images.unsplash.com/photo-1706353399656-210cca727a33?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio stretching a patient's shoulder as she lies on a treatment table",
        width: 1600,
        height: 1067,
        creditName: "Marc Zeman",
        creditUrl: "https://unsplash.com/@der_zeman",
    },
    N1c: {
        url: "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=1600&q=80&auto=format&fit=crop",
        alt: "A runner's legs mid-stride on a city road",
        width: 1600,
        height: 1067,
        creditName: "sporlab",
        creditUrl: "https://unsplash.com/@sporlab",
    },
    N1i: {
        url: "https://images.unsplash.com/photo-1597892657493-6847b9640bac?w=1600&q=80&auto=format&fit=crop",
        alt: "A runner's well-used grey running shoes on the road",
        width: 1600,
        height: 2400,
        creditName: "Jakob Owens",
        creditUrl: "https://unsplash.com/@jakobowens1",
    },
    N2c: {
        url: "https://images.unsplash.com/photo-1645005512968-0c1fe99f0093?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio holding and moving a patient's shoulder",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    N2i: {
        url: "https://images.unsplash.com/photo-1540205895360-4ad4cffb3aa8?w=1600&q=80&auto=format&fit=crop",
        alt: "A physio guiding a patient into a hip stretch on a mat",
        width: 1600,
        height: 2399,
        creditName: "Annie Spratt",
        creditUrl: "https://unsplash.com/@anniespratt",
    },
    N3c: {
        url: "https://images.unsplash.com/photo-1708884831398-b9b7cca1b2ba?w=1600&q=80&auto=format&fit=crop",
        alt: "Morning sun through the trees on a Bengaluru road, a motorbike passing",
        width: 1600,
        height: 1200,
        creditName: "Zoshua Colah",
        creditUrl: "https://unsplash.com/@zoshuacolah",
    },
    N3i: {
        url: "https://images.unsplash.com/photo-1652035247233-b4b077703f47?w=1600&q=80&auto=format&fit=crop",
        alt: "A leafy residential street with parked cars",
        width: 1600,
        height: 2846,
        creditName: "Joydeep Sensarma",
        creditUrl: "https://unsplash.com/@jsensarma",
    },
    N4c: {
        url: "https://images.unsplash.com/photo-1606367199370-4852f9506648?w=1600&q=80&auto=format&fit=crop",
        alt: "Three people walking along a misty path in the early morning",
        width: 1600,
        height: 2400,
        creditName: "Ravi Sharma",
        creditUrl: "https://unsplash.com/@ravinepz",
    },
    N4i: {
        url: "https://images.unsplash.com/photo-1771011521821-e3d984f30522?w=1600&q=80&auto=format&fit=crop",
        alt: "A person walking along a path at sunrise",
        width: 1600,
        height: 2131,
        creditName: "Rafael Garcin",
        creditUrl: "https://unsplash.com/@nimbus_vulpis",
    },
    N5c: {
        url: "https://images.unsplash.com/photo-1628645339131-0c39c7527856?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman with a cup of tea talking on a video call at her laptop",
        width: 1600,
        height: 1067,
        creditName: "Helena Lopes",
        creditUrl: "https://unsplash.com/@helenalopesph",
    },
    N5i: {
        url: "https://images.unsplash.com/photo-1612831455359-970e23a1e4e9?w=1600&q=80&auto=format&fit=crop",
        alt: "A man gesturing to a group on a laptop video call",
        width: 1600,
        height: 1280,
        creditName: "Surface",
        creditUrl: "https://unsplash.com/@surface",
    },
    N6c: {
        url: "https://images.unsplash.com/photo-1713450106884-502021ee5e61?w=1600&q=80&auto=format&fit=crop",
        alt: "A wide Bengaluru road with buses and cars under a hazy sky",
        width: 1600,
        height: 1061,
        creditName: "Bhargav Panchal",
        creditUrl: "https://unsplash.com/@bhargavpanchal1986",
    },
    N6i: {
        url: "https://images.unsplash.com/photo-1592389209483-02dea6bc5a4f?w=1600&q=80&auto=format&fit=crop",
        alt: "An older man walking along a street with two walking sticks",
        width: 1600,
        height: 1067,
        creditName: "Miikka Luotio",
        creditUrl: "https://unsplash.com/@mluotio83",
    },
    N7c: {
        url: "https://images.unsplash.com/photo-1762331660777-840a589195f0?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman holding the front of her knee as she sits",
        width: 1600,
        height: 1067,
        creditName: "Zulfugar Karimov",
        creditUrl: "https://unsplash.com/@zulfugarkarimov",
    },
    N7i: {
        url: "https://images.unsplash.com/photo-1598286987849-41663a539ff9?w=1600&q=80&auto=format&fit=crop",
        alt: "An older couple walking together along a street",
        width: 1600,
        height: 1067,
        creditName: "Mark Timberlake",
        creditUrl: "https://unsplash.com/@mtimber71",
    },
    N8c: {
        url: "https://images.unsplash.com/photo-1706102005390-2d1f41fdddcd?w=1600&q=80&auto=format&fit=crop",
        alt: "A bowler running in on a cricket ground lined with palm trees",
        width: 1600,
        height: 1067,
        creditName: "Speedy Sandy",
        creditUrl: "https://unsplash.com/@fiftymm",
    },
    N8i: {
        url: "https://images.unsplash.com/photo-1567943346767-72780dd14cd5?w=1600&q=80&auto=format&fit=crop",
        alt: "A bowler delivering the ball in a club cricket match",
        width: 1600,
        height: 1200,
        creditName: "sefton Marks",
        creditUrl: "https://unsplash.com/@image_marks",
    },
    N9c: {
        url: "https://images.unsplash.com/photo-1635192592106-77a5aacbe1a3?w=1600&q=80&auto=format&fit=crop",
        alt: "A rangoli of marigolds ringed with lit diyas",
        width: 1600,
        height: 1207,
        creditName: "Suchandra Roy Chowdhury",
        creditUrl: "https://unsplash.com/@artsy_lens21",
    },
    N9i: {
        url: "https://images.unsplash.com/photo-1636619773834-c7e0762ddfe1?w=1600&q=80&auto=format&fit=crop",
        alt: "Three lit clay diyas in the evening",
        width: 1600,
        height: 1197,
        creditName: "Rajyavardhan Singh",
        creditUrl: "https://unsplash.com/@_raj_28",
    },
    A1c: {
        url: "https://images.unsplash.com/photo-1758876201884-8695c9c98203?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman at her desk rubbing the back of her neck",
        width: 1600,
        height: 900,
        creditName: "Vitaly Gariev",
        creditUrl: "https://unsplash.com/@silverkblack",
    },
    A1i: {
        url: "https://images.unsplash.com/photo-1535957998253-26ae1ef29506?w=1600&q=80&auto=format&fit=crop",
        alt: "A desk with a monitor, a laptop and a separate keyboard by a window",
        width: 1600,
        height: 2133,
        creditName: "Olena Bohovyk",
        creditUrl: "https://unsplash.com/@olenkasergienko",
    },
    A2c: {
        url: "https://images.unsplash.com/photo-1586274955503-7dc869e7fd23?w=1600&q=80&auto=format&fit=crop",
        alt: "A person holding their ankle above a running shoe",
        width: 1600,
        height: 1067,
        creditName: "Sincerely Media",
        creditUrl: "https://unsplash.com/@sincerelymedia",
    },
    A2i: {
        url: "https://images.unsplash.com/photo-1758599881247-b7a28d9297e5?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman balancing on one leg on an exercise mat",
        width: 1600,
        height: 900,
        creditName: "Vitaly Gariev",
        creditUrl: "https://unsplash.com/@silverkblack",
    },
    A3c: {
        url: "https://images.unsplash.com/photo-1594144497858-64c1b1d79f92?w=1600&q=80&auto=format&fit=crop",
        alt: "A runner on a wet promenade in the rain at dusk",
        width: 1600,
        height: 1083,
        creditName: "Naseem Buras",
        creditUrl: "https://unsplash.com/@naseem_buras",
    },
    A3i: {
        url: "https://images.unsplash.com/photo-1649887974297-4be052375a67?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman doing a bodyweight squat at home",
        width: 1600,
        height: 2400,
        creditName: "SUNDAY II SUNDAY",
        creditUrl: "https://unsplash.com/@sunday2sunday",
    },
    A4c: {
        url: "https://images.unsplash.com/photo-1620939068789-fc0c88ddb71e?w=1600&q=80&auto=format&fit=crop",
        alt: "A man sitting on the edge of a bed holding his lower back",
        width: 1600,
        height: 2400,
        creditName: 'Adrian "Rosco" Stef',
        creditUrl: "https://unsplash.com/@roscoadrian",
    },
    A4i: {
        url: "https://images.unsplash.com/photo-1639287569032-7300f2f7b36f?w=1600&q=80&auto=format&fit=crop",
        alt: "Two people walking along a path through the fields",
        width: 1600,
        height: 2240,
        creditName: "Joe Han",
        creditUrl: "https://unsplash.com/@joehan330",
    },
    A5c: {
        url: "https://images.unsplash.com/photo-1453928582365-b6ad33cbcf64?w=1600&q=80&auto=format&fit=crop",
        alt: "A laptop, a coffee and notes on a wooden table",
        width: 1600,
        height: 1064,
        creditName: "Lauren Mancke",
        creditUrl: "https://unsplash.com/@laurenmancke",
    },
    A5i: {
        url: "https://images.unsplash.com/photo-1518655048521-f130df041f66?w=1600&q=80&auto=format&fit=crop",
        alt: "A wireless keyboard on a clean white desk beside a cup of tea",
        width: 1600,
        height: 1067,
        creditName: "Leone Venter",
        creditUrl: "https://unsplash.com/@fempreneurstyledstock",
    },
    A6c: {
        url: "https://images.unsplash.com/photo-1740512922093-9c2756ab5844?w=1600&q=80&auto=format&fit=crop",
        alt: "A man sitting on a step holding his knee",
        width: 1600,
        height: 2000,
        creditName: "Nikola",
        creditUrl: "https://unsplash.com/@bynikolavu",
    },
    A6i: {
        url: "https://images.unsplash.com/photo-1701826478825-8d975e7883f4?w=1600&q=80&auto=format&fit=crop",
        alt: "A man lowering himself slowly towards the floor in a controlled squat",
        width: 1600,
        height: 899,
        creditName: "GMB Fitness",
        creditUrl: "https://unsplash.com/@gmb",
    },
    A7c: {
        url: "https://images.unsplash.com/photo-1786025065474-cb3a3b4cd56c?w=1600&q=80&auto=format&fit=crop",
        alt: "A group doing running drills on a grass field",
        width: 1600,
        height: 1065,
        creditName: "Alejandro Stuardo",
        creditUrl: "https://unsplash.com/@astuardom",
    },
    A7i: {
        url: "https://images.unsplash.com/photo-1785427615102-0d9d48edf38b?w=1600&q=80&auto=format&fit=crop",
        alt: "A yellow training cone on a running track",
        width: 1600,
        height: 2400,
        creditName: "Anton R",
        creditUrl: "https://unsplash.com/@geometryline",
    },
    A8c: {
        url: "https://images.unsplash.com/photo-1601228008055-bcae7a02862c?w=1600&q=80&auto=format&fit=crop",
        alt: "A man holding his sore shoulder",
        width: 1600,
        height: 2400,
        creditName: 'Adrian "Rosco" Stef',
        creditUrl: "https://unsplash.com/@roscoadrian",
    },
    A8i: {
        url: "https://images.unsplash.com/photo-1701826510629-051bb954fb8f?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman reaching back to stretch her neck and shoulder",
        width: 1600,
        height: 1067,
        creditName: "GMB Fitness",
        creditUrl: "https://unsplash.com/@gmb",
    },
    A9c: {
        url: "https://images.unsplash.com/photo-1652354989460-ecccd5644412?w=1600&q=80&auto=format&fit=crop",
        alt: "A knee wrapped in a support sleeve",
        width: 1600,
        height: 1067,
        creditName: "Alexey Demidov",
        creditUrl: "https://unsplash.com/@alexeydemidov",
    },
    A9i: {
        url: "https://images.unsplash.com/photo-1695918427235-2d6faaae356a?w=1600&q=80&auto=format&fit=crop",
        alt: "A man in shorts stretching his knee before a run",
        width: 1600,
        height: 2400,
        creditName: "Adam Davis",
        creditUrl: "https://unsplash.com/@adamcdav",
    },
} satisfies Record<string, DsImage>;

export const MOTION_POSTS: DsPost[] = [
    // ── Help ─────────────────────────────────────────────────────────
    {
        slug: "booking-moving-or-cancelling-an-appointment",
        title: "Booking, moving or cancelling an appointment",
        category: "help",
        daysAgo: 172,
        excerpt:
            "How far ahead you can book, which service to pick, and how to move a visit without a charge or a phone tag.",
        image: ph.H1c,
        body: `<p>You can book any clinic appointment online, from 21 days ahead up to 3 hours before it starts. Choose the service, then the physio and a time that suits you. If you are not sure who to see, leave it on "anyone" and Shruti at the desk will match you with the right person.</p>
<h2>Which service should I pick?</h2>
<ul>
<li><strong>New problem, or new to us:</strong> a First assessment (60 minutes).</li>
<li><strong>Already seen us for this problem:</strong> a Follow-up session (45 minutes), or Sports injury rehab or Post-surgery rehab if that is what your physio set up.</li>
<li><strong>Need us at home:</strong> home visits are booked through the desk, not online, so we can check the address and the time it takes to get to you.</li>
</ul>
${fig(ph.H1i, "The front desk on the second floor, where Shruti looks after bookings.")}
<h2>Moving or cancelling</h2>
<p>Moving or cancelling is free up to 12 hours before your appointment. Use the link in your confirmation or the <a href="/account/bookings">bookings page in your account</a>, or call or WhatsApp us on +91 00000 00008.</p>
<p>Inside 12 hours, please still tell us. A message at 7 am saying you can't make the 9 am slot is far better than an empty room, because someone with a sore back is usually hoping for exactly that time.</p>
<h2>Need to be seen today?</h2>
<p>Online booking closes 3 hours before a slot. For anything sooner, call the desk; if a physio has a gap we will offer it to you.</p>
<p>Ready? <a href="/book">Book a time</a>.</p>`,
    },
    {
        slug: "your-first-assessment-what-to-bring-and-wear",
        title: "Your first assessment: what to bring and what to wear",
        category: "help",
        daysAgo: 165,
        excerpt:
            "A first assessment takes an hour. Here is what to bring, what to wear, and what the physio will do in that time.",
        image: ph.H2c,
        body: `<p>Your first visit is a 60-minute assessment. Please come <strong>10 minutes early</strong>: the lift is quick, but there is a short form to fill at the desk and it is better done before the clock starts.</p>
<h2>What to bring</h2>
<ul>
<li>Any scans or reports: X-rays, MRI reports (the CD as well if you have it), blood tests your doctor ordered.</li>
<li>Your surgeon's notes and discharge summary if you have had an operation, including any restrictions such as "no bending past 90 degrees".</li>
<li>A list of the medicines you take, including painkillers and anything for blood pressure, sugar or thyroid.</li>
<li>The shoes you train or walk in, if your problem is in the foot, knee or hip.</li>
</ul>
${fig(ph.H2i, "Reports and scans help, but the physio still examines how you move.")}
<h2>What to wear</h2>
<p>Loose, comfortable clothes. For a knee or hip problem, bring shorts. For a shoulder or neck, a sleeveless top or a vest makes it much easier to see how the shoulder blade moves. There is a curtained space to change in.</p>
<h2>What happens in the hour</h2>
<ol>
<li>We ask about the problem: when it started, what makes it better or worse, how it affects work, sleep and sport.</li>
<li>We look at how you move and test strength, joint range and, where relevant, nerves.</li>
<li>We explain what we think is going on in plain words, and what we don't know yet.</li>
<li>You leave with two or three home exercises and a rough plan. Sometimes we start hands-on treatment in the first session too.</li>
</ol>
<p>If something we find needs a doctor's opinion first, we will say so and tell you why. You are welcome to bring a family member along.</p>`,
    },
    {
        slug: "how-session-packs-work",
        title: "How session packs work",
        category: "help",
        daysAgo: 130,
        excerpt:
            "Two pack sizes, what they cover, how long they last, and how to tell whether one makes sense for you.",
        image: ph.H3c,
        body: `<p>If your physio expects you to come back several times, a pack brings the cost of each session down. There are two sizes:</p>
<ul>
<li><strong>6 sessions</strong> for ₹5,400, valid for 60 days from the day you buy it (₹900 a session).</li>
<li><strong>10 sessions</strong> for ₹8,500, valid for 120 days (₹850 a session).</li>
</ul>
<p>A single follow-up is ₹1,000, so the 6-session pack saves ₹600 and the 10-session pack saves ₹1,500 if you use every session.</p>
<h2>What a pack covers</h2>
<p>Each visit for a <strong>Follow-up session</strong>, <strong>Sports injury rehab</strong> or <strong>Post-surgery rehab</strong> at the clinic uses one session from your pack. The first assessment, home visits, online follow-ups and dry needling are booked and paid separately. Packs are for one person.</p>
${fig(ph.H3i, "Most follow-up sessions are part hands-on, part exercise you can take home.")}
<h2>Does a pack make sense for me?</h2>
<p>Ask your physio at the end of your assessment how many visits they expect. As a rough guide:</p>
<ul>
<li>A stiff neck that is already settling may need two or three follow-ups. Pay as you go.</li>
<li>A sprained ankle you want to run on again often needs five or six over a few weeks. The 6-session pack fits.</li>
<li>Rehab after a knee replacement or an ACL reconstruction runs for months. The 10-session pack, and probably another after it.</li>
</ul>
<p>Sessions left after the validity date lapse, so choose the size that matches the plan rather than the bigger discount. You can buy a pack at the desk or when you book online, and your remaining sessions show on each receipt.</p>`,
    },
    {
        slug: "the-knee-rehab-programme-what-the-six-sessions-involve",
        title: "The knee rehab programme: what the six sessions involve",
        category: "help",
        daysAgo: 30,
        excerpt:
            "Six 45-minute sessions for people living with knee osteoarthritis, booked after an assessment. What happens in each, and what it can and can't do.",
        image: ph.H4c,
        body: `<p>The knee rehab programme is six 45-minute sessions for people with knee osteoarthritis. It costs ₹6,000, paid upfront, and it starts <strong>after a first assessment</strong>, so the physio can check that the programme suits your knee and that nothing else needs attention first.</p>
<h2>How the six sessions run</h2>
<ol>
<li><strong>Starting point.</strong> We measure a few things you can feel in daily life: how many times you can stand up from a chair in 30 seconds, how you manage a flight of stairs, how far you walk before the knee complains. You get your first two or three exercises.</li>
<li><strong>Sessions 2 to 5.</strong> Strength work for the thigh and hip, balance, and a walking plan. Each session we adjust the load according to how the knee responded since the last one.</li>
<li><strong>Session 6.</strong> We repeat the starting measures, talk through what changed, and write you a home plan you can carry on with alone.</li>
</ol>
${fig(ph.H4i, "Stairs are one of the everyday tasks we measure at the start and the end.")}
<p>Most people come once a week; some come twice a week at the start. Shruti at the desk books all six slots with you at once so you are not hunting for times later.</p>
<h2>What to expect, honestly</h2>
<p>The programme does not reverse arthritis and we won't tell you it will. What it aims to do is help you understand your knee, build strength around it and find a level of activity you can keep up. Some people notice a real difference; others find it helps them manage. Your physio will tell you what they see as you go.</p>
<h2>When to see a doctor instead</h2>
<p>If your knee becomes hot, red and very swollen, if you have a fever with knee pain, or if the knee locks and won't straighten, see a doctor before carrying on with exercise.</p>
<p>To start, <a href="/book">book a first assessment</a> and mention the programme.</p>`,
    },
    {
        slug: "paying-and-getting-receipts-for-reimbursement",
        title: "Paying, and getting receipts for a reimbursement claim",
        category: "help",
        daysAgo: 100,
        excerpt:
            "Pay by UPI, card or cash at the desk, or online when you book. Our receipts are plain receipts with no GST, and here is why.",
        image: ph.H5c,
        body: `<p>You can pay at the desk by UPI, card or cash, or online when you book. Packs, the knee programme and the Keep Moving plan are paid in advance; single sessions can be paid either way.</p>
<h2>Why there is no GST on your receipt</h2>
<p>Healthcare services such as physiotherapy are exempt from GST, so Stride Physio is not GST-registered. Your receipt is a plain receipt: our name and address, your name, the date, the service, the physio who saw you and the amount paid. There is no GST line and no GSTIN, and that is correct.</p>
${fig(ph.H5i, "A plain receipt for each payment, on paper or as a download.")}
<h2>Getting a copy</h2>
<ul>
<li>Every payment has a receipt you can download from <a href="/account/receipts">Receipts in your account</a>.</li>
<li>Shruti can print one at the desk, or WhatsApp you a copy.</li>
<li>Need several months together for a claim? Ask at the desk and we will put them together for you.</li>
</ul>
<h2>Claiming it back</h2>
<p>Whether an insurer or employer pays you back depends entirely on your policy, and we can't tell you in advance whether a claim will be accepted. Some policies only cover physiotherapy after a hospital stay, some need a doctor's referral, some have a yearly cap. Please check with your insurer or HR team <em>before</em> you start if the claim matters to you. If they need a referral letter, ask your doctor; if they need a short note from us about the treatment, ask your physio.</p>`,
    },
    {
        slug: "getting-here-metro-parking-and-the-lift",
        title: "Getting here: the metro, parking and the lift",
        category: "help",
        daysAgo: 160,
        excerpt:
            "We are on the second floor of 418 CMH Road, two minutes from Indiranagar metro. Where to park a scooter or a car, and what to do if stairs are hard.",
        image: ph.H6c,
        body: `<p><strong>Stride Physio, 2nd floor, 418 CMH Road, Indiranagar, Bengaluru 560038.</strong></p>
<h2>By metro</h2>
<p>Indiranagar station on the Purple Line is about two minutes' walk away. Leave the station towards CMH Road and walk along it; our building is on the same side. If you are on crutches or in a knee brace, the metro and the walk are both manageable, and the station has lifts.</p>
${fig(ph.H6i, "Two-wheelers can park in the building's basement.")}
<h2>By scooter or bike</h2>
<p>There is two-wheeler parking in the basement of the building. Tell the security guard you are visiting Stride Physio.</p>
<h2>By car</h2>
<p>There is no car parking in the building. Most people find a spot on the side streets off 12th Main, or use the pay-and-park near the metro station. In the evening rush, CMH Road can be slow, so give yourself ten extra minutes; if you are going to be late, call or WhatsApp us and we will tell the physio.</p>
<h2>By auto or cab</h2>
<p>Ask to be dropped at the building gate on CMH Road. It is a short, flat walk to the lift.</p>
<h2>If stairs are difficult</h2>
<p>The building has a lift that comes up to our floor, and the clinic itself has no steps inside. If you are coming soon after surgery and getting out of a car is the hard part, tell Shruti when you book; someone can come down to meet you. And if travelling at all is too much for now, ask about a home visit.</p>`,
    },
    {
        slug: "how-a-home-visit-works",
        title: "How a home visit works, and the area we cover",
        category: "help",
        daysAgo: 38,
        excerpt:
            "A 60-minute visit from the physio, within about 4 km of the clinic. Who it is for, how to book it and how to get your home ready.",
        image: ph.H7c,
        body: `<p>A home visit is a 60-minute session with Dr. Rohit Menon in your own home. It costs ₹2,200 and covers the same kind of assessment and treatment you would have at the clinic, with the exercises built around your stairs, your bed and your chairs.</p>
<h2>Who it is for</h2>
<ul>
<li>The first weeks after a knee or hip replacement, or other surgery, when the trip to the clinic is the hardest part of the day.</li>
<li>Older family members who find travel tiring or who don't leave home much.</li>
<li>Anyone whose pain makes sitting in traffic impossible for now.</li>
</ul>
<h2>The area we cover</h2>
<p>We visit homes within about 4 km of the clinic: <strong>Indiranagar, Domlur, HAL 2nd Stage, Jeevan Bima Nagar, CV Raman Nagar and Old Airport Road</strong>. If you are just outside these areas, call and ask; if we can't come, we will say so plainly.</p>
${fig(ph.H7i, "We cover the neighbourhoods around Indiranagar, within about four kilometres.")}
<h2>Booking</h2>
<p>Home visits are booked through the desk rather than online, because Shruti plans them around the travel time between homes. Call or WhatsApp +91 00000 00008 with the address, the best time and a line about the problem. Pay by UPI or card after the visit, or online in advance.</p>
<h2>Getting ready for the visit</h2>
<ul>
<li>Keep the reports, discharge summary and medicines list handy.</li>
<li>Clear a space about two metres long, and keep a firm chair without wheels nearby.</li>
<li>For a first visit, it helps if a family member is at home to hear the plan too.</li>
<li>Wear loose clothes, shorts for a knee or hip, as you would at the clinic.</li>
</ul>
<p>Rohit brings resistance bands and anything else the session needs.</p>`,
    },
    {
        slug: "setting-up-an-online-follow-up",
        title: "Setting up for an online follow-up",
        category: "help",
        daysAgo: 48,
        excerpt:
            "A 30-minute video session for people who have already been assessed in person. Five minutes of setting up makes it far more useful.",
        image: ph.H8c,
        body: `<p>An online follow-up is a 30-minute video session (₹700) with your physio. It is for people who have <strong>already had an assessment in person</strong> with us, so we know your history and how you move. The video link comes with your booking confirmation.</p>
<h2>Before the call</h2>
<ol>
<li><strong>Prop the phone or laptop low and far.</strong> Your physio needs to see all of you, head to feet, while you move. A phone leaning against a few books on the floor, about two metres away, usually works better than a laptop on a table.</li>
<li><strong>Find light.</strong> Face a window, not away from it.</li>
<li><strong>Clear the space.</strong> Room to lie down and to take three steps.</li>
<li><strong>Have your kit ready.</strong> A firm chair, a mat or a towel, and any band or weight you were given.</li>
<li><strong>Open the link five minutes early</strong> to check sound and camera. Use headphones if the house is noisy.</li>
</ol>
${fig(ph.H8i, "A mat, a chair and room to move are usually enough.")}
<h2>What we do in 30 minutes</h2>
<p>We ask how things have been, watch you do your exercises, correct form, progress what has become too easy and adjust what has become too sore. You get an updated plan afterwards.</p>
<h2>When it is better to come in</h2>
<p>A video session can't replace hands-on assessment. If you have a new injury, if things are getting worse rather than better, or if you notice new numbness, weakness or pain that wakes you at night, book a visit to the clinic, and see a doctor promptly if those changes are sudden.</p>`,
    },
    {
        slug: "dry-needling-what-a-session-involves-and-consent",
        title: "Dry needling: what a session involves, and your consent",
        category: "help",
        daysAgo: 85,
        excerpt:
            "Dry needling is only offered after an assessment and with your written consent. What it is, how it feels, and who should avoid it.",
        image: ph.H9c,
        body: `<p>Dry needling uses very fine, sterile, single-use needles placed into tight, tender areas of muscle. Some physios use it as one part of treatment for muscle-related pain, for example in the upper back, shoulders, buttocks or calves. It is a 30-minute session (₹1,200) and is never a treatment on its own: it sits alongside exercise and the rest of your plan.</p>
<h2>Only after an assessment</h2>
<p>We offer dry needling only to people we have assessed, so the physio knows why it might help and where it shouldn't be used. If your physio thinks it is worth trying, they will explain it first. You can always say no, and it won't change the rest of your care.</p>
<h2>Written consent</h2>
<p>Before the first session, you read and sign a consent form. It covers what the needling is, the common after-effects, the rare risks, and that you can ask us to stop at any moment. Please tell us if any of these apply to you:</p>
<ul>
<li>You are pregnant or may be.</li>
<li>You take blood thinners, or have a bleeding disorder.</li>
<li>You have diabetes, a weakened immune system, or a skin infection near the area.</li>
<li>You have a metal allergy or a strong fear of needles, or have fainted with injections before.</li>
</ul>
${fig(ph.H9i, "The consent form is explained and signed before the first session.")}
<h2>How it feels</h2>
<p>Most people feel a small prick, then a dull ache or a brief twitch of the muscle. Afterwards, the area can feel sore or bruised for a day or two, a bit like after a hard workout. Gentle movement usually helps. If you notice unusual breathlessness after needling around the chest or upper back, or signs of infection where a needle went in, contact a doctor straight away and let us know.</p>
<p>Some people feel it helps; some notice little difference. We will review it with you rather than keep repeating it.</p>`,
    },
    {
        slug: "the-keep-moving-plan-and-how-to-book-it",
        title: "The Keep Moving plan, and how to book it",
        category: "help",
        daysAgo: 16,
        excerpt:
            "Two check-in sessions a month for people managing long-term back, neck or knee pain. Booked through the desk, and you can stop before any month.",
        image: ph.H10c,
        body: `<p>Long-term pain rarely needs weekly treatment. What many people find useful is a regular check-in: someone who knows their back, neck or knee, who looks at how they are doing, updates the exercises and spots a flare-up before it takes over a month.</p>
<p>The <strong>Keep Moving plan</strong> is that check-in. It costs ₹1,900 a month and includes <strong>two sessions a month</strong> with your physio.</p>
<h2>Who it suits</h2>
<ul>
<li>People living with persistent low back or neck pain who already know their exercises but drift away from them.</li>
<li>People with knee osteoarthritis who have finished the knee programme and want to keep going.</li>
<li>Desk workers whose neck and shoulders creep back after a busy quarter.</li>
</ul>
<p>It is not for a new injury: that needs a first assessment, so we can find out what is going on.</p>
${fig(ph.H10i, "Each check-in reviews how you have been and updates the exercises.")}
<h2>Booking it</h2>
<p>The plan is set up through the desk, not online. Talk to your physio at your next visit, or call or WhatsApp Shruti on +91 00000 00008. She will set up the plan, take the first month's payment and book your two sessions for the month with you, usually two weeks apart. The two sessions are meant for that month, so tell her early if a trip is coming up and she will help you fit them in.</p>
<h2>Stopping</h2>
<p>You can stop any time before the next month begins. Tell the desk and the next month won't be charged. No questions, no exit forms.</p>`,
    },

    // ── News ─────────────────────────────────────────────────────────
    {
        slug: "welcome-dr-rohit-menon",
        title: "Welcome, Dr. Rohit Menon",
        category: "news",
        daysAgo: 152,
        excerpt:
            "Rohit joins us from Monday 18 May, bringing orthopaedic rehab after surgery and back pain care to the clinic.",
        image: ph.N2c,
        body: `<p>We are very glad to say that <strong>Dr. Rohit Menon (PT)</strong> joins Stride Physio from Monday 18 May.</p>
<p>Rohit has a master's in orthopaedic physiotherapy and has spent his career in post-surgery rehab: knee and shoulder replacements, ACL reconstructions, and the long, careful months that follow. He also sees a lot of people with back pain, and is good at explaining what a scan report does and doesn't mean.</p>
${fig(ph.N2i, "Rohit's work is mostly rehab after knee and shoulder surgery.")}
<p>With two physios on the diary, there will be more early-morning and evening slots through the week. Ananya will keep seeing runners, cricketers and desk workers; if you have had surgery, or are about to, Rohit is the person to ask for when you book.</p>
<p>Later this year Rohit will also start home visits for people who can't easily get to us. More on that soon.</p>
<p>Say hello when you next come in. <a href="/book">Book with Rohit</a>.</p>`,
    },
    {
        slug: "free-running-form-check-saturday-30-may",
        title: "Free running-form check before the monsoon 10Ks",
        category: "news",
        daysAgo: 147,
        excerpt:
            "Ten-minute running-form checks with Ananya on Saturday 30 May, 6:30 to 8 am, before the clinic opens. Free; register on WhatsApp.",
        image: ph.N1c,
        body: `<p>June and July bring Bengaluru's monsoon run season, and with it a familiar wave of sore shins and knees in the clinic. So before the training ramps up, Dr. Ananya Krishnan is holding a free running-form morning.</p>
<ul>
<li><strong>When:</strong> Saturday 30 May, 6:30 to 8 am, before the clinic opens.</li>
<li><strong>Where:</strong> Stride Physio, 2nd floor, 418 CMH Road, and the quiet stretch outside.</li>
<li><strong>What:</strong> a 10-minute slot each. Ananya films you running from the side and from behind on a phone, then talks you through two or three things worth working on.</li>
<li><strong>Cost:</strong> free. There are 9 slots; register on WhatsApp at +91 00000 00008.</li>
</ul>
${fig(ph.N1i, "Bring the shoes you actually train in.")}
<p>Come in the shoes you run in and something you can move in. This is a form check, not a medical assessment: if something is already hurting, a <a href="/book">first assessment</a> is the better place to start.</p>`,
    },
    {
        slug: "home-visits-start-in-indiranagar",
        title: "Home visits start in Indiranagar",
        category: "news",
        daysAgo: 118,
        excerpt:
            "From Monday 22 June, Dr. Rohit Menon will visit patients at home in Indiranagar. Sixty minutes, ₹2,200, booked through the desk.",
        image: ph.N3c,
        body: `<p>Some of the people who most need physiotherapy find it hardest to reach us: someone a week out of a knee replacement, a grandparent who hasn't left the house since a fall. From <strong>Monday 22 June</strong>, we will come to them.</p>
<p>Dr. Rohit Menon will make home visits within Indiranagar. Each visit is 60 minutes with Rohit and costs ₹2,200. He brings what the session needs and plans exercises around your own stairs, bed and chairs.</p>
${fig(ph.N3i, "Visits start within Indiranagar.")}
<p>Home visits are booked through the desk so Shruti can plan the travel between homes. Call or WhatsApp +91 00000 00008 with your address and a good time.</p>
<p>We are starting with Indiranagar only so we can keep to time. If it works well, we hope to cover the neighbouring areas later in the year.</p>`,
    },
    {
        slug: "saturdays-now-open-until-2-pm",
        title: "Saturdays now open 8 am to 2 pm",
        category: "news",
        daysAgo: 58,
        excerpt:
            "From Saturday 22 August, the clinic opens an hour earlier and closes an hour later on Saturdays.",
        image: ph.N4c,
        body: `<p>Saturday mornings have been our busiest slots for months, and the waiting list for them kept growing. So from <strong>Saturday 22 August</strong>, Saturday hours change:</p>
<ul>
<li><strong>Before:</strong> 9 am to 1 pm</li>
<li><strong>Now:</strong> 8 am to 2 pm</li>
</ul>
<p>That is two more hours each Saturday, which should help everyone who can't get away from work on a weekday. Weekday hours stay the same: 7:30 am to 1 pm and 4 pm to 8 pm, Monday to Friday. We are still closed on Sundays.</p>
${fig(ph.N4i, "The extra hour at 8 am is popular with people who run or walk first.")}
<p>Both Ananya and Rohit will be in on Saturdays, so the extra hours cover first assessments, follow-ups and post-surgery rehab alike. Shruti will be at the desk from 7:45 am if you need to buy a pack or pick up a receipt before your session.</p>
<p>The new Saturday slots are open for <a href="/book">online booking</a> now, up to 21 days ahead.</p>`,
    },
    {
        slug: "online-follow-ups-are-here",
        title: "Online follow-ups are here",
        category: "news",
        daysAgo: 50,
        excerpt:
            "If you have been assessed at the clinic, you can now have a 30-minute follow-up by video for ₹700.",
        image: ph.N5c,
        body: `<p>Rain, traffic on the Old Airport Road, a work trip, a sick child at home: there are plenty of reasons a follow-up gets missed. From this week you can have one by video instead.</p>
<p><strong>Online follow-ups</strong> are 30 minutes with your physio and cost ₹700. The video link arrives with your booking confirmation; you need only a phone or laptop and a bit of floor space.</p>
${fig(ph.N5i, "Your physio watches your exercises and adjusts them on the call.")}
<p>They are for people who have <strong>already been assessed in person</strong> at the clinic. We need to have examined you before we can sensibly guide you over a screen, and some problems still need hands-on care, so your physio may suggest coming in instead.</p>
<p>We have put together a short guide to getting set up for the call. Online follow-ups are open for <a href="/book">booking</a> now.</p>`,
    },
    {
        slug: "home-visits-now-cover-domlur-to-old-airport-road",
        title: "Home visits now reach Domlur, HAL 2nd Stage and beyond",
        category: "news",
        daysAgo: 42,
        excerpt:
            "Home visits now cover Domlur, HAL 2nd Stage, Jeevan Bima Nagar, CV Raman Nagar and Old Airport Road, as well as Indiranagar.",
        image: ph.N6c,
        body: `<p>When home visits started in June we kept them to Indiranagar, to be sure we could arrive on time. Since then the calls from just outside the area have kept coming, often from families caring for a parent after surgery.</p>
<p>So from this week, Dr. Rohit Menon's home visits cover homes within about 4 km of the clinic:</p>
<ul>
<li>Indiranagar</li>
<li>Domlur</li>
<li>HAL 2nd Stage</li>
<li>Jeevan Bima Nagar</li>
<li>CV Raman Nagar</li>
<li>Old Airport Road</li>
</ul>
${fig(ph.N6i, "Most home visits are with people recovering from surgery or a fall.")}
<p>The visit is the same: 60 minutes with Rohit, ₹2,200, booked through the desk on +91 00000 00008. Mornings fill first, so if you are flexible, mention an afternoon window when you call. Our help page on how a home visit works explains how to get your home ready for one.</p>`,
    },
    {
        slug: "new-knee-rehab-programme",
        title: "New: a six-session knee rehab programme",
        category: "news",
        daysAgo: 33,
        excerpt:
            "A structured six-week programme for people living with knee osteoarthritis, starting after an assessment. ₹6,000 for six 45-minute sessions.",
        image: ph.N7c,
        body: `<p>Knee osteoarthritis is one of the most common reasons people come to us, and many of them ask the same thing: "What should I actually be doing, week by week?"</p>
<p>Our new <strong>knee rehab programme</strong> is our answer. It is six 45-minute sessions, ₹6,000 paid upfront, built around strength, balance and walking. We measure a few everyday things at the start (standing up from a chair, managing stairs, how far you walk) and again at the end, so you can see where you stand.</p>
${fig(ph.N7i, "Walking is part of the plan, built up gradually.")}
<p>The programme begins after a first assessment, so the physio can check it suits your knee. Ananya and Rohit both run it. It won't cure arthritis, and we won't pretend otherwise, but it gives you a clear plan and someone to check your progress along the way.</p>
<p>Read what the six sessions involve, or <a href="/book">book a first assessment</a>.</p>`,
    },
    {
        slug: "pre-season-cricket-screening-3-october",
        title: "Pre-season screening for cricketers, Saturday 3 October",
        category: "news",
        daysAgo: 24,
        excerpt:
            "A free morning of shoulder, back and hamstring checks for club and school cricketers aged 14 and up, before the season starts.",
        image: ph.N8c,
        body: `<p>Once the rains ease, nets fill up across the city, and so does our diary with bowlers' backs and fielders' shoulders. Dr. Ananya Krishnan treats a lot of cricketers, and she would rather see you before the season than in the middle of it.</p>
<p>On <strong>Saturday 3 October, 6:30 to 8 am</strong>, she is running a free pre-season screening at the clinic for club and school cricketers aged 14 and up.</p>
<h2>What we check</h2>
<ul>
<li>Shoulder range and strength, especially for throwers.</li>
<li>Back and hip movement for fast bowlers.</li>
<li>Hamstring and calf strength, and single-leg balance.</li>
</ul>
${fig(ph.N8i, "Fast bowlers in particular benefit from a back and hip check before the season.")}
<p>Each player gets 15 minutes and a short list of exercises to work on. Under-18s, please come with a parent. Register on WhatsApp at +91 00000 00008; there are 6 slots.</p>
<p>A screening is not a diagnosis. If something already hurts, <a href="/book">book a sports injury session</a> instead.</p>`,
    },
    {
        slug: "deepavali-hours",
        title: "Deepavali hours",
        category: "news",
        daysAgo: 6,
        excerpt:
            "We are closed on Deepavali, Sunday 8 November. Saturday 7 and Monday 9 November run as usual, and both fill up fast.",
        image: ph.N9c,
        body: `<p>Deepavali falls on <strong>Sunday 8 November</strong> this year, and the clinic is closed for the day.</p>
<ul>
<li><strong>Saturday 7 November:</strong> open as usual, 8 am to 2 pm.</li>
<li><strong>Sunday 8 November:</strong> closed for Deepavali.</li>
<li><strong>Monday 9 November:</strong> open as usual, 7:30 am to 1 pm and 4 pm to 8 pm.</li>
</ul>
${fig(ph.N9i, "Wishing everyone a bright and safe Deepavali.")}
<p>The week before a festival always fills up, especially Saturday morning. If you will be travelling or hosting family, <a href="/book">book</a> your follow-up early, or set up an online follow-up for while you are away.</p>
<p>Messages sent on Deepavali will be answered on Monday morning. If you are recovering from surgery and are unsure about anything over the long weekend, call your surgeon's team or hospital; for anything urgent, go to the nearest emergency department.</p>
<p>Happy Deepavali from Ananya, Rohit and Shruti.</p>`,
    },

    // ── Articles ─────────────────────────────────────────────────────
    {
        slug: "desk-neck-five-fixes",
        title: "Desk neck: five fixes that don't need a new chair",
        category: "articles",
        daysAgo: 175,
        excerpt:
            "A stiff, aching neck by Thursday afternoon is common among desk workers. Five small changes our physios suggest most often.",
        image: ph.A1c,
        body: `<p>It usually starts the same way. A dull ache at the base of the skull by mid-afternoon, a neck that feels like it needs cracking, shoulders slowly creeping up towards the ears. By Friday it has turned into a headache. Dr. Ananya Krishnan sees this pattern most weeks, mostly in people who spend long days at a screen.</p>
<p>The good news is that desk neck is rarely serious, and small changes often make a real difference. None of these needs a new chair.</p>
<h2>1. Lift the screen</h2>
<p>If you work on a laptop, you are almost certainly looking down. The top of the screen should be roughly at eye level. Stack a few books, a shoebox or an old printer ream under the laptop and use a separate keyboard and mouse. It costs very little and is the single most useful change for most people.</p>
${fig(ph.A1i, "A raised screen and a separate keyboard keep your head over your shoulders.")}
<h2>2. Move every 30 to 45 minutes</h2>
<p>No single posture is the "right" one. The problem is staying in any one position for hours. Set a reminder, stand for calls, refill your water bottle at the far end of the office. The best posture is the next one.</p>
<h2>3. Chin nods</h2>
<p>Sit tall. Gently nod your chin down, as if saying "yes" very slowly, and feel a stretch at the back of your neck. Hold for five seconds and relax. Do 10. This wakes up the small muscles at the front of the neck that tend to switch off when the head drifts forward.</p>
<h2>4. Shoulder blade squeezes</h2>
<p>Let your arms hang. Draw your shoulder blades gently back and down, as if sliding them into your back pockets, hold for five seconds and let go. Do 10, a few times a day. Keep it gentle; this is not about forcing your shoulders back.</p>
<h2>5. Open up the upper back</h2>
<p>Sit back in your chair with your hands behind your head and gently arch your upper back over the top of the backrest, looking slightly up. Hold for a breath or two and come back. Repeat five times. If your chair has a low back, roll up a towel and lie on it lengthways on the floor for a few minutes instead.</p>
<h2>A word about phones</h2>
<p>Much of what gets called "desk neck" happens after work, on the sofa, scrolling. Lift the phone up towards your eye line rather than bending your head down to it.</p>
<h2>How to do the exercises safely</h2>
<p>Move slowly and within comfort. A mild stretch is fine; sharp pain is not. If any exercise causes sharp or increasing pain, stop it and ask a physio.</p>
<h2>When to see a doctor</h2>
<p>See a doctor promptly if neck pain comes with:</p>
<ul>
<li>pain, pins and needles, numbness or weakness spreading down an arm;</li>
<li>dizziness, blurred or double vision, difficulty speaking or swallowing;</li>
<li>a fever, or a severe headache unlike any you have had before;</li>
<li>pain that started after a fall or an accident.</li>
</ul>
<p>And if your neck still aches after a few weeks of trying these fixes, a <a href="/book">first assessment</a> can look at what else is going on.</p>`,
    },
    {
        slug: "after-an-ankle-sprain-getting-back-on-your-feet",
        title: "After an ankle sprain: getting back on your feet",
        category: "articles",
        daysAgo: 140,
        excerpt:
            "Rolled an ankle on a broken footpath or the badminton court? What usually helps in the first days, and why balance work matters later.",
        image: ph.A2c,
        body: `<p>Bengaluru's footpaths give the ankle plenty of chances: a missing slab, a sudden kerb, a pothole hidden under rainwater. Add weekend badminton and football, and ankle sprains are one of the most common injuries we see at Stride Physio.</p>
<p>Most sprains involve stretching or tearing the ligaments on the outside of the ankle when the foot rolls inwards. Most recover well, but a sprain that is rushed, or simply ignored, has a habit of happening again.</p>
<h2>First, is it more than a sprain?</h2>
<p>See a doctor, or go to an emergency department, if:</p>
<ul>
<li>you couldn't take four steps straight after the injury, or still can't;</li>
<li>pressing on the bony points of the ankle or the middle of the foot is very painful;</li>
<li>the ankle or foot looks out of shape, or feels numb, cold or pale;</li>
<li>the swelling and pain are getting worse rather than better after two or three days.</li>
</ul>
<p>These can be signs of a fracture or a more serious injury that needs an X-ray.</p>
<h2>The first few days</h2>
<p>Protect the ankle without fully resting it. Walk as much as is comfortable, using a support or a stick if needed. Raise the foot above the level of your hip when you sit, which helps the swelling. Many people find a cold pack, wrapped in a cloth, eases the pain for 10 to 15 minutes at a time. Gentle movement, like tracing the alphabet in the air with your big toe, helps keep the ankle from stiffening.</p>
${fig(ph.A2i, "Single-leg balance is one of the most useful exercises after a sprain.")}
<h2>The next few weeks</h2>
<p>As the pain settles, the work shifts to three things.</p>
<h3>Movement</h3>
<p>Getting back the full range, especially bending the ankle so the knee can travel forward over the toes. A stiff ankle changes the way you walk and loads the knee and hip instead.</p>
<h3>Strength</h3>
<p>Calf raises on both feet, then one foot. Pushing the foot outwards against a resistance band. Start with what you can do comfortably and build up.</p>
<h3>Balance</h3>
<p>Ligaments do more than hold bones together: they help tell your brain where your foot is. After a sprain that sense is often dulled, which is one reason ankles get sprained again. Stand on the injured leg near a wall or a counter for 30 seconds. When that is easy, try it with your eyes closed, or standing on a folded towel.</p>
<p>Stop any exercise that causes sharp pain, and go back a step.</p>
<h2>Back to sport</h2>
<p>Before you return to running or court sports, you should be able to hop on the injured leg without pain, balance on it as well as the other one, and change direction at speed. That may take two weeks or it may take a couple of months, depending on the sprain. A physio can test these things with you and plan the steps in between, including whether taping or an ankle support makes sense while you get your confidence back.</p>
<p>If a sprain is still swollen or giving way after a few weeks, <a href="/book">book a sports injury session</a>.</p>`,
    },
    {
        slug: "running-through-the-monsoon-without-getting-injured",
        title: "Running through the monsoon without getting injured",
        category: "articles",
        daysAgo: 125,
        excerpt:
            "Wet roads, a crowded race calendar and a sudden jump in mileage: why June and July bring runners to the clinic, and what helps.",
        image: ph.A3c,
        body: `<p>Every year, as the first monsoon showers cool the city down, two things happen. Bengaluru's runners come out in force for the season's 10Ks and half marathons, and a few weeks later, many of them turn up at the clinic. Dr. Ananya Krishnan runs herself and has treated runners for over a decade. Most of the injuries she sees in June and July have the same root: too much, too soon.</p>
<h2>Build up gradually</h2>
<p>Bodies adapt to running, but bones, tendons and muscles adapt at different speeds. Your fitness can improve faster than your Achilles tendon. A race date on the calendar makes it tempting to jump from 15 km a week to 30. Instead, increase your weekly distance gradually, and every third or fourth week, run a little less to let your body catch up.</p>
<h2>Respect the wet</h2>
<ul>
<li><strong>Surfaces:</strong> wet tiles, painted road markings and leaf-covered paths are slippery. Shorten your stride on them, and save fast sessions for drier days or better surfaces.</li>
<li><strong>Visibility:</strong> dark mornings and heavy showers make you harder to see. Wear something bright and reflective, especially on roads shared with traffic.</li>
<li><strong>Shoes:</strong> running in wet shoes changes how they grip and cushion. If you run most days, a second pair lets each dry out properly. Stuff wet shoes with newspaper rather than drying them in the sun.</li>
</ul>
${fig(ph.A3i, "Two short strength sessions a week support everything else.")}
<h2>Add two strength sessions a week</h2>
<p>Strength training is one of the best-supported ways to help prevent running injuries. Twenty minutes, twice a week, is enough to start:</p>
<ul>
<li>Calf raises, building to single-leg: three sets of 15.</li>
<li>Split squats or step-ups: three sets of 10 each side.</li>
<li>Bridges, progressing to single-leg bridges: three sets of 12.</li>
<li>Side planks: three holds of 20 to 30 seconds each side.</li>
</ul>
<p>Start with what you can do comfortably and build up over the weeks. Stop any exercise that causes sharp pain.</p>
<h2>Sleep and fuel</h2>
<p>Early-morning runners often trade sleep for mileage. Recovery happens while you rest, and a run on five hours of sleep is harder on the body than it feels. Eat enough, too, especially when training increases.</p>
<h2>Listen to the right signals</h2>
<p>Some stiffness the morning after a long run is normal and settles as you warm up. Pay attention if:</p>
<ul>
<li>pain makes you change the way you run;</li>
<li>pain gets worse as the run goes on, rather than easing;</li>
<li>there is one small spot on a bone, often the shin or foot, that is very tender to press;</li>
<li>pain is there at rest or wakes you at night.</li>
</ul>
<p>Bone pain like this can be a sign of a stress fracture. Stop running and see a doctor. For other niggles that won't settle within a week or two, <a href="/book">book a sports injury session</a> before your race rather than after it.</p>`,
    },
    {
        slug: "lower-back-pain-six-myths",
        title: "Lower back pain: six myths worth letting go of",
        category: "articles",
        daysAgo: 108,
        excerpt:
            'Bed rest, scans, bending and "a disc that slipped out": Dr. Rohit Menon on what we now know about everyday back pain.',
        image: ph.A4c,
        body: `<p>Back pain comes with a lot of advice, much of it from family, colleagues and the internet, and much of it out of date. Dr. Rohit Menon sees people with back pain every day at Stride Physio. These are the beliefs he most often finds himself gently challenging.</p>
<h2>Myth 1: "Rest in bed until it goes away."</h2>
<p>For most everyday back pain, staying in bed tends to slow recovery. Gentle movement, short walks and getting back to normal activities as you are able usually help more. You may need to do less for a few days, but less is not the same as nothing.</p>
<h2>Myth 2: "I need an MRI to know what's wrong."</h2>
<p>For most back pain, a scan doesn't change the treatment. Scans also show many changes, such as disc bulges and "degeneration", in plenty of people who have no pain at all. A scan is important when a doctor suspects something specific, for example after a significant injury or when there are warning signs like those below. Otherwise, a careful examination usually tells us more.</p>
${fig(ph.A4i, "Walking is one of the simplest ways to keep a sore back moving.")}
<h2>Myth 3: "My disc slipped out and needs to be put back."</h2>
<p>Discs don't slip out of place like a drawer, and nobody can push them back in. A disc can bulge and irritate a nerve, and that can be very painful, but these often settle over time with movement, time and the right exercise.</p>
<h2>Myth 4: "Bending and lifting with a rounded back is dangerous."</h2>
<p>The spine is built to bend. There is no single safe way to lift, and people who lift with a rounded back are not clearly at more risk than those who keep it straight. What matters more is building up gradually to the loads you need to handle, whether that is a toddler, a gas cylinder or a suitcase.</p>
<h2>Myth 5: "It hurts, so something must be damaged."</h2>
<p>Pain is real, but how much it hurts doesn't reliably show how much damage there is. Sleep, stress, worry and how active you are all affect how much pain you feel. That is not saying "it's in your head". It means there are more ways to help than you might think.</p>
<h2>Myth 6: "A weak core caused this, so I need to strengthen it."</h2>
<p>Exercise helps back pain, but no single type has been shown to be clearly better than others. The best exercise is one you will keep doing: walking, swimming, yoga, strength training. A physio can help you start at the right level and build up.</p>
<h2>When back pain needs a doctor urgently</h2>
<p>Most back pain is not serious. But see a doctor straight away, or go to an emergency department, if you have back pain with any of these:</p>
<ul>
<li>loss of control of your bladder or bowels, or difficulty passing urine;</li>
<li>numbness around your genitals, buttocks or inner thighs;</li>
<li>weakness in your legs that is getting worse;</li>
<li>a fever, or feeling generally unwell;</li>
<li>unexplained weight loss, or a history of cancer;</li>
<li>pain after a significant fall or accident.</li>
</ul>
<p>For pain that hasn't settled after a few weeks, or keeps coming back, <a href="/book">book an assessment</a>. We will explain what we find and set a plan that fits your days.</p>`,
    },
    {
        slug: "laptop-at-home-a-better-setup-for-bengaluru-wfh",
        title: "Laptop at home: a better setup for work-from-home days",
        category: "articles",
        daysAgo: 92,
        excerpt:
            "Dining tables, beds and sofas weren't built for eight-hour workdays. Cheap ways to make a home setup kinder to your back, neck and wrists.",
        image: ph.A5c,
        body: `<p>Plenty of Bengaluru's tech workers now split the week between the office and home, and some have not seen an office in years. Few homes were set up for that. The laptop ends up on the dining table, the bed or the sofa arm, the chair is whatever was free, and by evening the neck, lower back or wrists are complaining.</p>
<p>There is no single perfect posture, and you don't need an expensive chair to work comfortably. What helps is a setup that lets you sit comfortably, see the screen without stooping, and get up often.</p>
<h2>Start with the screen</h2>
<p>A laptop's biggest drawback is that its screen and keyboard are joined. Put the keyboard where your hands are comfortable and the screen is too low; raise the screen and your shoulders hunch to reach the keys. The fix is to separate them:</p>
<ul>
<li>Raise the laptop so the top of the screen is about at eye level, using a stand, a stack of books or a sturdy box.</li>
<li>Add a separate keyboard and mouse. Even inexpensive ones make a big difference.</li>
<li>If you have an old monitor at home, use it.</li>
</ul>
${fig(ph.A5i, "A raised laptop with a separate keyboard and mouse.")}
<h2>Then the chair and the table</h2>
<ul>
<li><strong>Height:</strong> elbows roughly level with the table, shoulders relaxed. A dining table is usually a little high; a firm cushion on the chair often fixes this.</li>
<li><strong>Feet:</strong> flat on the floor or on a footrest. A small stool, a box or a couple of thick books will do.</li>
<li><strong>Back:</strong> a rolled towel or small cushion behind the lower back can make a plain chair more comfortable.</li>
</ul>
<h2>Bed and sofa days</h2>
<p>Everyone has them. If you must work from the bed or sofa, keep it to shorter stretches, sit up against pillows rather than lying propped on one elbow, and put the laptop on a firm cushion or tray so you aren't curled over it.</p>
<h2>Light and noise</h2>
<p>A window to the side, rather than behind the screen or behind you, cuts glare and squinting. Headphones for calls stop you holding the phone against your shoulder.</p>
<h2>Move more than you think you need to</h2>
<p>Working from home removes the walk to the meeting room, the canteen and the bus. Put some back:</p>
<ul>
<li>Stand or walk for phone calls without video.</li>
<li>Every 30 to 45 minutes, stand up, roll your shoulders and walk to the kitchen.</li>
<li>Take a proper lunch break away from the screen.</li>
<li>Use the time you save on traffic for a walk around the block or a short exercise session.</li>
</ul>
<h2>If it still hurts</h2>
<p>A better setup helps many people, but it isn't the whole picture: sleep, stress and how active you are outside work matter too. If pain persists for more than a few weeks, or you have numbness, tingling or weakness in the arms or hands, see a physio or doctor. Our neck exercises are in Desk neck: five fixes, and you can <a href="/book">book an assessment</a> if you'd like someone to look properly.</p>`,
    },
    {
        slug: "home-exercises-for-knee-pain",
        title: "Home exercises for knee pain",
        category: "articles",
        daysAgo: 65,
        excerpt:
            "Five exercises our physios often start with for everyday knee pain and knee osteoarthritis, with how many to do and when to stop.",
        image: ph.A6c,
        body: `<p>Knee pain makes many people want to protect the knee by doing less. Often, the opposite helps: stronger thigh and hip muscles share the load the knee carries, and regular movement helps the joint feel less stiff. These five exercises are ones our physios often begin with for knee osteoarthritis and general knee pain. They are a starting point, not a prescription; a physio can tailor them to your knee.</p>
<h2>Before you start: the pain rule</h2>
<p>Some discomfort during exercise is fine and expected. As a rough guide, mild discomfort that settles within a day is acceptable. <strong>Stop any exercise that causes sharp pain</strong>, or if the knee is more painful or swollen the next day; next time, do fewer or make it easier.</p>
<h2>1. Sit to stand</h2>
<p>Sit on a firm chair, feet hip-width apart. Lean slightly forward and stand up, using your hands on your thighs if you need to. Sit down slowly. Do 3 sets of 8 to 10. Use a higher chair, or a cushion, to make it easier; a lower chair or arms across the chest to make it harder.</p>
${fig(ph.A6i, "A slow, controlled squat: the same movement as standing up from a chair.")}
<h2>2. Straight leg raise</h2>
<p>Lie on your back with one knee bent and the other leg straight. Tighten the thigh of the straight leg, then lift it to the height of the bent knee. Hold for two seconds and lower slowly. Do 3 sets of 10 on each side.</p>
<h2>3. Bridges</h2>
<p>Lie on your back with both knees bent and feet flat. Squeeze your buttocks and lift your hips until your body is in a line from shoulders to knees. Hold for three seconds and lower. Do 3 sets of 10.</p>
<h2>4. Step-ups</h2>
<p>Stand facing the bottom step of a staircase, holding the rail. Step up with the sore leg, bring the other foot up, then step down. Do 3 sets of 8 on each side. Start with a low step if a full stair is too much.</p>
<h2>5. Calf raises</h2>
<p>Stand holding a counter or the back of a chair. Rise up on your toes, then lower slowly. Do 3 sets of 15. Strong calves help with walking and stairs.</p>
<h2>And walk</h2>
<p>Walking is one of the most useful things you can do for knee arthritis. If walking hurts now, start with a distance that is comfortable, even if it is short, and add a little each week. Flat, even ground is easiest; many people find walking at the park, rather than on broken footpaths, helps.</p>
<h2>How often</h2>
<p>Do the exercises three or four times a week. Expect changes to take weeks, not days. Keep a note of how many sit-to-stands you can do; it is a useful way to track progress.</p>
<h2>When to see a doctor</h2>
<p>See a doctor if your knee:</p>
<ul>
<li>becomes hot, red and very swollen, especially with a fever;</li>
<li>locks and won't straighten, or keeps giving way;</li>
<li>can't take your weight after an injury;</li>
<li>is painful along with swelling or tenderness in the calf.</li>
</ul>
<p>If you would like a structured plan and someone to check your progress, our knee rehab programme starts with a <a href="/book">first assessment</a>.</p>`,
    },
    {
        slug: "returning-to-sport-after-acl-surgery",
        title: "Returning to sport after ACL surgery",
        category: "articles",
        daysAgo: 45,
        excerpt:
            "Why the return after an ACL reconstruction is measured in months and milestones rather than a date, and what each stage looks like.",
        image: ph.A7c,
        body: `<p>An anterior cruciate ligament (ACL) tear often happens in a moment: a sudden twist on the football pitch, an awkward landing in basketball, a fielder planting a foot to change direction. The road back after an ACL reconstruction is much longer. Dr. Rohit Menon works with many people through this rehab, and the question he hears most is "When can I play again?"</p>
<p>His honest answer is: when your knee is ready, which is something we test, rather than a date on the calendar. Many surgeons and physios suggest that a return to cutting and pivoting sports usually takes at least nine months, but every knee and every surgery is different. Your surgeon's advice always comes first.</p>
<h2>The stages of rehab</h2>
<p>Exact plans depend on your surgery and your surgeon's protocol, but rehab usually moves through these stages.</p>
<h3>Early weeks: settle the knee</h3>
<p>Control the swelling, get the knee fully straight and gradually bent, and get the thigh muscle working again. Walking normally without crutches is an early goal. Getting full straightening back early matters a great deal.</p>
<h3>Building strength</h3>
<p>The quadriceps, hamstrings, hips and calves need to be strong again, which takes months of steady, progressive strength training. This is often the stage where people lose patience, and it is the one that matters most.</p>
${fig(ph.A7i, "Agility and change-of-direction drills come late in rehab, once strength is back.")}
<h3>Running and jumping</h3>
<p>Once strength and control are good enough, running begins, usually in a straight line, along with hopping and landing drills.</p>
<h3>Agility and sport-specific work</h3>
<p>Cutting, change of direction, deceleration, and the movements of your sport: a bowler's follow-through, a defender's sidestep, a badminton lunge.</p>
<h3>Testing before returning</h3>
<p>Before returning to full training and matches, we look at several things together: strength of the operated leg compared with the other, hop tests, the quality of movement when you land and change direction, and how confident you feel. Fear of re-injury is common and normal, and it matters; we work on it as part of rehab.</p>
<h2>Why not rush?</h2>
<p>Returning to pivoting sport too early is linked with a higher chance of injuring the knee again, either the same ligament or the other knee. The extra weeks spent getting strong are worth it.</p>
<h2>Working with your surgeon</h2>
<p>We follow your surgeon's protocol and restrictions, and keep in touch with them when there are questions. Bring your surgeon's notes to your first assessment.</p>
<h2>When to contact your surgeon or a doctor</h2>
<ul>
<li>A fever, redness or discharge from the wound.</li>
<li>Calf pain, swelling or warmth, or sudden breathlessness.</li>
<li>A new injury with a pop, rapid swelling, or the knee giving way.</li>
</ul>
<p>To start or continue rehab with Rohit, <a href="/book">book post-surgery rehab</a>.</p>`,
    },
    {
        slug: "frozen-shoulder-what-to-expect",
        title: "Frozen shoulder: what to expect, and what helps",
        category: "articles",
        daysAgo: 20,
        excerpt:
            "A shoulder that slowly stiffens until you can't reach the top shelf or fasten a blouse. What frozen shoulder is, how it tends to run, and how physiotherapy fits in.",
        image: ph.A8c,
        body: `<p>It often starts as an ache you put down to sleeping awkwardly. Over weeks the shoulder becomes painful at night, and then slowly stiffer, until reaching behind your back, tying your hair or lifting a bag into the overhead rack becomes hard. This is a common story for frozen shoulder, also called adhesive capsulitis.</p>
<h2>What is it?</h2>
<p>The capsule around the shoulder joint becomes inflamed and then thickens and tightens, limiting movement in every direction. It is most common between the ages of 40 and 60, more common in women, and seen more often in people with diabetes or thyroid conditions. Often there is no clear cause.</p>
<h2>How it tends to run</h2>
<p>Frozen shoulder often moves through overlapping phases:</p>
<ol>
<li><strong>Freezing:</strong> pain builds, often worst at night, and movement starts to reduce.</li>
<li><strong>Frozen:</strong> pain may ease, but stiffness is at its most marked.</li>
<li><strong>Thawing:</strong> movement gradually returns.</li>
</ol>
<p>The whole course can last many months, and sometimes a couple of years. Many people regain most of their movement over time, though some are left with some stiffness. That timeline can be hard to hear, and it helps to know it from the start.</p>
${fig(ph.A8i, "Gentle, regular movement within comfort is the aim, not forcing the stiffness.")}
<h2>How physiotherapy fits in</h2>
<p>Physiotherapy can't hurry the condition through its phases on its own, but it can help you manage pain, keep the movement you have, and regain movement as the shoulder allows. Your physio will match the exercises to the phase: gentle in the painful stage, more stretching as it settles. Common starting points:</p>
<ul>
<li><strong>Pendulum swings:</strong> lean forward with your good hand on a table and let the sore arm hang, making small circles.</li>
<li><strong>Table slides:</strong> sit at a table and slide your hand forward on a towel, letting your body lean with it.</li>
<li><strong>Wall walks:</strong> walk your fingers up a wall as far as is comfortable.</li>
<li><strong>Towel stretch:</strong> hold a towel behind your back and gently pull the sore arm up with the good one.</li>
</ul>
<p>Stay within a mild stretch. Forcing the shoulder into painful positions, especially early on, tends to flare it up. Stop any exercise that causes sharp pain.</p>
<p>Your doctor may also discuss other options, such as pain relief or an injection, particularly when pain is severe. Physiotherapy often works alongside these.</p>
<h2>See a doctor if</h2>
<ul>
<li>shoulder or arm pain comes with chest pain, breathlessness or sweating: <strong>get emergency help</strong>;</li>
<li>the pain started after a fall or injury;</li>
<li>you have a fever, or the shoulder is hot and swollen;</li>
<li>you have weakness or numbness in the arm.</li>
</ul>
<p>If your shoulder has been slowly stiffening, <a href="/book">book an assessment</a>. Frozen shoulder can look like other shoulder problems, and it is worth knowing which one you have.</p>`,
    },
    {
        slug: "choosing-a-knee-support",
        title: "Choosing a knee support: sleeves, straps and hinges",
        category: "articles",
        daysAgo: 9,
        excerpt:
            "The knee supports at our desk, what each kind is for, how to find your size, and what a support can and can't do.",
        image: ph.A9c,
        body: `<p>"Should I wear a knee support?" comes up at the desk most days. Sometimes the answer is yes, for a while. Sometimes it is "it won't hurt, but it is not the main thing". Here is how our physios think about it.</p>
<h2>What a support can do</h2>
<ul>
<li>Give a feeling of warmth and support that many people find comforting, especially with arthritis.</li>
<li>Help you feel more confident on stairs, on a walk or back at sport after an injury.</li>
<li>Give mild compression, which some people find helps a puffy knee feel better.</li>
</ul>
<h2>What it can't do</h2>
<p>A support doesn't strengthen the knee, fix a ligament or cartilage injury, or replace exercise. Used instead of strengthening, it can let the muscles around the knee do even less. Think of it as a tool to help you stay active while you build strength, not the plan itself.</p>
${fig(ph.A9i, "A sleeve should feel snug when you bend the knee, never tight enough to pinch.")}
<h2>The three main types</h2>
<h3>Sleeves</h3>
<p>A pull-on knitted or neoprene sleeve. Light, simple and comfortable for walking, the gym or a long day on your feet with an achy knee. The most common choice for knee osteoarthritis.</p>
<h3>Wrap-around supports with straps</h3>
<p>These open flat and fasten with straps, so they are easier to put on if bending is hard or the knee is swollen. Some have a ring around the kneecap.</p>
<h3>Hinged supports</h3>
<p>Stiffer supports with metal or plastic hinges on each side. These are generally for specific injuries or after surgery, and should be used on the advice of your surgeon or physio. After surgery, always follow your surgeon's instructions on any brace.</p>
<h2>Getting the size right</h2>
<p>Supports at our desk come in sizes, and some are made for the left or right knee. Measure around your thigh about 10 cm above the top of the kneecap, with the leg straight, and bring the number along; Shruti will check it against the size chart for that support. A support should feel snug but not tight. If it leaves deep marks, causes pins and needles, or your foot swells, it is too tight.</p>
<h2>Wearing it sensibly</h2>
<ul>
<li>Wear it for the activities you need it for, rather than all day and night.</li>
<li>Check the skin underneath for redness or soreness, especially if you have diabetes or delicate skin.</li>
<li>Wash it as the label says; a sweaty support irritates skin.</li>
</ul>
<h2>Check first if</h2>
<p>If your knee is very swollen, hot, locking, or gave way during an injury, see a doctor or physio before reaching for a support. And if you are unsure which type suits you, ask your physio at your next session; we would much rather help you choose than see you buy the wrong one.</p>`,
    },
];
