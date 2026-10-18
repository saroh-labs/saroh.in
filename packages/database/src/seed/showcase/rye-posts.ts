import type { JournalPost } from "./journal";
import { figure, photo } from "./journal";

/**
 * Rye & Co.'s journal: help with ordering cakes, the subscription,
 * allergens and delivery; the bakery's news; and longer pieces on how it
 * bakes. Written for the showcase; photos are free-licence Unsplash images,
 * credited in each caption, looked at before use.
 */

const STARTER = photo(
    "photo-1620429195658-bff06a35e6a6",
    "A glass jar of sourdough starter beside a sliced loaf",
    "Margaret Jaszowska",
    "https://unsplash.com/@margaret_jaszowska",
);
const BUBBLY = photo(
    "photo-1594053646793-39c92a8ec4a7",
    "A jar of risen, bubbly sourdough starter on a cloth",
    "qazal heydarpour",
    "https://unsplash.com/@iqazal",
);
const KNEAD = photo(
    "photo-1517686469429-8bdb88b9f907",
    "Hands kneading dough on a floured bench",
    "Nadya Spetnitskaya",
    "https://unsplash.com/@kiboka",
);
const SHAPE = photo(
    "photo-1652283321082-72bb2b601abd",
    "Hands shaping a round of dough on a floured counter",
    "Skyler Ewing",
    "https://unsplash.com/@skylerewing",
);
const BENCH = photo(
    "photo-1549057188-efd70413345e",
    "Bakers dividing dough into rounds on a long wooden bench",
    "Maranda Vandergriff",
    "https://unsplash.com/@mkvandergriff",
);
const FLOURED = photo(
    "photo-1652283319196-9288add2d60c",
    "A ball of dough being rounded in a dusting of flour",
    "Skyler Ewing",
    "https://unsplash.com/@skylerewing",
);
const SCORE = photo(
    "photo-1554643895-20d00c6cdeda",
    "A baker scoring proofed loaves before they go in the oven",
    "DDP",
    "https://unsplash.com/@moino007",
);
const COUNTER = photo(
    "photo-1711672284661-bd70e38f31b2",
    "A bakery counter of pastries and loaves under the lights",
    "Elisha Terada",
    "https://unsplash.com/@elishaterada",
);
const SHELVES = photo(
    "photo-1738898326912-83ec04de4ccf",
    "Bread on wooden shelves behind a busy bakery counter",
    "wei",
    "https://unsplash.com/@chanwei_snap",
);
const RUSTIC = photo(
    "photo-1777709350429-d152848a698e",
    "Loaves and buns on the wooden shelves of a small bakery",
    "Thamy N.",
    "https://unsplash.com/@thamyn",
);
const CAFE = photo(
    "photo-1790156591751-5c3c96e0140f",
    "A café counter with cakes under glass domes",
    "Ceba Solutions",
    "https://unsplash.com/@professional_photos_online",
);
const MILLSTONE = photo(
    "photo-1763809677023-4f3450645dee",
    "An old millstone set in the floor of a mill",
    "Sushanta Rokka",
    "https://unsplash.com/@sanoyatra",
);
const RYE_SLICES = photo(
    "photo-1534620808146-d33bb39128b2",
    "Thin slices of dark rye bread stacked on white",
    "Louise Lyshøj",
    "https://unsplash.com/@louiogbearnaisen",
);
const WHEAT_LOAF = photo(
    "photo-1585478259844-06d7b756b082",
    "A long loaf scored with a wheat-ear pattern, cracked with flour",
    "Tommaso Urli",
    "https://unsplash.com/@tunnuz",
);
const LOAF = photo(
    "photo-1586444248902-2f64eddc13df",
    "A round floured sourdough loaf on brown paper",
    "Sergio Arze",
    "https://unsplash.com/@sergich",
);
const DARK_LOAF = photo(
    "photo-1542482331-f0979d6616ad",
    "A dark-crusted loaf against a black background",
    "mau mar",
    "https://unsplash.com/@tatlin",
);
const CRUMB = photo(
    "photo-1614121604213-9a0da4c84da2",
    "A cut loaf showing an open, even crumb",
    "Alexas_Fotos",
    "https://unsplash.com/@alexas_fotos",
);
const SCORED = photo(
    "photo-1638788449271-9bb9121c1bfc",
    "A scored round loaf on a cooling rack",
    "Jens Meyers",
    "https://unsplash.com/@u1le901",
);
const CROISSANTS = photo(
    "photo-1623334044303-241021148842",
    "Rows of golden croissants on baking paper",
    "Conor Brown",
    "https://unsplash.com/@commonboxturtle",
);
const DUSTED = photo(
    "photo-1555507036-ab1f4038808a",
    "Croissants on a dark board, a dusting of sugar falling",
    "Mae Mu",
    "https://unsplash.com/@picoftasty",
);
const LAYERS = photo(
    "photo-1700915704616-b455b3679024",
    "Close-up of flaky croissant layers",
    "Vadim Babenko",
    "https://unsplash.com/@vakerbv",
);
const ICING = photo(
    "photo-1645995575875-ea6511c9d127",
    "Icing poured over a stack of cinnamon buns",
    "Eve Maier",
    "https://unsplash.com/@maierfoto",
);
const BUNS = photo(
    "photo-1775582662806-2972d4878175",
    "A tray of freshly baked cinnamon buns",
    "Kamilla Isalieva",
    "https://unsplash.com/@kamillaisalieva",
);
const SWIRL = photo(
    "photo-1651604017152-e2c94e9cff1c",
    "One cinnamon swirl on a plate",
    "Aurela Redenica",
    "https://unsplash.com/@aureler",
);
const BEANS = photo(
    "photo-1447933601403-0c6688de566e",
    "A layer of roasted coffee beans",
    "Mike Kenneally",
    "https://unsplash.com/@asthetik",
);
const ROASTER = photo(
    "photo-1511537190424-bbbab87ac5eb",
    "A small coffee roaster with beans tumbling in its drum",
    "Yanapi Senaud",
    "https://unsplash.com/@yaanapi",
);
const COOLING = photo(
    "photo-1537130508299-46ab547b4be3",
    "Fresh-roasted beans pouring into a roaster's cooling tray",
    "Gregory Hayes",
    "https://unsplash.com/@gregoryallen",
);
const HANDFUL = photo(
    "photo-1608586283588-123ebe4e6e45",
    "Two hands holding roasted coffee beans",
    "Hugo Clément",
    "https://unsplash.com/@hugo_cmt",
);
const LATTE = photo(
    "photo-1650097364104-eef0e54af0da",
    "A latte with a leaf pattern in a white cup",
    "Sepehr Moazed",
    "https://unsplash.com/@sepmo",
);
const PIPE_TIERS = photo(
    "photo-1586985289688-ca3cf47d3e6e",
    "A cake on a stand being finished with piped chocolate ruffles",
    "American Heritage Chocolate",
    "https://unsplash.com/@americanheritagechocolate",
);
const PIPE_BORDER = photo(
    "photo-1687561822667-c308ab7b97a7",
    "A piping bag adding a chocolate border to a white cake",
    "Federico Faccipieri",
    "https://unsplash.com/@efecubo",
);
const PIPE_MINIS = photo(
    "photo-1687102626222-cc819882b295",
    "Chocolate frosting piped onto small cakes",
    "SERHAT TUĞ",
    "https://unsplash.com/@sserhattug",
);
const PIPING_BAG = photo(
    "photo-1625489461079-bcfdfe726d51",
    "A baker holding a piping bag over a work table",
    "Arsham Baseri",
    "https://unsplash.com/@arsham_baseri",
);
const CANDLES_DARK = photo(
    "photo-1610670444950-0b29430891b4",
    "A dark chocolate cake with lit candles",
    "Duncan Kidd",
    "https://unsplash.com/@we_the_royal",
);
const HAPPY_CAKE = photo(
    "photo-1562804698-732e972e46e4",
    "A chocolate cake with Happy Birthday candles alight",
    "prosha amiri",
    "https://unsplash.com/@proshaaaa",
);
const LETTER_CANDLES = photo(
    "photo-1729870526122-0de9a7113dc6",
    "Happy Birthday letter candles lit on a cream cake",
    "CR",
    "https://unsplash.com/@cr029",
);
const PARTY_CAKE = photo(
    "photo-1616964524979-c08f6d87c7e1",
    "A chocolate birthday cake with lettered candles",
    "Lan Gao",
    "https://unsplash.com/@langao",
);
const BLOWING = photo(
    "photo-1605654574671-d0ee8a068053",
    "A frosted chocolate cake with thin lit candles",
    "A n v e s h",
    "https://unsplash.com/@anvesh1616",
);
const DIYA_HANDS = photo(
    "photo-1605292356183-a77d0a9c9d1d",
    "Hands cupping a lit clay diya",
    "Umesh Soni",
    "https://unsplash.com/@umeshsonii",
);
const DIYAS = photo(
    "photo-1636737512034-518389c47764",
    "A row of lit clay diyas",
    "VD Photography",
    "https://unsplash.com/@vdphotography",
);
const DIYA_GLOW = photo(
    "photo-1635960054325-65ad7871aa15",
    "A single lit diya with soft lights behind",
    "VD Photography",
    "https://unsplash.com/@vdphotography",
);
const PLUM_CUT = photo(
    "photo-1764944663495-c1183aa05cc4",
    "A plum cake studded with fruit, cut open",
    "Subhra Jyoti Paul",
    "https://unsplash.com/@sjpaul",
);
const PLUM_WHOLE = photo(
    "photo-1764944663494-b1d5b8a22f6c",
    "A round plum cake on a plate among fairy lights",
    "Subhra Jyoti Paul",
    "https://unsplash.com/@sjpaul",
);
const DRIP_CAKE = photo(
    "photo-1626263468007-a9e0cf83f1ac",
    "A tall cake with a chocolate drip and biscuits on top",
    "Syed Maaz",
    "https://unsplash.com/@syedmaaz904",
);
const TIN = photo(
    "photo-1759975142115-23f8862b6748",
    "A round tin of biscuits beside a takeaway coffee",
    "Tony Chen",
    "https://unsplash.com/@tony1218",
);
const TOAST = photo(
    "photo-1612827788868-c8632040ab64",
    "Two slices of grilled toast on a white plate",
    "Mishaal Zahed",
    "https://unsplash.com/@mishaalzahed",
);
const SLICED = photo(
    "photo-1554933054-0b679a7982ca",
    "A sliced loaf standing on its end",
    "Stephanie Harvey",
    "https://unsplash.com/@stephanieharvey",
);
const STACKED = photo(
    "photo-1677825948767-5d379d012bda",
    "Thick slices of sourdough stacked on a counter",
    "Caramel",
    "https://unsplash.com/@caramel_works",
);
const WHEAT_SKY = photo(
    "photo-1529511582893-2d7e684dd128",
    "Ripe wheat under a blue sky",
    "Polina Rytova",
    "https://unsplash.com/@polina_art",
);
const WHEAT_SUN = photo(
    "photo-1594842059196-5b6b8fa73187",
    "Wheat ears in the evening sun",
    "Vlad Stawizki",
    "https://unsplash.com/@vlad_stawizki",
);
const GREEN_WHEAT = photo(
    "photo-1596967302183-e9a3775a75ef",
    "A field of green wheat",
    "ＭΛＴΞ",
    "https://unsplash.com/@kovacs__mate",
);

