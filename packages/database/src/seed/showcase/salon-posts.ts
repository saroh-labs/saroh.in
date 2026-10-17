/**
 * Gulmohar Salon & Bridal's journal: help for clients, news from the salon and
 * longer articles on hair, skin and bridal, written for a Jaipur salon and
 * agreeing with its fact sheet (prices, policies, team, hours). Photos are
 * free-licence Unsplash images, credited by photographer and hot-linked,
 * each looked at before it was chosen.
 */
import type { DsImage, DsPost } from "./diary-shop-types";

const escapeAttr = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** An inline figure for a post body, credited in the caption. */
const fig = (image: DsImage, caption: string) =>
    `<figure><img src="${image.url}" alt="${escapeAttr(image.alt)}" width="${image.width}" height="${image.height}" /><figcaption>${caption} Photo: ${image.creditName} / Unsplash</figcaption></figure>`;

/** Every photograph the journal uses. */
const ph = {
    H1c: {
        url: "https://images.unsplash.com/photo-1554672408-730436b60dde?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand holding a phone with a booking screen open",
        width: 1600,
        height: 2183,
        creditName: "charlesdeluvio",
        creditUrl: "https://unsplash.com/@charlesdeluvio",
    },
    H1i: {
        url: "https://images.unsplash.com/photo-1695527081848-1e46c06e6458?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist working on a client's hair in a bright salon",
        width: 1600,
        height: 2400,
        creditName: "Daniel",
        creditUrl: "https://unsplash.com/@unsplashbydan",
    },
    H2c: {
        url: "https://images.unsplash.com/photo-1562217180-021f74991332?w=1600&q=80&auto=format&fit=crop",
        alt: "An open planner with a pen and paper clips on a desk",
        width: 1600,
        height: 1068,
        creditName: "Alexa Williams",
        creditUrl: "https://unsplash.com/@glamorousplanning",
    },
    H2i: {
        url: "https://images.unsplash.com/photo-1569257437369-90bdc0a45d5f?w=1600&q=80&auto=format&fit=crop",
        alt: "Hands tapping on a phone's number pad",
        width: 1600,
        height: 1067,
        creditName: "Igor Rodrigues",
        creditUrl: "https://unsplash.com/@igorrodrigues",
    },
    H3c: {
        url: "https://images.unsplash.com/photo-1617391654484-2894196c2cc9?w=1600&q=80&auto=format&fit=crop",
        alt: "A colourist in black gloves applying colour to hair",
        width: 1600,
        height: 1067,
        creditName: "Maksim Chernishev",
        creditUrl: "https://unsplash.com/@primipil",
    },
    H3i: {
        url: "https://images.unsplash.com/photo-1715220210514-5b52d4893f65?w=1600&q=80&auto=format&fit=crop",
        alt: "A ring of hair colour swatches from dark brown to blonde",
        width: 1600,
        height: 2400,
        creditName: "Courtney Spittle",
        creditUrl: "https://unsplash.com/@courtsue",
    },
    H4c: {
        url: "https://images.unsplash.com/photo-1610173826014-d131b02d69ca?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride in pink with a maang tikka and jewellery, getting ready at a mirror",
        width: 1600,
        height: 1067,
        creditName: "Alok Verma",
        creditUrl: "https://unsplash.com/@theweddingfocus",
    },
    H4i: {
        url: "https://images.unsplash.com/photo-1724856605022-106d6dd6e842?w=1600&q=80&auto=format&fit=crop",
        alt: "Close-up of red lehenga embroidery in gold thread",
        width: 1600,
        height: 2400,
        creditName: "Abhishek Sharma",
        creditUrl: "https://unsplash.com/@abhishekvats",
    },
    H5c: {
        url: "https://images.unsplash.com/photo-1614838000027-76439aa4aedc?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist blow-drying a client's dark hair in a salon",
        width: 1600,
        height: 1067,
        creditName: "Nicolás Flor",
        creditUrl: "https://unsplash.com/@nicolasflor",
    },
    H5i: {
        url: "https://images.unsplash.com/photo-1552693673-1bf958298935?w=1600&q=80&auto=format&fit=crop",
        alt: "A therapist working on a client's face during a facial",
        width: 1600,
        height: 1064,
        creditName: "karelys Ruiz",
        creditUrl: "https://unsplash.com/@karelysruiz",
    },
    H6c: {
        url: "https://images.unsplash.com/photo-1599011176306-4a96f1516d4d?w=1600&q=80&auto=format&fit=crop",
        alt: "A barber trimming a bearded client's hair with scissors",
        width: 1600,
        height: 2400,
        creditName: "Mr Shave",
        creditUrl: "https://unsplash.com/@mrshave",
    },
    H6i: {
        url: "https://images.unsplash.com/photo-1560869713-7d0a29430803?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist curling a client's long hair into soft waves",
        width: 1600,
        height: 2847,
        creditName: "Baylee Gramling",
        creditUrl: "https://unsplash.com/@bayleejadegramling",
    },
    H7c: {
        url: "https://images.unsplash.com/photo-1673465766620-1f336d434bff?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist straightening a section of hair with flat irons",
        width: 1600,
        height: 1068,
        creditName: "Adam Winger",
        creditUrl: "https://unsplash.com/@awcreativeut",
    },
    H7i: {
        url: "https://images.unsplash.com/photo-1629397662600-50ad523ef4fb?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist working on a client's long hair in the salon",
        width: 1600,
        height: 1067,
        creditName: "Giorgio Trovato",
        creditUrl: "https://unsplash.com/@giorgiotrovato",
    },
    H8c: {
        url: "https://images.unsplash.com/photo-1602339752474-f77aa7bcaecd?w=1600&q=80&auto=format&fit=crop",
        alt: "Patrika Gate in Jaipur, painted in pink and red",
        width: 1600,
        height: 1064,
        creditName: "Satyam Bhardwaj",
        creditUrl: "https://unsplash.com/@b_satyam",
    },
    H8i: {
        url: "https://images.unsplash.com/photo-1477587458883-47145ed94245?w=1600&q=80&auto=format&fit=crop",
        alt: "Traffic and a decorated horse cart on a Jaipur street by Hawa Mahal",
        width: 1600,
        height: 1067,
        creditName: "Aditya Siva",
        creditUrl: "https://unsplash.com/@msaditya9",
    },
    H9c: {
        url: "https://images.unsplash.com/photo-1623217509141-6f735087b50c?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman holding up her hand to show fresh mehendi",
        width: 1600,
        height: 2397,
        creditName: "Eddy Lee",
        creditUrl: "https://unsplash.com/@lee_eddy",
    },
    H9i: {
        url: "https://images.unsplash.com/photo-1771992230380-bc023f41771e?w=1600&q=80&auto=format&fit=crop",
        alt: "A hand with dark mehendi resting on marigold flowers",
        width: 1600,
        height: 2400,
        creditName: "Rejaul Karim",
        creditUrl: "https://unsplash.com/@rejaul_creativedesign",
    },
    N1c: {
        url: "https://images.unsplash.com/photo-1771992226177-759e116e72f4?w=1600&q=80&auto=format&fit=crop",
        alt: "Hands with mehendi over a yellow outfit and marigold garlands",
        width: 1600,
        height: 2400,
        creditName: "Rejaul Karim",
        creditUrl: "https://unsplash.com/@rejaul_creativedesign",
    },
    N1i: {
        url: "https://images.unsplash.com/photo-1729587024306-6992a1c1057c?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman on a rooftop showing her mehendi-covered palms",
        width: 1600,
        height: 1056,
        creditName: "Tanuj Singhal",
        creditUrl: "https://unsplash.com/@tanujsky",
    },
    N2c: {
        url: "https://images.unsplash.com/photo-1785581778868-79100f7fe56c?w=1600&q=80&auto=format&fit=crop",
        alt: "An open jar of cream and a dropper bottle on marble with dried flowers",
        width: 1600,
        height: 1067,
        creditName: "Henry Davidson",
        creditUrl: "https://unsplash.com/@henrydavisonny",
    },
    N2i: {
        url: "https://images.unsplash.com/photo-1648313143853-aa913f6ad44a?w=1600&q=80&auto=format&fit=crop",
        alt: "A client relaxing at the basin while her hair is washed",
        width: 1600,
        height: 1006,
        creditName: "Gabriela",
        creditUrl: "https://unsplash.com/@gabigi",
    },
    N3c: {
        url: "https://images.unsplash.com/photo-1774660810725-fb04e002003d?w=1600&q=80&auto=format&fit=crop",
        alt: "A colourist at work in a bright, white salon",
        width: 1600,
        height: 2400,
        creditName: "Alexander Mass",
        creditUrl: "https://unsplash.com/@alexandermassph",
    },
    N3i: {
        url: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1600&q=80&auto=format&fit=crop",
        alt: "Long hair with warm balayage against a pink wall",
        width: 1600,
        height: 1068,
        creditName: "Element5 Digital",
        creditUrl: "https://unsplash.com/@element5digital",
    },
    N4c: {
        url: "https://images.unsplash.com/photo-1746372283841-dbb3838f9935?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride in a pink lehenga standing under a stone arch",
        width: 1600,
        height: 2400,
        creditName: "SAREE GHAR",
        creditUrl: "https://unsplash.com/@sareegharjaipur",
    },
    N4i: {
        url: "https://images.unsplash.com/photo-1756483560049-e7b2208f99a0?w=1600&q=80&auto=format&fit=crop",
        alt: "A smiling bride wearing a kundan necklace and maang tikka",
        width: 1600,
        height: 2399,
        creditName: "iKshana Productions",
        creditUrl: "https://unsplash.com/@ikshanaproductions",
    },
    N5c: {
        url: "https://images.unsplash.com/photo-1605029271330-95970e826af3?w=1600&q=80&auto=format&fit=crop",
        alt: "Two women in festive outfits taking a selfie",
        width: 1600,
        height: 1068,
        creditName: "AMIT RANJAN",
        creditUrl: "https://unsplash.com/@am_ranjan",
    },
    N5i: {
        url: "https://images.unsplash.com/photo-1780247473263-4be70d512f5c?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman in red smiling and showing her mehendi palms",
        width: 1600,
        height: 1041,
        creditName: "Mr Catographer",
        creditUrl: "https://unsplash.com/@mrcato",
    },
    N6c: {
        url: "https://images.unsplash.com/photo-1662720868850-e60cefb03201?w=1600&q=80&auto=format&fit=crop",
        alt: "Rows of lit clay diyas",
        width: 1600,
        height: 1064,
        creditName: "Joshi Milestoner",
        creditUrl: "https://unsplash.com/@joshimilestoner",
    },
    N6i: {
        url: "https://images.unsplash.com/photo-1785456390070-9960e3997066?w=1600&q=80&auto=format&fit=crop",
        alt: "Long, soft bronde hair after colour, in a salon",
        width: 1600,
        height: 899,
        creditName: "Yovanka Loria Salon",
        creditUrl: "https://unsplash.com/@yovankaloriasalon",
    },
    N7c: {
        url: "https://images.unsplash.com/photo-1575989762363-c7ce0137427a?w=1600&q=80&auto=format&fit=crop",
        alt: "A brass diya lit on a wooden ledge",
        width: 1600,
        height: 2844,
        creditName: "Manoj kumar kasirajan",
        creditUrl: "https://unsplash.com/@manoj25",
    },
    N7i: {
        url: "https://images.unsplash.com/photo-1603262110263-fb0112e7cc33?w=1600&q=80&auto=format&fit=crop",
        alt: "Hawa Mahal in Jaipur at dusk",
        width: 1600,
        height: 1067,
        creditName: "Dexter Fernandes",
        creditUrl: "https://unsplash.com/@bleachedhuman",
    },
    N8c: {
        url: "https://images.unsplash.com/photo-1747253523463-b3d68611a5a5?w=1600&q=80&auto=format&fit=crop",
        alt: "Rows of hair colour swatches in browns and reds",
        width: 1600,
        height: 1067,
        creditName: "Jason Leung",
        creditUrl: "https://unsplash.com/@ninjason",
    },
    N8i: {
        url: "https://images.unsplash.com/photo-1677746882421-2e3f45ccb9b1?w=1600&q=80&auto=format&fit=crop",
        alt: "Bundles of hair swatches in natural and bright colours",
        width: 1600,
        height: 2133,
        creditName: "Mic Hair Company",
        creditUrl: "https://unsplash.com/@michaircompany",
    },
    N9c: {
        url: "https://images.unsplash.com/photo-1788930045572-5be1e03c1433?w=1600&q=80&auto=format&fit=crop",
        alt: "A young boy in a red cape in a barber's chair",
        width: 1600,
        height: 2402,
        creditName: "🔥John Rodriguez🔥",
        creditUrl: "https://unsplash.com/@firephotos",
    },
    N9i: {
        url: "https://images.unsplash.com/photo-1703792685152-d13e206924d8?w=1600&q=80&auto=format&fit=crop",
        alt: "A barber cutting a young boy's hair with clippers",
        width: 1600,
        height: 2400,
        creditName: "Kawê Rodrigues",
        creditUrl: "https://unsplash.com/@kawerodriguess",
    },
    A1c: {
        url: "https://images.unsplash.com/photo-1669139470813-827cbcf54b20?w=1600&q=80&auto=format&fit=crop",
        alt: "A glass being filled from a kitchen tap",
        width: 1600,
        height: 1219,
        creditName: "Swanky Fella",
        creditUrl: "https://unsplash.com/@swankyfella",
    },
    A1i: {
        url: "https://images.unsplash.com/photo-1599661046289-e31897846e41?w=1600&q=80&auto=format&fit=crop",
        alt: "Amer Fort above a dry, sandy hillside",
        width: 1600,
        height: 2845,
        creditName: "Meriç Dağlı",
        creditUrl: "https://unsplash.com/@meric",
    },
    A2c: {
        url: "https://images.unsplash.com/photo-1665923148259-3340e61d3ff2?w=1600&q=80&auto=format&fit=crop",
        alt: "Long, voluminous curly hair seen from behind",
        width: 1600,
        height: 1067,
        creditName: "Irina Chishkova",
        creditUrl: "https://unsplash.com/@irina_chishkova",
    },
    A2i: {
        url: "https://images.unsplash.com/photo-1753269045298-08cb92bd7374?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman with an umbrella crossing a wet street in the rain",
        width: 1600,
        height: 1248,
        creditName: "Saad Ahmad",
        creditUrl: "https://unsplash.com/@saadahmad_umn",
    },
    A3c: {
        url: "https://images.unsplash.com/photo-1713180760640-c9ff9eb90b2d?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman straightening her long hair with a flat iron",
        width: 1600,
        height: 1067,
        creditName: "TYMO Beauty",
        creditUrl: "https://unsplash.com/@tymobeauty",
    },
    A3i: {
        url: "https://images.unsplash.com/photo-1629397683830-9805395892e8?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist blow-drying a client's hair straight with a paddle brush",
        width: 1600,
        height: 1067,
        creditName: "Giorgio Trovato",
        creditUrl: "https://unsplash.com/@giorgiotrovato",
    },
    A4c: {
        url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman with long, brown-to-caramel coloured hair",
        width: 1600,
        height: 2400,
        creditName: "Rafaella Mendes Diniz",
        creditUrl: "https://unsplash.com/@rafaelladiniz",
    },
    A4i: {
        url: "https://images.unsplash.com/photo-1605980625600-88b46abafa8d?w=1600&q=80&auto=format&fit=crop",
        alt: "Long ash-brown waves seen from behind",
        width: 1600,
        height: 2000,
        creditName: "Lera Kogan",
        creditUrl: "https://unsplash.com/@newyork_creator",
    },
    A5c: {
        url: "https://images.unsplash.com/photo-1573461160327-b450ce3d8e7f?w=1600&q=80&auto=format&fit=crop",
        alt: "A dropper placing a drop of oil on the back of a hand",
        width: 1600,
        height: 2000,
        creditName: "Enecta Cannabis extracts",
        creditUrl: "https://unsplash.com/@enecta",
    },
    A5i: {
        url: "https://images.unsplash.com/photo-1787616291784-0de8970e3ad4?w=1600&q=80&auto=format&fit=crop",
        alt: "A stylist applying colour to a client's hair",
        width: 1600,
        height: 2402,
        creditName: "🔥John Rodriguez🔥",
        creditUrl: "https://unsplash.com/@firephotos",
    },
    A6c: {
        url: "https://images.unsplash.com/photo-1775642548371-861fab6cea75?w=1600&q=80&auto=format&fit=crop",
        alt: "A woman with a towel on her hair doing her skincare at the mirror",
        width: 1600,
        height: 1067,
        creditName: "Christian Agbede",
        creditUrl: "https://unsplash.com/@chriscreations__",
    },
    A6i: {
        url: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=1600&q=80&auto=format&fit=crop",
        alt: "A therapist applying a white hydrating mask during a facial",
        width: 1600,
        height: 1067,
        creditName: "engin akyurt",
        creditUrl: "https://unsplash.com/@enginakyurt",
    },
    A7c: {
        url: "https://images.unsplash.com/photo-1618049049816-43a00d5b0c3d?w=1600&q=80&auto=format&fit=crop",
        alt: "A man with a full, well-groomed beard",
        width: 1600,
        height: 2442,
        creditName: "Damian Barczak",
        creditUrl: "https://unsplash.com/@barczakshoots",
    },
    A7i: {
        url: "https://images.unsplash.com/photo-1627876280688-24a58ba02f2c?w=1600&q=80&auto=format&fit=crop",
        alt: "Two small bottles of beard oil beside cut oranges",
        width: 1600,
        height: 1067,
        creditName: "CastleBeard Co",
        creditUrl: "https://unsplash.com/@castlebeard",
    },
    A8c: {
        url: "https://images.unsplash.com/photo-1605980766335-d3a41c7332a1?w=1600&q=80&auto=format&fit=crop",
        alt: "Long ash-blonde balayage seen from behind",
        width: 1600,
        height: 2400,
        creditName: "Lera Kogan",
        creditUrl: "https://unsplash.com/@newyork_creator",
    },
    A8i: {
        url: "https://images.unsplash.com/photo-1707914704014-0f0b2f65ce5b?w=1600&q=80&auto=format&fit=crop",
        alt: "Hair colour swatches in pinks and violets on a shade card",
        width: 1600,
        height: 2400,
        creditName: "Victor Volkov",
        creditUrl: "https://unsplash.com/@lensyfoxography",
    },
    A9c: {
        url: "https://images.unsplash.com/photo-1740674570259-a47d713a2976?w=1600&q=80&auto=format&fit=crop",
        alt: "A bride in a maroon lehenga and bridal jewellery",
        width: 1600,
        height: 2215,
        creditName: "Aman Malik",
        creditUrl: "https://unsplash.com/@dingledesign",
    },
    A9i: {
        url: "https://images.unsplash.com/photo-1518468607622-5844bca31a05?w=1600&q=80&auto=format&fit=crop",
        alt: "A wedding planner notebook with rings, flowers and bridal shoes",
        width: 1600,
        height: 1600,
        creditName: "Jorge Rosal",
        creditUrl: "https://unsplash.com/@yortrosal",
    },
} satisfies Record<string, DsImage>;

