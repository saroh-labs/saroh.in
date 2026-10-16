import type { StudioImage, StudioPost } from "./studio-types";

/**
 * Golden Hour's writing: help notes for couples who have booked or are about
 * to, studio news through the 2026–27 season, and longer articles (real
 * weddings, planning guides, how the studio prices things). Photographs are
 * free-licence Unsplash images, hot-linked and credited on each cover.
 */

/** One Unsplash photograph: id, size at 1600 wide, the photographer. */
interface Photo {
    id: string;
    height: number;
    name: string;
    username: string;
    alt: string;
}

const PHOTOS = {
    brideSmile: {
        id: "photo-1600685890506-593fdf55949b",
        height: 2398,
        name: "Aayush(gop) Rawat",
        username: "aayushrawat",
        alt: "A smiling bride in a red and gold dupatta with kundan jewellery",
    },
    brideDark: {
        id: "photo-1787831535717-9ff65f1e03f2",
        height: 2405,
        name: "Picture & Poet",
        username: "amarpoems08",
        alt: "A bride in a red lehenga looking down, lit softly against a dark room",
    },
    brideBw: {
        id: "photo-1779253806092-05bca568d85b",
        height: 1067,
        name: "Deepak Vedwal",
        username: "vedwal_official",
        alt: "A black and white portrait of a bride in an embroidered dupatta",
    },
    brideSpotlight: {
        id: "photo-1760080838885-03e482f4ca71",
        height: 1067,
        name: "Royal Photography",
        username: "royalfoto",
        alt: "A bride in profile caught in a beam of violet light",
    },
    mandapOutdoor: {
        id: "photo-1587271636175-90d58cdad458",
        height: 1067,
        name: "AMISH THAKKAR",
        username: "amishthakkar",
        alt: "A couple seated under a floral mandap in the open air during the pheras",
    },
    banquetMandap: {
        id: "photo-1587271407850-8d438ca9fdf2",
        height: 1067,
        name: "AMISH THAKKAR",
        username: "amishthakkar",
        alt: "A mandap under a chandelier in a hall lined with candles",
    },
    ritualThali: {
        id: "photo-1774020039263-03aedef90681",
        height: 1067,
        name: "Sushanta Rokka",
        username: "sanoyatra",
        alt: "Hands of the couple and family over a brass thali during a wedding ritual",
    },
    kalashPour: {
        id: "photo-1774020039312-f1965e1b6ef0",
        height: 1067,
        name: "Sushanta Rokka",
        username: "sanoyatra",
        alt: "Water poured from a brass kalash over the joined hands of the couple",
    },
    handsRed: {
        id: "photo-1760080839561-6b1228ed2e60",
        height: 1067,
        name: "Royal Photography",
        username: "royalfoto",
        alt: "A groom holding the bride's hennaed hand, red bangles in the foreground",
    },
    handsDark: {
        id: "photo-1621801306185-8c0ccf9c8eb8",
        height: 1067,
        name: "Love Arya",
        username: "lovearya",
        alt: "Two hands with mehendi held together against a dark background",
    },
    coupleRiver: {
        id: "photo-1630526720753-aa4e71acf67d",
        height: 2397,
        name: "Sean Williams",
        username: "studiowilliams",
        alt: "A couple in wedding clothes standing on a rock by a river under a grey sky",
    },
    groomCarries: {
        id: "photo-1765881395337-a69cf213bd84",
        height: 1067,
        name: "Sabesh Photography LTD",
        username: "sabesh",
        alt: "A groom lifting the bride in her red saree, both laughing",
    },
    coupleRuins: {
        id: "photo-1767333586238-5fe2e8e62b0e",
        height: 1067,
        name: "Davor Denkovski",
        username: "ddenkovski",
        alt: "A couple sitting close together in an old stone doorway",
    },
    coupleLights: {
        id: "photo-1722952934661-dde241aeb591",
        height: 2400,
        name: "ARTO SURAJ",
        username: "artosuraj",
        alt: "A bride and groom standing under strings of warm fairy lights at night",
    },
    groomWhite: {
        id: "photo-1759906766080-82b785c61f51",
        height: 2400,
        name: "Royal Photography",
        username: "royalfoto",
        alt: "A groom in an ivory sherwani and safa standing on a lit stage",
    },
    coupleArchSmoke: {
        id: "photo-1744804298431-57953e4eaba0",
        height: 2293,
        name: "iKshana Productions",
        username: "ikshanaproductions",
        alt: "A couple under a lit floral arch as cold smoke rises behind them",
    },
    coupleForest: {
        id: "photo-1775566417313-e57b7c47716c",
        height: 1067,
        name: "Sushanta Rokka",
        username: "sanoyatra",
        alt: "A bride and groom walking together under a pergola of dry creepers",
    },
    coupleEmbrace: {
        id: "photo-1769500810743-5e5dd4fd5848",
        height: 2400,
        name: "Rejaul Karim",
        username: "rejaul_creativedesign",
        alt: "A newly married couple holding each other close among trees",
    },
    palaceMandap: {
        id: "photo-1756190564669-215843660e93",
        height: 1244,
        name: "roshan pms",
        username: "roshanpms",
        alt: "A couple walking toward a sandstone pavilion lined with roses at dusk",
    },
    haldiBackdrop: {
        id: "photo-1698460918119-7359a8a945a0",
        height: 1067,
        name: "ARTO SURAJ",
        username: "artosuraj",
        alt: "A bride in a yellow saree seated before a yellow haldi backdrop",
    },
    haldiShower: {
        id: "photo-1681717166573-f71589207785",
        height: 2400,
        name: "Arun Prakash",
        username: "its_arunprakash",
        alt: "Water poured over a bride covered in haldi, her eyes closed",
    },
    marigoldPetals: {
        id: "photo-1788357928572-adbdfa7f8613",
        height: 2133,
        name: "Kruti Mehta",
        username: "_kruttii_",
        alt: "A heap of marigolds and red rose petals",
    },
    garlandsLight: {
        id: "photo-1789971649660-eefc756ee5dd",
        height: 1067,
        name: "Sangram Rakate",
        username: "najaratonajaria",
        alt: "Strings of marigold and mogra hanging in a row in soft daylight",
    },
    garlandsDark: {
        id: "photo-1789971649652-ae5dfeeaa7b4",
        height: 2400,
        name: "Sangram Rakate",
        username: "najaratonajaria",
        alt: "Marigold and jasmine strings hanging against a dark wall",
    },
    haldiCanopy: {
        id: "photo-1744891471118-f74c0453cd21",
        height: 1068,
        name: "Anubhav Event Productions",
        username: "anubhaveventproductions",
        alt: "An open-air canopy draped in yellow, orange and pink for a haldi",
    },
    marigoldDoor: {
        id: "photo-1589463349208-95817c91f971",
        height: 1067,
        name: "Joshuva Daniel",
        username: "joshuvadaniel",
        alt: "Marigold garlands and a hanging bell ornament over a doorway",
    },
    mehendiGroup: {
        id: "photo-1505932794465-147d1f1b2c97",
        height: 1067,
        name: "Vitaliy Lyubezhanin",
        username: "aperinastudios",
        alt: "Several hands with fresh mehendi held together in a circle",
    },
    mehendiBridal: {
        id: "photo-1730003873829-09b4b16444c1",
        height: 1067,
        name: "anik das",
        username: "anik01993",
        alt: "A bride's hands covered in full bridal mehendi up to the elbows",
    },
    mehendiArtist: {
        id: "photo-1767607740740-25ef7ca4342b",
        height: 1068,
        name: "AJOY DAS",
        username: "champsara",
        alt: "A mehendi artist drawing a fine pattern on a bride's fingers",
    },
    mehendiCone: {
        id: "photo-1771498897921-91522949362e",
        height: 2400,
        name: "Senir khawas",
        username: "senir",
        alt: "Henna being applied to a palm with a cone, bangles at the wrist",
    },
    picholaBoat: {
        id: "photo-1615836245337-f5b9b2303f10",
        height: 1200,
        name: "Jainam Mehta",
        username: "jainam09",
        alt: "A red boat crossing Lake Pichola below the City Palace in afternoon light",
    },
    picholaGhat: {
        id: "photo-1589901164570-f9de6556e1c1",
        height: 900,
        name: "Pranav Panchal",
        username: "pranavpanchal",
        alt: "The City Palace on the banks of Lake Pichola, seen from the water",
    },
    picholaNight: {
        id: "photo-1690708186073-17037cd66467",
        height: 1047,
        name: "Luckey Rajaora",
        username: "hilucky",
        alt: "A palace on Lake Pichola lit up at night, reflected in the water",
    },
    chhatriLake: {
        id: "photo-1784554377338-86cab7f29f79",
        height: 1067,
        name: "Lalit Kumar",
        username: "lalitkumar_dev",
        alt: "A stone chhatri overlooking a lake and the Aravalli hills",
    },
    palaceGolden: {
        id: "photo-1695956353120-54ce5e91632b",
        height: 1200,
        name: "Maitree Patel",
        username: "maitree_",
        alt: "Lakeside palace walls catching the last of the evening sun",
    },
    picholaAerial: {
        id: "photo-1770665567859-129bbd144038",
        height: 900,
        name: "Harsh Vardhan Yadav",
        username: "_varrdhan",
        alt: "Lake Pichola from above at golden hour, the old city along its shore",
    },
    archWindowLake: {
        id: "photo-1770665567877-72ee8a7c9051",
        height: 2843,
        name: "Harsh Vardhan Yadav",
        username: "_varrdhan",
        alt: "A lake and a white palace framed by a scalloped stone arch",
    },
    lakePalaceWhite: {
        id: "photo-1744385307864-50c38bbda91b",
        height: 1067,
        name: "Laura Lezman",
        username: "lauralezman",
        alt: "A white palace on an island in Lake Pichola with a boat at its jetty",
    },
    palaceReflection: {
        id: "photo-1706961121527-4017856774c7",
        height: 1200,
        name: "Abhishek R",
        username: "intheshot",
        alt: "Palace walls reflected in still water under a wide blue sky",
    },
    palaceJharokha: {
        id: "photo-1591264247469-d072a1018915",
        height: 2400,
        name: "Pranav Panchal",
        username: "pranavpanchal",
        alt: "Carved jharokhas of an old palace above the rooftops of Udaipur",
    },
    jaipurCityPalace: {
        id: "photo-1772976455832-9d6b078ac401",
        height: 2133,
        name: "vijay sreeram",
        username: "vijay_exe",
        alt: "Pink sandstone walls of an old Jaipur palace under an evening sky",
    },
    hawaMahalSky: {
        id: "photo-1781865087678-38284cf6471f",
        height: 1200,
        name: "Jay Thakkar",
        username: "cejaythakkar07",
        alt: "The honeycomb windows of the Hawa Mahal against a deep blue sky",
    },
    hawaMahalHorses: {
        id: "photo-1477587458883-47145ed94245",
        height: 1067,
        name: "Aditya Siva",
        username: "msaditya9",
        alt: "Two decorated white horses ridden past the Hawa Mahal in Jaipur",
    },
    amerRamp: {
        id: "photo-1599661046289-e31897846e41",
        height: 2845,
        name: "Meriç Dağlı",
        username: "meric",
        alt: "The zigzag ramparts climbing up to Amer Fort above Maota Lake",
    },
    jalMahal: {
        id: "photo-1661924326425-c14a6426d989",
        height: 1067,
        name: "Mayur Sable",
        username: "heymyur",
        alt: "The Jal Mahal sitting in still water at dawn",
    },
    amerDusk: {
        id: "photo-1709394173063-903ebda3dc91",
        height: 2133,
        name: "Rudra pratap singh",
        username: "rudracreates",
        alt: "Amer Fort and its walls reflected in the lake on a hazy evening",
    },
    banquetDecor: {
        id: "photo-1773745060497-4cc1df774c72",
        height: 1067,
        name: "Konark Weddings",
        username: "konarkweddings",
        alt: "A reception hall dressed with chandeliers, palms and low flower beds",
    },
    lanternsTrees: {
        id: "photo-1770774797707-19a89846fa23",
        height: 1067,
        name: "MChe Lee",
        username: "mclee",
        alt: "Small orange lanterns strung between old trees in a garden",
    },
    stagePurple: {
        id: "photo-1787555267973-b359645be0c4",
        height: 1067,
        name: "Ayush Design",
        username: "ayushdesign",
        alt: "A wedding stage with a wall of lilac and white flowers and a carved frame",
    },
    stageRed: {
        id: "photo-1745573673583-a51f665ae48e",
        height: 898,
        name: "Zaraq Iqbal",
        username: "zaraqiqbal",
        alt: "A stage with red drapes, white flowers and a carved sofa",
    },
    stageArch: {
        id: "photo-1745573673043-43a4f3b91466",
        height: 898,
        name: "Zaraq Iqbal",
        username: "zaraqiqbal",
        alt: "A floral arch over the aisle leading to a lit stage",
    },
    stageSofas: {
        id: "photo-1762709118823-7fe9c9afa8ff",
        height: 1067,
        name: "AL Kaium",
        username: "al_kaium",
        alt: "Cream sofas on a stage in front of a wall of mixed flowers",
    },
    sangeetWomen: {
        id: "photo-1587012521796-6359d3678f2a",
        height: 1067,
        name: "Pranav Kumar Jain",
        username: "peejayvisual",
        alt: "A bride surrounded by women of the family dancing on a lit stage",
    },
    foodSpread: {
        id: "photo-1728910156510-77488f19b152",
        height: 1600,
        name: "Perspective Studio",
        username: "perspectievstudio",
        alt: "A hand serving from copper handis on a table full of dishes",
    },
    foodClaypots: {
        id: "photo-1777613112895-139720bd43c9",
        height: 1067,
        name: "Adil Murshed",
        username: "adz_mush",
        alt: "Dishes served in small clay pots on a buffet",
    },
    thaliSilver: {
        id: "photo-1680993032090-1ef7ea9b51e5",
        height: 1200,
        name: "Zoshua Colah",
        username: "zoshuacolah",
        alt: "A steel thali with rice, puri, dal and vegetable katoris",
    },
    thaliTop: {
        id: "photo-1742281257687-092746ad6021",
        height: 1200,
        name: "Zoshua Colah",
        username: "zoshuacolah",
        alt: "Two thalis from above with many katoris and a bowl of rice",
    },
    albumCover: {
        id: "photo-1627353802102-48f39ab03fec",
        height: 1067,
        name: "Kirk Cameron",
        username: "psarahtonen",
        alt: "The corner of a dark album cover with an embossed round photograph",
    },
    albumOpen: {
        id: "photo-1571502189597-d7d3a0f114fd",
        height: 1068,
        name: "Mockaroon",
        username: "mockaroon",
        alt: "An open flush-mount wedding album showing a full-page photograph",
    },
    albumBw: {
        id: "photo-1784722237779-7fd5be91c980",
        height: 1067,
        name: "Harry Borrett",
        username: "harryborrettphotography",
        alt: "Hands holding an open album of black and white wedding photographs",
    },
    lens: {
        id: "photo-1769266258959-116489003154",
        height: 1067,
        name: "Nik",
        username: "helloimnik",
        alt: "A close view of a camera lens resting on a wooden table",
    },
    cameraDark: {
        id: "photo-1770854976529-9949947edd46",
        height: 1067,
        name: "zoltan Sari",
        username: "zoltansari",
        alt: "A camera body and lens on a dark surface",
    },
    photographerFront: {
        id: "photo-1758631813662-a10630e4c022",
        height: 1067,
        name: "Sanket Mishra",
        username: "sanketgraphy",
        alt: "A photographer raising a camera to his eye against a dark wall",
    },
    newbornBasket: {
        id: "photo-1757691723728-76c52b7e2a02",
        height: 1067,
        name: "Josh Duncan",
        username: "joshbduncan",
        alt: "A newborn asleep in a basket lined with white wool",
    },
    newbornHand: {
        id: "photo-1582486225644-aeacf6aa0b1b",
        height: 2400,
        name: "Nathan Dumlao",
        username: "nate_dumlao",
        alt: "A tiny hand holding a parent's finger",
    },
    newbornSleep: {
        id: "photo-1773243086673-66bef34f6969",
        height: 1067,
        name: "Olivia Anne Snyder",
        username: "olivialu10",
        alt: "A sleeping newborn held up in soft window light",
    },
    maternityDoor: {
        id: "photo-1568043625493-2b0633c7c491",
        height: 1067,
        name: "Camylla Battani",
        username: "camylla93",
        alt: "An expectant mother in a green dress holding her belly by a wooden door",
    },
    motherBaby: {
        id: "photo-1780329941563-866557aca9f7",
        height: 1067,
        name: "Rohit Dey",
        username: "rohit16dey",
        alt: "A mother holding her baby up over her shoulder, the baby looking at the camera",
    },
    familyPortrait: {
        id: "photo-1780329943665-ac2d6784e956",
        height: 1067,
        name: "Rohit Dey",
        username: "rohit16dey",
        alt: "A family of five standing together outside their home",
    },
    diyas: {
        id: "photo-1577083753695-e010191bacb5",
        height: 1067,
        name: "Udayaditya Barua",
        username: "nookscribe",
        alt: "Clay diyas lit on a brass tray among rose petals",
    },
    diyaRow: {
        id: "photo-1757693350857-61d31a1b77bf",
        height: 1067,
        name: "Rohit Dey",
        username: "rohit16dey",
        alt: "A line of lit diyas running into the dark",
    },
    monsoonFalls: {
        id: "photo-1754903272366-f92a6b23f18e",
        height: 2400,
        name: "Atharva Sawale",
        username: "arthsawale",
        alt: "A waterfall falling through green monsoon hills in mist",
    },
    monsoonHills: {
        id: "photo-1567960699877-b134ad1caef8",
        height: 1067,
        name: "Sanjeev Malhotra",
        username: "sanmal1996",
        alt: "Low cloud over green hills and a town after rain",
    },
    djPurple: {
        id: "photo-1777734448523-6b441c719d8d",
        height: 2400,
        name: "Keido wvtvnvbe",
        username: "wvtvnvbe",
        alt: "A DJ's hand on a controller lit in purple and blue",
    },
    djDeck: {
        id: "photo-1784019841755-3e1461f1729b",
        height: 1067,
        name: "Joanne Santini",
        username: "laultimaromanov",
        alt: "A DJ controller and laptop set up at the edge of a dance floor",
    },
} satisfies Record<string, Photo>;