export const RYE_POSTS: readonly JournalPost[] = [
    // ── Help ────────────────────────────────────────────────────────────
    {
        slug: "how-to-order-a-custom-cake",
        title: "How to order a custom cake (and why we ask for 48 hours)",
        category: "help",
        excerpt:
            "Pick a cake and a size, tell us the words and the day, and give us two days. Here is the whole process, start to finish.",
        cover: PIPE_TIERS,
        daysAgo: 9,
        featured: true,
        body: `
<p>Every celebration cake we sell is baked after you order it. Nothing sits in a fridge waiting for a birthday. That is why we ask for <strong>48 hours' notice</strong>: one day to bake and cool the sponges properly, and one to fill, cover and finish them.</p>
<h2>Ordering online</h2>
<ol>
<li>Open <strong>Celebration cakes</strong> in our shop and choose a cake.</li>
<li>Choose a size. Every cake lists its sizes from 500 g up, and most have an eggless version beside each size.</li>
<li>Add any extras — candles, a number candle, a topper or a chocolate plaque.</li>
<li>At checkout, choose collection from Hill Road or delivery in Bengaluru, and write in the note: <em>the day and time you need it, and the words for the cake</em>.</li>
<li>Pay online. You'll get an email with your order and a GST invoice straight away.</li>
</ol>
${figure(PIPING_BAG, "Most of the finishing happens on the second day")}
<h2>Ordering at the counter</h2>
<p>Come to Hill Road between 7am and 8pm and tell us what you have in mind. We'll take the order on the tablet at the counter, so it lands in exactly the same list as the online ones, and you pay there.</p>
<h2>Less than 48 hours?</h2>
<p>Call us. If the ovens allow it we will say yes, but we would rather say no than send out a cake that was rushed.</p>
`,
    },
    {
        slug: "eggless-cakes",
        title: "Eggless cakes: which ones, and how they differ",
        category: "help",
        excerpt:
            "Six of our cakes come eggless in every size, the rasmalai cake is only ever eggless, and one can't be made without eggs.",
        cover: PIPE_MINIS,
        daysAgo: 21,
        body: `
<p>About half the cakes we bake for birthdays are eggless, so we don't treat it as a special request. On every cake page you'll see each size twice: <em>1 kg</em> and <em>1 kg, eggless</em>. Choose the one you want.</p>
<h3>Which cakes</h3>
<ul>
<li><strong>Eggless in any size:</strong> chocolate truffle, red velvet, black forest, coffee walnut, vanilla bean &amp; seasonal fruit, and theme cakes.</li>
<li><strong>Always eggless:</strong> the rasmalai cake. The rabdi-soaked sponge works better without eggs, so we never make it any other way.</li>
<li><strong>Never eggless:</strong> lemon &amp; blueberry. The lemon curd inside is thickened with eggs and there is no honest substitute.</li>
</ul>
${figure(DRIP_CAKE, "An eggless chocolate cake looks and slices the same")}
<h3>Is it different?</h3>
<p>Slightly. Our eggless sponges use yoghurt and a little more raising agent; they are a touch denser and stay moist a day longer. It costs ₹100 more a kilo (₹200 for red velvet), because the cream-cheese frosting needs extra work to hold without eggs.</p>
<h3>Allergens</h3>
<p>Our allergen list belongs to the cake, not the size, so eggless cakes still show "Contains: eggs" on the label. They are baked in the same kitchen as everything else. If an egg allergy is serious, call us before ordering and we'll talk you through what we can and can't promise.</p>
`,
    },
    {
        slug: "what-to-write-on-a-cake",
        title: "What to write on a cake (in 30 characters)",
        category: "help",
        excerpt:
            "The message is free, piped by hand, and has to fit. A few rules of thumb from the person who pipes most of them.",
        cover: HAPPY_CAKE,
        daysAgo: 33,
        body: `
<p>Writing on a cake is free, up to <strong>30 characters</strong> including spaces. Put it in the order note exactly as you want it, with the spelling and capitals you want — we pipe what you write.</p>
${figure(PIPE_BORDER, "Messages are piped last, after the border")}
<h3>Rules of thumb</h3>
<ul>
<li>Names first. "Happy 7th, Aarav!" reads better than "Wishing you a very happy birthday Aarav" and fits.</li>
<li>On a 500 g cake, aim for under 20 characters. There isn't room for more without making the letters tiny.</li>
<li>Tamil, Kannada, Hindi and other scripts are fine — paste them into the note and we'll copy them carefully. Tell us if you'd like us to send a photo before it leaves.</li>
<li>Want more words? Add a <strong>chocolate message plaque</strong> (₹99, up to 20 characters) for a second line, or for a cake you're baking at home.</li>
</ul>
<p>And if the message is a surprise, tell us not to call the person the cake is for. We read every note.</p>
<p>One more tip from the counter: say who the cake is from only if the cake is going somewhere you won't be. "Love, the Rao family" is lovely on a cake sent to a grandparent across town, and wasted on one you'll carry in yourself.</p>
`,
    },
    {
        slug: "how-many-slices",
        title: "How many people does a 1 kg cake feed?",
        category: "help",
        excerpt: "A quick guide to sizes, so you don't run short at the party.",
        cover: CANDLES_DARK,
        daysAgo: 48,
        body: `
<p>It depends on how you cut it and whether there is dinner. These are the numbers we give at the counter for a cake served as dessert.</p>
<ul>
<li><strong>500 g</strong> — 4 to 6 people. A small family celebration.</li>
<li><strong>1 kg</strong> — 8 to 10 people. Most birthdays at home.</li>
<li><strong>1.5 kg</strong> — 12 to 15 people.</li>
<li><strong>2 kg</strong> — 16 to 20 people. An office or a big family.</li>
<li><strong>3 kg</strong> (theme cakes only) — 25 to 30 people, and enough room on top for a proper design.</li>
</ul>
${figure(PARTY_CAKE, "A 1 kg cake with room for candles")}
<p>For a children's party, where slices are smaller and half are left on the plate, you can go one size down. For an office, where everyone takes a slice back to their desk, go one size up.</p>
<p>Not sure? Order the smaller cake and add a box of our cinnamon buns — they disappear either way.</p>
<p>Ordering for a wedding, a housewarming or more than 30 people? Two 2 kg cakes in different flavours usually go further than one very large cake, and they're easier to carry. Ask at the counter and we'll suggest a pair.</p>
`,
    },
    {
        slug: "storing-your-cake",
        title: "Keeping your cake at its best",
        category: "help",
        excerpt:
            "Fridge or counter, how long it keeps, and when to take it out before cutting.",
        cover: BLOWING,
        daysAgo: 62,
        body: `
<p>Our cakes are made with fresh cream, butter and cream cheese, and no preservatives. They need a little care, especially in Bengaluru's warm afternoons.</p>
<h3>When it arrives</h3>
<p>Put it in the fridge, in its box, as soon as you can. If the cake travels in a car, keep it flat on the floor, not on a seat, and keep the AC on.</p>
<h3>Before cutting</h3>
<p>Take it out <strong>30 to 45 minutes</strong> before you cut. Cold cake tastes of very little; the ganache and the cream need to soften. Fruit cakes and cream-cheese frostings can come out 20 minutes before.</p>
${figure(CAFE, "Cakes wait in the cold until they're collected")}
<h3>How long it keeps</h3>
<ul>
<li>Fresh cream and fruit cakes: eat within 2 days.</li>
<li>Chocolate truffle, coffee walnut and red velvet: 3 days in the fridge.</li>
<li>Rasmalai cake: 2 days, always in the fridge.</li>
</ul>
<p>Leftover slices keep best wrapped in cling film so they don't pick up the smells of the fridge.</p>
<p>Collecting it yourself? We'll pack it in a box with a cake board and a sheet of instructions taped to the lid, so whoever cuts it knows when to take it out.</p>
`,
    },
    {
        slug: "sourdough-subscription",
        title: "How the sourdough subscription works",
        category: "help",
        excerpt:
            "A loaf every Saturday, paid weekly or monthly, collected from Hill Road. What happens each week and what it costs.",
        cover: LOAF,
        daysAgo: 150,
        body: `
<p>The subscription is the simplest way to have our sourdough every week without thinking about it. Two plans:</p>
<ul>
<li><strong>Weekly</strong> — ₹480 a week, renewed every week.</li>
<li><strong>Monthly</strong> — ₹1,800 a month, renewed each month. Slightly cheaper than paying week by week.</li>
</ul>
<p>Either way, your loaf is baked on Saturday morning and waits for you at the Hill Road counter from 7am. Just give your name.</p>
${figure(SHELVES, "Saturday's loaves, set aside by name")}
<h3>Paying</h3>
<p>The first payment is taken when you sign up. After that, each renewal sends you an invoice by email; pay it from the link. Bread is nil-rated for GST, so there is no tax on the plan.</p>
<h3>If a payment doesn't go through</h3>
<p>We'll email you, and the loaf is still baked that week. Pay from the link when you can — we would rather not stop anyone's bread over a card that expired.</p>
<h3>Your account</h3><p>Every subscriber can see their plan, their next renewal and every invoice in their account on our website — sign in with the email you subscribed with. It's also where you'll find your past orders.</p>
`,
    },
    {
        slug: "pause-skip-or-change-plan",
        title: "Skipping a week, pausing, or changing your plan",
        category: "help",
        excerpt:
            "Going away? Skip a Saturday or pause the whole thing. Want monthly instead of weekly? It changes at your next renewal.",
        cover: SCORED,
        daysAgo: 118,
        body: `
<p>A subscription should fit your life, not the other way round.</p>
<h3>Skip a Saturday</h3>
<p>Tell us by Thursday evening — at the counter, by email, or by replying to your renewal email — and we won't bake your loaf that week. You can skip as many Saturdays as you like.</p>
<h3>Pause</h3>
<p>Away for a month? We can pause the subscription, so nothing is baked and nothing is charged until you're back. Tell us the week you'd like to start again.</p>
${figure(STACKED, "A paused plan picks up where it left off")}
<h3>Change plan</h3>
<p>Moving from weekly to monthly (or back) takes effect at your next renewal, so you never pay twice for the same week. You'll see "changing plan at renewal" on your invoice email until it does.</p>
<h3>Cancel</h3>
<p>You can stop any time. The current week or month runs to its end, and you'll still get the loaves you've paid for.</p>
<p>If you're not sure which of these you want, tell us what's happening — a holiday, a guest, a diet — at the counter, and we'll set it up the right way.</p>
`,
    },
    {
        slug: "reading-our-allergen-labels",
        title: "Reading our allergen labels",
        category: "help",
        excerpt:
            'What "contains" and "may contain" mean on every product, and the eight allergens we list.',
        cover: WHEAT_LOAF,
        daysAgo: 132,
        body: `
<p>Every product in our shop lists two things: what it <strong>contains</strong>, and what it <strong>may contain</strong>.</p>
<ul>
<li><strong>Contains</strong> means the allergen is an ingredient. Our almond croissant contains nuts; our sourdough contains gluten.</li>
<li><strong>May contain</strong> means it isn't an ingredient, but the product is made on surfaces or in ovens shared with something that is. Our sourdough may contain sesame, because the seeded loaf is shaped on the same bench.</li>
</ul>
<p>We list eight: gluten, milk, eggs, nuts, peanuts, sesame, soy and mustard.</p>
${figure(RUSTIC, "One kitchen, one set of benches")}
<h3>If you have an allergy</h3>
<p>Tell us when you order and we'll note it against your name, so whoever packs your order sees it. We are one small kitchen and can't promise anything is free from traces of the others. If an allergy is severe, please talk to us before you order.</p>
<p>On our custom cakes, the label covers every size, including the eggless ones; the description says which ingredients are left out of an eggless cake. If you're unsure about anything on a label, ask whoever is at the counter — they can see the recipe.</p>
`,
    },
    {
        slug: "delivery-in-bengaluru",
        title: "Delivery: where, when and what it costs",
        category: "help",
        excerpt:
            "Our own rider covers most of Bengaluru for ₹60. Beans and gift boxes go further by courier.",
        cover: TIN,
        daysAgo: 104,
        body: `
<p>We deliver bread, pastry and cakes ourselves, and send coffee and gift boxes further afield by courier.</p>
<h3>In Bengaluru</h3>
<p>Our rider delivers within the city for a flat <strong>₹60</strong>. Morning orders placed by 9am usually go out the same day; after that, the next morning. Custom cakes go out on the day and time slot you put in your note.</p>
<h3>Outside Bengaluru</h3>
<p>Coffee beans and our baker's gift box can go anywhere in India by courier. You'll get a tracking link when it's handed over. Fresh bread and cakes stay in the city — they don't travel well.</p>
${figure(SLICED, "Bread travels best on the day it's baked")}
<h3>Invoices</h3>
<p>Every paid order comes with a GST invoice. Delivery is charged at 18%, as the rules require; most of our bread is nil-rated.</p>
<p>Prefer to come in? Choose collection and pick up from Hill Road from 7am.</p>
<p>Our rider goes out twice a day, at around 10am and 4pm, and carries bread, pastry and cakes in an insulated box. If nobody is home, we'll call, and leave the order with security only if you've said that's fine in your order note.</p>
`,
    },
    // ── News ────────────────────────────────────────────────────────────
    {
        slug: "diwali-cakes-and-gift-boxes",
        title: "Diwali at Rye & Co.: rasmalai cakes and gift boxes",
        category: "news",
        excerpt:
            "Order Diwali cakes now — 48 hours' notice as always, but the week before Diwali fills fast.",
        cover: DIYAS,
        daysAgo: 4,
        featured: true,
        body: `
<p>Diwali is on Sunday, 8 November, and the cake orders have started. Our <strong>rasmalai cake</strong> — saffron sponge, rabdi, pistachio and rose, always eggless — is back as the Diwali favourite, and the baker's gift box is going out to families across the country.</p>
${figure(DIYA_HANDS, "The week before Diwali is our busiest of the year")}
<p>Two things to know:</p>
<ul>
<li>We take cake orders with 48 hours' notice, but in Diwali week we stop taking them once the ovens are full. Order early for 6, 7 and 8 November.</li>
<li>Gift boxes sent outside Bengaluru should be ordered by 2 November to arrive in time.</li>
</ul>
<p>Office orders of five cakes or more: email us and we'll send one invoice for the lot.</p>
<p>Not sure what to choose for a family gathering? A 2 kg rasmalai cake feeds around twenty and travels well across town.</p>
`,
    },
    {
        slug: "christmas-plum-cake-pre-orders",
        title: "Christmas plum cake: pre-orders open in November",
        category: "news",
        excerpt:
            "The fruit has been soaking since August. Plum cakes go on pre-order in the first week of November.",
        cover: PLUM_WHOLE,
        daysAgo: 1,
        body: `
<p>The raisins, currants, orange peel and cherries for this year's Christmas plum cake went into their jars of rum and spice in August, and they have been turned every week since.</p>
${figure(PLUM_CUT, "Last year's plum cake, the week before Christmas")}
<p>Pre-orders open in the first week of November, in 500 g and 1 kg, with an alcohol-free version soaked in orange juice and spice. We bake them from 10 December and they keep for three weeks, so you can order for the whole season at once.</p>
<p>We'll put a note here and on the shop the day they open.</p>
<p>The plum cake makes a good gift for colleagues and neighbours: we wrap the 500 g cakes in paper and ribbon at no extra cost. Order five or more and we'll send one invoice for the lot.</p>
`,
    },
    {
        slug: "custom-cakes-are-on-the-website",
        title: "Custom cakes are now on the website",
        category: "news",
        excerpt:
            "Eight cakes, every size, eggless where the recipe allows, and candles and toppers to go with them.",
        cover: LETTER_CANDLES,
        daysAgo: 12,
        body: `
<p>For years our birthday cakes were ordered over the counter or on a phone call, written on a slip and pinned above the oven. From this week they're in our online shop, with every size and price on the page.</p>
<p>There are eight to choose from: Belgian chocolate truffle, red velvet, black forest, rasmalai, lemon &amp; blueberry, coffee walnut, vanilla bean &amp; seasonal fruit, and a theme cake drawn up with you. Most come eggless too. Candles, number candles, a gold, silver or rose-gold topper and a chocolate message plaque are in the shop beside them.</p>
${figure(PIPE_BORDER, "Same cakes, same kitchen — just easier to order")}
<p>We still need 48 hours, and you can still order at the counter. The difference is that every order now lands in one list, with the date and the message in front of the baker.</p>
`,
    },
    {
        slug: "rye-and-caraway-is-back",
        title: "The rye & caraway loaf is back on Tuesdays and Fridays",
        category: "news",
        excerpt:
            "Dark, dense and sour — the loaf regulars asked about all summer.",
        cover: RYE_SLICES,
        daysAgo: 24,
        body: `
<p>We paused the rye &amp; caraway loaf over the summer, when the heat made the rye ferment too quickly to control. With the cooler evenings it's back, baked on <strong>Tuesdays and Fridays</strong>.</p>
${figure(DARK_LOAF, "Rye bakes darker and denser than wheat")}
<p>It sells out by late morning on both days, so if you want one, order online the evening before and collect from 7am. It keeps well — a week, wrapped in paper — and is at its best on the second day, sliced thin.</p>
<p>If you've not tried it before, start with a few thin slices and good butter, or with cheese and a sharp pickle. It's not a sandwich loaf, and it doesn't pretend to be one. For a gentler rye, ask for a slice of the multigrain to taste alongside.</p>
`,
    },
    {
        slug: "diwali-week-hours",
        title: "Our hours over Diwali",
        category: "news",
        excerpt:
            "Open as usual until Saturday 7 November, short hours on Diwali, closed the day after.",
        cover: DIYA_GLOW,
        daysAgo: 3,
        body: `
<p>Here is how Hill Road opens over Diwali week:</p>
<ul>
<li><strong>Monday 2 to Saturday 7 November:</strong> 7am to 8pm, as usual. Cake collections from 10am.</li>
<li><strong>Sunday 8 November, Diwali:</strong> 7am to 1pm, for collections and the morning bake only.</li>
<li><strong>Monday 9 November:</strong> closed, so the team can be with their families.</li>
<li><strong>Tuesday 10 November:</strong> back to normal.</li>
</ul>
${figure(DIYAS, "Happy Diwali from all of us on Hill Road")}
<p>Subscription loaves are baked on Saturday 7 November as usual. Online orders placed while we're closed go out on Tuesday.</p>
<p>Cake collections for Diwali Sunday are between 7am and 1pm only — please choose a slot in the morning when you order, or choose delivery. Our rider is working that morning too.</p>
`,
    },
    {
        slug: "monsoon-deliveries",
        title: "Monsoon deliveries: a little slower, still dry",
        category: "news",
        excerpt:
            "On heavy-rain days our rider may run up to an hour late. Your bread will arrive dry.",
        cover: TOAST,
        daysAgo: 96,
        body: `
<p>With the rains properly here, some mornings our rider is crossing flooded underpasses on Old Airport Road and Indiranagar 100 Feet Road. On those days deliveries can run up to an hour late.</p>
${figure(STACKED, "Every delivery now goes in a sealed bag inside the box")}
<p>We've switched to sealed bags inside every box, so the bread arrives dry even when the rider doesn't. If an order arrives damp or damaged, send us a photo the same day and we'll replace it or refund it.</p>
<p>And if you'd rather not wait, collection from Hill Road is always from 7am.</p>
<p>We'll message you if your delivery is going to be late, rather than leave you wondering.</p>
`,
    },
    {
        slug: "new-house-blend",
        title: "A new house blend from Chikmagalur",
        category: "news",
        excerpt:
            "Our coffee partner has changed the blend for the season: more chocolate, less acidity.",
        cover: ROASTER,
        daysAgo: 30,
        body: `
<p>Our house blend comes from Kaapi Roasters in Chikmagalur, who roast it for us every Tuesday. With the new crop in, they've changed the blend: a higher share of a washed Arabica from Baba Budangiri, roasted a touch darker.</p>
${figure(HANDFUL, "This season's beans, two days after roasting")}
<p>In the cup, that means more chocolate and less of the bright, fruity edge some of you found sharp in a flat white. It's what we're pouring at the counter now, and it's in the 250 g and 1 kg bags in the shop — whole bean, espresso or filter grind.</p>
<p>If you preferred the old blend, the filter grind still has some of its brightness: try it in a South Indian filter with a little more coffee than usual. And tell us what you think — this is the blend we'll keep through to February.</p>
`,
    },
    {
        slug: "weekend-bakes-focaccia",
        title: "Weekend bakes: a full tray of focaccia",
        category: "news",
        excerpt:
            "Rosemary focaccia joins the weekend list, by the square or by the tray.",
        cover: FLOURED,
        daysAgo: 16,
        body: `
<p>Our focaccia has been a Saturday-only experiment for a few weeks. It has sold out every time, so it's now on the weekend list for good: a full tray, olive oil and rosemary from the garden behind the bakery, flaky salt on top.</p>
${figure(BENCH, "The dough goes in the tins on Friday night")}
<p>Buy it by the square at the counter or order a whole tray online for collection — it feeds six as a side. It's best on the day; the next day, warm it in the oven for five minutes.</p>
<p>Hosting on Sunday? Order the tray by Friday evening and choose a collection time; we'll cut it into squares for you if you ask in the note.</p>
`,
    },
    // ── Articles ────────────────────────────────────────────────────────
    {
        slug: "why-48-hours",
        title: "Why our sourdough takes 48 hours",
        category: "articles",
        excerpt:
            "Most of a loaf's flavour is made while nobody is touching it. Here is what happens over two days.",
        cover: BUBBLY,
        daysAgo: 175,
        featured: true,
        body: `
<p>People are sometimes surprised that a loaf collected on Saturday morning was started on Thursday. The work itself takes perhaps forty minutes. The rest of the time belongs to the starter, the flour and the cold.</p>
<h2>Thursday evening: the starter</h2>
<p>Our starter is a mix of flour and water that has been fed every day for years. It's full of wild yeasts and lactic bacteria. On Thursday evening we feed it generously and leave it overnight, so by morning it's risen, bubbly and smells like yoghurt and green apples.</p>
${figure(STARTER, "The starter, fed and waiting")}
<h2>Friday morning: the dough</h2>
<p>We mix flour from our own mill with water and leave it for an hour before adding anything else. That rest lets the flour drink the water and the gluten begin to form on its own. Then the starter and salt go in, and for the next few hours we fold the dough every half hour — stretching it over itself, four times round — instead of kneading.</p>
<h2>Friday afternoon: shaping</h2>
<p>When the dough has grown by about half and is full of air, we divide it, shape it into rounds and lay each one in a floured basket.</p>
<h2>Friday night to Saturday: the cold</h2>
<p>The baskets go into the cold room overnight. At low temperatures the yeast slows right down, but the bacteria keep working. They produce the acids that give sourdough its taste — mild and milky from lactic acid, sharper from acetic. A long, cold ferment builds both, and it's the single biggest difference between our loaf and a quick bread.</p>
${figure(CRUMB, "An open crumb is the sign of a slow, even ferment")}
<h2>Saturday, 4am: the bake</h2>
<p>Loaves go straight from the cold into a very hot oven with steam. The cold dough holds its shape, the steam keeps the crust soft long enough for the loaf to spring up, and then the crust darkens and cracks as it bakes. They need at least an hour to cool before they can be cut — the inside is still cooking.</p>
<h2>What you get</h2>
<p>A crust that crackles, a crumb that's moist and open, a flavour that's a little sour without being sharp, and a loaf that keeps three or four days in paper. None of it needs anything added. It just needs the time.</p>
<h2>Why we don't speed it up</h2><p>Commercial bakeries can make a loaf from flour to shelf in under four hours with a lot of yeast and a few additives. It's cheaper and it's consistent. It also tastes of very little, and goes stale within a day. Every time we've tried to shave a few hours off our process — to bake on a busy Diwali morning, say — the loaves have come out paler, flatter and less sour, and our regulars have noticed. So we don't, and the bread costs what two days of work costs.</p>
<p>If you'd like to see it for yourself, come in on a Friday afternoon. The dough will be in its folding stage, and whoever is on the bench will be glad to show you how it feels.</p>
`,
    },
    {
        slug: "what-rye-flour-does",
        title: "What rye does to a loaf",
        category: "articles",
        excerpt:
            "Rye behaves nothing like wheat in the bowl. Why our rye loaf is dense, dark and keeps for a week.",
        cover: WHEAT_SUN,
        daysAgo: 88,
        body: `
<p>Rye and wheat look similar in a field and are milled the same way. In a bowl of dough, they could hardly be more different.</p>
<h2>Very little gluten</h2>
<p>Wheat dough stretches because its proteins form gluten, a net that traps gas and lets a loaf rise tall. Rye has those proteins too, but they barely form a net. A rye dough doesn't stretch; it feels more like clay or a thick paste. You can't fold it the way you fold a wheat dough, and you can't expect it to rise like one.</p>
${figure(GREEN_WHEAT, "Rye and wheat look alike in the field; not in the bowl")}
<h2>Sticky carbohydrates</h2>
<p>What rye has instead is a family of carbohydrates called pentosans, which soak up a great deal of water and turn the dough sticky. They're what hold a rye loaf together, and they're why it stays moist for a week.</p>
<h2>Why it has to be sour</h2>
<p>Rye flour is full of an enzyme that breaks down starch. Left unchecked, it turns the inside of a loaf gummy. Acidity slows the enzyme down — which is why traditional rye breads are almost always sourdough. Our rye &amp; caraway loaf is leavened with a rye starter that's kept more acidic than our wheat one, for exactly this reason.</p>
<h2>How to eat it</h2>
<ul>
<li>Wait a day. Rye bread is better on the second day, once the crumb has set.</li>
<li>Slice it thin — half the thickness of a sourdough slice.</li>
<li>It's good with butter and a little salt, with cheese, or with smoked fish. With the caraway, it's very good with a sharp pickle.</li>
</ul>
${figure(RYE_SLICES, "Thin slices, the day after baking")}
<p>We bake it on Tuesdays and Fridays only. It takes up a whole oven for longer than any other loaf, and it rewards the wait.</p>
<h2>Caraway</h2><p>The caraway in our rye loaf is an old pairing in northern and eastern Europe. The seed's slight aniseed flavour cuts through the sourness of the rye, and many people find it makes the bread easier to like on first taste. We toast the seeds in a dry pan before they go into the dough, which takes the edge off their bitterness.</p><h2>A word on weight</h2><p>A rye loaf the same size as our sourdough weighs almost half as much again. That's the water the pentosans hold. It's also why it costs a little more: more flour goes into it, and it spends longer in the oven.</p>
<p>If you'd like to bake rye at home, start with a mix: one part rye to three parts wheat behaves much more like a familiar dough, and still tastes of rye. A loaf that's all rye is a different craft, and a wet, sticky one. We're happy to sell a kilo of our stoneground rye flour over the counter if you'd like to try.</p>
`,
    },
    {
        slug: "a-bakers-morning",
        title: "A baker's morning on Hill Road",
        category: "articles",
        excerpt:
            "From the 3:30am alarm to the first customer at seven: what happens before the shutter goes up.",
        cover: SCORE,
        daysAgo: 70,
        body: `
<p>The street is quiet at half past three. The first person in turns on the ovens — they need an hour to reach temperature — and the rest of the kitchen follows them in.</p>
<h2>4:00 — the bread</h2>
<p>The loaves that have spent the night in the cold room come out in their baskets. Each one is tipped onto a peel, scored with a razor in one quick stroke, and slid into the oven onto the hot stone. The scoring isn't decoration: it tells the loaf where to open as it rises, so it doesn't burst at the side.</p>
${figure(KNEAD, "Dough for tomorrow is mixed while today's bakes")}
<h2>5:00 — the pastry</h2>
<p>Croissants and pains au chocolat, laminated over the previous three days, are proofing on their trays. They go in when the bread comes out. The cinnamon buns follow, and the kitchen begins to smell the way the street will in an hour.</p>
<h2>6:00 — tomorrow's dough</h2>
<p>While today bakes, tomorrow begins. The starter is fed, the first doughs are mixed and left to rest. The shelves go out front and the coffee machine is warmed up.</p>
<h2>6:30 — the orders</h2>
<p>The day's orders are on a tablet by the bench: who is collecting what, which deliveries leave with the rider, which cakes are due this week and what they say on top. Subscription loaves are set aside by name. Anything with an allergy note is packed first and separately.</p>
${figure(COUNTER, "The counter just before seven")}
<h2>7:00 — the shutter</h2>
<p>The first customers are usually the same three people every morning: a doctor on her way to the hospital, a man who buys one baguette for his mother, and whoever has a train to catch. By eight it's busy. By ten, the bakers who started at half past three are cleaning down, and the kitchen begins again for the afternoon.</p>
<h2>Who does what</h2><p>There are four of us in the kitchen most mornings. One bakes bread, one bakes pastry, one finishes cakes and packs orders, and one runs the counter and the coffee. On Saturdays, with the subscription loaves and the weekend bakes, a fifth person comes in at five. Everyone washes up.</p><p>The hardest part of the job isn't the early start. It's the afternoon: by two o'clock, the people who started at half past three have to make decisions about tomorrow's dough with a tired head. Most of our worst loaves were planned at 2pm.</p>
<p>People ask whether we get tired of the smell. We don't — but we do stop noticing it, which is why the best part of the morning is when a customer walks in at seven, stops in the doorway and breathes in. That's when we remember what it's like.</p>
`,
    },
    {
        slug: "how-we-choose-our-coffee",
        title: "How we choose our coffee",
        category: "articles",
        excerpt:
            "Why a bakery buys its beans from a roaster three hours away, and what we taste for.",
        cover: BEANS,
        daysAgo: 140,
        body: `
<p>Karnataka grows most of India's coffee, and some of the best of it within a few hours' drive of Bengaluru. It would be strange for a bakery on Hill Road to pour anything else.</p>
<h2>Our roaster</h2>
<p>Our beans come from Kaapi Roasters in Chikmagalur, a small roastery that buys directly from estates in the hills around Baba Budangiri — where, the story goes, coffee was first planted in India. They roast our blend every Tuesday and it reaches us within the week.</p>
${figure(COOLING, "Beans leaving the drum to cool")}
<h2>What we taste for</h2>
<p>A bakery's coffee has to work with what's on the plate. We want a coffee that is:</p>
<ul>
<li><strong>Good with milk.</strong> Most of what we pour is a flat white or a cappuccino. The coffee has to come through the milk, not disappear into it.</li>
<li><strong>Chocolatey rather than sharp.</strong> Bright, fruity coffees are wonderful on their own and fight with a buttery croissant.</li>
<li><strong>Forgiving.</strong> Customers brew our beans at home in every kind of filter, French press and moka pot. A blend that only tastes good on a ₹4 lakh espresso machine is no use to them.</li>
</ul>
<h2>Fresh, not too fresh</h2>
<p>Coffee is at its best between about four days and a month after roasting. Straight out of the roaster it's still releasing gas and tastes flat in an espresso. That's why our bags carry the roast date, and why we don't sell a bag that's more than six weeks old.</p>
${figure(LATTE, "The house blend in a flat white")}
<h2>Grind</h2>
<p>We sell whole bean, an espresso grind and a filter grind. If you can, buy whole beans and grind them as you brew: ground coffee loses its aroma within days. If you don't have a grinder, a filter grind suits a South Indian filter, a pour-over and a French press well enough.</p>
<h2>Price</h2><p>Good coffee isn't cheap, and we don't think it should be. A bag of our house blend costs more than the supermarket's, because the estate is paid properly for its beans and the roaster roasts in small batches. In the cup at the counter it works out to a few rupees more than a coffee chain's, for a coffee that's been roasted in the last fortnight.</p>
<h2>Tasting</h2><p>Twice a year, when the roaster sends samples of a new blend, we taste them the way the trade does: ground coffee in a cup, hot water, four minutes, then a spoon and a lot of slurping. We taste each one black and in a flat white, and with a croissant on the side. The one that's still good after the croissant wins. It's not scientific, but it's how our customers drink it.</p>
`,
    },
    {
        slug: "the-mill-on-hill-road",
        title: "Why we mill our own flour",
        category: "articles",
        excerpt:
            "A stone mill a few steps from the oven, and what fresh flour does to a loaf.",
        cover: MILLSTONE,
        daysAgo: 162,
        body: `
<p>At the back of the bakery, past the cold room, there is a small stone mill. Every few days it grinds the wheat and rye that become our bread. It is noisy, it covers everything in a fine dust, and it's the reason our bread tastes the way it does.</p>
<h2>What stone milling keeps</h2>
<p>Industrial flour is made on steel rollers that separate the wheat berry into its parts — the white starchy middle, the bran and the germ — and mostly keep the middle. A stone mill grinds the whole berry together. The germ, with its oils and flavour, stays in.</p>
${figure(WHEAT_SKY, "Our wheat comes from farms in north Karnataka")}
<h2>Why fresh matters</h2>
<p>Those oils are also why stoneground flour doesn't keep for long. Within a few weeks, they start to go stale. Flour milled on Monday and baked on Friday tastes noticeably sweeter and nuttier than flour that has sat in a sack for months — the difference between freshly ground coffee and a tin of ground coffee.</p>
<h2>What it means in the loaf</h2>
<ul>
<li>A deeper, slightly sweet flavour, even in a white loaf.</li>
<li>A dough that drinks more water, which gives a moister crumb.</li>
<li>A little less height than a loaf made with strong roller-milled flour. We think it's worth it.</li>
</ul>
${figure(SHAPE, "Fresh flour makes a softer, thirstier dough")}
<p>We don't mill everything — the croissants need a fine, white flour that a small stone mill can't make. But every loaf of bread you buy from us started as whole grain a few steps from the oven.</p>
<h2>Where the grain comes from</h2><p>Our wheat comes from two farms near Dharwad that grow a traditional variety alongside their main crop, and our rye from a co-operative in Himachal Pradesh — rye is a cool-climate crop and doesn't grow well in Karnataka. Both arrive as whole grain in sacks. We clean it, rest it for a few days and mill it in small batches, a few times a week.</p><p>The mill itself was built for us by a millwright in Mysuru, with granite stones cut from a quarry near Kanakapura. It runs slowly — fast stones get hot and spoil the flour — and grinds about 40 kg an hour.</p>
<p>Visitors often ask to see it. If the mill is running when you come in, ask at the counter and someone will take you to the back for a minute. Wear something you don't mind getting a little flour on.</p>
<p>Fresh flour is also why we bake every day rather than once or twice a week: our bread tastes best when the flour, the dough and the loaf are all only days old.</p>
`,
    },
    {
        slug: "how-to-revive-a-loaf",
        title: "How to revive a day-old loaf",
        category: "articles",
        excerpt:
            "Stale isn't finished. Five minutes in the oven, and four good things to do with what's left.",
        cover: TOAST,
        daysAgo: 55,
        body: `
<p>Sourdough keeps better than most bread, but by day three or four the crust goes leathery and the crumb dries. Nothing has gone wrong; the starch is simply firming up as it cools and loses water. The good news is that it can be undone.</p>
<h2>The five-minute revive</h2>
<ol>
<li>Heat the oven to 200°C.</li>
<li>Run the whole loaf, or the cut piece, quickly under the tap — just enough to wet the crust.</li>
<li>Put it straight on the oven rack for 5 to 8 minutes.</li>
</ol>
<p>The water turns to steam, the heat softens the starch again, and the crust crisps. Eat it within the hour; it won't last a second time.</p>
${figure(SLICED, "Slice what you'll eat, keep the rest whole")}
<h2>Storing it so it lasts</h2>
<ul>
<li>Keep it cut side down on a board, or in a paper bag. Plastic keeps it soft but makes the crust rubbery and, in Bengaluru's humidity, invites mould.</li>
<li>Don't put bread in the fridge. It goes stale faster there than anywhere.</li>
<li>To keep it longer, slice and freeze it on the day. Toast slices straight from the freezer.</li>
</ul>
<h2>Four things to do with the end of a loaf</h2>
<ul>
<li><strong>Toast</strong> — older sourdough makes better toast than fresh.</li>
<li><strong>Croutons</strong> — tear into pieces, toss with olive oil and salt, bake at 180°C for 12 minutes.</li>
<li><strong>Breadcrumbs</strong> — blitz dry pieces and keep in a jar for cutlets.</li>
<li><strong>Bread pudding</strong> — with milk, jaggery, cardamom and a handful of raisins, it's a very good thing to do with a loaf you'd otherwise throw away.</li>
</ul>
${figure(STACKED, "Day-old slices make the best toast")}
<h2>What about mould?</h2><p>In the monsoon, bread can grow mould in two or three days. If you see any, throw the whole loaf away rather than cutting the patch out; the threads you can't see go deeper than the spot you can. This is the best argument for freezing half a loaf on the day you buy it.</p><p>None of this is waste-free virtue for its own sake. A loaf takes us two days and a lot of flour to make, and we'd like every slice of it eaten.</p>
<h2>Which loaves keep best</h2><p>Of everything we bake, the rye &amp; caraway keeps longest — a week, easily. The sourdough keeps three to four days. The baguette is best within the hour and gone by evening, which is why we bake it three times a day. Plan your shopping around that and you'll throw away very little.</p>
<p>And if a loaf goes past saving, the birds in the park behind Hill Road will happily disagree with you.</p>
`,
    },
    {
        slug: "sourdough-and-digestion",
        title: "Sourdough and digestion: what we can and can't say",
        category: "articles",
        excerpt:
            "Some people find sourdough easier to eat. Here is what is known, and what isn't.",
        cover: STARTER,
        daysAgo: 110,
        body: `
<p>One of the things customers tell us most often is that they can eat our bread when other bread leaves them feeling bloated. We hear it often enough that it's worth being careful about what it does and doesn't mean.</p>
<h2>What happens in a long ferment</h2>
<p>Over the 48 hours our dough ferments, the yeasts and bacteria in the starter feed on the flour. They break down some of the starches and some of the sugars that are known to cause discomfort for some people with sensitive digestion. A long fermentation also breaks down some phytic acid, a compound in whole grains.</p>
${figure(BUBBLY, "The work is done by the starter, over two days")}
<h2>What that may mean</h2>
<p>For some people, a slowly fermented loaf may simply feel easier to eat than a fast, yeasted sandwich loaf. That matches what many of our customers say. It doesn't apply to everyone, and the research on it is still limited.</p>
<h2>What it doesn't mean</h2>
<ul>
<li><strong>Sourdough is not gluten-free.</strong> Our bread is made from wheat and rye and contains gluten. It is not safe for anyone with coeliac disease or a wheat allergy, however long it ferments.</li>
<li>It isn't a treatment for anything. If bread regularly makes you unwell, please see a doctor rather than switching loaves and hoping.</li>
</ul>
${figure(CRUMB, "Still wheat, still gluten — just slower")}
<p>What we can promise is simpler: our bread has four ingredients — flour, water, salt and starter — and takes two days to make. If that suits you, we're glad.</p>
<h2>Why we're careful</h2><p>It would be easy to put "gut-friendly" on our labels and sell more bread. Some bakeries do. We'd rather tell you exactly what our bread is and how it's made, and let you decide how it suits you. If a doctor or dietitian has asked you to try a particular kind of bread, tell us — we're happy to tell you the full recipe of anything we bake, including the flours and the timings.</p><p>And if you have a question we can't answer honestly, we'll say so.</p>
<h2>A note on wholegrain</h2><p>Our seeded multigrain and rye loaves have more fibre than our white sourdough, because more of the grain is in them. Fibre is good for most people, but a sudden switch to a lot of it can be uncomfortable. If you're changing what you eat, change it gradually — and if you have a condition that affects what you can eat, take advice from your doctor.</p>
<p>Questions about this are welcome at the counter, any morning.</p>
`,
    },
    {
        slug: "a-cake-from-sketch-to-box",
        title: "A theme cake, from sketch to box",
        category: "articles",
        excerpt:
            "A cricket ground for a tenth birthday: how a custom cake goes from a WhatsApp photo to a box on the counter.",
        cover: PIPE_TIERS,
        daysAgo: 40,
        body: `
<p>Most theme cakes start with a photo. A parent sends us a picture — a cartoon, a cricket ground, a favourite animal — and a line: "something like this, for Saturday". Here is what happens next, using a cricket-ground cake for a ten-year-old called Kabir as the example.</p>
<h2>Day one: the sketch</h2>
<p>We draw the cake back on paper, at its real size, and send a photo of the sketch. A green pitch with a fondant batsman, a set of stumps and a scoreboard on a 1.5 kg cake; "Happy 10th, Kabir!" on the scoreboard. Parents almost always change something: the batsman should wear his team's colours, the score should read 100 not out. That's the point of the sketch.</p>
${figure(PIPING_BAG, "The design is agreed before anything is baked")}
<h2>Day two: the figures and the sponge</h2>
<p>Fondant figures need a day to dry, so they're made first. The batsman's helmet grille takes longest. Meanwhile, the sponges are baked — in this case eggless chocolate truffle — and left to cool completely overnight. A warm sponge can't be filled or covered.</p>
<h2>Day three: building it</h2>
<ol>
<li>The sponge is levelled, split and filled with ganache.</li>
<li>A thin first coat of ganache seals in the crumbs, and the cake goes into the cold.</li>
<li>A second coat, smoothed with a hot palette knife, makes the surface the fondant sits on.</li>
<li>The green fondant goes on, then the pitch and the stumps, then the batsman, then the scoreboard.</li>
</ol>
${figure(DRIP_CAKE, "A finished cake rests in the cold before it travels")}
<h2>Day four: the box</h2>
<p>The cake rests in the cold room until it leaves. Our rider takes it in a flat box on the floor of the car, never on a seat, and it reaches the door in the time slot written in the order.</p>
<p>That's why we ask for 48 hours for an ordinary cake, and why theme cakes are better ordered four or five days ahead. Nothing about it is quick, and we wouldn't want it to be.</p>
<h2>What costs what</h2><p>A theme cake costs more than one of our standard cakes of the same weight — from ₹2,200 a kilo — because most of its price is the figures and the time it takes to make them. A simple design with a printed photo on edible paper costs less than a fully modelled scene. When we send the sketch, we'll tell you if a change will cost more, before we start.</p>
<h2>What we won't make</h2><p>We don't copy cartoon characters exactly, trade marks or a team's official logo; we'll make a cake in their spirit — the colours, the shapes, a jersey number — instead. We also won't put sparklers or anything inedible into the cake itself. Toppers sit on top, on picks, and come off before cutting.</p>
`,
    },
    {
        slug: "three-days-of-a-croissant",
        title: "Three days in the life of a croissant",
        category: "articles",
        excerpt:
            "Eighty-one layers of butter and dough, and why a good croissant can't be made in an afternoon.",
        cover: LAYERS,
        daysAgo: 128,
        body: `
<p>A croissant is mostly air, butter and patience. Ours take three days.</p>
<h2>Day one: the dough</h2>
<p>We make a soft, slightly sweet yeasted dough with milk and white flour, and leave it in the cold overnight. Cold dough is easier to roll and the slow rise gives it flavour.</p>
${figure(CROISSANTS, "Eighty-one layers, if the folds go well")}
<h2>Day two: the lamination</h2>
<p>A flat slab of cultured butter, beaten to the same firmness as the dough, is wrapped inside it. Then the dough is rolled out long, folded in three, turned and rolled again. Each fold multiplies the layers. After four folds there are 81 layers of dough separated by butter.</p>
<p>Temperature is everything. Too warm and the butter melts into the dough; too cold and it shatters into pieces. In Bengaluru's warm months the dough goes back into the cold between every fold, and on the hottest afternoons we don't laminate at all.</p>
<h2>Day three: shaping and baking</h2>
<p>The laminated dough is rolled out, cut into long triangles and rolled up from the wide end. The shaped croissants proof slowly until they wobble when the tray is moved. In the oven, the water in the butter turns to steam and pushes the layers apart, which is what makes the honeycomb inside.</p>
${figure(DUSTED, "Fresh from the oven at 5am")}
<h2>How to tell a good one</h2>
<ul>
<li>It shatters when you bite it and leaves flakes on your shirt.</li>
<li>Cut across, the inside looks like a honeycomb, not like bread.</li>
<li>It tastes of butter, not of sugar.</li>
</ul>
<p>Best eaten within a few hours. A day-old croissant comes back in a hot oven for four minutes — or becomes the start of our almond croissant, which is a story for another day.</p>
<h2>The butter</h2><p>We use a cultured butter from a dairy near Hosur, made from cream that's left to ripen for a day before churning. It has a little more flavour and a little less water than ordinary butter, and it stays pliable at a slightly higher temperature, which matters in a Bengaluru kitchen. It's also the single most expensive thing in the bakery, and the reason our croissant costs ₹180.</p>
<p>The trimmings, by the way, aren't wasted. They become the cinnamon buns. Nothing laminated at Rye &amp; Co. goes in the bin.</p>
<h2>Why not every day</h2><p>Because lamination can't be hurried, we decide on Monday how many croissants we'll bake on Thursday. On a slow week we have a few left by noon; on a busy one we sell out by nine. We'd rather sell out than bake a croissant we laminated in a rush.</p>
`,
    },
    {
        slug: "cinnamon-buns-a-short-history",
        title: "How the cinnamon bun became a Hill Road habit",
        category: "articles",
        excerpt:
            "We started baking them for ourselves. Now we bake two hundred a week.",
        cover: BUNS,
        daysAgo: 78,
        body: `
<p>The cinnamon bun was never meant to be on the shelf. In our first year it was what the bakers ate at six in the morning, made from the croissant dough left over at the end of a lamination.</p>
<h2>Leftovers, at first</h2>
<p>Laminated dough is precious, and trimmings were too good to throw away. We rolled them out, brushed them with butter, cinnamon and brown sugar, rolled them up and baked them in a tin. A regular saw a tray of them through the kitchen door one morning and asked what they cost. We didn't have an answer.</p>
${figure(SWIRL, "Croissant dough, cinnamon and a thin orange glaze")}
<h2>What makes ours different</h2>
<ul>
<li><strong>Laminated dough</strong>, so the bun is flaky at the edges and soft in the middle, rather than bready all through.</li>
<li><strong>A thin orange glaze</strong> instead of a thick cream-cheese icing. It keeps the bun from being too sweet and lets the cinnamon through.</li>
<li><strong>Ceylon cinnamon</strong> from a spice merchant in Kochi — softer and more fragrant than the cassia sold as cinnamon in most shops.</li>
</ul>
<h2>Now</h2>
<p>We bake them every morning, sold single or in a box of six. The six-pack goes out of the state by courier to people who moved away from Bengaluru and miss them. It's the product that has taught us most about packing: the buns travel best a day old, warmed at the other end.</p>
${figure(ICING, "Glazed while still warm")}
<p>If you've never had one, come before nine. They're usually gone by ten.</p>
<h2>How to warm one</h2><p>A cinnamon bun is best on the day it's baked. The next day, five minutes in an oven at 160°C brings it back; a microwave makes it soft, then hard, so we'd avoid it. If you're freezing a box of six, freeze them on the day and warm them from frozen for ten minutes.</p><p>We're often asked for the recipe. It's not a secret: it's our croissant dough, good cinnamon and patience. The patience is the hard part.</p>
<p>The most cinnamon buns anyone has bought from us at once was ninety, for an office in Whitefield on a Friday. We baked them in three batches and the rider made two trips. We'd do it again, with a day's notice.</p>
<h2>The six-pack</h2><p>The box of six was invented by a customer, not by us: she ordered six every Friday for her office and asked if we could stop putting them in two paper bags. We found a box that held six without squashing the glaze, and it has been on the shop ever since.</p>
`,
    },
];