export const NOOR_POSTS: DsPost[] = [
    // ── Help ─────────────────────────────────────────────────────────
    {
        slug: "booking-moving-and-cancelling",
        title: "Booking, moving and cancelling an appointment",
        category: "help",
        daysAgo: 171,
        excerpt:
            "Book online any time, up to 90 days ahead. Moving or cancelling is free until 24 hours before.",
        image: ph.H1c,
        body: `<p>The quickest way to get a time with us is the <a href="/book">booking page</a>. Pick the service, then either a stylist you know or "whoever is free", and you'll see every open slot for the next 90 days. Bridal clients often book that far ahead; for a cut or a blow-dry, the same week is usually fine.</p>
<h2>Booking by phone or WhatsApp</h2>
<p>If you'd rather talk to a person, message or call the desk on +91 00000 00001. Kavya keeps the diary and replies through the day. Club members book this way, because their visits come out of the month's allowance rather than a payment.</p>
${fig(ph.H1i, "Tell us which stylist you saw last time and we'll try to keep you with them.")}
<h2>Moving or cancelling</h2>
<p>You can move or cancel for free up to 24 hours before your appointment, using the link in your confirmation email or by messaging us. Inside 24 hours, please still let us know: there is nearly always someone on the waiting list hoping for that chair.</p>
<p>For services that take a 50% advance — colour, keratin, smoothening and bridal — the advance is kept if you cancel inside 24 hours. We explain why in <a href="/journal">our note on the advance</a>.</p>
<h2>Running late</h2>
<p>We hold your chair for ten minutes. After that we'll offer you the next free slot that day, which on a Saturday may be a while.</p>`,
    },
    {
        slug: "the-50-percent-advance",
        title: "The 50% advance: what it covers, and when it's kept",
        category: "help",
        daysAgo: 152,
        excerpt:
            "Colour, keratin, smoothening and bridal bookings take half online. It comes off your bill on the day.",
        image: ph.H2c,
        body: `<p>Some of our services take a long block of a stylist's day. A keratin treatment is three hours with Kavya or Tanvi; a wedding morning is four hours of Noor's. When one of those slots goes empty at the last minute, nobody else can step into it.</p>
<p>So when you book these online, you pay half the price as an advance:</p>
<ul>
<li>Global colour — ₹2,250 of ₹4,500</li>
<li>Highlights / balayage — ₹3,750 of ₹7,500</li>
<li>Keratin — ₹4,250 of ₹8,500</li>
<li>Smoothening — ₹4,750 of ₹9,500</li>
<li>Engagement or reception makeup — ₹7,000 of ₹14,000</li>
<li>Bridal makeup package — ₹14,000 of ₹28,000</li>
<li>Bridal mehendi — ₹5,500 of ₹11,000</li>
</ul>
${fig(ph.H2i, "The advance is paid by UPI or card on the booking page.")}
<h2>It isn't an extra charge</h2>
<p>The advance is part of the price. On the day, your bill shows the full amount, the advance already paid, and the balance, which you pay at the desk by UPI, card or cash.</p>
<h2>When it's kept</h2>
<p>Move or cancel up to 24 hours before and nothing is lost: we move the advance to your new date. Cancel inside 24 hours, or don't come, and we keep it. For bridal dates that families need to shift, talk to Noor — we've always found a way when there's notice.</p>`,
    },
    {
        slug: "patch-tests-before-colour",
        title: "Patch tests before colour: why we ask, and how it works",
        category: "help",
        daysAgo: 139,
        excerpt:
            "A five-minute visit to the desk at least 48 hours before any colour. It's free, and it matters.",
        image: ph.H3c,
        body: `<p>Every colour service at Gulmohar — root touch-up, global colour, highlights — needs a patch test at least 48 hours before. This includes clients who have coloured their hair for years. Allergies to hair dye can develop after many uneventful colours.</p>
<h2>What happens</h2>
<ol>
<li>Drop in at the desk any time we're open. It takes about five minutes and costs nothing.</li>
<li>We dab a little of the colour we plan to use behind your ear or on the inside of your elbow.</li>
<li>Leave it alone for 48 hours. No washing it off, no scrubbing.</li>
<li>If you notice itching, redness, swelling or a rash, tell us before your appointment and don't wait for it to pass.</li>
</ol>
${fig(ph.H3i, "We test with the shade we plan to use, not a generic one.")}
<h2>If the test reacts</h2>
<p>We won't use permanent dye on you, and we'll note it on your file so nobody forgets. Tanvi can talk you through what's still possible. If a reaction is more than mild, please see a doctor.</p>
<p>If you've reacted to dye or black henna before, tell us when you book. We stock PPD-free shades, and we'll still patch-test them.</p>`,
    },
    {
        slug: "what-to-bring-to-your-bridal-trial",
        title: "What to bring to your bridal trial",
        category: "help",
        daysAgo: 124,
        excerpt:
            "Outfit photos, your jewellery and two or three looks you love. And come with a clean, bare face.",
        image: ph.H4c,
        body: `<p>The trial is two hours with Noor and Riya, three to six weeks before your wedding. It's where we settle your base, eyes, lips and hairstyle so that the morning itself is calm. It costs ₹4,800 and is booked separately from the wedding-day package.</p>
<h2>Please bring</h2>
<ul>
<li><strong>Photos of your outfits</strong> for each function, in daylight if you can. Colours look different under shop lights.</li>
<li><strong>Your jewellery</strong>, or at least the maang tikka, nath and earrings. They change how the hair needs to sit.</li>
<li><strong>Two or three looks you like</strong> and one you don't. The one you don't like is often the most useful.</li>
<li>Your <strong>dupatta</strong>, if it's ready, so we can practise the setting.</li>
</ul>
${fig(ph.H4i, "Embroidery and zari decide a lot about the makeup: we match the warmth of the gold.")}
<h2>On the day of the trial</h2>
<p>Come with a clean face and clean, dry hair, washed the day before. Wear a shirt that buttons at the front so you can change without disturbing the hair.</p>
<p>Bring your mother, sister or a friend whose eye you trust, but perhaps not the whole family. Too many opinions in a two-hour trial can leave you less sure than when you came in.</p>`,
    },
    {
        slug: "how-our-packs-work",
        title: "How our packs work: 5 blow-dries and 6 facials",
        category: "help",
        daysAgo: 108,
        excerpt:
            "Pay once at the desk, then book each visit as usual. Here's how long each pack lasts and what happens if you miss one.",
        image: ph.H5c,
        body: `<p>We have two packs, both bought at the desk:</p>
<ul>
<li><strong>5 Blow-dries</strong> for ₹3,400, to use within 90 days. Five single blow-dries would be ₹4,000.</li>
<li><strong>6 Hydrating facials</strong> for ₹12,500, to use within 180 days. Six single facials would be ₹15,000.</li>
</ul>
<h2>Booking a visit from your pack</h2>
<p>Message the desk and say you'd like to use your pack. We book the time and take one visit off. We'll tell you how many you have left each time.</p>
${fig(ph.H5i, "A facial a month through winter is what most of our facial-pack clients do.")}
<h2>Cancelling a pack visit</h2>
<p>Cancel 24 hours or more before and the visit goes back into your pack. Inside 24 hours, or if you don't come, the visit is used.</p>
<h2>When a pack runs out of time</h2>
<p>Any visits left when the 90 or 180 days are up expire. We send a reminder two weeks before, and if something has kept you away — illness, a family wedding — talk to us.</p>
<p>A pack is yours: it can't be shared with a friend, but you can use it with any stylist who does the service. Packs are paid for at the desk by UPI, card or cash.</p>`,
    },
    {
        slug: "blow-dry-club-and-mens-grooming-club",
        title: "The Blow-dry Club and the Men's Grooming Club",
        category: "help",
        daysAgo: 92,
        excerpt:
            "Monthly memberships for regulars. You book through the desk, and you can stop any time before the next month.",
        image: ph.H6c,
        body: `<p>Some clients come every week. For them we have two monthly clubs:</p>
<ul>
<li><strong>Blow-dry Club</strong> — ₹2,600 a month for four blow-dries.</li>
<li><strong>Men's Grooming Club</strong> — ₹1,100 a month for three haircuts or beard trims with Imran.</li>
</ul>
<h2>How to book a club visit</h2>
<p>Club visits are booked through the desk, by phone or WhatsApp on +91 00000 00001, not on the booking page. Tell us you're a member and when you'd like to come; we book it against your month.</p>
${fig(ph.H6i, "Most Blow-dry Club members come before work or on Saturday mornings.")}
<h2>The small print, plainly</h2>
<ul>
<li>Visits don't roll over. Four blow-dries are for this month.</li>
<li>Cancel a club visit 24 hours ahead and it doesn't count. Later than that, it does.</li>
<li>The membership renews monthly on the date you joined. Stop any time before the next renewal by telling the desk.</li>
</ul>
<h2>Is a club worth it for you?</h2><p>If you come for a blow-dry most weeks, the Blow-dry Club costs ₹600 less a month than four single visits. If you come twice a month, a pack of five is better value. Men who have a cut every three weeks and a beard tidy in between usually find the Grooming Club pays for itself. Ask at the desk and we'll tell you honestly which suits how often you actually come.</p>`,
    },
    {
        slug: "getting-ready-for-keratin",
        title: "Getting ready for a keratin appointment",
        category: "help",
        daysAgo: 79,
        excerpt:
            "Wash two days before, skip the oil, and plan your first three days after. Here's the routine.",
        image: ph.H7c,
        body: `<p>A keratin treatment takes about three hours, and most of what makes it last happens before and after the chair.</p>
<h2>Before</h2>
<ul>
<li>Wash your hair as normal two days before. Don't apply oil the night before — it stops the treatment taking evenly.</li>
<li>If you're planning colour too, colour first, at least a week before.</li>
<li>Tell us if you're pregnant or breastfeeding. We'll talk through whether to wait.</li>
</ul>
${fig(ph.H7i, "Kavya and Tanvi both do keratin; the advance holds a three-hour slot.")}
<h2>After</h2>
<ul>
<li>For the first 72 hours, no tying, clipping or tucking behind your ears, and keep it dry.</li>
<li>From the first wash, use a sulphate-free shampoo. We sell the one we use; any sulphate-free one will do.</li>
<li>Expect three to four months, longer if you wash less often.</li>
</ul>
<p>If you're unsure whether keratin or smoothening suits your hair, read <a href="/journal">our comparison</a> or ask for a five-minute consult at the desk.</p>
<h2>On the day</h2><p>Bring something to read or work on — much of the three hours is sitting while the treatment sets or the hair is ironed in sections. If you have a function in the next three days, tell us; we may suggest moving the appointment so you can wear your hair up.</p>`,
    },
    {
        slug: "parking-and-getting-to-c-scheme",
        title: "Parking, and getting to us in C-Scheme",
        category: "help",
        daysAgo: 66,
        excerpt:
            "We're on Prithviraj Road near Statue Circle. Street parking is limited; the Central Park gate lot is a five-minute walk.",
        image: ph.H8c,
        body: `<p>You'll find us at Plot 14, Prithviraj Road, C-Scheme, a few minutes from Statue Circle.</p>
<h2>By car</h2>
<p>There's some street parking on Prithviraj Road, but on weekend afternoons it fills up quickly. The paid lot at the Central Park gate is a five-minute walk and has space almost always.</p>
<h2>By auto or cab</h2>
<p>Ask for Prithviraj Road, C-Scheme, and say "near Statue Circle". Drivers who come from the station side sometimes go around Central Park first; it's quicker to come down Bhagwan Das Road.</p>
${fig(ph.H8i, "Coming from the old city? Allow extra time in the evenings.")}
<h2>Step-free entry</h2>
<p>The front door has one step. There's a ramp at the side gate — let the desk know you're coming and we'll keep the front station by the door free for you.</p>
<h2>From the station or the airport</h2><p>From Jaipur Junction it's about fifteen minutes by auto, longer at the evening rush. From the airport, allow thirty to forty minutes. If you're coming for bridal makeup on a wedding morning, we'll send a pinned location on WhatsApp the day before, so your driver doesn't have to ask the way at 5 am.</p>`,
    },
    {
        slug: "mehendi-how-to-prepare",
        title: "Mehendi: how to prepare, and how to make the colour last",
        category: "help",
        daysAgo: 44,
        excerpt:
            "No lotion before, no water after, and patience. Shabnam's advice for a deep, even colour.",
        image: ph.H9c,
        body: `<p>Shabnam has been drawing mehendi for brides in Jaipur for over a decade. Her advice comes down to a few things.</p>
<h2>Before your appointment</h2>
<ul>
<li>Wax or scrub two days before, not the same day — fresh waxing leaves skin sensitive and the paste can sting.</li>
<li>Arrive with clean, dry hands and feet. No lotion, oil or sunscreen.</li>
<li>Eat first. Bridal mehendi is four hours and you won't be able to use your hands.</li>
</ul>
${fig(ph.H9i, "Colour deepens for two days after the paste comes off.")}
<h2>After</h2>
<ul>
<li>Leave the paste on for at least six hours; overnight is better.</li>
<li>Scrape it off, don't wash it off. Avoid water for as long as you can.</li>
<li>A little warmth helps. Stay away from soap and chlorine for a day.</li>
</ul>
<h2>A word on "black henna"</h2>
<p>We only use natural henna paste, which stains orange to deep maroon. "Black" henna often contains PPD, which can cause serious reactions. If anyone offers you mehendi that turns black within an hour, please say no.</p>`,
    },

    // ── News ─────────────────────────────────────────────────────────
    {
        slug: "teej-mehendi-weekend",
        title: "Teej mehendi: Shabnam's extra weekend hours",
        category: "news",
        daysAgo: 70,
        excerpt:
            "Shabnam is in from noon to 8 pm on the weekend before Teej, with party mehendi in hour-long slots.",
        image: ph.N1c,
        body: `<p>Teej is one of the busiest weeks of the year for mehendi in Jaipur, and every year we turn people away. This year Shabnam is adding hours on the weekend before Teej: noon to 8 pm on both Saturday and Sunday.</p>
<p>Party mehendi on both hands is ₹1,600 and takes about an hour. Book on the <a href="/book">booking page</a> under Party mehendi; slots usually go by Wednesday.</p>
${fig(ph.N1i, "Arabic and Rajasthani patterns, front and back to the wrist.")}
<p>Coming as a group? Message the desk and we'll try to book you back to back.</p>
<p>Please come with clean, dry hands — no lotion — and plan to keep the paste on for at least six hours afterwards for the deepest colour.</p>`,
    },
    {
        slug: "new-hair-spa-for-the-monsoon",
        title: "A new hair spa for the monsoon",
        category: "news",
        daysAgo: 100,
        excerpt:
            "We've changed the mask we use in the hair spa: richer for frizz, still light enough not to weigh fine hair down.",
        image: ph.N2c,
        body: `<p>With the humidity back, we've changed the mask in our hair spa. The new one is a little richer, for the frizz the monsoon brings, but rinses clean so fine hair doesn't go flat by evening.</p>
<p>The hair spa is still ₹1,800 for an hour: a wash, the mask under steam, a head and shoulder massage, and a simple dry. If your hair is coloured or keratin-treated, tell us when you book and we'll use the sulphate-free wash.</p>
${fig(ph.N2i, "The massage is the part most people book it for.")}
<p>Book with Kavya or Imran on the <a href="/book">booking page</a>.</p>
<p>It's also a good reset after a summer of sun and hard water, before the dry months come back.</p>`,
    },
    {
        slug: "meet-tanvi-our-new-colourist",
        title: "Meet Tanvi Mathur, our new colourist",
        category: "news",
        daysAgo: 42,
        excerpt:
            "Tanvi joins us from a Mumbai salon, bringing balayage, colour correction and a careful hand with PPD-free shades.",
        image: ph.N3c,
        body: `<p>We're very happy to welcome Tanvi Mathur to the team. Tanvi spent six years colouring at a busy Mumbai salon and has come home to Jaipur. She's in every day except Wednesday.</p>
<p>Ask her about soft, lived-in balayage that grows out gracefully, about fixing a box-dye that went orange, or about colour if you've reacted to dye before. She's thorough about patch tests and will tell you honestly if what you want will take two sittings.</p>
${fig(ph.N3i, "Warm, soft balayage is Tanvi's favourite thing to do.")}
<p>Book Tanvi for highlights, global colour, root touch-ups or keratin on the <a href="/book">booking page</a>. Her first month has filled quickly, so look a week or two ahead.</p>`,
    },
    {
        slug: "wedding-season-dates-open",
        title: "Wedding season: bridal dates open to February",
        category: "news",
        daysAgo: 30,
        excerpt:
            "Noor's bridal dates from mid-November to February are open. Popular muhurat days are already filling.",
        image: ph.N4c,
        body: `<p>The wedding season diary is open. Noor is taking bridal makeup bookings from mid-November through February, and Shabnam is taking bridal mehendi for the same dates.</p>
<p>A few dates in late November and December already have one bride booked. Noor takes one bride per morning, so if your date is a popular muhurat, please <a href="/bridal">enquire</a> soon.</p>
${fig(ph.N4i, "One bride a morning, so each one has Noor's full attention.")}
<p>Remember to book your trial three to six weeks before the day. Most brides do it on a weekday afternoon, when the salon is calmer.</p>
<p>Family makeup for the same morning is booked with Riya, and we plan the order so the bride is never waiting on anyone else.</p>`,
    },
    {
        slug: "karwa-chauth-slots",
        title: "Karwa Chauth: mehendi and makeup slots",
        category: "news",
        daysAgo: 12,
        excerpt:
            "Karwa Chauth falls on Thursday 29 October. Mehendi the evening before and makeup on the day are opening now.",
        image: ph.N5c,
        body: `<p>Karwa Chauth falls on Thursday 29 October this year, and we've opened extra slots:</p>
<ul>
<li><strong>Wednesday 28 October:</strong> party mehendi with Shabnam from 3 pm to 8 pm.</li>
<li><strong>Thursday 29 October:</strong> party makeup and occasion hairstyling with Riya and Noor from 11 am.</li>
</ul>
${fig(ph.N5i, "Mehendi the evening before has the deepest colour by moonrise.")}
<p>Book on the <a href="/book">booking page</a>. If you need makeup for two or three people together, message the desk and we'll plan the order so everyone is ready on time.</p>
<p>The day itself is a fast for many of our clients, so we keep makeup appointments calm and unhurried, and there's always water and a quiet chair for anyone who needs a moment.</p>`,
    },
    {
        slug: "diwali-colour-offer",
        title: "Diwali offer: a hair spa with any global colour",
        category: "news",
        daysAgo: 8,
        excerpt:
            "Book a global colour between 20 October and 7 November and we'll add a hair spa on the same visit.",
        image: ph.N6c,
        body: `<p>From <strong>Tuesday 20 October to Saturday 7 November</strong>, every global colour comes with a hair spa on the same visit, at no extra charge. That's the deep-conditioning mask, steam and head massage — a ₹1,800 service — after your colour.</p>
<p>The colour is still ₹4,500, with the 50% advance when you book online, and still needs a patch test 48 hours before. The spa adds about forty minutes, so we'll book a longer slot for you.</p>
${fig(ph.N6i, "Colour, then the spa: hair goes home soft as well as bright.")}
<p>One spa per colour booking. Not for root touch-ups or highlights.</p>
<p>Book online under Global colour and we'll add the spa ourselves; there's no code to enter.</p>`,
    },
    {
        slug: "closed-for-diwali",
        title: "Closed for Diwali, 8 and 9 November",
        category: "news",
        daysAgo: 4,
        excerpt:
            "We're closed on Diwali and the day after. Saturday 7 November is open as usual and already busy.",
        image: ph.N7c,
        body: `<p>The salon is closed on <strong>Sunday 8 November</strong> for Diwali and on <strong>Monday 9 November</strong>. We're open as usual on Saturday 7 November, 10:30 am to 8:30 pm, and back on Tuesday 10 November.</p>
<p>Saturday the 7th is nearly full for blow-dries and makeup. If you need something done before the festival, book now or ask to join the waiting list.</p>
${fig(ph.N7i, "Wishing you and your family a happy Diwali.")}
<p>Happy Diwali from all of us at Gulmohar.</p>
<p>Online booking stays open while we're closed, so you can still book or move appointments for after the festival. Messages sent on the 8th and 9th will be answered on Tuesday morning.</p>`,
    },
    {
        slug: "ppd-free-shades-in-stock",
        title: "PPD-free colour shades now in stock",
        category: "news",
        daysAgo: 25,
        excerpt:
            "For clients who've reacted to regular dye, we now keep a range of PPD-free shades — and still patch-test every one.",
        image: ph.N8c,
        body: `<p>Many permanent hair colours contain PPD (paraphenylenediamine), the ingredient behind most dye allergies. For clients who have reacted before, we've added a set of PPD-free shades in browns and soft blacks.</p>
<p>They're not a free pass: some people react to the alternative ingredients too. We patch-test every shade at least 48 hours before, and if anything reacts, we stop.</p>
${fig(ph.N8i, "PPD-free shades cover browns and soft blacks; very light blondes need a different conversation.")}
<p>Ask Tanvi or Kavya at the desk, or mention it when you book a root touch-up.</p>
<p>If you've reacted in the past but don't know what caused it, bring the name of the product if you still have it. It helps us, and your doctor, work out what to avoid.</p>`,
    },
    {
        slug: "kids-cuts-sunday-mornings",
        title: "Kids' cuts on Sunday mornings with Imran",
        category: "news",
        daysAgo: 55,
        excerpt:
            "Sunday mornings are now set aside for children's haircuts. Calm, patient, scissors-only if needed.",
        image: ph.N9c,
        body: `<p>Children's haircuts go better when the salon is quiet. So from this month, Imran keeps Sunday mornings for kids' cuts, from 11:30 am.</p>
<p>A kids' cut (under 10) is ₹350 and takes about half an hour. If your child is nervous of clippers, say so when you book and Imran will use scissors only. Bring a favourite toy or show — whatever keeps them in the chair.</p>
${fig(ph.N9i, "Imran works quickly and doesn't mind a wriggle.")}
<p>Book under Kids' haircut on the <a href="/book">booking page</a>.</p>
<p>Parents are welcome to sit right beside the chair. For a first haircut, we'll keep a small lock of hair in an envelope for you to take home.</p>`,
    },

    // ── Articles ─────────────────────────────────────────────────────
    {
        slug: "hair-care-in-jaipurs-hard-water-and-dry-heat",
        title: "Hard water and dry heat: looking after your hair in Jaipur",
        category: "articles",
        daysAgo: 162,
        excerpt:
            "Why hair feels like straw by May, and the few habits that make a real difference.",
        image: ph.A1c,
        body: `<p>Ask any stylist in Jaipur what clients complain about most, and you'll hear the same two things: hair that feels rough and dull, and colour that fades faster than promised. Much of that comes down to two things we can't change — hard water and dry heat — and a few habits we can.</p>
<h2>What hard water does</h2>
<p>Much of Jaipur's water is hard, with dissolved calcium and magnesium. When you rinse, some of those minerals stay behind on the hair. Over weeks they build a thin film that makes hair feel stiff, stops conditioner working well and dulls shine. On coloured hair, the film can make shades look flat or brassy sooner.</p>
<p>You don't need a filter on every tap. A few changes help most people:</p>
<ul>
<li><strong>Rinse with cooler water at the end.</strong> It doesn't seal anything, but hot water strips more oil, and dry hair picks up more mineral roughness.</li>
<li><strong>Use a clarifying wash every two or three weeks.</strong> One wash, not daily — clarifying every day dries hair out.</li>
<li><strong>Condition the lengths, not the scalp.</strong> Hard water makes it tempting to use more product. Use it where the hair is oldest and driest.</li>
</ul>
${fig(ph.A1i, "Dry air from March to June draws water out of hair as much as the sun does.")}
<h2>What dry heat does</h2>
<p>From March to June, the air is so dry that hair loses water all day, and the sun breaks down its outer layer. By the end of summer the ends are fragile, and they split.</p>
<ul>
<li><strong>Cover up in the afternoon sun.</strong> A dupatta or a cap does more than any product.</li>
<li><strong>Use a leave-in cream on the ends.</strong> A pea-sized amount on damp hair, and less if your hair is fine.</li>
<li><strong>Oil, but lightly.</strong> Oiling is an old habit for good reason, but a whole scalp drenched overnight means harsh washing the next morning. Two or three drops on the ends after washing works better for most hair.</li>
<li><strong>Turn the heat down.</strong> If you straighten or curl, use a heat protectant and the lowest temperature that works.</li>
</ul>
<h2>When it's more than dryness</h2>
<p>If your scalp itches, flakes heavily or is sore, or if hair is coming out in patches, that isn't a hard-water problem. See a dermatologist.</p>
<h2>What we do in the salon</h2>
<p>A hair spa every four to six weeks through summer helps. So does a trim every two to three months, because no product repairs a split end — it can only be cut. If you'd like a routine made for your hair, ask at your next visit. It takes five minutes at the mirror.</p>`,
    },
    {
        slug: "monsoon-frizz-what-actually-helps",
        title: "Monsoon frizz: what actually helps",
        category: "articles",
        daysAgo: 84,
        excerpt:
            "Frizz is hair drinking in moisture from the air. You can't stop the weather, but you can make it matter less.",
        image: ph.A2c,
        body: `<p>Jaipur's monsoon is short but humid, and for many clients it's the worst hair month of the year. The same hair that felt like straw in May now puffs up the moment you step outside. The two problems are related.</p>
<h2>Why hair frizzes</h2>
<p>Hair is made of long protein fibres covered by overlapping scales, like roof tiles. When hair is dry or damaged, those scales lift a little, and when the air is humid, the fibre soaks up moisture unevenly. Different parts of each strand swell by different amounts, the hair bends, and the strands stop lying together. That's frizz.</p>
<p>So frizz is usually a sign of hair that's thirsty, not hair that's too wet.</p>
${fig(ph.A2i, "On wet days, it's the walk from the auto that does it.")}
<h2>What helps</h2>
<ul>
<li><strong>Condition every wash.</strong> Even if your hair is fine or oily at the roots, condition from the ears down.</li>
<li><strong>Don't rough-dry with a towel.</strong> Squeeze, don't rub. A cotton T-shirt is gentler than a towel.</li>
<li><strong>Put on a leave-in while hair is damp.</strong> Smooth it through with your palms, then leave it.</li>
<li><strong>Finish with a little serum.</strong> One or two drops, rubbed between the palms, on the outer layer of dry hair.</li>
<li><strong>Touch it less.</strong> Every time you run your fingers through hair on a humid day, you lift the scales again.</li>
</ul>
<h2>What doesn't help much</h2>
<ul>
<li>Heavy oil left in all day. It weighs hair down and collects dust.</li>
<li>Brushing curly hair dry. Brush curls when they're wet and conditioned, or not at all.</li>
<li>Washing every day. Shampoo strips the oils that help keep frizz in check.</li>
</ul>
<h2>Salon options</h2>
<p>If frizz takes over your mornings, a keratin treatment smooths it for three to four months and cuts drying time. It isn't for everyone: it relaxes curl a little and needs sulphate-free care. A hair spa is the gentler option, every four to six weeks through the wet months. Ask Kavya which suits your hair.</p>
<h2>A simple wet-day routine</h2><ol><li>Wash with a mild shampoo and condition the lengths.</li><li>Squeeze out the water with a cotton T-shirt.</li><li>Smooth a pea-sized amount of leave-in cream through damp hair.</li><li>Let it dry most of the way before you blow-dry or tie it up.</li><li>Finish with a drop of serum on the outer layer.</li></ol><p>If you tie your hair up for the commute, use a soft scrunchie rather than a tight elastic. The dent from a tight band is where frizz starts on a humid afternoon.</p>
<p>And on the worst days, a sleek low bun or a braid is not giving up. It's often the kindest thing for your hair.</p>`,
    },
    {
        slug: "keratin-or-smoothening",
        title: "Keratin or smoothening? How to choose",
        category: "articles",
        daysAgo: 131,
        excerpt:
            "They sound alike and both take hours, but they do different things. Here's how we help clients decide.",
        image: ph.A3c,
        body: `<p>Two of the questions we hear most at the desk: "Should I get keratin or smoothening?" and "What's the difference?" Here's the honest answer.</p>
<h2>Keratin: frizz control that wears off</h2>
<p>A keratin treatment coats the hair with a smoothing treatment that is sealed with heat. It reduces frizz, makes hair quicker to blow-dry and adds shine. Your hair keeps its basic shape: wavy hair stays wavy, just calmer.</p>
<ul>
<li>About three hours in the chair, ₹8,500.</li>
<li>Lasts three to four months and fades gradually.</li>
<li>Needs a sulphate-free shampoo to last.</li>
</ul>
${fig(ph.A3i, "After either treatment, the first few blow-dries are noticeably quicker.")}
<h2>Smoothening: a lasting change</h2>
<p>Smoothening changes the hair's internal structure so it sits straighter. The treated hair stays straight until it's cut off; new growth comes in your natural texture.</p>
<ul>
<li>About three and a half hours, ₹9,500.</li>
<li>Permanent on the treated hair; roots need touching up every four to six months.</li>
<li>Harder on hair: not ideal over heavy bleaching or if your hair is already fragile.</li>
</ul>
<h2>How we help you decide</h2>
<ul>
<li><strong>Do you like your waves, but not the frizz?</strong> Keratin.</li>
<li><strong>Do you want straight hair every day without heat?</strong> Smoothening.</li>
<li><strong>Is your hair highly bleached or breaking?</strong> Neither, for now. Let's start with treatments and a trim.</li>
<li><strong>Are you pregnant or breastfeeding?</strong> Talk to us first; many clients prefer to wait.</li>
</ul>
<p>Both treatments take a 50% advance when booked online. If you're still unsure, ask for a five-minute consult at the desk. We'd rather talk you out of a treatment than have you unhappy with it for four months.</p>
<h2>What it means over a year</h2><p>Keratin lasting three to four months means three or four treatments a year if you want smooth hair year-round, though many clients only do it before the monsoon and before the wedding season. Smoothening lasts longer on the treated hair, but the regrowth needs a root treatment every four to six months, and the line where treated hair meets new growth needs careful handling.</p><h2>Can I colour as well?</h2><p>Yes, but plan the order. Colour first, at least a week before keratin, because keratin can soften a fresh colour. With smoothening, we prefer at least two weeks between colour and the treatment, and we may advise against lightening over smoothened hair. Tell us your plans for the next few months and we'll put the appointments in the right order.</p>
<p>Either way, the first week matters most. Follow the aftercare sheet we give you, and message us if anything feels wrong — a patchy finish or a smell that doesn't go after the first wash is worth a look, and we'd rather see you early.</p>`,
    },
    {
        slug: "caring-for-coloured-hair",
        title: "Looking after coloured hair between visits",
        category: "articles",
        daysAgo: 116,
        excerpt:
            "Most fading happens at home. Here's how to keep colour brighter for longer.",
        image: ph.A4c,
        body: `<p>Colour leaves the salon at its best. What happens over the next six weeks decides whether you love it or start wondering about the next appointment. Most of it is in your hands.</p>
<h2>The first 72 hours</h2>
<p>Colour is still settling for the first few days. If you can, wait three days before washing. When you do, use lukewarm water rather than hot.</p>
<h2>Washing</h2>
<ul>
<li><strong>Use a sulphate-free shampoo.</strong> Strong cleansers lift colour faster.</li>
<li><strong>Wash less often.</strong> Two or three times a week is plenty for most hair.</li>
<li><strong>Finish with a cool rinse</strong> — not because it seals anything, but because hot water speeds fading.</li>
</ul>
${fig(ph.A4i, "Warm browns and reds fade fastest; ash tones turn brassy instead.")}
<h2>Sun and heat</h2>
<p>Jaipur's sun is hard on colour, especially reds and coppers. Cover your hair in the afternoon, and use a heat protectant before straightening or curling.</p>
<h2>Brassiness</h2>
<p>Lightened hair often turns yellow or orange as it fades. A purple toning shampoo once a week counteracts yellow in blonde and light brown hair. Too often, and it can leave a lilac tint on very light hair.</p>
<h2>Swimming</h2>
<p>Chlorine strips and discolours. Wet your hair with clean water and put on a little conditioner before you swim, and wash it soon after.</p>
<h2>Roots</h2>
<p>Most clients come back for a root touch-up every four to six weeks. If you'd like to stretch that, ask Tanvi about a softer root or balayage that grows out without a hard line.</p>
<p>And if you've had any reaction to colour — itching, a rash, swelling — tell us before your next visit, even if it was mild.</p>
<h2>Products that help</h2><p>You don't need a shelf of products. A sulphate-free shampoo, a conditioner for coloured hair, a leave-in or serum for the ends, and a heat protectant if you style with heat — that's the whole kit. A deep-conditioning mask once a week is worth adding if your hair has been lightened.</p><h2>Henna over colour</h2><p>Please don't use henna on hair that has, or will soon have, salon colour. Henna coats the hair and can react unpredictably with permanent dye and lightener. If you've used henna in the last year, tell us before any colour service; it changes what we can safely do.</p>
<h2>Sleeping and tying</h2><p>A cotton pillowcase rubs; a smoother one is gentler on lightened ends. Tie long hair in a loose plait at night rather than a tight bun, and avoid tying it up while it's wet. These sound small, but on fragile, coloured lengths they add up to less breakage by your next appointment.</p>`,
    },
    {
        slug: "ppd-and-hair-dye-allergy",
        title: "PPD and hair dye allergy, explained",
        category: "articles",
        daysAgo: 98,
        excerpt:
            "What PPD is, why some people react to it, and what we do in the salon to keep you safe.",
        image: ph.A5c,
        body: `<p>Every so often a client tells us that after a colour, their scalp itched for days, or their eyelids swelled. Often the cause is an ingredient called PPD. Here's what we'd like every client to know.</p>
<h2>What PPD is</h2>
<p>PPD (paraphenylenediamine) is an ingredient in many permanent hair colours, especially darker shades. It's very good at giving lasting colour, which is why it's so widely used. It's also one of the most common causes of allergic reactions to hair dye.</p>
<h2>How an allergy develops</h2>
<p>An allergy to PPD can develop over time. Someone who has coloured their hair for years with no problem can react the next time. That's why we patch-test before every colour service, even for long-standing clients.</p>
<p>"Black henna" for temporary tattoos often contains high levels of PPD and is a common way people first become sensitised. Natural henna — the orange-to-maroon kind we use for mehendi — doesn't contain PPD.</p>
${fig(ph.A5i, "Everything goes on your file, so every stylist knows before they mix colour.")}
<h2>What a reaction can look like</h2>
<ul>
<li>Itching, redness or burning on the scalp, hairline, ears or neck.</li>
<li>Swelling, sometimes of the eyelids or face.</li>
<li>Blistering or weeping skin.</li>
</ul>
<p>A severe reaction — significant swelling of the face, or any difficulty breathing — needs urgent medical help. Mild reactions should still be checked by a doctor, who can arrange proper allergy testing.</p>
<h2>What we do</h2>
<ul>
<li>A patch test at least 48 hours before every colour.</li>
<li>If a test reacts, or you've reacted before, we don't use PPD-containing dye on you, and we write it on your file.</li>
<li>For some clients, PPD-free shades are an option — after their own patch test, because some people react to those too.</li>
</ul>
<p>If you've had a reaction anywhere, please tell us when you book. It changes how we plan your colour, and it's the most useful thing you can share.</p>
<h2>Questions we're often asked</h2><p><strong>Is a natural or herbal colour safer?</strong> Not necessarily. "Natural" on a box doesn't mean free of PPD or other allergens. Read the ingredients, and still patch-test.</p><p><strong>Can I take an antihistamine and colour anyway?</strong> Please don't. It can hide a reaction without preventing it.</p><p><strong>My test was fine last year.</strong> We still test, every time. Allergies can start after years of uneventful colour.</p>
<p><strong>Does it affect mehendi?</strong> Natural henna paste doesn't contain PPD. If you react to hair dye, you can usually still have mehendi with us — but tell Shabnam, and avoid any "black" or "instant" henna anywhere else.</p>`,
    },
    {
        slug: "pre-wedding-skin-plan",
        title: "A pre-wedding skin plan: twelve weeks to the day",
        category: "articles",
        daysAgo: 71,
        excerpt:
            "Good wedding skin is mostly patience. Here's the plan we suggest, week by week.",
        image: ph.A6c,
        body: `<p>Brides often ask us for one big facial "to glow" the week before the wedding. We understand, but it's the riskiest thing to do so late. Skin needs time to settle after any treatment. A calm, steady plan over three months gives far better results.</p>
<h2>Twelve weeks out</h2>
<ul>
<li>Start a simple routine: a gentle cleanser, a moisturiser and sunscreen every morning. Sunscreen matters most.</li>
<li>If you have acne or pigmentation that bothers you, see a dermatologist now. Some treatments need weeks to work.</li>
<li>Book a clean-up to see how your skin responds.</li>
</ul>
<h2>Eight weeks out</h2>
<ul>
<li>A hydrating facial now and then every three to four weeks. Our pack of six suits this well.</li>
<li>Don't try new products from here on. A reaction now has time to settle; a reaction later doesn't.</li>
</ul>
${fig(ph.A6i, "Hydrating facials every three to four weeks, not one big treatment at the end.")}
<h2>Four weeks out</h2>
<ul>
<li>Bridal trial with Noor. Your skin's response to the products is part of what we check.</li>
<li>A brightening facial if your skin is dull or tanned.</li>
</ul>
<h2>Two weeks out</h2>
<ul>
<li>A final clean-up. No new facials after this.</li>
<li>Full waxing a week before; threading two days before.</li>
</ul>
<h2>The last week</h2>
<ul>
<li>Sleep, water, and nothing new on your skin.</li>
<li>Mehendi the day before the wedding — wax and scrub before, not after.</li>
<li>If a spot appears, don't squeeze it. Noor can cover it far more easily than a scab.</li>
</ul>
<p>Every skin is different. If you're starting closer to the date, talk to Pooja and we'll shorten the plan sensibly.</p>
<h2>What we'd skip</h2><ul><li>Strong peels or new acids in the last month, unless your dermatologist has planned them.</li><li>Bleach on the face close to the wedding. It can irritate, and it leaves skin uneven under makeup.</li><li>A friend's "miracle" pack the night before.</li></ul><h2>For the groom, too</h2><p>Grooms benefit from the same plan in a shorter form: a clean-up a month before, a facial two weeks before, a haircut five to seven days before so it has settled, and a beard trim two days before. Imran is happy to plan it with you.</p><h2>On the day</h2><p>Drink water, eat something before makeup starts, and use blotting paper rather than powder for touch-ups. Noor will give you a small kit for the evening.</p>
<h2>Hair, too</h2><p>Book a trim about three weeks before so the ends look fresh without the cut looking new in photos. If you want colour, do it four to six weeks before, with a gloss closer to the day if needed. Keratin, if you want it, needs to be done at least three weeks before so you can wash and style your hair normally again by the wedding.</p>`,
    },
    {
        slug: "beard-care-in-dry-weather",
        title: "Beard care in dry weather",
        category: "articles",
        daysAgo: 58,
        excerpt:
            "Itchy skin, flakes and a beard that looks dry by noon. Imran's advice for Jaipur's dry months.",
        image: ph.A7c,
        body: `<p>Imran sees the same thing every winter and summer: beards that look good after a trim and dry, wiry and itchy a week later. The good news is that beard care is simple, and most of it takes less than a minute a day.</p>
<h2>Wash it, but not with your shampoo</h2>
<p>The skin under your beard is facial skin. Washing it with a strong shampoo every day dries it out, and dry skin flakes into the beard. Use a mild face or beard wash, and rinse well — leftover soap itches.</p>
<h2>Oil the skin, not just the hair</h2>
<p>Beard oil is for the skin underneath as much as the beard itself. Three or four drops, warmed between your palms, massaged in with your fingertips after washing. A longer beard needs a little more.</p>
${fig(ph.A7i, "A few drops a day is enough; more just makes it greasy.")}
<h2>Brush or comb daily</h2>
<p>Combing spreads the oil, catches flakes and trains the beard to grow the way you want. A wide-tooth wooden comb is gentle and doesn't snag.</p>
<h2>Trim regularly</h2>
<p>Even if you're growing a beard out, tidy the neckline and cheeks every two to three weeks. Uneven growth is normal, and a little shaping makes a growing beard look intentional.</p>
<h2>Itchy new growth</h2>
<p>The first few weeks of a new beard often itch as the hairs grow out. Keep the skin clean and moisturised and it usually settles. If the skin is red, sore, or has bumps that don't clear, see a doctor — that isn't normal beard itch.</p>
<h2>In the salon</h2>
<p>Our beard trim and shape is ₹250 and includes a hot towel. Members of the Men's Grooming Club can use their visits for a haircut or a beard trim — whichever needs it more that month.</p>
<h2>Choosing a shape</h2><p>A beard should frame your face, not hide it. As a rough guide, a round face looks longer with a little more length at the chin and shorter sides; a long face suits fuller sides and a shorter chin. The neckline should sit about a finger's width above the Adam's apple — any higher and it starts to look like a chinstrap. Imran will suggest a shape at your first trim and show you how to keep the lines tidy between visits.</p>
<h2>Summer sweat</h2><p>In May and June, a beard traps heat and sweat. Wash it in the evening rather than leaving the day's dust in overnight, and if it gets uncomfortable, a shorter summer length is no shame. It grows back by the wedding season.</p>`,
    },
    {
        slug: "choosing-a-hair-colour-shade",
        title: "Choosing a hair colour: what the numbers on the tube mean",
        category: "articles",
        daysAgo: 35,
        excerpt:
            "Level, tone and why 6.3 isn't just a name. A short guide to talking shades with your colourist.",
        image: ph.A8c,
        body: `<p>Look at a professional colour tube and you'll see a number like 4.0, 6.3 or 7.44. The numbers aren't random. Once you know how they work, it's much easier to talk to your colourist about what you want.</p>
<h2>The first number: level</h2>
<p>The number before the point is the <strong>level</strong>: how light or dark the colour is, on a scale from 1 (black) to around 10 (very light blonde). Most Indian hair sits naturally between levels 1 and 4. The further you move from your natural level, the more the colour has to do — and the more care your hair needs afterwards.</p>
<h2>The numbers after the point: tone</h2>
<p>The digits after the point describe the <strong>tone</strong>. Brands vary a little, but commonly:</p>
<ul>
<li>.0 — natural</li>
<li>.1 — ash (cool, reduces warmth)</li>
<li>.3 — golden</li>
<li>.4 — copper</li>
<li>.5 — mahogany</li>
<li>.6 — red</li>
</ul>
<p>So 6.3 is a dark blonde with a golden tone, and 4.62 is a medium brown with a strong red and a touch of violet.</p>
${fig(ph.A8i, "A shade card shows dyed hair, not a painted colour. Look at it in daylight.")}
<h2>Why the box picture lies</h2>
<p>Hair colour adds to what's already there. A 6.3 on naturally black hair will not look like the picture; it may barely show. Lighter results on dark hair need lightening first. That's why we ask about your natural colour and any previous colour before we suggest a shade.</p>
<h2>Warm or cool?</h2>
<p>Warm tones (golden, copper) brighten and catch the light. Cool tones (ash) look softer and calmer, and help counter brassiness. Most Indian skin tones suit warm-to-neutral browns, but there's no rule — the best guide is how you feel looking at a strand against your face in daylight.</p>
<h2>Home touch-ups</h2>
<p>We sell our professional colour at the counter for clients who touch up their roots at home between visits. We'll only sell a shade after a consult and a patch test, and we'll write down the shade and developer we used, so the roots match.</p>
<h2>Grey coverage</h2><p>Grey hair is more resistant to colour, especially at the temples. Natural tones (the .0 shades) cover grey most reliably; very ashy or very warm shades can leave greys looking see-through. If you're more than half grey, tell us — we may mix a natural shade into your chosen tone, and the developer and timing change too.</p>
<p>When in doubt, go one shade softer than you think. It's much easier to deepen a colour next time than to lift one that came out too dark.</p>`,
    },
    {
        slug: "bridal-makeup-timeline",
        title: "From enquiry to the pheras: a bridal timeline",
        category: "articles",
        daysAgo: 20,
        excerpt:
            "When to enquire, when to trial, and what the wedding morning looks like, hour by hour.",
        image: ph.A9c,
        body: `<p>Weddings in Jaipur are rarely one day, and brides often have three or four looks to plan. Here's how the months before usually run when you book your bridal makeup with us.</p>
<h2>Four to six months before: enquire</h2>
<p>Send us your dates and functions through the <a href="/bridal">bridal enquiry form</a>. Noor takes one bride per morning, so popular muhurat dates go early. We'll reply within a day with what's free.</p>
<h2>When you're sure: hold the date</h2>
<p>Book your wedding-day makeup online with a 50% advance. The advance moves with you if dates change with notice.</p>
${fig(ph.A9i, "Write your functions down early: who needs makeup, when, and where.")}
<h2>Three to six weeks before: the trial</h2>
<p>Two hours with Noor and Riya. Bring outfit photos, jewellery and references. We note everything we settle: the base, the lip, how the dupatta pins.</p>
<h2>Two to three weeks before: skin</h2>
<p>A final clean-up with Pooja. Nothing new on your skin after this.</p>
<h2>The day before: mehendi</h2>
<p>Bridal mehendi with Shabnam takes about four hours. Eat first, and leave the paste on overnight.</p>
<h2>The wedding morning</h2>
<p>For an evening wedding, we usually start about six hours before you need to leave:</p>
<ul>
<li><strong>First hour:</strong> skin prep and base.</li>
<li><strong>Second and third hours:</strong> eyes, lashes, contour, lips.</li>
<li><strong>Fourth hour:</strong> hair, jewellery and dupatta setting.</li>
<li><strong>The rest:</strong> breathing room for photos, family and the unexpected.</li>
</ul>
<p>For early muhurats, we'll plan the timings together. And if your family needs makeup too, we book them in separately with Riya so your time with Noor is never cut short.</p>
<h2>What to have ready the night before</h2><ul><li>Your outfit, jewellery and dupatta laid out together, with safety pins.</li><li>A front-buttoned shirt to wear while we do your makeup.</li><li>A light breakfast planned, and water within reach.</li></ul><h2>If plans change</h2><p>Weddings move. If your date shifts, tell us as early as you can; the advance moves with your booking when there's more than 24 hours' notice. If the change is last-minute, call Noor directly — we'll do everything we can.</p><h2>A note on trends</h2><p>Bring the references you love, but trust your trial. A look that photographs beautifully on someone else may not suit your features or your lighting. The trial is where we find the version of it that is yours.</p>
<h2>After the wedding</h2><p>Removing bridal makeup properly matters after a long night. Use an oil cleanser first, then a gentle face wash, and be patient with the lashes. If you have a reception the next day, message us; a quick skin-calming clean-up in the morning helps your base sit well again.</p>`,
    },
];