type PhotoKey = keyof typeof PHOTOS;

function src(key: PhotoKey): string {
    return `https://images.unsplash.com/${PHOTOS[key].id}?w=1600&q=80&auto=format&fit=crop`;
}

/** The cover a post index and share card show, credited to its photographer. */
function cover(key: PhotoKey): StudioImage {
    const photo = PHOTOS[key];
    return {
        url: src(key),
        alt: photo.alt,
        width: 1600,
        height: photo.height,
        creditName: photo.name,
        creditUrl: `https://unsplash.com/@${photo.username}`,
    };
}

/** A photograph inside a post's body, with the studio's caption. */
function figure(key: PhotoKey, caption: string): string {
    const photo = PHOTOS[key];
    return `<figure><img src="${src(key)}" alt="${photo.alt}" width="1600" height="${photo.height}"><figcaption>${caption}</figcaption></figure>`;
}

export const FV_POSTS: readonly StudioPost[] = [
    // ───────────────────────────── Help ─────────────────────────────
    {
        slug: "how-a-planning-consultation-works",
        title: "How a planning consultation works",
        excerpt:
            "Thirty minutes, free, at the studio on Lake Palace Road or on a video call. What we ask, what you leave with, and what it doesn't commit you to.",
        category: "help",
        daysAgo: 156,
        cover: cover("lens"),
        body: `<p>Most couples meet us first over a planning consultation. It is free, it takes thirty minutes, and it does not commit you to anything. You can come to the studio on the second floor of 14 Lake Palace Road in Udaipur, or talk to us on a video call from wherever you are.</p>
<h2>What we'll ask you</h2>
<ul>
<li>Your date, or the two or three dates the family is considering.</li>
<li>The functions you're planning: roka, haldi, mehendi, sangeet, the wedding, a reception.</li>
<li>Roughly how many guests, and whether the venue is fixed yet.</li>
<li>What you want to keep from the day. Some couples care most about the film, some about the album their parents will hold.</li>
</ul>
<h2>What you'll leave with</h2>
<p>A written note within a day: which of our packages fit, which add-ons you might want, and the total. Every figure we quote includes 18% GST, so the number you see is the number you pay. If Meher is in the meeting, you'll also get a first rough budget for décor and catering.</p>
${figure("chhatriLake", "Most of our first meetings end with a walk to the lake. It helps to see the light we're talking about.")}
<h2>What happens next</h2>
<p>Nothing, until you decide. When you're ready, a 25% advance holds your date and we send the booking confirmation the same day. Call us on +91 00000 00056 or use the <a href="/enquire">enquiry form</a> to pick a slot.</p>`,
    },
    {
        slug: "what-the-advance-covers",
        title: "What the 25% advance covers, and when the balance is due",
        excerpt:
            "The advance holds your date; the balance comes after you've seen your photographs. Here's the schedule, with a worked example.",
        category: "help",
        daysAgo: 151,
        cover: cover("handsRed"),
        body: `<p>We keep payments simple, and we keep them in an order that's fair to both of us.</p>
<h2>The advance: 25%, when you book</h2>
<p>The advance holds your date. Once it reaches us, that day is yours and we turn away every other enquiry for it. During the November to February season, that often means turning away three or four families, which is why the advance is how we confirm a booking rather than a handshake.</p>
<h2>The balance: 75%, after the edit</h2>
<p>We invoice the remaining 75% once your edited gallery is delivered, so you pay it having seen the work. It is due before your album goes to print. Nothing is printed until the balance is settled.</p>
<h3>A worked example</h3>
<p>For our wedding day photo and film package at ₹2,40,000:</p>
<ul>
<li>Advance at booking: ₹60,000</li>
<li>Balance after your gallery arrives: ₹1,80,000</li>
</ul>
<p>Add-ons such as an album or a haldi setup follow the same split.</p>
${figure("kalashPour", "The part of the day nobody wants to think about invoices during. That's why we settle the date early and the rest after.")}
<h2>How to pay</h2>
<p>UPI or bank transfer, both to the studio's account. Our prices include 18% GST, and every invoice shows the GST split as CGST and SGST, with our GSTIN, so you can keep it for your records. We don't take cash.</p>`,
    },
    {
        slug: "album-timeline-from-wedding-to-print",
        title: "Your album, from the wedding day to the box it arrives in",
        excerpt:
            "Seventy-two hours to a sneak peek, four to six weeks to the full gallery, then your picks, a proof and three weeks at the bindery.",
        category: "help",
        daysAgo: 139,
        cover: cover("albumOpen"),
        body: `<p>Couples ask us this more than anything else, usually about a week after the wedding. Here is the whole path.</p>
<ol>
<li><strong>Within 72 hours:</strong> a sneak peek of twenty to thirty photographs, so the family has something to share while the rest is edited.</li>
<li><strong>Four to six weeks:</strong> the full edited gallery. For the wedding day package that's around 400 photographs, plus the films.</li>
<li><strong>Your picks:</strong> you choose the photographs for the album. Take your time; most couples take two to three weeks.</li>
<li><strong>Two weeks after your picks:</strong> the first design proof. You can ask for changes, and most albums are signed off on the second proof.</li>
<li><strong>Three weeks:</strong> printing and binding. Flush-mount pages are pressed and cured, and covers are wrapped by hand.</li>
</ol>
${figure("albumBw", "A finished album on its first afternoon home. The pages lie flat, which is the point of flush-mount.")}
<p>Add it up and a winter wedding usually has its album by spring. Two things speed it up: picking photographs promptly and settling on one design direction early. Two things slow it down: a family committee choosing pages over a long WhatsApp thread, and changing the album size after the proof.</p>
<p>The balance payment falls between steps two and five: it is invoiced once your gallery is delivered and is due before the album goes to print.</p>`,
    },
    {
        slug: "changing-your-wedding-date",
        title: "If your wedding date changes",
        excerpt:
            "Muhurats move, venues change, families reschedule. What happens to your booking and your advance if the date shifts.",
        category: "help",
        daysAgo: 121,
        cover: cover("picholaGhat"),
        body: `<p>Dates change more often than people expect. The pandit revises the muhurat, a grandparent can't travel in December, the venue double-books. Here's how we handle it.</p>
<h2>If we're free on the new date</h2>
<p>Your 25% advance moves with you, once, to any date within twelve months of the original. There's no fee for the move. We send a fresh confirmation with the new date, and everything else in your booking stays as it was.</p>
<h2>If we're already booked on the new date</h2>
<p>We'll tell you straight away and offer what we can. Sometimes Ishaan can lead the day with a trusted second photographer; sometimes a nearby date works for the family. If neither works, we'll talk it through honestly. We'd rather lose a booking than send a team we don't stand behind.</p>
${figure("coupleForest", "This couple moved their pheras from December to the first week of February. The light was kinder for it.")}
<h2>If the wedding is called off</h2>
<p>The advance isn't refunded, because the date was held for you and other couples were turned away. If you've already paid for add-ons we haven't started on, such as a printed album, we refund those in full.</p>
<h3>What helps</h3>
<ul>
<li>Tell us as soon as a change is likely, even before it's final. We can pencil the new date while the family decides.</li>
<li>Let Meher know if venue or catering bookings also need moving; she'll handle the calls with our partners.</li>
</ul>`,
    },
    {
        slug: "whats-in-the-wedding-day-package",
        title: "What's in the wedding day package",
        excerpt:
            "Two photographers, one filmmaker, around 400 edited photographs, a five-minute highlight film and the full ceremony on film. ₹2,40,000, GST included.",
        category: "help",
        daysAgo: 96,
        cover: cover("banquetMandap"),
        body: `<p>Our wedding day photo and film package is ₹2,40,000, with 18% GST included. This is exactly what it covers.</p>
<h2>The team</h2>
<ul>
<li><strong>Two photographers.</strong> Kabir leads; a second photographer covers the other side of the mandap, the groom's side of the baraat, and the guests while Kabir is with the couple.</li>
<li><strong>One filmmaker.</strong> Usually Ishaan, who shoots the highlight film and records the ceremony end to end.</li>
</ul>
<h2>What you receive</h2>
<ul>
<li>Around 400 edited photographs in a private online gallery, full resolution, yours to download and print.</li>
<li>A five-minute highlight film, cut to music.</li>
<li>The full ceremony film, unhurried, with the pandit's words and the family's voices left in.</li>
<li>A sneak peek within 72 hours.</li>
</ul>
${figure("groomWhite", "The groom, ten minutes before the baraat leaves. The second photographer's job is to be here while Kabir is with the bride.")}
<h2>What it doesn't include</h2>
<p>Albums, prints and extra functions are separate, so you only pay for what you'll use. Haldi and mehendi coverage is ₹55,000 for both on one day; albums start at ₹22,000. If you'd like more than 400 photographs edited, extra sets are ₹6,000 per 50.</p>
<p>The whole list is on our <a href="/packages">packages page</a>.</p>`,
    },
    {
        slug: "choosing-photos-for-your-album",
        title: "Choosing the photographs for your album",
        excerpt:
            "How many to pick, how to mark them, and why we ask for one person to make the final call.",
        category: "help",
        daysAgo: 81,
        cover: cover("brideBw"),
        body: `<p>Once your full gallery arrives, the next step is yours: choosing which photographs go into the album. We design from your picks, so this is the part that shapes the book.</p>
<h2>How many to pick</h2>
<p>A rough guide: three to four photographs per page. That's about 100 for a 30-page album, 140 for 40 pages and 180 for 50. Pick a few more than that and we'll leave out the weakest.</p>
<h2>How to mark them</h2>
<p>Mark favourites in the gallery with the heart. If a photograph must be a full spread, add a note to it saying so. Anything you want left out entirely, such as a cousin who'd rather not be in it, tell us in writing.</p>
${figure("brideDark", "The quiet frames often end up on a full page of their own. Mark the ones you keep coming back to.")}
<h2>Some honest advice</h2>
<ul>
<li>Choose one person to make the final call. Collect the family's opinions, then let one person decide.</li>
<li>Don't pick five versions of the same pose. Pick the one where everyone's eyes are open.</li>
<li>Leave room for small moments: the shoes, the mehendi drying, Nani's hands.</li>
</ul>
<p>Your first design proof arrives two weeks after we receive your picks. If you've ordered parent albums, choose those photographs at the same time; it saves a second round.</p>`,
    },
    {
        slug: "what-to-wear-for-your-pre-wedding-shoot",
        title: "What to wear for your pre-wedding shoot",
        excerpt:
            "Questions we're asked in the week before a pre-wedding shoot in Udaipur, answered plainly.",
        category: "help",
        daysAgo: 67,
        cover: cover("coupleRuins"),
        body: `<p>These are the questions we're asked most in the week before a pre-wedding shoot. Our pre-wedding package is a half day across two Udaipur locations, so you have time for two looks.</p>
<h3>How many outfits should we bring?</h3>
<p>Two, one for each location. A third only if it's simple to change into. Every change costs twenty minutes of light.</p>
<h3>Traditional or western?</h3>
<p>Whichever you'll actually be comfortable in. A common pairing: something easy and western for the lakeside in the morning, then a lehenga or saree and a bandhgala for the palace walls later.</p>
<h3>Which colours work best?</h3>
<p>Solid colours and rich tones: rani pink, mustard, deep green, ivory. Udaipur's walls are cream and ochre, and the lake is blue-grey, so colour stands out against them. Avoid small checks and fine stripes, which shimmer on camera, and big logos.</p>
<h3>What about shoes?</h3>
<p>Bring flat shoes for walking between spots and the good ones for the photographs. The ghats and steps are uneven.</p>
${figure("palaceJharokha", "Old jharokhas like these are why we tell couples to wear colour. The stone does the rest.")}
<h3>Hair and make-up?</h3>
<p>Book your artist for a little longer than you'd think; a touch-up between locations helps. Waterproof kajal, always.</p>
<h3>Anything else?</h3>
<p>Bring water, a small towel, and something that means something to you both. The film is sixty seconds long, and a small personal detail makes it yours.</p>`,
    },
    {
        slug: "how-your-gallery-is-delivered",
        title: "How your gallery is delivered",
        excerpt:
            "A private online gallery, full-resolution downloads, and what to do if Masi can't find the link.",
        category: "help",
        daysAgo: 47,
        cover: cover("cameraDark"),
        body: `<p>Your photographs reach you in two steps.</p>
<h2>The sneak peek</h2>
<p>Within 72 hours of the wedding we send twenty to thirty finished photographs. They're sized for phones, ready to share with the family that evening.</p>
<h2>The full gallery</h2>
<p>Four to six weeks after the wedding, you get a link to a private online gallery with every edited photograph, sorted by function: haldi, mehendi, sangeet, wedding. From there you can:</p>
<ul>
<li>download everything at full resolution, one function at a time or all at once;</li>
<li>mark favourites, which is also how you'll choose album photographs;</li>
<li>share a view-only link with family who should see but not download.</li>
</ul>
${figure("brideSmile", "Some photographs are for the family group the same evening. Those go in the sneak peek.")}
<h2>The films</h2>
<p>Highlight and ceremony films come with the gallery, as downloads in full HD, plus a version sized for phones.</p>
<h2>How long it stays up</h2>
<p>The gallery stays online for a year. Please download a copy and keep it in two places. We keep our own archive, but your copy should be in your hands.</p>
<p>If anyone in the family can't open the link, call us on +91 00000 00056 and we'll walk them through it. It happens every week.</p>`,
    },
    {
        slug: "weddings-outside-udaipur-and-jaipur",
        title: "Weddings outside Udaipur and Jaipur",
        excerpt:
            "We travel across Rajasthan and beyond. How travel and stay are handled, and what we need from you.",
        category: "help",
        daysAgo: 34,
        cover: cover("amerDusk"),
        body: `<p>Most of our weddings are in and around Udaipur and Jaipur, but every season we travel: Jodhpur, Pushkar, Kumbhalgarh, Ranakpur, and once in a while Goa or Ahmedabad.</p>
<h2>What it costs</h2>
<ul>
<li><strong>Within 150 km of Udaipur or Jaipur:</strong> no travel charge. Nathdwara, Kumbhalgarh, Ajmer and Pushkar fall inside this.</li>
<li><strong>Further away:</strong> we bill travel and rooms for the team at cost. We quote it upfront, before you book, so it's never a surprise on the final invoice.</li>
</ul>
<h2>What we need from you</h2>
<ul>
<li>Rooms for the team at or near the venue for each night of coverage. Three people for the wedding day package, two for most single functions.</li>
<li>Meals on working days. A plate from the guest buffet is perfect.</li>
<li>A contact at the venue for the day before, so we can walk the spaces in daylight.</li>
</ul>
${figure("jalMahal", "Early starts are part of travelling weddings. We like to see a new place at dawn before we photograph anyone in it.")}
<h2>Planning from afar</h2>
<p>If Meher is planning your wedding outside our two cities, she'll visit the venue once before the wedding. That visit is billed at cost too. For everything else, the consultation and the follow-ups happen on video.</p>`,
    },
    {
        slug: "preparing-for-a-newborn-session",
        title: "Preparing for a newborn session",
        excerpt:
            "Two unhurried hours at the studio. When to book, what to bring, and why we keep the room warm.",
        category: "help",
        daysAgo: 23,
        cover: cover("newbornBasket"),
        body: `<p>Our newborn sessions happen at the studio and last two hours, which is mostly time for feeding, settling and cuddles. The session is ₹16,000 with GST included.</p>
<h2>When to book</h2>
<p>Babies sleep most deeply in their first two weeks, so the best window is between day 6 and day 14. Book during pregnancy with your due date, and call us once the baby arrives. We'll set the date then.</p>
<h2>What to bring</h2>
<ul>
<li>Two or three feeds' worth of whatever you're using, and more nappies than you think.</li>
<li>A swaddle or blanket from home, if it means something: one Nani knitted, or the one from the hospital.</li>
<li>Something plain for the parents to wear in case you'd like to be in a few photographs. Soft colours work best.</li>
</ul>
${figure("newbornHand", "We never pose a baby in a way they wouldn't settle into themselves. This one chose her own grip.")}
<h2>In the studio</h2>
<p>We keep the room warm, around 27°C, because babies settle better when they're cosy. We wash our hands at the door, and the props and wraps are laundered after every session. Only one or two family members in the room, please; it keeps the baby calm.</p>
<p>You'll get thirty edited photographs in your gallery within three weeks. If you also booked a maternity session with us, we'll include a few side-by-sides.</p>`,
    },
    {
        slug: "booking-a-bridal-mehendi-artist",
        title: "Booking a bridal mehendi artist through us",
        excerpt:
            "₹21,000 for the bride, ₹350 a hand for guests. How we schedule the artists so nobody waits three hours for their turn.",
        category: "help",
        daysAgo: 104,
        cover: cover("mehendiBridal"),
        body: `<p>We book mehendi artists we've worked with for years. These are the prices and how the day runs.</p>
<h2>Prices</h2>
<ul>
<li><strong>Bridal mehendi:</strong> ₹21,000. Full hands to the elbow and feet to the ankle, in a design you agree with the artist beforehand.</li>
<li><strong>Guests:</strong> ₹350 per hand, for a simpler design that takes ten to fifteen minutes.</li>
</ul>
<p>Both include 18% GST.</p>
<h2>Timing the bride</h2>
<p>Bridal mehendi takes five to six hours. We start the bride on the morning of the mehendi function, or the evening before if the function is in the morning. The colour darkens for two days, so mehendi two days before the wedding gives the deepest shade on the day itself.</p>
${figure("mehendiCone", "The finest lines take the longest. We schedule the bride first so she isn't rushed when guests arrive.")}
<h2>Planning for guests</h2>
<p>One artist can do about twenty guest hands an hour. For a mehendi of eighty guests, where half want both hands, we send three artists so the queue never becomes the party. Tell Meher your rough count a week before and she'll set the numbers.</p>
<h3>A few small things</h3>
<ul>
<li>Ask guests to wash their hands and skip lotion beforehand.</li>
<li>Keep a lemon and sugar mix ready; dabbing it on helps the colour.</li>
<li>If you've booked our haldi and mehendi coverage, we'll photograph the bridal design close up before the family arrives.</li>
</ul>`,
    },

    // ───────────────────────────── News ─────────────────────────────
    {
        slug: "meher-bhati-joins-as-wedding-planner",
        title: "Meher Bhati joins us as wedding planner",
        excerpt:
            "Planning at Golden Hour Weddings now has someone whose whole job it is. Say hello to Meher.",
        category: "news",
        daysAgo: 163,
        cover: cover("marigoldDoor"),
        body: `<p>For the last few seasons, Kabir and Tanvi have been fitting wedding planning in between shoots and décor builds. It worked, mostly, but late-night calls with caterers during an edit weren't fair to anyone.</p>
<p>So we're glad to say that <strong>Meher Bhati</strong> has joined the studio full time as our wedding planner. Meher grew up in Udaipur's old city and spent six years planning weddings and family functions across Mewar before joining us. She knows which ghats flood in a heavy monsoon, which havelis lose power at 10 pm, and which halwai can cook for 400 without anyone noticing a delay.</p>
${figure("banquetDecor", "Meher's first walkthrough with us. She counted the plug points before she looked at the flowers.")}
<p>From this season, Meher handles planning consultations, venue visits, our partner kitchen, mehendi artists and the run-sheet on the day. Tanvi continues to lead décor, and Kabir and Ishaan stay behind the cameras.</p>
<p>You can book a free thirty-minute consultation with Meher at the studio or on video through our <a href="/enquire">enquiry form</a>.</p>`,
    },
    {
        slug: "monsoon-pre-wedding-and-studio-sessions",
        title: "Monsoon months: pre-wedding slots and studio sessions",
        excerpt:
            "June to August is quiet for weddings, so it's when we open the calendar for monsoon pre-wedding shoots, maternity, newborn and family sessions.",
        category: "news",
        daysAgo: 128,
        cover: cover("monsoonHills"),
        body: `<p>From June to August, Udaipur's wedding calendar goes quiet. First it's too hot, then the rain arrives. For us, that's the most beautiful time to photograph the city: the Aravallis turn green, the lakes fill, and Sajjangarh sits in cloud.</p>
<p>This year we've opened weekday slots for:</p>
<ul>
<li><strong>Monsoon pre-wedding shoots:</strong> ₹65,000 for a half day at two Udaipur locations, with 40 edited photographs and a 60-second film. We keep a rain date on hold for every booking.</li>
<li><strong>Maternity sessions:</strong> ₹18,000.</li>
<li><strong>Newborn sessions:</strong> ₹16,000, two hours at the studio.</li>
<li><strong>Family portraits:</strong> ₹12,000 for ninety minutes.</li>
</ul>
${figure("maternityDoor", "Monsoon light is soft all day, which makes it a good season for maternity portraits.")}
<p>All prices include GST. Studio sessions run Monday to Saturday; outdoor shoots depend on the sky, and we'll call you the evening before.</p>`,
    },
    {
        slug: "season-dates-open-2026-27",
        title: "Dates for the 2026–27 season are open",
        excerpt:
            "November 2026 to February 2027, and the late April–May run, are now open for booking. Some December dates are already gone.",
        category: "news",
        daysAgo: 58,
        cover: cover("palaceMandap"),
        body: `<p>Our calendar for the 2026–27 wedding season is open: <strong>November 2026 to February 2027</strong>, plus the second run from <strong>late April to May 2027</strong>.</p>
<p>A few things to know:</p>
<ul>
<li>The busiest muhurat dates in late November and the second week of December are filling fastest. Some are already gone.</li>
<li>We take one wedding per day, so a 25% advance is what holds a date.</li>
<li>If you're still choosing between two dates, tell us both. We'll pencil them for a week while the family decides.</li>
</ul>
${figure("stageRed", "Stages like this are booked a season ahead. Tanvi has already started on drawings for December.")}
<p>Planning, décor and catering can be booked alongside photography, or on their own. Start with a free consultation at the studio, at the Jaipur desk, or on video. <a href="/enquire">Send us your date</a>.</p>`,
    },
    {
        slug: "jaipur-desk-tuesdays-and-fridays",
        title: "Our Jaipur desk is open Tuesdays and Fridays",
        excerpt:
            "Couples in Jaipur can now meet us in C-Scheme, by appointment, two days a week.",
        category: "news",
        daysAgo: 52,
        cover: cover("hawaMahalHorses"),
        body: `<p>Last season, nearly a third of our weddings were in Jaipur, and most of those families drove to Udaipur at least once just to meet us. That didn't seem right.</p>
<p>From this month, we have a small desk in <strong>C-Scheme, Jaipur</strong>, open on <strong>Tuesdays and Fridays, by appointment</strong>. Kabir or Meher will be there each week with sample albums, cover swatches and the season calendar. Tanvi joins on Fridays in the run-up to the season, with décor drawings and flower samples for Jaipur weddings.</p>
${figure("jaipurCityPalace", "We've spent many evenings in Jaipur's old city. Now we have somewhere to sit down and talk afterwards.")}
<p>You can book a free thirty-minute consultation there just as you would in Udaipur. Call +91 00000 00056 or use the <a href="/enquire">enquiry form</a> and pick "Jaipur desk". We'll send the exact address with your confirmation.</p>`,
    },
    {
        slug: "mogra-and-marigold-haldi",
        title: "New this season: the Mogra & Marigold haldi",
        excerpt:
            "Tanvi's new haldi setup: strings of marigold and mogra, low seating and a canopy that keeps the sun off.",
        category: "news",
        daysAgo: 41,
        cover: cover("haldiCanopy"),
        body: `<p>Tanvi has spent the summer building something new for haldi mornings: the <strong>Mogra & Marigold</strong> setup.</p>
<p>It's built around three things families keep asking us for:</p>
<ul>
<li><strong>Shade.</strong> A light cotton canopy, open on the sides, so the haldi can start at 10 am without anyone wilting.</li>
<li><strong>Fragrance.</strong> Hanging strings of marigold with mogra between them. Mogra is in short supply in winter, so we source it from growers near Nathdwara two days ahead.</li>
<li><strong>Low seating.</strong> Gaddas and bolsters in turmeric and white, so elders can sit comfortably and the bride is at their height.</li>
</ul>
${figure("garlandsLight", "A test string in the studio courtyard. The mogra is what you notice first when you walk in.")}
<p>The setup starts from ₹65,000, GST included, for a courtyard or lawn of up to 80 guests. You can see more on our <a href="/packages">packages page</a>, or ask Meher in your consultation.</p>`,
    },
    {
        slug: "sheesham-frames-and-cotton-rag-prints",
        title: "Sheesham frames and cotton-rag prints, now in the studio",
        excerpt:
            "Come and see the frames and fine-art prints in person before you order. They're on the wall by the window.",
        category: "news",
        daysAgo: 33,
        cover: cover("palaceReflection"),
        body: `<p>We've hung a new wall in the studio, by the window that looks toward the lake. It holds our printed work as couples receive it: <strong>canvas prints</strong>, <strong>fine-art cotton-rag prints</strong>, and frames in solid <strong>sheesham wood</strong> made by a carpenter in Hathipole who has been framing for thirty years.</p>
<p>Cotton-rag paper has a soft, matte surface with no glare. It suits black-and-white portraits and the quieter photographs from a haldi or mehendi. Canvas is better for big colourful frames that go over a sofa.</p>
${figure("familyPortrait", "A family portrait session from the summer, now printed on cotton rag in a sheesham frame for the grandparents' room.")}
<p>Prints and frames can be ordered from any gallery we've delivered, including from sessions years ago. Drop in when you're near Lake Palace Road, or ask us for sizes and prices.</p>`,
    },
    {
        slug: "acrylic-photo-album-covers",
        title: "Acrylic photo covers for albums",
        excerpt:
            "Your favourite photograph behind a sheet of clear acrylic, as the cover of your album. Samples are in the studio.",
        category: "news",
        daysAgo: 95,
        cover: cover("albumCover"),
        body: `<p>Alongside linen and leather, our flush-mount albums now come with an <strong>acrylic photo cover</strong>: one photograph of your choosing, printed and set behind a sheet of clear acrylic with polished edges.</p>
<p>It's ₹6,500 more than linen, GST included, in all three sizes: 10×12, 12×15 and 12×18 inches. The rest of the album is unchanged: the same flush-mount pages, and 30, 40 or 50 pages.</p>
${figure("brideDark", "Portraits like this one, with a dark background and one strong subject, look best behind acrylic.")}
<p>A tip from Kabir: choose a photograph with a dark or simple background and the couple in the middle third. Busy wide shots lose their detail behind the acrylic's shine.</p>
<p>Samples are in the studio. Couples who are already in the proof stage can switch covers until the album goes to print.</p>`,
    },
    {
        slug: "in-mehfil-and-mandap-vendor-round-up",
        title: "A small mention in Mehfil & Mandap",
        excerpt:
            "A Rajasthan wedding quarterly included us in its autumn round-up of vendors. We're quietly pleased.",
        category: "news",
        daysAgo: 19,
        cover: cover("coupleLights"),
        body: `<p><em>Mehfil & Mandap</em>, a small wedding quarterly published from Jodhpur, included Golden Hour Weddings in its autumn round-up of Rajasthan wedding vendors, under "photographers who stay out of the way".</p>
<p>The piece was a page and a half, with one of our photographs and a few lines from two couples we photographed last winter. It isn't a big magazine, but it's read by the families and planners who actually book weddings here, which matters more to us.</p>
<p>We'll take that description. It's what we try to do: be close enough to catch the moment Papa's composure breaks during the kanyadaan, and far enough back that he doesn't notice we're there.</p>
${figure("coupleArchSmoke", "The photograph the magazine used, from a February wedding near Fateh Sagar. The smoke was the décor team's idea and the timing was luck.")}
<p>Thank you to the couples who spoke to the editors, and to Ishaan, who has been making the case for "stay out of the way" since he joined.</p>`,
    },
    {
        slug: "diwali-studio-holiday-2026",
        title: "Studio closed for Diwali, 7–10 November",
        excerpt:
            "We're closed from Saturday 7 to Tuesday 10 November, and back on Wednesday 11th.",
        category: "news",
        daysAgo: 12,
        cover: cover("diyas"),
        body: `<p>The studio and the Jaipur desk will be <strong>closed from Saturday 7 November to Tuesday 10 November</strong> for Diwali. We reopen on <strong>Wednesday 11 November</strong>.</p>
<p>During those days:</p>
<ul>
<li>Enquiries are welcome; we'll reply from Wednesday.</li>
<li>If your wedding is in November and something urgent comes up, call +91 00000 00056. Meher will have the phone.</li>
<li>Galleries due that week will be delivered on Monday 16 November.</li>
</ul>
${figure("diyaRow", "The studio steps on Diwali night last year. We light them every year before we leave.")}
<p>Wedding dates pick up again after Dev Uthani Ekadashi, and from then until February we're out most days. So we'll spend these few days with our families first. Happy Diwali from all of us at Golden Hour Weddings.</p>`,
    },

    // ─────────────────────────── Articles ───────────────────────────
    {
        slug: "pre-wedding-locations-in-udaipur",
        title: "Six places in Udaipur we keep coming back to for pre-wedding shoots",
        excerpt:
            "Ghats, chhatris, palace walls and a hilltop at sunset. Where we take couples, when the light is right, and what to know before you go.",
        category: "articles",
        daysAgo: 177,
        cover: cover("picholaBoat"),
        body: `<p>Our pre-wedding shoot is a half day at two locations. Choosing which two is a conversation we have with every couple, and it usually starts with "something with the lake." Here are the places we suggest most often, and what each one is good for.</p>
<h2>1. The ghats around Lake Pichola</h2>
<p>Steps down to the water, old havelis behind, boats moving past. Mornings are best; by 9 am the ghats fill with people washing clothes and children diving, and while that makes lovely candid photographs, it makes posed ones difficult. We start at 6:45 in winter.</p>
${figure("palaceGolden", "Late light on the palace walls across the water. We time the second location of the day around this.")}
<h2>2. The Bagore ki Haveli area</h2>
<p>The lanes behind Gangaur Ghat are narrow and painted in faded blues and pinks, with carved doorways at every turn. It's good for close, quiet portraits, and for couples who'd rather not be watched. Wear flat shoes; the lanes are steep.</p>
<h2>3. Fateh Sagar at the edge of day</h2>
<p>Fateh Sagar is wide and open, with the hills right behind it. It suits couples who want movement: walking, laughing, a scooter ride along the road beside the lake. The wind off the water does wonderful things to a dupatta.</p>
<h2>4. Chhatris above the water</h2>
<p>Stone pavilions on the lake's edge give a frame without anyone needing to hold one. We like them for couples who feel stiff in front of a camera: sitting in a chhatri, talking to each other, they forget about us within ten minutes.</p>
${figure("chhatriLake", "A chhatri on a grey morning. Overcast skies are a gift for portraits, and the hills come out softer.")}
<h2>5. Sajjangarh at sunset</h2>
<p>The Monsoon Palace sits on a hill west of the city, and from its terraces you see every lake at once. The drive up closes in the early evening, so we time the shoot to finish here with the last light. In the monsoon it's often in cloud, which is either magical or a wash-out, so we always keep a backup.</p>
<h2>6. The city palace walls from the water</h2>
<p>A boat out on Pichola in the late afternoon, with the palace walls glowing behind you. We book the boat ahead, and it's the one location that adds a small cost: the boat hire, at actual rates, paid on the day.</p>
${figure("coupleRiver", "Not every couple wants palaces. This pair asked for water and rocks, and the river under a grey sky felt more like them.")}
<h2>A few practical notes</h2>
<ul>
<li>Some heritage sites need a permit for professional cameras. We arrange it, and the fee is paid at cost.</li>
<li>Two locations means about four hours including the drive, outfit changes and a chai stop.</li>
<li>From these you'll get 40 edited photographs and a sixty-second film. The package is ₹65,000, GST included.</li>
</ul>
<p>If you've seen a spot on someone else's feed, send it to us. We've probably been there, and we'll tell you honestly whether it's worth the drive.</p>`,
    },
    {
        slug: "decor-budget-guide",
        title: "A décor budget guide for a three-function wedding",
        excerpt:
            "Mandap, haldi, sangeet stage: what each costs with us, where the money goes, and where you can save without anyone noticing.",
        category: "articles",
        daysAgo: 131,
        cover: cover("stagePurple"),
        body: `<p>Décor is usually the biggest number on a wedding budget after the venue and food, and the hardest to compare. One quote says "stage décor," another says "floral package," and neither tells you how many flowers. Here's how Tanvi breaks it down, using our own starting prices. All of them include GST.</p>
<h2>The three big pieces</h2>
<ul>
<li><strong>Floral mandap:</strong> from ₹1,85,000. Four pillars, a canopy, fresh flowers on every surface the camera will see, seating for the couple, parents and pandit, and the havan setup.</li>
<li><strong>Haldi setup (marigold and mogra):</strong> from ₹65,000. Hanging strings, low seating, a canopy for shade.</li>
<li><strong>Sangeet stage:</strong> from ₹1,40,000. Stage, backdrop, lighting rig and dance floor edging.</li>
</ul>
<p>Together, that's ₹3,90,000 as a starting point for a wedding with around 200 guests.</p>
${figure("stageArch", "An aisle arch and stage for a 250-guest wedding. The arch alone was a fifth of the floral budget.")}
<h2>Where the money actually goes</h2>
<p>Roughly, for a mandap: 45% flowers, 25% structure and fabric, 15% labour (most of it on the day itself), and 15% lighting and transport. Flowers are the part that moves. Roses and orchids cost three times more in the second week of December than in early November, because every wedding in Rajasthan wants them that week.</p>
<h2>Where to spend</h2>
<ul>
<li><strong>The mandap.</strong> It's in every ceremony photograph for three hours. If you only splurge on one thing, make it this.</li>
<li><strong>Lighting at night.</strong> A modest stage with good warm lighting photographs better than an expensive one lit with white floodlights.</li>
</ul>
<h2>Where to save</h2>
<ul>
<li><strong>Seasonal flowers.</strong> Marigold, mogra, rajnigandha and roses from local growers are cheaper and fresher than imported blooms. Our haldi setup is built around them for that reason.</li>
<li><strong>Re-use between functions.</strong> Sangeet seating can become reception seating with new fabric. Haldi strings can line the mehendi courtyard the same afternoon.</li>
<li><strong>Entrance arches.</strong> Guests walk through them in four seconds. A simple frame with a fabric drape is fine.</li>
</ul>
${figure("lanternsTrees", "Lanterns in old trees cost very little and look like a lot. We used them instead of a second stage at this mehendi.")}
<h2>What makes a quote go up</h2>
<p>Three things: guest count (more seating, wider stages), venue access (carrying everything up four flights of haveli stairs takes a crew of eight instead of four), and late changes. Once flowers are ordered, three days out, changing colours means paying twice.</p>
${figure("stageSofas", "A full flower wall behind the couple's seating. Families often choose this over a bigger stage.")}
<h2>A sample split for 200 guests</h2>
<p>For a family with a total décor budget of about ₹5,00,000 across three functions, Tanvi would usually suggest something like this: ₹2,20,000 on the mandap, ₹75,000 on the haldi, ₹1,55,000 on the sangeet stage, and the remaining ₹50,000 kept back for entrance pieces, table flowers and the small things that always come up in the last week.</p>
<h2>How we quote</h2>
<p>After a consultation, Tanvi sends a drawing and a line-by-line quote: flower varieties and stems, fabric metres, lights, crew. If something is over budget, we'll tell you which line to cut first. A good décor budget should leave you something for the moments in between.</p>`,
    },
    {
        slug: "planning-a-haldi-in-udaipurs-heat",
        title: "Planning a haldi in Udaipur's heat",
        excerpt:
            "If your wedding falls in the April–May run, the haldi needs a plan for the sun. Timings, shade, water, and why we bring two kinds of towels.",
        category: "articles",
        daysAgo: 112,
        cover: cover("haldiShower"),
        body: `<p>A haldi in January is easy: soft sun, a light breeze off the lake, people happy to sit outside all morning. A haldi in the second week of May is a different event. By 11 am it's 40°C, the marble is too hot to walk on barefoot, and the turmeric paste dries before anyone has finished applying it.</p>
<p>About a quarter of our weddings now fall in the late April–May run, so we've worked out how to make a summer haldi pleasant. Here's what we tell families.</p>
<h2>Start early, finish by eleven</h2>
<p>Start the haldi at 8 am. Elders are awake anyway, the light is gentle on skin, and by 10:30 you're done and inside before the heat sets in. If the family insists on a later start, move it to the evening: 5:30 pm, with the last of the sun behind the hills.</p>
${figure("haldiBackdrop", "A morning haldi, finished by half past ten. The backdrop was up the night before so nobody was hammering in the heat.")}
<h2>Shade, everywhere</h2>
<p>Our haldi setup, starting from ₹65,000, includes a cotton canopy over the main seating, but in summer we also shade the guest area and the path from the house. Cotton, not synthetic. A synthetic shamiana traps heat and turns the space into an oven by mid-morning.</p>
<h2>Water and floors</h2>
<ul>
<li>Clay matkas of chilled water at both ends of the courtyard, and someone to refill them.</li>
<li>Jute or cotton durries on any marble or stone. Bare feet on summer marble at 10 am is not a ritual anyone enjoys.</li>
<li>Thandai or aam panna instead of hot chai. Our partner kitchen will adjust the menu.</li>
</ul>
<h2>The paste</h2>
<p>In dry heat, haldi paste cracks within minutes. Ask whoever is preparing it to make it slightly wetter than usual with a little extra curd or milk, and keep the bowl in the shade. Make it fresh in two batches rather than one large one.</p>
${figure("marigoldPetals", "Marigolds wilt fast in May. Tanvi has them delivered at dawn and kept in wet cloth until the guests arrive.")}
<h2>Flowers that survive</h2>
<p>Marigold holds up well in heat; mogra doesn't last past midday. For a summer haldi, Tanvi uses marigold for structure and adds mogra only where it will be smelled: near the bride's seat, and in the strings by the entrance.</p>
<h2>For the photographs</h2>
<p>Harsh midday sun flattens faces and burns out yellow clothes, which is the other reason to finish early. Under a cotton canopy, the light is soft and warm, exactly what turmeric and yellow outfits need. We bring two kinds of towels: dark ones for the family to wipe haldi off, and white ones we keep away from the haldi entirely for the bride's face before close portraits.</p>
<p>If your wedding is in May, talk to Meher at your consultation about the order of functions. Sometimes swapping the haldi and mehendi between morning and evening solves half the problem.</p>`,
    },
    {
        slug: "a-small-haveli-wedding-neha-and-siddharth",
        title: "Sixty guests, one haveli: Neha and Siddharth's wedding",
        excerpt:
            "A small wedding in a restored haveli near Gangaur Ghat, three functions in two days, and a family who knew exactly what they didn't want.",
        category: "articles",
        daysAgo: 88,
        cover: cover("archWindowLake"),
        body: `<p>Neha's first message to us was very clear: "Sixty people. No stage. No DJ. My grandmother has to be able to hear the pheras."</p>
<p>Neha and Siddharth both work in Bengaluru, and both their families are originally from Udaipur. They'd been to enough 600-guest weddings to know what they didn't want. What they wanted was a weekend in the old city with the people they actually talk to, in a place that felt like a home rather than a venue.</p>
<h2>The haveli</h2>
<p>Meher found them a restored haveli in the lanes near Gangaur Ghat: three storeys around a central courtyard, a terrace with a view of the lake, and twelve rooms, enough for both sets of grandparents and the closest family to stay on site. The owners had hosted small functions before but never a full wedding, so Meher and Tanvi walked it twice, measuring doorways and counting plug points.</p>
${figure("ritualThali", "The family gathered close around the thali. With sixty guests, everyone could see.")}
<h2>Two days, three functions</h2>
<p>Day one began with a haldi in the courtyard at 9 am, under a simple marigold canopy. Mehendi followed on the terrace in the afternoon, with two artists so that every guest who wanted it had both hands done by sunset. Then dinner on the terrace, with a dholak instead of a DJ, Siddharth's uncles singing songs nobody under forty knew, and everyone joining in anyway.</p>
<p>Day two was the wedding. The mandap went up in the courtyard: smaller than our usual design, built so the pheras could be seen from all three balconies above. Neha's grandmother sat in the front row, as promised, about two metres from the fire.</p>
<h2>Food on the terrace</h2>
<p>For sixty guests across four meals, our partner kitchen did a royal Rajasthani vegetarian menu: dal baati churma, gatte ki sabzi, ker sangri, and a mohan thaal recipe from Siddharth's mother that she'd sent over on WhatsApp the week before. With the 100-plate minimum, the family used the extra plates for the haveli's staff and the musicians, which felt right.</p>
${figure("foodClaypots", "Lunch on the terrace on the second day. The kitchen served in clay, at the family's request.")}
<h2>Photographing a small wedding</h2>
<p>Small weddings are harder to photograph than big ones, not easier. There's nowhere to hide. Kabir and Ishaan worked with shorter lenses and no flash during the ceremony, and kept to the balconies for the pheras so the courtyard felt like the family's own. We delivered a little over 300 photographs, fewer than our usual 400, because sixty people make fewer moments than six hundred. Every one of those people is in the album.</p>
<h2>What they chose afterwards</h2>
<p>A 12×15 leather album with 40 pages, and two parent albums. When Neha picked the photographs, she sent us a list of every guest and asked us to check each one appeared at least twice. They all did.</p>
<blockquote>"Everyone keeps saying it felt like a family function, not a wedding. That's the best thing anyone could have said." – Neha</blockquote>`,
    },
    {
        slug: "how-we-price-a-wedding-album",
        title: "How we price a wedding album",
        excerpt:
            "Size, cover, pages. Every line in an album quote, with the real numbers and three albums couples actually ordered.",
        category: "articles",
        daysAgo: 74,
        cover: cover("albumCover"),
        body: `<p>Album prices across the wedding industry are hard to compare, mostly because nobody publishes them. We'd rather you understood exactly what you're paying for, so here is our whole price card and the reasoning behind it. Every figure includes 18% GST.</p>
<h2>What an album is, at Golden Hour Weddings</h2>
<p>All our albums are flush-mount: each photograph is printed on photographic paper and mounted onto a thick board, so the pages are rigid and the spreads lie completely flat, with no gutter splitting a face in half. They're made to be handled by every cousin at every Diwali for forty years.</p>
<h2>Start with the size</h2>
<p>The base price is for a linen cover and 30 pages:</p>
<ul>
<li>10×12 inches: ₹22,000</li>
<li>12×15 inches: ₹28,000</li>
<li>12×18 inches: ₹34,000</li>
</ul>
<p>Most couples choose 12×15. The 12×18 is a landscape book that suits wide ceremony photographs and palace venues; the 10×12 is lovely for a smaller wedding or for a pre-wedding shoot on its own.</p>
${figure("albumBw", "A finished album being looked through. Flush-mount pages don't curve, so a wide spread stays one photograph.")}
<h2>Then the cover</h2>
<ul>
<li><strong>Linen:</strong> included. Soft, matte, in ten colours. Ages beautifully.</li>
<li><strong>Leather:</strong> +₹4,000. Full-grain, in tan, oxblood or black, with your names or initials debossed.</li>
<li><strong>Acrylic photo:</strong> +₹6,500. One of your photographs behind clear acrylic on the front.</li>
</ul>
<h2>Then the pages</h2>
<ul>
<li>30 pages: included</li>
<li>40 pages: +₹4,500</li>
<li>50 pages: +₹9,000</li>
</ul>
<p>A page is one side; a spread is two. Thirty pages holds the wedding day comfortably. Forty is right if the album also covers haldi, mehendi and sangeet. Fifty is for big, multi-day weddings, or for couples who simply can't leave anything out.</p>
<h2>Three real albums from last season</h2>
<ol>
<li><strong>12×15, leather, 40 pages:</strong> ₹28,000 + ₹4,000 + ₹4,500 = <strong>₹36,500</strong>. Our most common order.</li>
<li><strong>12×18, acrylic, 50 pages:</strong> ₹34,000 + ₹6,500 + ₹9,000 = <strong>₹49,500</strong>. A three-day wedding in Jaipur.</li>
<li><strong>10×12, linen, 30 pages, plus two parent albums:</strong> ₹22,000 + 2 × ₹9,500 = <strong>₹41,000</strong>. The couple kept theirs simple and spent the difference on their parents.</li>
</ol>
<h2>Parent albums</h2>
<p>An 8×10 album with 20 pages, made from the same design as yours, is ₹9,500. They're our favourite thing to deliver: a smaller book that grandparents can actually hold on their lap.</p>
${figure("albumOpen", "A 12×15 open at the pheras. We design every spread by hand. There are no templates.")}
<h2>Why albums cost what they do</h2>
<p>Roughly a third of the price is the printing and binding itself, done by a bindery that does nothing but flush-mount. Another third is design: fifteen to twenty hours per album, choosing sequence and pacing, retouching each photograph for print, and two rounds of proofs with you. The rest covers the cover materials, a rigid box, and our time handling it from your picks to your door.</p>
<p>If you'd like more photographs edited for the album than your package includes, extra sets are ₹6,000 per 50. Ask us to show you a sample in each size at the studio; you'll know which one is yours when you hold it.</p>`,
    },
    {
        slug: "a-jaipur-old-city-wedding-riya-and-arjun",
        title: "Riya and Arjun: a winter wedding in Jaipur's old city",
        excerpt:
            "A baraat past the Hawa Mahal, a sangeet in a haveli courtyard, and a bride who wanted Amer Fort at dawn.",
        category: "articles",
        daysAgo: 30,
        cover: cover("hawaMahalSky"),
        body: `<p>Riya and Arjun met at college in Pune and married in Jaipur, where Riya's family has lived in the walled city for four generations. They booked us almost a year ahead, after driving down to Udaipur for a consultation, with a list that started "Amer at sunrise" and ended "my Dadi's courtyard."</p>
<h2>Amer at dawn</h2>
<p>The day before the wedding, we met them at 6 am below Amer Fort. Winter mornings in Jaipur are cold and hazy, and the fort comes out of the mist slowly, which is the whole point. Riya wore her grandmother's bandhej odhni over a simple lehenga; Arjun wore a bandhgala he'd had made in Johari Bazaar the week before. We walked the ramparts for an hour and a half, until the tour buses arrived.</p>
${figure("amerRamp", "The ramparts at Amer, a little after six. Riya wanted the climb in the photographs, not just the view from the top.")}
<h2>A sangeet at home</h2>
<p>The sangeet was in the courtyard of Riya's family haveli in the old city, which is narrow, tall and very beautiful, with blue-painted jharokhas on every side. Getting a stage in there meant a lot of measuring. Tanvi built a low platform rather than a full stage, and lit the balconies so the haveli itself was the backdrop. The cousins had rehearsed for six weeks. The aunties had not, and were better for it.</p>
<h2>The baraat</h2>
<p>Arjun's baraat set out from a hotel near Chandpole and wound through the old city, past the pink walls and the Hawa Mahal, to the wedding venue. It took ninety minutes to cover what is normally a fifteen-minute walk. Ishaan walked backwards in front of the ghodi for most of it, filming, while Kabir ran ahead to photograph the arrival from a first-floor window he had arranged with a shopkeeper two days earlier.</p>
<h2>The wedding</h2>
<p>The pheras were at night, in a garden venue on the edge of the city, under a mandap of white roses and rajnigandha. There were 350 guests. Our partner kitchen served a mixed menu: royal Rajasthani vegetarian for most guests and royal non-veg for Arjun's side, laal maas included, at Arjun's father's very firm request.</p>
${figure("brideSpotlight", "Riya, just before she walked down to the mandap. One light, and a moment of quiet in a very loud evening.")}
<h2>What we delivered</h2>
<ul>
<li>A sneak peek two days after the wedding, which the family used for their thank-you messages.</li>
<li>About 450 edited photographs across the functions; Riya and Arjun added an extra set of 50.</li>
<li>A highlight film, the full ceremony film, and a short film of the sangeet that has now been watched, we're told, at every family gathering since.</li>
<li>A 12×18 acrylic album with 50 pages, the cover a photograph from that morning at Amer.</li>
</ul>
<blockquote>"Kabir told us to trust the timings and we did. We still don't know how he got that window." – Arjun</blockquote>
<p>Jaipur weddings have their own rhythm: the old city's lanes, its winter mornings, and families who have done this in the same courtyards for generations. If you're planning one, come and see us at the C-Scheme desk on a Tuesday or Friday.</p>`,
    },
    {
        slug: "a-sangeet-run-sheet",
        title: "A sangeet run-sheet that actually works",
        excerpt:
            "Our minute-by-minute plan for a three-and-a-half-hour sangeet, from sound check to the last song, and the mistakes it's designed to avoid.",
        category: "articles",
        daysAgo: 69,
        cover: cover("sangeetWomen"),
        body: `<p>Sangeets go wrong in predictable ways. The family performances run long, dinner gets pushed to 11 pm, the elders leave hungry, and the couple's own dance happens to a half-empty lawn. A run-sheet won't make your sangeet magical, but it will stop it falling apart. Here's the one Meher starts from.</p>
<h2>Before guests arrive</h2>
<ul>
<li><strong>4:00 pm:</strong> Stage and lighting ready. Our sangeet stage setups start from ₹1,40,000, and Tanvi signs off the lighting before the DJ arrives.</li>
<li><strong>5:00 pm:</strong> DJ sound check with every performance track, in order, played from the actual playlist. No "we'll send it on the day."</li>
<li><strong>6:00 pm:</strong> A last rehearsal for the cousins on the stage itself, not in a hotel room.</li>
</ul>
${figure("djDeck", "Sound check at five. Every track gets played once through the real speakers before guests arrive.")}
<h2>The evening</h2>
<ol>
<li><strong>7:00 pm:</strong> Guests arrive. Welcome drinks and snacks. Music low enough to talk over.</li>
<li><strong>7:45 pm:</strong> The couple's entry. Short: one song, two minutes.</li>
<li><strong>8:00 pm:</strong> First block of performances, about 40 minutes. Start with the youngest children, since they get sleepy, then the friends.</li>
<li><strong>8:45 pm:</strong> Dinner opens. This is the most important line on the page. Elders eat now, and the evening doesn't sag.</li>
<li><strong>9:30 pm:</strong> Second block, about 40 minutes: parents, aunts and uncles, then the grandparents' surprise if there is one.</li>
<li><strong>10:15 pm:</strong> The couple's dance, while the lawn is still full.</li>
<li><strong>10:25 pm:</strong> The floor opens. DJ takes over.</li>
<li><strong>11:30 pm:</strong> Last song. Check the venue's sound limit; many in Udaipur cut off at 10 or 11.</li>
</ol>
<h2>The rules behind it</h2>
<ul>
<li><strong>Cap every performance at four minutes.</strong> Medleys run long. Twelve performances of four minutes is already 48 minutes plus changeovers.</li>
<li><strong>One person on the mic.</strong> A cousin who's funny and knows the family, with the order printed on a card.</li>
<li><strong>Feed people before the second block.</strong> A hungry audience doesn't clap.</li>
<li><strong>Put the couple's dance before the open floor.</strong> After the floor opens, nobody stops dancing to watch.</li>
</ul>
${figure("djPurple", "Our DJ and sound night is ₹75,000 with GST. The DJ gets the run-sheet a week ahead and the final order on the day.")}
<h2>For the photographs and the film</h2>
<p>We need the order of performances by the afternoon, so Ishaan can place a camera on the right side of the stage for each one. Tell us which performances matter most to the family, like Dadi's song or the brothers' surprise. We'll make sure Kabir is right at the front for those, not changing a battery.</p>
<h2>When things slip anyway</h2>
<p>Something will run late. When it does, cut from the second block, not from dinner and not from the couple's dance. Meher keeps two performances marked as "can drop" on her copy of the sheet, agreed with the family in advance, so nobody has to make that call in front of a cousin in full costume.</p>
<p>If you'd like this run-sheet as a template, ask Meher. She'll fill in your timings and send it back the same day.</p>`,
    },
    {
        slug: "per-plate-catering-explained",
        title: "Per-plate catering, explained",
        excerpt:
            "What 'per plate' includes, why there's a 100-plate minimum, and how to estimate your count without paying for empty chairs.",
        category: "articles",
        daysAgo: 59,
        cover: cover("thaliTop"),
        body: `<p>Catering is usually the largest single line on a wedding budget, and the one families understand least. "Per plate" sounds simple until you're arguing about whether children count. Here's how it works with our partner kitchen.</p>
<h2>The four menus</h2>
<p>All prices are per plate, with GST included:</p>
<ul>
<li><strong>Veg classic:</strong> ₹1,450. Two starters, paneer and two seasonal sabzis, dal, rice, breads, raita, salad, two desserts.</li>
<li><strong>Veg royal Rajasthani:</strong> ₹2,100. Dal baati churma, gatte ki sabzi, ker sangri, a live counter, and three desserts including a regional sweet.</li>
<li><strong>Non-veg classic:</strong> ₹1,850. The classic menu, with one chicken and one mutton dish added.</li>
<li><strong>Non-veg royal:</strong> ₹2,600. The royal menu with laal maas, a chicken dish, and a non-veg live counter.</li>
</ul>
${figure("thaliSilver", "A tasting thali from the royal Rajasthani menu. Couples taste everything before they sign off.")}
<h2>What a plate includes</h2>
<p>One plate is one adult guest at one meal. It covers the food, the serving staff, crockery and cutlery, the buffet counters and their décor, and clearing up. It does not cover the venue's own charges, or bar service, which the venue usually handles.</p>
<h2>Why there's a minimum</h2>
<p>The kitchen sets up a full brigade for any function: cooks, tandoor, counters, staff. Below 100 plates, that cost doesn't come down, so the minimum is 100 plates per function. For smaller events, families often use the extra plates for drivers, staff and musicians.</p>
<h2>Estimating your count</h2>
<ul>
<li>Start with confirmed RSVPs, not the invitation list. In our experience, about 80% of invited guests come to the wedding and 60% to the smaller functions.</li>
<li>Children under six are free; six to twelve count as half a plate.</li>
<li>Confirm the final count with Meher <strong>five days before</strong> the function. You pay for the confirmed count, even if fewer guests arrive, and we add 5% spare at no charge.</li>
</ul>
<h2>A worked example</h2>
<p>A wedding dinner for 300 guests: 180 on the royal Rajasthani veg menu and 120 on the royal non-veg menu.</p>
<ul>
<li>180 × ₹2,100 = ₹3,78,000</li>
<li>120 × ₹2,600 = ₹3,12,000</li>
<li><strong>Total: ₹6,90,000</strong></li>
</ul>
<p>Your invoice shows the GST split as CGST and SGST.</p>
${figure("foodSpread", "Royal non-veg at a winter wedding. The laal maas is always the first dish to run out.")}
<h2>Tastings</h2>
<p>Every couple who books catering through us gets a tasting for up to six people at the partner kitchen, about a month before the wedding. Bring the people whose opinion about food actually matters in your family; there are usually two. Changes after the tasting are free until the final count is confirmed.</p>
<h2>A few things we've learned</h2>
<ul>
<li>Don't order the royal menu for every function. Classic at the mehendi lunch and royal at the wedding dinner is a common, sensible split.</li>
<li>Put the live counter where guests will queue in the shade.</li>
<li>Feed the elders first. Ask the kitchen to send plates to the front rows during the pheras; it's the kindest thing you'll do all day.</li>
</ul>`,
    },
    {
        slug: "aditi-and-karan-at-the-lake-palace",
        title: "Aditi and Karan at the lake palace",
        excerpt:
            "A boat to the mandap, pheras at sunset on Lake Pichola, and a family that finally all fitted into one photograph.",
        category: "articles",
        daysAgo: 44,
        cover: cover("lakePalaceWhite"),
        body: `<p>Aditi grew up in Delhi hearing her Nana's stories about Udaipur, where he was posted as a young engineer in the 1960s. When she and Karan got engaged, there was only ever going to be one city. When they saw the palace on its island in Lake Pichola, there was only going to be one venue.</p>
<h2>Two days on the water</h2>
<p>A wedding on an island means everything arrives by boat: guests, flowers, the pandit, our cameras. We spent a month on the logistics. Three boats on a loop every twenty minutes, a jetty schedule printed for every guest, and a separate boat for Aditi's grandparents with a ramp so Nana didn't have to step down onto a moving deck.</p>
${figure("picholaAerial", "The lake from above, the evening before the wedding. Every guest crossed this water at least twice.")}
<h2>A sangeet on the terrace</h2>
<p>The first evening, the sangeet was on a terrace looking back at the city, with the City Palace lit gold across the water. Karan's cousins did a Punjabi medley; Aditi's college friends did something involving a lot of Madhuri Dixit. Everyone had dinner by 9; we'd insisted on that weeks before.</p>
<h2>Pheras at sunset</h2>
<p>The pandit had suggested an evening muhurat, and the timing was perfect: the pheras began at 5:40 pm, just as the sun dropped behind the Aravallis. Tanvi's mandap was white: rajnigandha, white roses and mogra, with brass lamps at each pillar. She kept it low and open so that the lake stayed in every photograph.</p>
<p>We worked as three. Kabir stayed at the front with a long lens, Ishaan filmed from the side, and our second photographer moved among the guests. For the kanyadaan, Kabir moved behind Aditi's parents, and the photograph of her father's hands is the one the family has framed.</p>
${figure("coupleEmbrace", "After the pheras, a few minutes alone on the terrace before the family found them.")}
<h2>The photograph that took eleven years</h2>
<p>Aditi's family is spread across Delhi, Toronto and Melbourne. They had not all been in one place since her parents' 25th anniversary, eleven years earlier. She asked for one thing above everything else: a single photograph with all forty-three of them in it.</p>
<p>We did it the morning after, on the jetty, with the city behind. It took twenty minutes to arrange, two steps for the grandparents, and one small cousin on Karan's shoulders. We took thirty frames. In frame twenty-six, every single person is looking at the camera.</p>
${figure("handsDark", "Aditi's mehendi, two days in. Karan's initials are hidden near her right thumb, and he found them during the pheras.")}
<h2>What they took home</h2>
<ul>
<li>Our wedding day photo and film package, plus haldi and mehendi coverage.</li>
<li>A 12×15 leather album with 50 pages, the family photograph across the centre spread.</li>
<li>Three parent albums: one for each set of parents, and one for Nana.</li>
</ul>
<blockquote>"My Nana held the album for an hour without saying a word. Then he told us which window his office used to be behind." – Aditi</blockquote>`,
    },
    {
        slug: "how-many-hours-of-coverage-you-need",
        title: "How many hours of coverage do you actually need?",
        excerpt:
            "Which functions are worth a photographer, which you can skip, and how to plan coverage without paying for hours of people eating.",
        category: "articles",
        daysAgo: 25,
        cover: cover("mandapOutdoor"),
        body: `<p>"Should we book you for everything?" is one of the first questions at a consultation. The honest answer is: probably not. Here's how we help couples decide where a photographer is worth it, and where your cousin's phone is fine.</p>
<h2>Start with what you'll miss</h2>
<p>A useful test: which moments will you not see yourself? You won't see your groom's face as the baraat arrives, your parents during the kanyadaan, or your friends' faces during your first dance. Those are the moments worth paying for. A long dinner is not.</p>
<h2>The functions, one by one</h2>
<ul>
<li><strong>Roka or engagement:</strong> four hours covers the ceremony, the family portraits and the start of the party. Our engagement and roka coverage is ₹45,000.</li>
<li><strong>Haldi and mehendi:</strong> when they're on the same day, one booking covers both. We arrive for the bridal mehendi, stay through the haldi, and leave once guest mehendi becomes a queue. ₹55,000.</li>
<li><strong>Sangeet:</strong> three hours is usually enough: the couple's entry, the performances and the first half hour of dancing. After that, it's the same dance floor photograph again and again.</li>
<li><strong>The wedding:</strong> this is where you want the full team. Getting ready, the baraat, the jaimala, the pheras, the vidaai. Our wedding day package covers it with two photographers and a filmmaker.</li>
</ul>
${figure("mehendiArtist", "The bridal mehendi, early in the day. If you only book part of a function, book the part that starts the earliest.")}
<h2>Where couples overspend</h2>
<ul>
<li><strong>Full-day coverage of the reception.</strong> Two hours, from the couple's entry through the family greetings, is plenty. Nobody wants 200 photographs of people holding plates.</li>
<li><strong>A separate team at each house for getting ready.</strong> One photographer with the bride and the filmmaker with the groom usually tells the story better.</li>
</ul>
<h2>Where couples underspend</h2>
<ul>
<li><strong>The vidaai.</strong> It often happens at 2 am, after a long day, and families send the photographers home. Don't. It's the moment parents ask about most, years later.</li>
<li><strong>Family portraits.</strong> Allow 45 minutes, with a list, and someone from each side to call names. Otherwise half the family ends up missing.</li>
</ul>
${figure("groomCarries", "The end of a long wedding night. This is why we tell families not to send the team home before the vidaai.")}
<h2>Hours are not the same as photographs</h2>
<p>More hours doesn't always mean a better gallery. A tight four hours with a clear list of moments often gives you more photographs you'll keep than an open-ended ten. Tell us the people and moments that matter, and we'll plan the day around them rather than around the clock.</p>
<h2>A typical plan</h2>
<p>For a three-day wedding in Udaipur, the most common combination we book is: haldi and mehendi on day one (₹55,000) and the full wedding day (₹2,40,000), with the sangeet left to family phones or added on if it matters most. A pre-wedding shoot a few months earlier (₹65,000) gives the album its opening pages. All of those prices include GST.</p>
<p>Bring your function list to a consultation, and we'll mark where we'd put a camera and where we wouldn't. You might book less than you expected.</p>`,
    },
];

/** A photograph from the table above, for the site and catalogue (`studio-photos.ts`). */
export const fvPhoto = cover;
