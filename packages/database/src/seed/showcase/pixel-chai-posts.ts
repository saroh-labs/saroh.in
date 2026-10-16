import type { StudioImage, StudioPost } from "./studio-types";

/**
 * The photographs Pixel & Chai's writing uses: Unsplash id, the original's
 * width and height, and the photographer as Unsplash names them.
 */
const PHOTOS = {
    cafeWindow: [
        "photo-1579018183467-a60b8dc9dd78",
        4640,
        3480,
        "Praveen Gupta",
        "praveeeeeeeen",
    ],
    cafePendant: [
        "photo-1676188043163-9f16eac1f2ac",
        3024,
        4032,
        "Sagar Chauhan",
        "sagar_b_chauhan",
    ],
    cafeEvening: [
        "photo-1714328864042-1d23671ab8d5",
        6000,
        4000,
        "Akshat Jhingran",
        "akshat_jhingran",
    ],
    chaiPour: [
        "photo-1693302050215-66ae33076745",
        1969,
        4029,
        "Dhruval Upadhyay",
        "dhruval47",
    ],
    kulhadRows: [
        "photo-1619581073186-5b4ae1b0caad",
        4000,
        6000,
        "Harsh Pandey",
        "harsh_clicks__",
    ],
    kulhadTop: [
        "photo-1625033405953-f20401c7d848",
        4000,
        6000,
        "Shubham Dangi",
        "shubham_dangi",
    ],
    chaiArt: [
        "photo-1561336526-2914f13ceb36",
        5472,
        3648,
        "René Porter",
        "reneporter",
    ],
    chaiRusk: [
        "photo-1683533699004-7f6b9e5a073f",
        5737,
        3830,
        "Ananthan Chithiraikani",
        "ananthan8110",
    ],
    chaiStrain: [
        "photo-1611312410928-bdcb480e6239",
        3315,
        5184,
        "Ayaneshu Bhardwaj",
        "ayaneshu",
    ],
    samosaChai: [
        "photo-1732519970445-8f2d6998961f",
        5472,
        3648,
        "prajakta bagade",
        "coraljasmine",
    ],
    phoneShoot: [
        "photo-1543525469-65b61cc2bc06",
        3648,
        5472,
        "charlesdeluvio",
        "charlesdeluvio",
    ],
    phoneSunset: [
        "photo-1578417618193-3726d6f2fef6",
        6720,
        4480,
        "Joey Huang",
        "onice",
    ],
    phoneTripod: [
        "photo-1658837721890-fc4b47a6f0e2",
        3648,
        2432,
        "DIEU",
        "quangdieu195",
    ],
    editing: [
        "photo-1627244714766-94dab62ed964",
        3933,
        4916,
        "Nubelson Fernandes",
        "nublson",
    ],
    kitchenShoot: [
        "photo-1695408247109-3bf125ad0538",
        6000,
        4000,
        "Wesley Tingey",
        "wesleyphotography",
    ],
    videographer: [
        "photo-1611784728558-6c7d9b409cdf",
        2792,
        1861,
        "Kyle Loftus",
        "kyleloftusstudios",
    ],
    handsPhone: [
        "photo-1488509082528-cefbba5ad692",
        5472,
        3648,
        "Priscilla Du Preez",
        "priscilladupreez",
    ],
    twoLaptop: [
        "photo-1653503425441-9d975e51ce91",
        3000,
        4000,
        "Yash Parashar",
        "lookforyash",
    ],
    laptopMug: [
        "photo-1637999052989-4d7cf96bb805",
        4885,
        3236,
        "Kishore V",
        "imkishorein",
    ],
    deskMan: [
        "photo-1731657021987-65b55c98568d",
        4608,
        3456,
        "Pritimohan Shit",
        "pritimohan",
    ],
    salonWash: [
        "photo-1634449571010-02389ed0f9b0",
        5760,
        3840,
        "Lindsay Cash",
        "lindsayrc81",
    ],
    salonBlow: [
        "photo-1580618672591-eb180b1a973f",
        6016,
        4016,
        "Adam Winger",
        "awcreativeut",
    ],
    salonChairs: [
        "photo-1521590832167-7bcbfaa6381f",
        4038,
        2692,
        "Guilherme Petri",
        "guipetri",
    ],
    dentalRoom: [
        "photo-1629909613654-28e377c37b09",
        5472,
        3658,
        "Benyamin Bohlouli",
        "benyamin_bohlouli",
    ],
    dentalChair: [
        "photo-1598256989800-fe5f95da9787",
        5568,
        3712,
        "Atikah Akhtar",
        "atikahakhtar",
    ],
    dentalExam: [
        "photo-1606811971618-4486d14f3f99",
        5355,
        4016,
        "Caroline LM",
        "carocaro1987",
    ],
    halwa: [
        "photo-1517244683847-7456b63c5969",
        4000,
        5990,
        "Nisha Ramesh",
        "nisharamesh",
    ],
    sweetsPlatter: [
        "photo-1695568181363-af5c78f4d059",
        3883,
        5824,
        "Gaurav Kumar",
        "countingframez",
    ],
    katli: [
        "photo-1695568181558-034b7d3e49eb",
        4000,
        6000,
        "Gaurav Kumar",
        "countingframez",
    ],
    gymRack: [
        "photo-1534438327276-14e5300c3a48",
        4272,
        2848,
        "Danielle Cerullo",
        "dncerullo",
    ],
    gymMono: [
        "photo-1571902943202-507ec2618e8f",
        3836,
        2874,
        "Risen Wang",
        "risennnnn",
    ],
    gymHall: [
        "photo-1623874514711-0f321325f318",
        6000,
        4000,
        "Samuel Girven",
        "samuelgirven",
    ],
    groupTable: [
        "photo-1682962232755-f1d051ddb638",
        6000,
        4000,
        "Sanket Mishra",
        "sanketgraphy",
    ],
    samosas: [
        "photo-1601050690597-df0568f70950",
        6000,
        4000,
        "kabir cheema",
        "kabircheema",
    ],
    thaliTop: [
        "photo-1589778655375-3e622a9fc91c",
        4028,
        2814,
        "Barun Ghosh",
        "barunghosh",
    ],
    curry: [
        "photo-1585937421612-70a008356fbe",
        2597,
        3462,
        "Andy Hay",
        "eastcoastkitchen",
    ],
    puri: [
        "photo-1717587052948-fb9825de50f8",
        4000,
        4293,
        "Jainica Dhingra",
        "jainica",
    ],
    ringLightWoman: [
        "photo-1718874380569-7a44071f01c3",
        5184,
        3456,
        "siddharth vyas",
        "siddharth_vyas1",
    ],
    ringLight: [
        "photo-1673196649671-eb09066ad6c1",
        4672,
        7008,
        "Maria",
        "lyumotech",
    ],
    ringHand: [
        "photo-1694173966355-6a8048f91769",
        4400,
        4400,
        "Ramin Turne",
        "raminturne",
    ],
    mapPhone: [
        "photo-1604357209793-fca5dca89f97",
        4024,
        5030,
        "Tamas Tuzes-Katai",
        "tamas_tuzeskatai",
    ],
    mandu: [
        "photo-1535280783-cd33989a9522",
        3147,
        3932,
        "Bhaumik Shrivastava",
        "iambhaumik",
    ],
    chhatri: [
        "photo-1699953792735-f684145f1e39",
        6000,
        4000,
        "Abhishek Singh",
        "abhi_7477",
    ],
    handloom: [
        "photo-1616986491129-3e37cb654c82",
        3888,
        2592,
        "soumya parthasarathy",
        "iamsoumya",
    ],
    saree: [
        "photo-1610189012906-4c0aa9b9781e",
        4958,
        3292,
        "Bulbul Ahmed",
        "bulbul252",
    ],
    diyaTray: [
        "photo-1577083753695-e010191bacb5",
        6000,
        4000,
        "Udayaditya Barua",
        "nookscribe",
    ],
    diyas: [
        "photo-1718476971217-677d43112daa",
        4752,
        3168,
        "Rahul Saraf",
        "rahul_saraf",
    ],
    classroom: [
        "photo-1719159381962-4170890ada4e",
        7728,
        5152,
        "Haseeb Modi",
        "haseebm",
    ],
    lecture: [
        "photo-1722573783625-eceb04251036",
        3476,
        1955,
        "Adhitya Sibikumar",
        "adhitya_2505",
    ],
    workshop: [
        "photo-1524178232363-1fb2b075b655",
        5101,
        3401,
        "Quilia",
        "heyquilia",
    ],
    planner: [
        "photo-1632772998001-cc9bf6f7c852",
        3576,
        2384,
        "2H Media",
        "2hmedia",
    ],
    notebookHand: [
        "photo-1513128034602-7814ccaddd4e",
        3024,
        4032,
        "Marissa Grootes",
        "marissacristina",
    ],
    notebookBlank: [
        "photo-1612367980327-7454a7276aa7",
        5568,
        3712,
        "Kelly Sikkema",
        "kellysikkema",
    ],
    friendsPhone: [
        "photo-1625463006115-09f08489f591",
        4592,
        3064,
        "Karthik Balakrishnan",
        "karthikb351",
    ],
    womanPhone: [
        "photo-1645538165779-81d7f49baa6f",
        5091,
        3347,
        "SUSHMITA NAG",
        "susnag",
    ],
    sareePhone: [
        "photo-1704088030734-96769c4593a2",
        3632,
        5456,
        "Rosario Fernandes",
        "rioferns62",
    ],
    dashboard: [
        "photo-1551288049-bebda4e38f71",
        4810,
        3207,
        "Luke Chesser",
        "lukechesser",
    ],
    laptopChart: [
        "photo-1460925895917-afdab827c52f",
        2426,
        1728,
        "Carlos Muza",
        "kmuza",
    ],
    reportPaper: [
        "photo-1711097383282-28097ae16b1d",
        3000,
        2001,
        "Jakub Żerdzicki",
        "jakubzerdzicki",
    ],
    laptopCup: [
        "photo-1745847768367-893e989d3a98",
        6000,
        4000,
        "dlxmedia.hu",
        "dlxmedia",
    ],
    thali: [
        "photo-1542367592-8849eb950fd8",
        6000,
        3376,
        "Lior Shapira",
        "shapira",
    ],
} as const satisfies Record<
    string,
    readonly [string, number, number, string, string]
>;

type PhotoKey = keyof typeof PHOTOS;

const WIDTH = 1600;

function photoUrl(key: PhotoKey): string {
    return `https://images.unsplash.com/${PHOTOS[key][0]}?w=${WIDTH}&q=80&auto=format&fit=crop`;
}

function photoHeight(key: PhotoKey): number {
    const [, w, h] = PHOTOS[key];
    return Math.round((WIDTH * h) / w);
}

/** A post's cover, credited to its photographer. */
function cover(key: PhotoKey, alt: string): StudioImage {
    const [, , , name, username] = PHOTOS[key];
    return {
        url: photoUrl(key),
        alt,
        width: WIDTH,
        height: photoHeight(key),
        creditName: name,
        creditUrl: `https://unsplash.com/@${username}`,
    };
}

/** A figure inside a post's body. */
function figure(key: PhotoKey, alt: string, caption: string): string {
    return `<figure><img src="${photoUrl(key)}" alt="${alt}" width="${WIDTH}" height="${photoHeight(key)}"><figcaption>${caption}</figcaption></figure>`;
}

/**
 * Pixel & Chai's writing: help pages for clients (plans, onboarding, approvals,
 * invoices), studio news, and longer articles and case studies drawn from
 * work with Indore businesses.
 */
export const PC_POSTS: readonly StudioPost[] = [
    // ─── Help ────────────────────────────────────────────────────────────
    {
        slug: "how-the-free-audit-call-works",
        title: "How the free 20-minute audit call works",
        excerpt:
            "Twenty minutes on video, no slides and no pitch deck. What we look at, what you need to keep open, and what you get afterwards.",
        category: "help",
        daysAgo: 152,
        cover: cover(
            "laptopMug",
            "A laptop on a desk with a coffee mug in warm evening light",
        ),
        body: `<p>Most owners who book the audit call want to know one thing: is it worth paying someone to do this, or can we keep doing it ourselves? The call is built to answer that honestly, in twenty minutes.</p>
<h2>Before the call</h2>
<p>Book a slot from the <a href="/audit">audit page</a>. You will get a video link on WhatsApp and email. Send us your Instagram handle and the name your business uses on Google Maps. That is all we need; there is no form to fill.</p>
<h2>During the call</h2>
<ol>
<li><strong>Your Google profile (8 minutes).</strong> Category, hours, photos, how many reviews are unanswered, and whether people are finding you for the searches that matter, such as "cafe near Vijay Nagar".</li>
<li><strong>Your Instagram (8 minutes).</strong> Bio, the last 12 posts, how often you post, and which posts people actually saved or shared.</li>
<li><strong>Three things to fix (4 minutes).</strong> In order of effort, most of which you can do yourself this week.</li>
</ol>
${figure("twoLaptop", "Two people talking across a table with a laptop open between them", "We keep the call to twenty minutes and keep the camera on the screen, not on slides.")}
<h2>After the call</h2>
<p>Within one working day you get a short WhatsApp note with the three fixes written out. If one of our <a href="/plans">plans</a> would help, the note says which one and why. If none would, it says that too. About a third of the people we speak to leave with a to-do list and no reason to hire us, and that is fine.</p>
<p>The call is free and there is no follow-up sequence. Riya or Nikita take most calls, Monday to Saturday, 11 am to 6 pm.</p>`,
    },
    {
        slug: "whats-in-each-plan",
        title: "What's in each plan",
        excerpt:
            "Listing care, Starter, Growth and Pro, side by side. Every price includes 18% GST.",
        category: "help",
        daysAgo: 121,
        cover: cover(
            "planner",
            "A monthly planner page with two pens lying across it",
        ),
        body: `<p>We have four monthly plans. Every price below includes 18% GST, so the figure you see is the figure you pay. All plans run for a minimum of three months, then month to month.</p>
<h2>Listing care: ₹2,999 a month</h2>
<p>For businesses where most customers find you on Google Maps. We look after your Google Business Profile: four posts a month, replies to every review within 48 hours, fresh photos, and a monthly report of calls and direction requests.</p>
<h2>Starter: ₹14,999 a month</h2>
<ul>
<li>12 posts a month across Instagram and Facebook</li>
<li>Captions in English and Hindi</li>
<li>A one-page monthly report and a 20-minute call</li>
</ul>
<h2>Growth: ₹27,999 a month</h2>
<ul>
<li>20 posts and 6 reels a month</li>
<li>Replies to comments and DMs six days a week</li>
<li>A half-day shoot every quarter at your premises</li>
</ul>
${figure("notebookHand", "A hand writing in a spiral notebook beside a keyboard", "Every plan starts with the same thing: a written plan for the month, agreed with you before anything goes live.")}
<h2>Pro: ₹44,999 a month</h2>
<p>Everything in Growth, plus Meta and Google ads management for up to ₹1.5 lakh of monthly spend, and a review call every fortnight instead of every month. Ad spend is paid by you directly to Meta and Google; it is never part of our invoice.</p>
<p>Not sure which fits? The <a href="/audit">free audit call</a> ends with a recommendation, and it is often the smaller plan.</p>`,
    },
    {
        slug: "your-first-week-with-us",
        title: "Your first week with us",
        excerpt:
            "The access we need, the brand questionnaire, and how the first content calendar comes together in five working days.",
        category: "help",
        daysAgo: 96,
        cover: cover(
            "notebookBlank",
            "A blank spiral notebook and a pen on a wooden table",
        ),
        body: `<p>The first week decides how the next three months go, so we keep it structured. Here is what happens, day by day.</p>
<h2>Day 1: access</h2>
<p>Nikita sends a checklist on WhatsApp. We need:</p>
<ul>
<li>Your Facebook Page and Instagram added to our Meta Business account as a partner (we never ask for your password)</li>
<li>Manager access to your Google Business Profile</li>
<li>For Pro clients, access to your ad accounts with your own card on file</li>
<li>Your logo files, if you have them, and any photos you like</li>
</ul>
<h2>Day 2: the brand questionnaire</h2>
<p>Fifteen questions, about 30 minutes. Who walks in, what they usually order or book, what you never want to be compared to, the words you use for your own business, and which festivals matter to your customers. Short answers are fine. Voice notes are fine too.</p>
${figure("deskMan", "A man working at a desk with a lamp and a monitor", "Faizan builds the first set of templates from your answers before anyone writes a caption.")}
<h2>Days 3 and 4: the first calendar</h2>
<p>Sneha drafts the month: dates, post types, caption drafts in English and Hindi, and the reels we want to shoot. Faizan sets up your templates.</p>
<h2>Day 5: the walkthrough</h2>
<p>A 30-minute call to go through the calendar together. You change what you want, we lock it, and the first posts go out the following Monday.</p>
<p>If something is slow, it is almost always the access step. Sending it on day one saves the whole week.</p>`,
    },
    {
        slug: "how-approvals-work-on-whatsapp",
        title: "How approvals work on WhatsApp",
        excerpt:
            "One group, one weekly batch, three ways to reply. And what happens if you don't reply at all.",
        category: "help",
        daysAgo: 71,
        cover: cover(
            "womanPhone",
            "A woman in a dupatta looking down at her phone outdoors",
        ),
        body: `<p>Owners are busy, so approvals have to fit into the gaps of a working day. We do them on WhatsApp because that is where you already are.</p>
<h2>The group</h2>
<p>When you join, we make one WhatsApp group with you, anyone you want from your team, and the three of us who work on your account. Nothing about your account goes anywhere else.</p>
<h2>The weekly batch</h2>
<p>Every Thursday evening we send the next week's posts as one batch: the image or reel, the caption in both languages, and the day it goes out. Each item is numbered.</p>
<h2>How to reply</h2>
<ul>
<li><strong>"OK"</strong> or a thumbs up approves the whole batch.</li>
<li><strong>"3 change"</strong> with a note, or a voice note, and we fix that item and send it back.</li>
<li><strong>"3 skip"</strong> drops it, no questions asked.</li>
</ul>
${figure("handsPhone", "Two hands holding a phone close up", "Most clients approve in under five minutes, usually between customers.")}
<h2>If you don't reply</h2>
<p>We send one reminder on Saturday morning. If we still have no reply by Sunday night, we post only the items that carry no prices, offers or claims, and hold the rest. We never post a discount or a price you have not seen.</p>
<p>Urgent changes, such as a closed day or a sold-out item, can go in the group any time. We act on them within two working hours.</p>`,
    },
    {
        slug: "what-counts-as-a-post-or-a-reel",
        title: "What counts as a post, and what counts as a reel",
        excerpt:
            "Your plan says 12 posts or 6 reels. Here is exactly how we count them, including carousels and stories.",
        category: "help",
        daysAgo: 108,
        cover: cover(
            "phoneTripod",
            "A phone mounted on a small tripod against a sunset sky",
        ),
        body: `<p>Plans are counted in posts and reels, so it helps to be clear about what each one is.</p>
<h2>A post</h2>
<p>One item in your feed: a single image, or a carousel of up to 8 slides. It is published on Instagram and Facebook at the same time and counts once, not twice. Captions in English and Hindi go in the same post.</p>
<h2>A reel</h2>
<p>A vertical video of 7 to 45 seconds, edited by us, with captions on screen and music that is cleared for business use. A reel also goes to both Instagram and Facebook and counts once.</p>
<h2>What doesn't count</h2>
<ul>
<li><strong>Stories.</strong> We share your new posts and reels to stories at no cost. Extra stories, such as a "we're open today" note, are on you, and we will make templates for them.</li>
<li><strong>Google posts.</strong> These come with Listing care, which can be added to any plan.</li>
<li><strong>Fixes.</strong> A post we redo after your feedback is still one post.</li>
</ul>
${figure("phoneShoot", "Two hands holding a phone up to film a room", "A reel shot on a phone, steady and in natural light, is often all a local business needs.")}
<h2>Swapping</h2>
<p>On Growth and Pro you can swap: two posts for one reel, or one reel for two posts, as long as you tell us before the month's calendar is locked. Unused posts don't roll over. We would rather plan a full month properly than run a backlog.</p>`,
    },
    {
        slug: "ad-spend-and-our-fee",
        title: "Ad spend and our fee are two different bills",
        excerpt:
            "On Pro you pay us for managing ads and pay Meta and Google directly for the ads themselves. Here's why, and how to set it up.",
        category: "help",
        daysAgo: 84,
        cover: cover(
            "laptopChart",
            "A laptop on a glass table showing charts on screen",
        ),
        body: `<p>On the Pro plan we manage your Meta and Google ads. Clients often ask why the ad money doesn't come to us. The short answer: it is cleaner and safer for you.</p>
<h2>How it works</h2>
<ul>
<li><strong>Our fee</strong> is ₹44,999 a month, GST included, on our invoice. It covers everything in Growth plus ads management for up to ₹1.5 lakh of spend a month.</li>
<li><strong>Your ad spend</strong> is charged by Meta and Google to the card or UPI you add in your own ad accounts. You get their invoices, in your business name, for your own records.</li>
</ul>
<h2>Why we do it this way</h2>
<ol>
<li>You can see every rupee spent, in real time, in your own account.</li>
<li>If you ever leave us, the account, its history and its audiences stay with you.</li>
<li>We never hold your money, and we never mark it up.</li>
</ol>
${figure("dashboard", "A laptop screen showing analytics charts in the dark", "You can open your ad account at any time and see the same numbers we see.")}
<h2>Setting a budget</h2>
<p>We agree a monthly budget with you on the first review call and set daily caps so a campaign can't overspend. If we want to move money between campaigns, we tell you on WhatsApp first. Most of our Pro clients spend between ₹20,000 and ₹80,000 a month; the plan covers up to ₹1.5 lakh.</p>`,
    },
    {
        slug: "pausing-or-cancelling-a-retainer",
        title: "Pausing or cancelling a retainer",
        excerpt:
            "Three months minimum, then 30 days' notice. One pause of up to a month each year.",
        category: "help",
        daysAgo: 58,
        cover: cover(
            "cafeWindow",
            "An empty cafe with round tables beside tall windows",
        ),
        body: `<p>Plans run for a minimum of three months. After that they continue month to month until you tell us to stop.</p>
<h2>Cancelling</h2>
<p>Send a message in your WhatsApp group or email Nikita. Notice is 30 days from the day you tell us. During that month we keep posting as planned, send your final report, and hand over everything we made for you: Canva templates, raw shoot footage, and caption files.</p>
<p>Your pages, profiles and ad accounts were always yours. We remove our own access on your last day and confirm it in writing.</p>
<h2>Pausing</h2>
<p>Once a year you can pause for up to a month. Owners use it for a renovation, a long family wedding, or a quiet month in the monsoon. Tell us before the next month's calendar is locked, usually the 25th.</p>
${figure("cafePendant", "A cafe interior with pendant lamps over a long table", "A pause suits the month the shutters are down for a renovation.")}
<p>While paused, nothing is posted and nothing is invoiced. We still keep an eye on your Google reviews and tell you if something needs a reply.</p>
<h2>Changing plans</h2>
<p>Moving up or down a plan takes effect from the next invoice. There is no fee for switching.</p>`,
    },
    {
        slug: "invoices-and-gst",
        title: "Invoices, payment and GST",
        excerpt:
            "Invoices go out on the 1st and are due in 7 days. Our prices include GST, shown split on the tax invoice.",
        category: "help",
        daysAgo: 44,
        cover: cover(
            "reportPaper",
            "A person holding a printed sheet of charts over a laptop",
        ),
        body: `<p>We keep billing simple, because nobody should spend time chasing a marketing invoice.</p>
<h2>When</h2>
<p>Retainer invoices go out on the 1st of every month by email and WhatsApp, and are due within 7 days. One-off work, such as a shoot day or a brand kit, is invoiced half when you book and half on delivery.</p>
<h2>GST</h2>
<p>All our prices include 18% GST. Your tax invoice shows the split: CGST 9% and SGST 9% for businesses in Madhya Pradesh, or IGST 18% if your business is registered in another state. Add your GSTIN when you join and it appears on every invoice, so you can claim the input credit.</p>
<p>For example, Starter at ₹14,999 shows a taxable value of ₹12,711, CGST of ₹1,144 and SGST of ₹1,144.</p>
${figure("laptopCup", "A person holding a cup next to a laptop showing a chart", "One invoice a month, one line per plan or job.")}
<h2>How to pay</h2>
<ul>
<li>UPI, to the ID printed on the invoice</li>
<li>Bank transfer by NEFT or IMPS</li>
</ul>
<p>We don't take cards or cash. Please put the invoice number in the payment note.</p>
<h2>If you're late</h2>
<p>We send one reminder on day 8. If an invoice is 15 days overdue, we pause new posts until it is settled. We have had to do this four times in four years.</p>`,
    },
    {
        slug: "what-a-reel-shoot-day-looks-like",
        title: "What a reel shoot day looks like",
        excerpt:
            "Eight hours, up to six edited reels, and a shot list agreed before we arrive. How to get the most from the day.",
        category: "help",
        daysAgo: 133,
        cover: cover(
            "videographer",
            "A videographer checking a camera monitor in moody red light",
        ),
        body: `<p>A shoot day is ₹18,000, GST included: eight hours at your premises anywhere in Indore city, and up to six reels edited and delivered within ten working days.</p>
<h2>A week before</h2>
<p>Sneha sends a shot list: the six reel ideas, what each needs, and who should be on camera. You tell us what is realistic. A kitchen at lunch rush is not a film set, and we plan around that.</p>
<h2>On the day</h2>
<ol>
<li><strong>10:00</strong> We arrive, walk the space and check the light.</li>
<li><strong>10:30 to 1:00</strong> Product and space shots while it is quiet.</li>
<li><strong>1:00 to 3:00</strong> Your busy hours. We shoot real customers only with their permission, otherwise hands, plates and counters.</li>
<li><strong>3:30 to 5:30</strong> Anything with you or your team talking to camera.</li>
<li><strong>5:30 to 6:00</strong> A quick look at the best clips together.</li>
</ol>
${figure("kitchenShoot", "A woman filming another person cooking in a bright kitchen", "We shoot on a mirrorless camera and a phone, and use whichever suits the reel.")}
<h2>What helps</h2>
<ul>
<li>Clean the counters, but don't hide the everyday things. Real looks better than staged.</li>
<li>Have your best-selling item ready in fresh batches every hour.</li>
<li>Pick one person on your team who is comfortable on camera.</li>
</ul>
<p>Growth and Pro plans include a half-day shoot each quarter, which follows the same plan in four hours.</p>`,
    },
    {
        slug: "how-we-handle-google-reviews",
        title: "How we handle reviews on your Google profile",
        excerpt:
            "Every review gets a reply within 48 hours. What we write, what we never write, and when we call you first.",
        category: "help",
        daysAgo: 23,
        cover: cover(
            "sareePhone",
            "A woman in a pink sari reading something on her phone",
        ),
        body: `<p>Reviews are the first thing many people read about you, and your replies are read almost as often. On Listing care, and any plan with Listing care added, we reply to every review within 48 hours.</p>
<h2>Good reviews</h2>
<p>We thank the person by name, mention the specific thing they liked, and keep it to two lines. We never paste the same reply twice; people notice.</p>
<h2>Mixed and bad reviews</h2>
<p>For anything three stars or below, we draft a reply and send it to you on WhatsApp first. You confirm the facts: did this happen, who was on shift, is there anything we should offer. Then we post it.</p>
<p>Our replies follow three rules:</p>
<ol>
<li>Acknowledge the problem in plain words.</li>
<li>Say what you have changed, if anything has.</li>
<li>Offer a number or a name to talk to, offline.</li>
</ol>
${figure("dentalRoom", "A clean, bright dental treatment room with a chair and cabinets", "For a clinic, we never confirm in public that someone is a patient.")}
<h2>What we never do</h2>
<ul>
<li>Argue, or share a customer's details</li>
<li>Write fake reviews, or ask friends to</li>
<li>Offer a discount in exchange for changing a review</li>
</ul>
<p>We reply in the language the review was written in: Hindi, English, or a mix of the two.</p>`,
    },

    // ─── News ────────────────────────────────────────────────────────────
    {
        slug: "we-have-moved-to-shekhar-central",
        title: "We've moved to Shekhar Central",
        excerpt:
            "New address, same chai. We're now on the third floor at 302, Shekhar Central, AB Road, Palasia.",
        category: "news",
        daysAgo: 171,
        cover: cover(
            "chhatri",
            "Old stone chhatris in a green garden in Indore",
        ),
        body: `<p>After three years in a two-room office above a printing shop in Saket, we have moved. Our new address is <strong>302, Shekhar Central, AB Road, Palasia, Indore 452001</strong>.</p>
<p>The new space has room for the five of us, a small corner for product shoots with a north-facing window, and a meeting table that seats six. There is parking in the basement and the building has a lift, which the clients who visited the old office will appreciate.</p>
${figure("deskMan", "A man working at a desk under a lamp", "Faizan's desk, now with an actual window behind it.")}
<p>Office hours stay the same: Monday to Saturday, 10 am to 7 pm. Drop in for a chai if you are nearby, but please message first so someone is at the desk and not out on a shoot.</p>`,
    },
    {
        slug: "new-listing-care-plan",
        title: "New: the Listing care plan, ₹2,999 a month",
        excerpt:
            "For businesses whose customers find them on Google Maps. Four posts, review replies within 48 hours, and a monthly calls report.",
        category: "news",
        daysAgo: 56,
        cover: cover(
            "mapPhone",
            "A hand holding a phone showing a map route on a road through trees",
        ),
        body: `<p>For a lot of local businesses, the Google profile does more work than Instagram does. A clinic, a sweet shop or a coaching centre is often found when someone searches "near me", taps call, and never looks at a feed at all.</p>
<p>So we have launched <strong>Listing care</strong>, a plan just for your Google Business Profile, at ₹2,999 a month including GST:</p>
<ul>
<li>4 Google posts a month: offers, new items, festival hours</li>
<li>Replies to every review within 48 hours</li>
<li>Fresh photos uploaded every month</li>
<li>A monthly report of calls, direction requests and searches</li>
</ul>
${figure("dentalChair", "An orange dental chair in a bright clinic room", "Smile Square Dental was our first Listing care client during the trial.")}
<p>Listing care can be taken on its own or added to any other plan. If your profile needs fixing first, the one-time Google Business Profile setup and clean-up is ₹6,500. See <a href="/plans">all plans</a>.</p>`,
    },
    {
        slug: "festive-calendar-slots",
        title: "Navratri and Diwali calendar slots are open",
        excerpt:
            "We plan festive content six weeks out. Eleven slots left for the season's shoots and calendars.",
        category: "news",
        daysAgo: 47,
        cover: cover(
            "diyaTray",
            "Lit clay diyas on a tray surrounded by flower petals",
        ),
        body: `<p>Festive content works best when it is planned early. Last year, the clients who signed off their Diwali calendar by the end of September saw their festive posts saved roughly twice as often as the ones who came to us in the last week.</p>
<p>This season we are taking on festive calendars for existing clients and a few new ones. Each includes:</p>
<ul>
<li>A Navratri-to-Diwali content plan, approved in one sitting</li>
<li>Festive templates in your brand colours</li>
<li>A shoot slot before Dussehra, while the light and your team still have time</li>
</ul>
${figure("katli", "Kaju katli and cashews on a tray with red cloth behind", "Sweet shops book first. Annapurna Mithai Ghar has had its slot since August.")}
<p>We have <strong>eleven shoot slots</strong> left between now and Dussehra. Existing clients can book in their WhatsApp group. New clients, start with a <a href="/audit">free audit call</a>.</p>`,
    },
    {
        slug: "welcome-nikita-rathi",
        title: "Welcome, Nikita Rathi",
        excerpt:
            "Nikita joins us to look after client success and Google listings. She's the person you'll hear from first.",
        category: "news",
        daysAgo: 37,
        cover: cover(
            "friendsPhone",
            "Two friends laughing while looking at a phone together",
        ),
        body: `<p>We are happy to welcome <strong>Nikita Rathi</strong> to Pixel &amp; Chai. Nikita looks after client success and Google listings, which means two things for you.</p>
<p>First, she is now the person who runs your onboarding week, sends your monthly report, and answers the "quick question" messages that used to wait until Riya was free. Second, she leads our new Listing care plan, so every review reply and Google post goes past her.</p>
${figure("groupTable", "A group of colleagues laughing together around a table", "Nikita's first week: four onboarding calls and a team lunch at Saffron Table.")}
<p>Nikita grew up in Indore and spent three years handling customer queries for a jewellery chain in Sarafa before joining us. She says the hardest part so far is choosing between the office's two chai orders. Say hello in your WhatsApp group.</p>`,
    },
    {
        slug: "malwa-business-awards-runner-up",
        title: "Runner-up at the Malwa Small Business Awards",
        excerpt:
            "Our work with Kulhad & Co. was runner-up in the local marketing category. A small award, and we're pleased.",
        category: "news",
        daysAgo: 21,
        cover: cover(
            "cafeEvening",
            "A warmly lit cafe counter with hanging pendant lights",
        ),
        body: `<p>Last Saturday, our reels campaign for Kulhad &amp; Co. in Vijay Nagar was named runner-up in the local marketing category at the Malwa Small Business Awards, run by a group of Indore trader associations.</p>
<p>There were 34 entries in the category. The winner was a family-run hardware store in Dewas whose WhatsApp catalogue we would happily have hired ourselves.</p>
${figure("kulhadRows", "Rows of clay kulhad cups filled with chai", "The entry was the 30 days of reels we shot at the Kulhad counter.")}
<p>The judges liked that the results were measured and plain: weekday footfall up, not a vanity number. Credit belongs to Sneha, who shot and edited every reel, and to Kulhad's owner, Pratik, who let us take over his counter at 7 am for a month. The full story is on our blog.</p>`,
    },
    {
        slug: "workshop-for-cafe-owners",
        title: "A free workshop for Indore café owners",
        excerpt:
            "Two hours on reels, Google reviews and festive offers. 25 seats, at our office in Palasia.",
        category: "news",
        daysAgo: 12,
        cover: cover(
            "workshop",
            "A small group seated in a room listening to a speaker beside a screen",
        ),
        body: `<p>We are running a free two-hour workshop for café and tea-stall owners in Indore, at our office in Palasia, on the last Sunday of this month, from 11 am to 1 pm.</p>
<h2>What we will cover</h2>
<ul>
<li>Shooting a 15-second reel on your phone during a quiet hour</li>
<li>Replying to Google reviews, in Hindi and English, in under five minutes a day</li>
<li>Planning festive offers that don't cut your margin</li>
</ul>
${figure("samosaChai", "Samosas and a glass of chai on a dark wooden table", "Bring your phone. We will shoot one reel together, on the day.")}
<p>There are 25 seats and chai is on us. To book, message us with your café's name and area. It isn't a sales event: we won't pitch plans, and you won't get follow-up calls.</p>`,
    },
    {
        slug: "shoot-day-price-change",
        title: "Shoot day price change for new bookings",
        excerpt:
            "Reel shoot days move to ₹18,000 for new bookings. Retainer prices stay the same.",
        category: "news",
        daysAgo: 30,
        cover: cover("ringLight", "A ring light on a stand in a dark room"),
        body: `<p>From the 1st of this month, a reel shoot day is ₹18,000 including GST, up from ₹15,500. The day is the same: eight hours in Indore city and up to six edited reels.</p>
<p>Why the change? Editing now takes most of the cost. Each reel goes through two rounds of edits with captions in both languages, and that is the part clients tell us they value most. We would rather charge for it honestly than rush it.</p>
${figure("editing", "A person editing video at a desk in a dark room", "Most of a shoot day's cost now sits in the edit, not the shoot.")}
<ul>
<li>Shoot days booked and paid for before the change keep the old price.</li>
<li>Quarterly half-day shoots on Growth and Pro are unchanged and still included.</li>
<li>Retainer prices don't change.</li>
</ul>
<p>Questions? Ask in your WhatsApp group.</p>`,
    },
    {
        slug: "diwali-office-hours",
        title: "Office hours over Diwali",
        excerpt:
            "We close for four days around Diwali. Posts still go out; review replies pause for two days.",
        category: "news",
        daysAgo: 4,
        cover: cover("diyas", "Rows of lit diyas glowing in the dark"),
        body: `<p>The office will be closed from Dhanteras to Bhai Dooj, four days in all, so the team can be with their families.</p>
<p>What this means for you:</p>
<ul>
<li><strong>Scheduled posts still go out.</strong> Your festive calendar is approved and queued.</li>
<li><strong>Review replies</strong> pause on Diwali and the day after. Everything waiting gets a reply by the end of the next working day.</li>
<li><strong>Ads</strong> on Pro keep running within their daily caps. Aman checks them each morning, even on holiday.</li>
<li><strong>Urgent changes</strong>, such as a sold-out offer, can still go in your WhatsApp group. Someone will see it within a few hours.</li>
</ul>
${figure("sweetsPlatter", "A brass platter of assorted Indian sweets with rose petals", "Happy Diwali from all of us at Pixel &amp; Chai.")}
<p>Next month's invoices go out on the 1st as usual. Shubh Deepavali.</p>`,
    },
    {
        slug: "shoot-days-in-ujjain-and-dewas",
        title: "Shoot days now in Ujjain and Dewas",
        excerpt:
            "We'll now travel to Ujjain and Dewas for reel shoot days, for a flat travel charge.",
        category: "news",
        daysAgo: 2,
        cover: cover(
            "mandu",
            "A domed stone pavilion seen through an arched doorway",
        ),
        body: `<p>Several clients have branches outside the city, and we have been turning down shoots in Ujjain and Dewas because the travel ate into the day. Not any more.</p>
<p>From this month, reel shoot days are available in <strong>Ujjain and Dewas</strong>. The shoot day is the same ₹18,000, including GST, with a flat ₹2,500 travel charge per day for the car and an early start. You still get the full eight hours on site and up to six edited reels.</p>
${figure("phoneSunset", "Hands holding a phone up to film a sunset over water", "Early starts mean we often catch the best light of the day on the drive.")}
<p>Quarterly half-day shoots on Growth and Pro can also be held at those branches, for the same travel charge. Book in your WhatsApp group, or ask on the <a href="/audit">audit call</a>.</p>`,
    },

    // ─── Articles ────────────────────────────────────────────────────────
    {
        slug: "30-days-of-reels-kulhad-and-co",
        title: "What 30 days of reels did for an Indore café",
        excerpt:
            "Kulhad & Co. in Vijay Nagar had a full weekend and empty weekday mornings. One reel a day for a month changed the second part.",
        category: "articles",
        daysAgo: 142,
        cover: cover(
            "chaiStrain",
            "Chai being strained into a cup over a steaming stove",
        ),
        body: `<p>Kulhad &amp; Co. is a twelve-table café in Vijay Nagar. On Saturday and Sunday evenings there is a queue on the pavement. On a Tuesday at 10 am there might be two tables taken. When the owner, Pratik, came to us, he did not want more weekend customers. He wanted weekday mornings to pay their way.</p>
<h2>The plan</h2>
<p>We agreed on one reel a day, every day, for 30 days, all shot between 7 and 9 am when the café was quiet and the light came straight through the front window. No dancing, no trending audio for its own sake. Every reel would show one thing a person could only get in the morning.</p>
${figure("kulhadTop", "A clay kulhad of frothy chai seen from above on wood", "The first reel: one kulhad, poured, steaming, 9 seconds long.")}
<h2>What we shot</h2>
<ul>
<li>The first chai of the day being poured into a kulhad, every day from a different angle</li>
<li>The morning-only poha and jalebi plate, and how fast it sells out</li>
<li>Regulars: the retired bank manager who reads three newspapers, the students from the coaching centre next door</li>
<li>Pratik explaining, in Hindi, why he buys his kulhads from a potter in Dewas</li>
</ul>
<p>Sneha shot most of it on a phone with a small tripod. Each reel was 8 to 20 seconds, with on-screen text in Hindi and English.</p>
<h2>What happened</h2>
<p>We measured three things: weekday morning bills from the café's billing counter, calls and direction requests from the Google profile, and saves on Instagram.</p>
<ul>
<li>Average weekday bills between 8 and 11 am went from 31 to 44.</li>
<li>Direction requests on Google went from 212 in the month before to 287.</li>
<li>Reels were saved 1,940 times in the month. The poha reel alone accounted for 610.</li>
<li>Followers went up by 860, which mattered least of all.</li>
</ul>
${figure("chaiRusk", "Two glasses of chai with rusks on a dark tray", "Chai and rusk, the morning combo that outsold everything else on weekdays.")}
<h2>What didn't work</h2>
<p>Reels of Pratik talking for more than 15 seconds did poorly, as did anything shot after 11 am, when the light turned flat. Two reels with trending audio got good reach but no saves at all, and no extra visits that we could see.</p>
<h2>What we'd tell another café</h2>
<p>Pick the hour you want to fill and shoot only in that hour. Show what is different about it, not what is the same as every other café. And measure bills, not followers. Thirteen extra bills a morning, at an average of ₹140, is about ₹55,000 a month, and that is the number Pratik cared about.</p>
<p>Kulhad &amp; Co. has stayed on our Growth plan, which now includes six reels a month. The mornings have held.</p>`,
    },
    {
        slug: "google-business-profile-checklist",
        title: "The Google Business Profile checklist we use for every client",
        excerpt:
            "Twenty minutes, fourteen checks. The same list Nikita runs on every new profile before we post a single thing.",
        category: "articles",
        daysAgo: 99,
        cover: cover("handsPhone", "Two hands holding a phone close up"),
        body: `<p>If you only fix one thing about your online presence this year, fix your Google profile. For most local businesses, it brings in more calls than Instagram and Facebook together. This is the checklist we run on every new client. You can do it yourself in about twenty minutes.</p>
<h2>The basics</h2>
<ol>
<li><strong>Name.</strong> Your real business name, exactly as on your signboard. No "Best Salon in Indore" stuffed in; Google can suspend you for it.</li>
<li><strong>Primary category.</strong> The most specific one that fits. "Dental clinic", not "Doctor". "Indian sweets shop", not "Store".</li>
<li><strong>Secondary categories.</strong> Two or three, only if true. A café that does catering can add "Caterer".</li>
<li><strong>Address and pin.</strong> Drag the pin to your actual door. We have seen clinics pinned to the building next door for years.</li>
<li><strong>Phone number.</strong> One that someone answers during opening hours. A landline that rings out is worse than none.</li>
<li><strong>Hours.</strong> Including special hours for festivals. Nothing annoys a customer more than a closed shutter on Diwali morning when Google said "Open".</li>
</ol>
${figure("mapPhone", "A hand holding a phone with a map route on a forest road", "Your pin decides where Google sends people, so check it from the street.")}
<h2>Photos</h2>
<ol start="7">
<li><strong>Cover photo.</strong> Your storefront in daylight, so people recognise it when they arrive.</li>
<li><strong>At least 10 photos.</strong> Inside, your team, your best products, and the entrance from the road.</li>
<li><strong>One new photo a month.</strong> Profiles that are updated look open. Profiles that aren't look closed.</li>
</ol>
<h2>Reviews</h2>
<ol start="10">
<li><strong>Reply to every review</strong>, good or bad, within two days.</li>
<li><strong>Ask for reviews</strong> at the moment people are happiest: at the counter, after a good haircut, after a clean dental check-up. A QR standee helps more than a WhatsApp link sent later.</li>
</ol>
<h2>The rest</h2>
<ol start="12">
<li><strong>Services or menu.</strong> Fill them in with prices where you can. People compare.</li>
<li><strong>Description.</strong> 750 characters: what you do, where, and for whom. Mention your area name.</li>
<li><strong>Posts.</strong> One a week: an offer, a new item, or festival hours.</li>
</ol>
${figure("dentalExam", "A dentist examining a patient's teeth with a mirror", "Smile Square Dental fixed six of these fourteen in their first week.")}
<h2>What it's worth</h2>
<p>When Smile Square Dental on Sapna Sangeeta Road went through this list with us, the biggest fixes were a wrong pin, missing Sunday hours and only three photos. Calls from the Google profile went from 41 to 73 a month over the next three months, with no ads at all.</p>
<p>If you'd rather we did it, our one-time setup and clean-up is ₹6,500, and the Listing care plan keeps it up to date from then on.</p>`,
    },
    {
        slug: "how-we-report-every-month",
        title: "How we report every month, and what we leave out",
        excerpt:
            "One page and a 20-minute call in the first week of the month. Here's every number on it and why it's there.",
        category: "articles",
        daysAgo: 76,
        cover: cover("dashboard", "A laptop screen showing analytics charts"),
        body: `<p>Marketing reports have a reputation for being long, colourful and hard to act on. Ours is one page. It arrives in the first week of every month, and Nikita walks you through it on a 20-minute call. Here is what is on it, and why.</p>
<h2>The numbers we report</h2>
<ul>
<li><strong>Reach.</strong> How many different people saw your posts. Useful as a trend, not as a score.</li>
<li><strong>Saves.</strong> The best sign that a post was useful. People save what they plan to come back to.</li>
<li><strong>Profile visits.</strong> How many people tapped through to see more of you.</li>
<li><strong>Calls and direction requests from Google.</strong> For most local businesses, the closest thing to a customer walking in.</li>
<li><strong>Enquiries.</strong> DMs and WhatsApp messages that asked about a price, a booking or an order. We count these by hand.</li>
<li><strong>Ad spend and cost per lead</strong>, for Pro clients only.</li>
</ul>
${figure("reportPaper", "A person holding a printed sheet of charts beside a laptop", "One page, printed if you like. Most owners read it on their phone.")}
<h2>What we leave out</h2>
<p>Likes, follower counts, impressions and "engagement rate". Not because they are useless, but because no owner we know has ever made a decision on them. If your followers go up by 300 and your calls go down, the report should show the second part first.</p>
<h2>How the call goes</h2>
<ol>
<li>What went up, what went down, and our best guess why.</li>
<li>The one post that did best, and the one that did worst.</li>
<li>What we will change next month.</li>
<li>Anything coming up in your business that we should plan for, such as a new menu, a sale or a staff change.</li>
</ol>
<h2>An example</h2>
<p>Here is part of last month's report for Bright Minds Coaching in Bhawarkuan:</p>
<blockquote><p>Enquiries 38, up from 26. Calls from Google 64, up from 51. Cost per lead on Meta ₹212, down from ₹290. Best post: the batch timings carousel, saved 142 times. Worst: the topper felicitation reel, high reach but no enquiries. Next month: more timing and fee posts, fewer celebration posts, and a parent Q&amp;A reel before admissions.</p></blockquote>
${figure("lecture", "Students seated in a lecture hall facing a projector screen", "For Bright Minds, the post that drove the most enquiries was the plainest one: batch timings.")}
<h2>Where the numbers come from</h2>
<p>Reach, saves and profile visits come from Instagram and Facebook's own insights. Calls and direction requests come from your Google Business Profile. Enquiries are the one number we count ourselves, from your DMs and, if you forward them, your WhatsApp chats. Ad spend comes straight from your own Meta and Google accounts, so it always matches their invoices.</p>
<p>We keep every month's report in one shared folder, so after six months you can see the whole year on a single screen. Several clients print the page and pin it next to the billing counter.</p>
<p>That last line, what changes next month, is the point of the whole page. A report that doesn't change the plan is just a record.</p>`,
    },
    {
        slug: "what-15000-a-month-of-ads-buys-a-salon",
        title: "What ₹15,000 a month of ads buys a local salon",
        excerpt:
            "Real numbers from three months of Meta and Google ads for Glow Theory Salon in Palasia: what we spent, what came in, and what we stopped.",
        category: "articles",
        daysAgo: 89,
        cover: cover(
            "salonBlow",
            "A stylist blow-drying a client's hair with a round brush",
        ),
        body: `<p>Owners often ask what a small ad budget can actually do. Not a brand campaign, just enough to fill some chairs. So here are the real numbers from Glow Theory Salon in Palasia, which spent ₹15,000 a month on ads for three months. Ad spend was paid directly to Meta and Google from the salon's own accounts.</p>
<h2>The split</h2>
<ul>
<li><strong>₹9,000 on Meta</strong> (Instagram and Facebook), shown to women aged 22 to 45 within 4 km of the salon</li>
<li><strong>₹6,000 on Google search</strong>, for searches such as "hair spa near me", "keratin treatment Palasia" and "bridal makeup Indore"</li>
</ul>
<p>Every ad sent people to WhatsApp, not to a website, because that is how the salon already takes bookings.</p>
${figure("salonChairs", "Three salon chairs facing a long mirror in a bright room", "Glow Theory has six chairs. The goal was to fill the Tuesday to Thursday afternoons.")}
<h2>What came in</h2>
<p>Over three months, the ads brought <strong>214 WhatsApp enquiries</strong>. The salon tracked how many turned into appointments: <strong>87 bookings</strong>, about 41%.</p>
<ul>
<li>Cost per enquiry: about ₹210</li>
<li>Cost per booking: about ₹517</li>
<li>Average first-visit bill: ₹1,850</li>
</ul>
<p>Thirty-one of those 87 clients came back at least once within the three months, which is where the money really is for a salon.</p>
<h2>What worked</h2>
<ol>
<li><strong>Google search for specific treatments.</strong> "Keratin" and "hair spa" searches had the highest booking rate, 52%. People searching a treatment name already want it.</li>
<li><strong>Meta ads with a real stylist, not a model.</strong> A 12-second reel of Priya, the senior stylist, explaining what a hair spa does for frizzy hair in the monsoon got the cheapest enquiries on Meta.</li>
<li><strong>A weekday offer, stated plainly.</strong> "Tuesday to Thursday, 12 to 4: hair spa ₹999 instead of ₹1,400." No countdowns.</li>
</ol>
<h2>What we stopped</h2>
<ul>
<li>Bridal makeup ads. Plenty of enquiries, almost no bookings. Brides book on recommendations and trials, not ads.</li>
<li>Ads after 9 pm. Enquiries came in, but replies went out next morning and most went cold.</li>
<li>A broad "salon near me" keyword that was matching to barbershops.</li>
</ul>
${figure("salonWash", "A stylist washing a client's hair at a basin", "Hair spa bookings filled most of the quiet weekday afternoons by the third month.")}
<h2>Is ₹15,000 enough?</h2>
<p>For a six-chair salon trying to fill quiet afternoons, yes. It won't make you famous, and it doesn't need to. What made it work was not the budget; it was replying to WhatsApp within ten minutes during opening hours. In the first month, enquiries answered after an hour booked at less than half the rate.</p>
<p>If you'd like us to run the numbers for your own business, start with a <a href="/audit">free audit call</a>.</p>`,
    },
    {
        slug: "shooting-reels-on-your-phone",
        title: "Shooting good reels on your phone: a guide for owners",
        excerpt:
            "You don't need a camera. You need a window, a steady hand and a plan for 15 seconds. Our in-house guide, written for owners.",
        category: "articles",
        daysAgo: 162,
        cover: cover(
            "ringLightWoman",
            "A woman filming herself on a phone in front of a soft light",
        ),
        body: `<p>Most of the reels that work for our clients were shot on a phone. A camera helps, but it isn't what makes a reel good. This is the guide we give owners who want to shoot their own between our visits.</p>
<h2>1. Plan 15 seconds, not a minute</h2>
<p>Write three lines before you press record: what the person sees first, what happens, and how it ends. For example: a full tray of jalebi, a hand picking one up, the crunch. That is a reel.</p>
<h2>2. Find a window</h2>
<p>Daylight from a window, falling across your subject from the side, beats any light you can buy. Turn off the tube lights overhead; they make food look grey and faces look tired. Before 11 am and after 4 pm is best.</p>
${figure("phoneShoot", "Two hands holding a phone up to frame a shot of a room", "Hold the phone with both hands and keep your elbows tucked in.")}
<h2>3. Hold still, then move once</h2>
<ul>
<li>Hold the phone with both hands, elbows against your body.</li>
<li>Start every clip with two still seconds. You will need them in the edit.</li>
<li>If you move, move slowly and in one direction only. Push in, or slide sideways, not both.</li>
<li>A ₹600 phone tripod is the best money you will spend.</li>
</ul>
<h2>4. Shoot more than you need</h2>
<p>For a 15-second reel, shoot about two minutes in short clips of 3 to 5 seconds. Shoot each thing from three angles: from above, from the side, and close up.</p>
<h2>5. Sound matters more than you think</h2>
<p>The sizzle of a tawa, a pair of scissors, the pour of chai: real sound gets people to stop scrolling more often than music does. If you talk to camera, stand close to the phone and away from fans and the road.</p>
${figure("ringHand", "A hand holding a phone inside a ring light", "A ring light is useful for talking to camera at night. For products, a window is better.")}
<h2>6. Text on screen, in both languages</h2>
<p>Most people watch without sound. Put the one thing you want them to know on screen in large letters, in English and Hindi, and keep it on for at least two seconds.</p>
<h2>7. End with where</h2>
<p>The last frame should say where you are: "Vijay Nagar, two minutes from the square" means more to an Indore customer than a logo.</p>
<h2>Things to avoid</h2>
<ul>
<li>Zooming with your fingers while recording</li>
<li>Filming customers without asking them</li>
<li>Copyrighted songs on a business account</li>
<li>Filters that change the colour of your food</li>
</ul>
<p>If you'd rather someone else held the phone, our reel shoot day is eight hours and up to six edited reels. But try this first. You might surprise yourself.</p>`,
    },
    {
        slug: "replying-to-bad-reviews-in-hindi-and-english",
        title: "Replying to bad reviews, in Hindi and English",
        excerpt:
            "A three-part reply that works in either language, with real examples from a dental clinic and a sweet shop.",
        category: "articles",
        daysAgo: 64,
        cover: cover(
            "dentalChair",
            "An orange dental chair in a bright treatment room",
        ),
        body: `<p>Every business gets bad reviews. What people judge is not the review but the reply, because the reply is written for everyone who reads it afterwards. Here is how we write them.</p>
<h2>The three parts</h2>
<ol>
<li><strong>Acknowledge.</strong> Say what went wrong in the customer's own words. Don't say "we're sorry you feel that way".</li>
<li><strong>Explain, briefly, or change something.</strong> One line on what happened or what you have done about it. No excuses about staff shortages or the weather.</li>
<li><strong>Take it offline.</strong> Offer a name and a number.</li>
</ol>
<p>Then stop. Three or four sentences at most.</p>
<h2>Reply in the language they wrote in</h2>
<p>If the review is in Hindi, reply in Hindi. If it's Hinglish, reply in simple Hinglish. Replying in formal English to a review in Hindi reads as cold, even when the words are kind.</p>
${figure("dentalRoom", "A bright dental clinic room with a chair and cabinets", "In a clinic's replies, never confirm someone was a patient or mention treatment.")}
<h2>Example 1: a dental clinic, in English</h2>
<blockquote><p>"Waited 50 minutes past my appointment time. Nobody told me why."</p></blockquote>
<p>Smile Square Dental's reply:</p>
<blockquote><p>"You're right, a 50-minute wait without an update isn't acceptable, and we're sorry. We now send a WhatsApp message to anyone whose appointment is running more than 15 minutes late. If you'd like to talk about your visit, please call our front desk manager, Kavita, on the clinic number."</p></blockquote>
<p>Notice what it doesn't say: nothing about the treatment, nothing that confirms the person was a patient, and no blame on an emergency case.</p>
<h2>Example 2: a sweet shop, in Hindi</h2>
<blockquote><p>"Diwali pe mawa barfi li thi, ek din mein hi khatti ho gayi."</p></blockquote>
<p>Annapurna Mithai Ghar's reply:</p>
<blockquote><p>"Aapko kharab barfi mili, iske liye hum maafi chahte hain. Tyohar ke samay hum mawa ki mithai ab sirf usi din ki banayi hui dete hain, aur dibbe par taareekh likhte hain. Kripya dukaan par Rakesh ji se baat karein, hum aapka dibba badal denge."</p></blockquote>
${figure("halwa", "A brass bowl of carrot halwa topped with nuts", "Annapurna now dates every box of mawa sweets during the festive season.")}
<h2>What not to do</h2>
<ul>
<li>Don't argue facts in public, even when the customer is wrong.</li>
<li>Don't copy and paste the same reply. Readers notice.</li>
<li>Don't offer a discount for changing the review.</li>
<li>Don't wait. A reply within 48 hours shows you're paying attention.</li>
</ul>
<h2>Does it matter?</h2>
<p>Over six months, Smile Square replied to all 23 of its reviews of three stars or below. Four reviewers edited their review upwards on their own. More importantly, the clinic's new-patient form asks how people chose them, and "I read the replies" now comes up a few times a month.</p>`,
    },
    {
        slug: "photographing-food-in-natural-light",
        title: "Photographing food in natural light",
        excerpt:
            "A window, a white sheet and twenty minutes before lunch service. How Saffron Table shoots its own menu photos now.",
        category: "articles",
        daysAgo: 118,
        cover: cover(
            "thaliTop",
            "A steel thali with small bowls of curries and rotis on a red cloth",
        ),
        body: `<p>Saffron Table in South Tukoganj used to photograph new dishes under the kitchen's tube lights, at 10 pm, after service. The curries looked brown and the rice looked grey. Now their sous-chef, Imran, shoots them himself in twenty minutes before lunch. This is what we taught him.</p>
<h2>Find your window</h2>
<p>Choose a window that doesn't get direct sun at the time you shoot. North-facing is ideal. Put a table right beside it, so the light falls across the plate from the side. Side light shows texture: the layers of a paratha, the oil on a tadka.</p>
<h2>Turn every other light off</h2>
<p>Mixed light is the most common problem we see. Yellow bulbs plus daylight make white plates look two different colours. Switch off everything except the window.</p>
${figure("curry", "Bowls of curry and rice on a wooden table from above", "Side light from one window and a white sheet on the other side. Nothing else.")}
<h2>Fill the shadows with a white sheet</h2>
<p>On the side away from the window, hold up a white sheet, a piece of thermocol or even a menu card. It bounces light back and softens the shadows. Move it closer for softer, further away for more drama.</p>
<h2>Three angles to try</h2>
<ul>
<li><strong>From directly above,</strong> for thalis, flat dishes and spreads with many bowls.</li>
<li><strong>From the side, at table height,</strong> for anything tall: a stack of puris, a layered dessert, a glass of lassi.</li>
<li><strong>At 45 degrees,</strong> roughly where a diner's eyes are. This works for almost everything else.</li>
</ul>
${figure("puri", "Puffed puris with chole and chutneys on a wooden table", "Shot from slightly above, so you can see the puri has puffed and the chole has texture.")}
<h2>Style it like it's about to be eaten</h2>
<ul>
<li>Wipe the edges of the plate.</li>
<li>Add one thing that shows scale or use: a spoon, a hand, a torn piece of roti.</li>
<li>Garnish just before you shoot, not ten minutes before. Coriander wilts.</li>
<li>Shoot hot food fast. Steam lasts about 30 seconds.</li>
</ul>
<h2>Phone settings</h2>
<p>Use the normal camera, not portrait mode, which blurs the wrong things on food. Tap on the food to focus, then slide the brightness down a little. Slightly dark photos can be fixed; washed-out ones can't.</p>
<h2>Sweets and desserts</h2>
<p>Sweets photograph best on plain brass, steel or a simple cloth, not on patterned plates that fight with the food. For syrupy sweets such as gulab jamun, shoot from the side so the light catches the shine. For dry sweets such as barfi or katli, shoot from above and let the silver vark catch the window.</p>
<h2>Keep a shot list</h2>
<p>Imran keeps a page in the kitchen with every dish on the menu and the date it was last photographed. Anything older than six months, or anything whose plating has changed, goes on the next morning's list. Two dishes a day is enough.</p>
<h2>The result</h2>
<p>Saffron Table replaced all 42 photos on its Google profile over two months. Views of its menu photos went from about 1,100 a month to 2,600, and table reservation calls from the profile went from 58 to 81 a month. The food didn't change. The light did.</p>`,
    },
    {
        slug: "is-boosting-a-post-worth-it",
        title: "Is boosting a post worth it?",
        excerpt:
            "Sometimes, for ₹500. Usually not. When the Boost button helps a local business, and when a proper ad does more.",
        category: "articles",
        daysAgo: 33,
        cover: cover(
            "sareePhone",
            "A woman in a pink sari looking at her phone",
        ),
        body: `<p>The blue "Boost post" button is the first ad most owners ever run. It's quick, it's cheap and it's right there. So is it worth it? Our honest answer is: sometimes, for small amounts, for one specific kind of post.</p>
<h2>What boosting actually does</h2>
<p>Boosting shows an existing post to more people, for a budget and number of days you choose. It's a simplified version of a real ad, with fewer choices about who sees it and what you want them to do.</p>
<h2>When it's worth it</h2>
<ul>
<li><strong>A post that is already doing well.</strong> If a post has been saved and shared far more than usual in its first day, ₹300 to ₹500 to show it to more people nearby can be good value.</li>
<li><strong>A time-bound local event.</strong> A Navratri garba night, a new branch opening, a sale this weekend. Boost to people within 3 to 5 km for two or three days.</li>
<li><strong>When you have no time.</strong> A boost done well is better than a proper ad you never get round to.</li>
</ul>
${figure("friendsPhone", "Two people laughing at something on a phone", "A boost works best on a post people already like, shown to people who live nearby.")}
<h2>When it isn't</h2>
<ul>
<li><strong>When you want enquiries.</strong> A boost is built for likes and reach. If you want WhatsApp messages or calls, a proper ad that asks for them will usually cost far less per enquiry.</li>
<li><strong>When you boost everything.</strong> ₹200 on every post spreads too thin to learn anything.</li>
<li><strong>When the audience is wrong.</strong> Boosts often default to "people who like your page and their friends". For a local shop, that friend in Pune is no use.</li>
</ul>
<h2>An example</h2>
<p>Leaf &amp; Loom, a handloom store near 56 Dukan, boosted twelve posts over two months at ₹500 each: ₹6,000 in all. The posts reached about 48,000 people and brought in 9 WhatsApp enquiries, about ₹670 each.</p>
<p>The next two months, we ran a single message ad for the same ₹6,000, shown to women aged 28 to 55 within 6 km, featuring their Maheshwari sarees. It brought in 41 enquiries, about ₹146 each, and 13 sales.</p>
${figure("handloom", "Folded handloom fabric in red and green with a woven border", "The Maheshwari saree ad: one product, one place, one question.")}
<h2>If you do boost, do it properly</h2>
<ol>
<li>Change the audience to "people you choose through targeting" and set a radius around your shop.</li>
<li>Set the button to "Send WhatsApp message" or "Call now", not "Learn more".</li>
<li>Run it for two or three days, not a week. Most of the result comes early.</li>
<li>Write down what you spent and what came in. If you can't tell, it didn't work.</li>
</ol>
<h2>Our rule of thumb</h2>
<p>If you want people to <em>notice</em> something, boosting is fine. If you want people to <em>contact</em> you, run an ad. And if you are spending more than ₹5,000 a month either way, it's worth having someone look at it properly.</p>`,
    },
    {
        slug: "nest-fitness-filling-the-6am-batch",
        title: "Nest Fitness: filling the 6 a.m. batch",
        excerpt:
            "A Bhawarkuan gym with a full evening floor and an empty morning. How four months of plain, local content added 38 morning members.",
        category: "articles",
        daysAgo: 28,
        cover: cover("gymRack", "Rows of dumbbells on a rack in a bright gym"),
        body: `<p>Nest Fitness in Bhawarkuan has the usual gym problem. From 6 to 9 pm the floor is crowded with students and office-goers. From 6 to 9 am, there are a dozen regulars and a lot of empty machines. Rajat, the owner, didn't want a fancy campaign. He wanted the 6 a.m. batch to fill up.</p>
<h2>Who we were talking to</h2>
<p>We spent an hour on the floor at 6 am and talked to the regulars. Most were in their thirties or forties, lived within 2 km, and had picked mornings because evenings clashed with work, children or the traffic on the ring road. Nobody mentioned six-packs.</p>
${figure("gymMono", "An empty gym with treadmills and benches by big windows", "Six in the morning at Nest: plenty of space, which turned out to be the selling point.")}
<h2>What we posted</h2>
<p>Over four months on the Growth plan, we made the mornings the main story:</p>
<ul>
<li><strong>"No waiting for machines."</strong> Reels shot at 6:15 am, showing the empty floor and the trainer with time to correct form.</li>
<li><strong>Morning regulars.</strong> Short interviews, with permission: a schoolteacher, a pharmacist, a retired army officer, each explaining why mornings work for them.</li>
<li><strong>The real timetable.</strong> A pinned post with batch timings and the morning-only fee, which was ₹200 a month lower.</li>
<li><strong>Hindi captions first.</strong> Morning members skewed older and more comfortable in Hindi.</li>
</ul>
<p>We also added Listing care so the Google profile showed morning hours clearly, with photos of the morning floor.</p>
<h2>What changed</h2>
<ul>
<li>Morning batch members went from 46 to 84 over four months.</li>
<li>Calls from the Google profile went from 37 to 59 a month.</li>
<li>Enquiries mentioning "morning" or "subah" on WhatsApp: 71 in four months, up from a handful.</li>
</ul>
${figure("gymHall", "A large industrial gym with benches and racks under skylights", "Rajat now runs a second trainer in the morning batch on weekdays.")}
<h2>What didn't work</h2>
<p>A transformation challenge we ran in the first month got lots of comments and only two sign-ups, both for evenings. We dropped it. Before-and-after photos also didn't suit the morning crowd, who mostly wanted to keep fit and sleep well.</p>
<h2>The cost</h2>
<p>Nest was on Growth at ₹27,999 a month including GST, with Listing care added for ₹2,999, and no ad spend at all. At a morning fee of ₹1,300 a month, the 38 extra members bring in about ₹49,000 a month, and most of them renewed for a second quarter. Rajat now counts morning sign-ups at the front desk himself, which is the number we report first on every monthly call.</p>
<h2>The lesson</h2>
<p>The gym didn't need to persuade people to exercise. It needed to tell the people who already wanted to that mornings were easier. Most local businesses have a quiet hour like this. The content that fills it is usually plainer than you expect.</p>`,
    },
    {
        slug: "writing-a-bio-people-read",
        title: "Writing an Instagram bio people actually read",
        excerpt:
            "150 characters to say what you sell, where you are and how to reach you. A before-and-after with Leaf & Loom.",
        category: "articles",
        daysAgo: 178,
        cover: cover(
            "saree",
            "A woman in a blue and gold sari seated against a red backdrop",
        ),
        body: `<p>Your Instagram bio is the second thing people read after your name, and for a local business it has one job: help a stranger decide whether to visit or message you. You have 150 characters. Most bios we see use them on a slogan.</p>
<h2>The four lines</h2>
<p>We write nearly every client bio in four short lines:</p>
<ol>
<li><strong>What you sell</strong>, in plain words a customer would search for.</li>
<li><strong>What's different</strong>, in one specific phrase.</li>
<li><strong>Where you are</strong>, using the area name locals use.</li>
<li><strong>How to reach you</strong>: hours or a call to action, with the link below.</li>
</ol>
${figure("handloom", "Folded handloom fabric with woven motifs and a striped border", "Leaf &amp; Loom's bio now names the weave, the town it comes from, and the street.")}
<h2>Before and after</h2>
<p>Leaf &amp; Loom, a handloom store near 56 Dukan, had this bio when they came to us:</p>
<blockquote><p>Weaving dreams since 2009 ✨ Tradition meets elegance 🌸 DM for orders 💌</p></blockquote>
<p>It's pretty, but it doesn't say what they sell, where they are, or why anyone should visit. We rewrote it as:</p>
<blockquote><p>Maheshwari and Chanderi sarees, direct from weavers<br>Every saree tagged with the weaver's name<br>Near 56 Dukan, New Palasia, Indore<br>Open 11 to 8.30, closed Tuesdays. WhatsApp below</p></blockquote>
<p>Profile visits that ended in a tap on the WhatsApp link went from about 3% to 7% over the next two months. The shop also started showing up when people in Indore searched Instagram for "Maheshwari saree".</p>
<h2>Small things that help</h2>
<ul>
<li><strong>Use the name field.</strong> Instagram search reads it. "Leaf &amp; Loom | Handloom Sarees" finds more people than "Leaf &amp; Loom".</li>
<li><strong>One emoji at most per line</strong>, and only if it helps scanning.</li>
<li><strong>Hindi or English?</strong> Whichever your customers search in. For most Indore businesses, English for the bio and both languages in captions works best.</li>
<li><strong>Update it.</strong> Festive hours, a new branch, a sale: change the bio the day it starts and the day it ends.</li>
<li><strong>Link to one place.</strong> WhatsApp or your booking page, not a list of seven links.</li>
</ul>
${figure("womanPhone", "A woman looking down at her phone outdoors", "Most people read your bio on a phone, in two seconds, before deciding to scroll on.")}
<h2>Common mistakes</h2>
<ul>
<li>Quotes and slogans that could belong to any business in India.</li>
<li>"DM for price" when you could simply say where to find the price.</li>
<li>A phone number in the bio and a different one on Google.</li>
<li>Hashtags in the bio. Nobody taps them.</li>
</ul>
<h2>Try it now</h2>
<p>Open your profile and read your bio as a stranger would. Can you tell what you sell, where you are and how to get in touch, in two seconds? If not, rewrite it using the four lines. It's the cheapest marketing change you'll make this year.</p>`,
    },
    {
        slug: "annapurna-diwali-orders-on-whatsapp",
        title: "How Annapurna Mithai Ghar took Diwali orders on WhatsApp",
        excerpt:
            "A sixty-year-old sweet shop near Rajwada, a crowded counter and a simple catalogue. What changed in one festive season.",
        category: "articles",
        daysAgo: 168,
        cover: cover(
            "sweetsPlatter",
            "A brass platter of assorted Indian sweets with rose petals",
        ),
        body: `<p>Annapurna Mithai Ghar has been selling sweets near Rajwada for three generations. Every Diwali the counter is five deep, the phone rings constantly, and orders for corporate gift boxes get written on the back of receipts. Last festive season, Rakesh Agrawal, who runs the shop with his son, asked us to help with one thing: fewer missed orders.</p>
<h2>The problem</h2>
<p>In the two weeks before Diwali the year before, Rakesh estimated the shop missed 40 to 60 phone orders because nobody could pick up. Customers who did get through often asked the same three questions: which boxes are available, how much, and when can I collect.</p>
${figure("katli", "Kaju katli and cashews on a tray with red cloth behind", "Kaju katli boxes made up nearly half of all festive orders.")}
<h2>What we set up</h2>
<ol>
<li><strong>A WhatsApp catalogue</strong> with nine gift boxes, each photographed by a window on the same morning, with weight, price and contents.</li>
<li><strong>One festive post a day</strong> on Instagram and Facebook for three weeks, each showing a box and ending with "Order on WhatsApp, collect from Rajwada".</li>
<li><strong>A Google post</strong> with festive hours and the WhatsApp number, updated twice.</li>
<li><strong>A QR standee</strong> at the counter: scan to order ahead and skip the queue next time.</li>
</ol>
<p>Rakesh's nephew answered WhatsApp from a corner of the shop with a printed order sheet. Nothing fancier.</p>
<h2>What happened</h2>
<ul>
<li>WhatsApp orders in the three weeks before Diwali: 312, up from about 90 the year before.</li>
<li>Corporate box orders: 27 businesses, against 16 the year before.</li>
<li>Calls from the Google profile in October: 486, up from 344.</li>
</ul>
<p>Rakesh's own estimate of missed orders: "maybe ten". The shop also ran out of its 1 kg kaju katli box two days early, which taught us both something about stock.</p>
${figure("diyaTray", "Lit diyas on a tray among flower petals", "The festive posts used the same warm, simple setup every day.")}
<h2>What it cost</h2>
<p>Annapurna took Starter at ₹14,999 a month including GST for the festive quarter, plus a half-day of product photography for the catalogue and two A4 QR standees at ₹1,600 each. No ads. The busiest week of WhatsApp orders alone was worth more than the whole quarter's fee, and the shop has kept the catalogue going for its wedding-season boxes.</p>
<h2>What we'd change</h2>
<p>We would start a week earlier, because corporate buyers decide by Dussehra. We would also add a cut-off time for same-day collection; on Dhanteras, 70 orders came in after 6 pm.</p>
<h2>The takeaway</h2>
<p>None of this was clever. It was the shop's own products, photographed well, made easy to order in the app every customer already used. For a business with loyal customers and a crowded counter, that is often all marketing needs to do.</p>`,
    },
];

/** A photograph from the table above, for the site and catalogue (`studio-photos.ts`). */
export const pcPhoto = cover;
