import type { JournalPost } from "./journal";
import { figure, photo } from "./journal";

/**
 * Leela & Loom's journal: help for customers, shop news and longer
 * articles, all about what the shop on Commercial Street actually sells
 * (`boutique-catalog.ts`). Photos are free-licence Unsplash images, each
 * looked at before it went in.
 */

// --- Help
const PHONE_ORDER = photo(
    "photo-1689799514696-b16af9b53753",
    "A woman in a dark coat holding a phone in both hands",
    "Ruan Richard Rodrigues",
    "https://unsplash.com/@ricdeoliveira",
);
const PHONE_CARD = photo(
    "photo-1758524944006-ba8116008496",
    "A smiling woman holding a phone in one hand and a bank card in the other",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const PARCEL_HANDOVER = photo(
    "photo-1566576721346-d4a3b4eaeb55",
    "Two people handing over a brown cardboard parcel",
    "RoseBox رز باکس",
    "https://unsplash.com/@rosebox",
);
const PARCEL_SUN = photo(
    "photo-1740842028123-56fd319de33a",
    "A plain cardboard box lying in afternoon sunlight",
    "Anastasiya Doicheva",
    "https://unsplash.com/@an_doich",
);
const PAPER_BAG = photo(
    "photo-1644015040594-8924d3ecc0dd",
    "A plain brown paper shopping bag against a grey wall",
    "Tamás Szabó",
    "https://unsplash.com/@tomi_",
);
const NEUTRAL_RAIL = photo(
    "photo-1490481651871-ab68de25d43d",
    "White, cream and black tops on wooden hangers along a rail",
    "Priscilla Du Preez",
    "https://unsplash.com/@priscilladupreez",
);
const TAPE_WHITE = photo(
    "photo-1523901839036-a3030662f220",
    "A white tailor's measuring tape in loose loops",
    "Siora Photography",
    "https://unsplash.com/@siora18",
);
const TAPE_ORANGE = photo(
    "photo-1593059127036-6f447853774b",
    "An orange measuring tape curled on a white table",
    "Nizzah Khusnunnisa",
    "https://unsplash.com/@nizzahkhu",
);
const SUNSCREEN_CHEEK = photo(
    "photo-1646457417455-77a66a9fcf34",
    "A smiling woman with a dab of white cream on her cheek",
    "Ben Masora",
    "https://unsplash.com/@benmasora",
);
const SWATCHES_LEAVES = photo(
    "photo-1748543668676-ea8241cb3886",
    "Three swatches of oil, gel and cream on a peach background with green leaves",
    "ibnu ihza",
    "https://unsplash.com/@mahendra_10",
);
const BUSY_STREET = photo(
    "photo-1580060092295-dbe639fffda3",
    "A busy shopping street in Bengaluru with scooters, walkers and tall shop signs",
    "Andrea Leopardi",
    "https://unsplash.com/@whatyouhide",
);
const BAGS_IN_HAND = photo(
    "photo-1760565030346-4b947220fe3a",
    "A hand holding brown, white, red and black paper shopping bags",
    "Iuliia Pilipeichenko",
    "https://unsplash.com/@pilipeichenko",
);
const PHONE_LAPTOP = photo(
    "photo-1423666639041-f56000c27a9a",
    "Hands holding a phone above an open laptop on a wooden desk",
    "Firmbee.com",
    "https://unsplash.com/@firmbee",
);
const PHONE_SCROLL = photo(
    "photo-1616422403639-282145aa3e73",
    "A woman in a striped top scrolling on her phone",
    "Darya Ezerskaya",
    "https://unsplash.com/@darya_ezerskaya",
);
const GIFT_PINK = photo(
    "photo-1513201099705-a9746e1e201f",
    "A gift wrapped in kraft paper with a pink satin ribbon",
    "Jess Bailey",
    "https://unsplash.com/@jessbaileydesigns",
);
const GIFT_OLIVE = photo(
    "photo-1668127039852-0e7c8b3a1601",
    "A white box tied with an olive green ribbon",
    "Raelle Cameron",
    "https://unsplash.com/@raegocreative",
);
const PACKING_BOX = photo(
    "photo-1449247666642-264389f5f5b1",
    "Someone packing a cardboard box on a white work table",
    "Bench Accounting",
    "https://unsplash.com/@benchaccounting",
);
const FOREARMS = photo(
    "photo-1621784178022-aae590591234",
    "A woman's crossed forearms in soft window light",
    "Chase Yi",
    "https://unsplash.com/@chaseyi_",
);
const DROPPER_SAND = photo(
    "photo-1638609927093-fc8ac17d3295",
    "A black dropper lying on sand, a drop of golden oil at its tip",
    "Birgith Roosipuu",
    "https://unsplash.com/@msbirgith",
);
const HAND_WASH = photo(
    "photo-1686998424052-0628b670f7fb",
    "Hands washing a white cloth in a basin of soapy water",
    "Ivan Pergasi",
    "https://unsplash.com/@crazyivan_ita",
);
const LINE_SHADE = photo(
    "photo-1785007618849-8e64a06bbe84",
    "Printed cotton clothes drying on a line in the shade of a verandah",
    "Ivett M",
    "https://unsplash.com/@ivett_m",
);
const SATIN_BLUE = photo(
    "photo-1676696663276-d556eea4f577",
    "Soft folds of pale blue satin",
    "Jatin Gajjar",
    "https://unsplash.com/@j3gajjar",
);

// --- News
const POLKA_RED = photo(
    "photo-1786865573488-220ead0edf93",
    "A woman in a red polka dot midi dress leaning on a black railing",
    "Zulfugar Karimov",
    "https://unsplash.com/@zulfugarkarimov",
);
const SLIP_WINE = photo(
    "photo-1572004862713-255fc4866dad",
    "A woman in a wine red satin slip dress among dark green leaves",
    "Tiko Giorgadze",
    "https://unsplash.com/@domenika",
);
const AMBER_LINEN = photo(
    "photo-1671493235081-5842463637cd",
    "An amber glass bottle lying on striped cotton cloth",
    "Denise Chan",
    "https://unsplash.com/@elchan",
);
const DROPPER_PLATE = photo(
    "photo-1575249142951-35b95b9bb5b7",
    "A black dropper bottle on a small white plate beside a brass ornament",
    "Content Pixie",
    "https://unsplash.com/@contentpixie",
);
const RANGOLI_DIYAS = photo(
    "photo-1635192592106-77a5aacbe1a3",
    "A flower rangoli ringed with lit clay diyas",
    "Suchandra Roy Chowdhury",
    "https://unsplash.com/@artsy_lens21",
);
const FESTIVE_BAGS = photo(
    "photo-1648544365218-188e3d07dcac",
    "Two paper shopping bags beside a glowing lamp against a red curtain",
    "Archer Fu",
    "https://unsplash.com/@yeehawprint",
);
const WHITE_DROPPER = photo(
    "photo-1576426863848-c21f53c60b19",
    "A white dropper bottle with a gold collar on a marble block",
    "Content Pixie",
    "https://unsplash.com/@contentpixie",
);
const DROPPER_BROWN = photo(
    "photo-1707539160277-e39464517645",
    "A glass dropper bottle of amber serum against a brown backdrop with dried grass",
    "George Dagerotip",
    "https://unsplash.com/@dagerotip",
);
const RAIN_STREET = photo(
    "photo-1560318958-322c6ad14c3a",
    "A rainy Indian street with taxis, overhead wires and an umbrella",
    "Thanuj Mathew",
    "https://unsplash.com/@thanujmathew",
);
const PRINT_RAIL = photo(
    "photo-1612423284934-2850a4ea6b0f",
    "Patterned blouses and dresses on wooden hangers along a rail",
    "Aviv Rachmadian",
    "https://unsplash.com/@avivrchmdn",
);
const BLUSH_RAIL = photo(
    "photo-1573879500655-98f2012dd1db",
    "Blush and rust dresses hanging on a black rail",
    "Highlight ID",
    "https://unsplash.com/@highlightid",
);
const LEANING_MIRROR = photo(
    "photo-1545805523-45ff2b97a766",
    "A tall mirror leaning on a wall beside a wooden stool in a sunlit room",
    "Hc Digital",
    "https://unsplash.com/@hcdigital",
);
const GIFT_GOLD = photo(
    "photo-1513885045260-6b3086b24c17",
    "A kraft paper gift tied with gold glitter ribbon",
    "freestocks",
    "https://unsplash.com/@freestocks",
);
const OIL_DROP = photo(
    "photo-1515377905703-c4788e51af15",
    "A drop of oil falling from an amber bottle into an open palm",
    "Christin Hume",
    "https://unsplash.com/@christinhumephoto",
);
const KURTA_MANNEQUIN = photo(
    "photo-1760287364219-160c234ded00",
    "A navy printed kurta dress on a mannequin inside a clothes shop",
    "Zayed Ahmed Zadu",
    "https://unsplash.com/@zayed_ahmed_zadu",
);
const KURTA_BLOCK = photo(
    "photo-1745313452052-0e4e341f326c",
    "A woman in a white kurta with block-printed pink flowers",
    "Shahenaz India",
    "https://unsplash.com/@shahenazindia",
);
const CREAM_OPEN = photo(
    "photo-1763503836825-97f5450d155a",
    "An open jar of white cream resting on a dark rock",
    "Eveling Salazar",
    "https://unsplash.com/@eve__3d",
);
const ROSE_BOWL = photo(
    "photo-1762328837175-672d686c1bae",
    "Pink rose petals in a bowl of water on white marble",
    "Zulfugar Karimov",
    "https://unsplash.com/@zulfugarkarimov",
);

// --- Articles
const SLIP_COAT = photo(
    "photo-1790802243983-e6de0e275f59",
    "A woman in a silver satin slip dress with a long black coat",
    "Marina Nazina",
    "https://unsplash.com/@nazinamari",
);
const SLIP_BLACK = photo(
    "photo-1594019739447-6c8a1d744d61",
    "A woman in a black satin slip dress by a sheer curtain",
    "Eugenia Pan'kiv",
    "https://unsplash.com/@eugenivy_now",
);
const SLIP_CHAIR = photo(
    "photo-1685790766893-77aa335953a2",
    "A woman in a dark green satin slip dress sitting on a wrought-iron chair",
    "Look Studio",
    "https://unsplash.com/@lookphoto",
);
const TREE_ROAD = photo(
    "photo-1708884831332-56f4e081fabe",
    "A tree-lined Bengaluru road with an auto rickshaw",
    "Zoshua Colah",
    "https://unsplash.com/@zoshuacolah",
);
const MIRROR_ROUTINE = photo(
    "photo-1775642544067-c4ad1eceba5b",
    "A woman patting cream into her skin in front of a mirror in warm light",
    "Christian Agbede",
    "https://unsplash.com/@chriscreations__",
);
const CREAM_FLOAT = photo(
    "photo-1763503839418-2b45c3d7a3c3",
    "A jar of white cream with its lid lifted, above a grey rock",
    "Eveling Salazar",
    "https://unsplash.com/@eve__3d",
);
const DROPPER_ORANGE = photo(
    "photo-1713768704571-6aeb0d0e5105",
    "An amber dropper bottle with a blank label on an orange background",
    "Point Normal",
    "https://unsplash.com/@normals",
);
const OIL_SWATCHES = photo(
    "photo-1748543668709-793b38a2810d",
    "Round swatches of golden oil, clear gel and pale serum on a peach background",
    "ibnu ihza",
    "https://unsplash.com/@mahendra_10",
);
const DROPPER_PINK = photo(
    "photo-1741896135512-084b251887f7",
    "A glass bottle of serum and its dropper on a pink surface",
    "Maria Lupan",
    "https://unsplash.com/@luandmario",
);
const MAN_SINK = photo(
    "photo-1566812867654-afe8da1e4302",
    "A man bending over a white basin, washing his face",
    "Trần Toàn",
    "https://unsplash.com/@kentro",
);
const BEARD_MAN = photo(
    "photo-1672761431764-61b8d9a00dbb",
    "A bearded man in a black T-shirt running his fingers through his beard",
    "Lance Reis",
    "https://unsplash.com/@lancereis",
);
const SHAVE_KIT = photo(
    "photo-1524230616393-d6229fcd2eff",
    "A shaving brush, a straight razor and a cream-coloured mug of lather",
    "Josh Sorenson",
    "https://unsplash.com/@joshsorenson",
);
const OFFICE_BLAZER = photo(
    "photo-1774850236254-f0aa024ca20c",
    "A smiling woman in a cream blazer and black trousers in an office corridor",
    "Skytech Aviation",
    "https://unsplash.com/@skytechaviation0",
);
const TERRACOTTA_SHIRTDRESS = photo(
    "photo-1789110853833-bc1a883da2d6",
    "A woman in a terracotta belted shirt dress, hands on her hips",
    "engin akyurt",
    "https://unsplash.com/@enginakyurt",
);
const WHITE_KURTA = photo(
    "photo-1731577506253-0fd9cd00ab7f",
    "A woman in a white kurta and printed trousers standing in an arched alcove",
    "Naseebo",
    "https://unsplash.com/@naseebo",
);
const LINEN_SHIFT = photo(
    "photo-1747396206869-75ea57b325ce",
    "A woman in a simple sand-coloured linen dress against a white wall",
    "Reistor",
    "https://unsplash.com/@reistor",
);
const LINEN_STACK = photo(
    "photo-1622532470022-24107cac5ef3",
    "A stack of folded linen in mustard, pink, sage, navy and green",
    "Ekaterina Grosheva",
    "https://unsplash.com/@kitkat93",
);
const UMBRELLA_RAIN = photo(
    "photo-1753269045298-08cb92bd7374",
    "A woman in red walking with an umbrella on a rainy street",
    "Saad Ahmad",
    "https://unsplash.com/@saadahmad_umn",
);
const KRAFT_TUBE = photo(
    "photo-1737007516314-27508948ab4e",
    "A kraft paper tube and a small tin on a white plinth",
    "Bharath Kumar",
    "https://unsplash.com/@bharath9110",
);
const DAB_UNDER_EYE = photo(
    "photo-1602144564445-159e5e5bae55",
    "A smiling woman dotting cream onto her cheekbone",
    "Benigno Hoyuela",
    "https://unsplash.com/@benignohoyuela",
);
const CREAM_DOTS = photo(
    "photo-1618871588239-18017db1dc15",
    "A woman with dots of white cream on her cheek in evening light",
    "Valentin Lacoste",
    "https://unsplash.com/@valentinlacoste",
);
const JHUMKAS = photo(
    "photo-1714733831162-0a6e849141be",
    "A pair of silver and gold jhumka earrings on white embroidered cloth",
    "Johny Silver",
    "https://unsplash.com/@johnysilver",
);
const WRAP_MAXI = photo(
    "photo-1496747611176-843222e1e57c",
    "A woman in an ivory floral wrap maxi dress walking by the sea with a woven bag",
    "Tamara Bellis",
    "https://unsplash.com/@tamarabellis",
);
const MARIGOLDS = photo(
    "photo-1699764681875-dd04ce36b1c3",
    "A heap of orange marigold flowers",
    "Himanshu Soni",
    "https://unsplash.com/@himanshusoni",
);
const SAFFRON_JAR = photo(
    "photo-1643471672168-f4a4b6cfa440",
    "Saffron threads spilling from a small glass jar",
    "Syed F Hashemi",
    "https://unsplash.com/@sfhashemi",
);
const TURMERIC_BOWL = photo(
    "photo-1781773338964-bc0e969d2973",
    "A hand stirring turmeric in a wooden bowl, with seeds in bowls beside it",
    "alishefi",
    "https://unsplash.com/@alishefi",
);
const OIL_POUR = photo(
    "photo-1747303969063-3b90bcb3942e",
    "A dropper drawing golden oil from a small bottle in warm light",
    "Mona Jain",
    "https://unsplash.com/@monajain",
);

export const LEELA_POSTS: readonly JournalPost[] = [
    // ------------------------------------------------------------ Help
    {
        slug: "how-to-place-an-order",
        title: "How to place an order",
        category: "help",
        excerpt:
            "From your bag to your door in four steps, and what to do if a payment does not go through.",
        cover: PHONE_ORDER,
        daysAgo: 170,
        body: `<p>Ordering from Leela &amp; Loom takes about two minutes. Here is the whole thing, step by step.</p>
<h2>1. Add what you like to your bag</h2>
<p>Pick a size or colour on the product page first. Dresses show sizes XS to XXL where we stock them; serums and creams show the volume, such as 15 ml or 30 ml for the Vitamin C 10% Brightening Serum. If a size is greyed out, it has sold out for now.</p>
<h2>2. Check your bag</h2>
<p>Your bag shows the delivery charge before you pay. Delivery is free on orders over ₹1,499; below that it is ₹79 anywhere in India. If you have a discount code, enter it here.</p>
<h2>3. Tell us where it is going</h2>
<p>Add your address and a phone number the courier can reach. You can also choose to collect from our shop at 14 Commercial Street instead, and pay nothing for delivery.</p>
<h2>4. Pay</h2>
<p>We take UPI and debit or credit cards. Once the payment goes through, you will see a confirmation page and get an email with your order number.</p>
${figure(PHONE_CARD, "UPI or card, whichever is easier")}
<h3>If a payment fails</h3>
<p>If money leaves your account but you do not see a confirmation, please do not pay again straight away. Failed payments are usually reversed by your bank within five to seven working days. Write to us with the time and amount, and we will check it for you.</p>
<h3>Your account</h3>
<p>If you sign in when you order, every order you place shows up in your account, with its status and what was in it. It is the easiest way to find an order number later.</p>`,
    },
    {
        slug: "tracking-your-order-and-delivery-times",
        title: "Tracking your order, and how long delivery takes",
        category: "help",
        excerpt:
            "Where to find your tracking link, how long parcels take to reach Bengaluru, the metros and everywhere else, and what to do if one is late.",
        cover: PARCEL_HANDOVER,
        daysAgo: 165,
        body: `<p>We pack orders at the shop on Commercial Street every day except Tuesday. Once your parcel is with the courier, we send you an email with a tracking link. The same link sits on the order in your account.</p>
<h2>How long it takes</h2>
<ul>
<li><strong>Bengaluru:</strong> 1–2 working days</li>
<li><strong>Other metros</strong> (Mumbai, Delhi NCR, Chennai, Hyderabad, Kolkata, Pune): 3–5 working days</li>
<li><strong>Everywhere else in India:</strong> 5–7 working days</li>
</ul>
<p>Orders placed after 4pm, or on a Tuesday, go out the next working day. Sundays and public holidays do not count as working days for most couriers.</p>
${figure(PARCEL_SUN, "Every order leaves in a plain, recyclable box")}
<h2>Delivery charges</h2>
<p>Delivery is free on orders over ₹1,499. Below that, it is a flat ₹79 wherever you are.</p>
<h2>If your parcel is late</h2>
<p>Check the tracking link first: during heavy rain or a festival rush, couriers sometimes hold parcels for a day at the local hub. If the tracking has not moved for three working days, write to us with your order number. We will chase the courier and tell you what we hear.</p>
<p>If a parcel shows as delivered but you have not received it, ask at your building gate or with neighbours first, then let us know within 48 hours so we can raise it with the courier.</p>`,
    },
    {
        slug: "returns-and-exchanges",
        title: "Returns and exchanges",
        category: "help",
        excerpt:
            "Dresses can be exchanged within seven days with the tags on. Skincare can be returned within seven days if it is unopened.",
        cover: PAPER_BAG,
        daysAgo: 160,
        body: `<p>We want you to love what you bought. When something is not right, here is how we put it right.</p>
<h2>Dresses: exchange within 7 days</h2>
<p>You can exchange a dress for another size or colour, or for something else in the shop, within 7 days of delivery. The dress needs to be unworn and unwashed, with its tags still on. Size swaps ship free.</p>
<p>To start an exchange, write to us with your order number and what you would like instead. We will arrange a pickup, or you can bring the dress to the shop on Commercial Street.</p>
${figure(NEUTRAL_RAIL, "Exchanges go back on the rail, so please keep the tags on")}
<h2>Skincare: return if unopened</h2>
<p>Serums, moisturisers, cleansers and grooming products can be returned within 7 days of delivery if they are unopened and the seal is intact. Once a product has been opened, we cannot take it back, for hygiene reasons. That is also why we always suggest a patch test before you use something new on your face.</p>
<p>If a product arrives damaged or leaking, that is different: send us a photo within 48 hours and we will replace it.</p>
<h2>Refunds</h2>
<p>For an approved skincare return, we refund to the way you paid, UPI or card, within 5–7 working days of the parcel reaching us.</p>
<h2>What we cannot exchange</h2>
<ul>
<li>Dresses that have been worn, washed or altered</li>
<li>Items bought more than 7 days ago</li>
<li>Opened skincare that is not damaged</li>
</ul>`,
    },
    {
        slug: "dress-size-guide",
        title: "Size guide for our dresses",
        category: "help",
        excerpt:
            "Bust and waist measurements in inches for XS to XXL, how to measure yourself, and which of our dresses run relaxed.",
        cover: TAPE_WHITE,
        daysAgo: 150,
        body: `<p>All our dresses are cut to the same size chart. Measure yourself once, and you will know your size across the shop.</p>
<h2>The chart</h2>
<ul>
<li><strong>XS:</strong> bust 32", waist 26"</li>
<li><strong>S:</strong> bust 34", waist 28"</li>
<li><strong>M:</strong> bust 36", waist 30"</li>
<li><strong>L:</strong> bust 38", waist 32"</li>
<li><strong>XL:</strong> bust 40", waist 34"</li>
<li><strong>XXL:</strong> bust 42", waist 36"</li>
</ul>
<h2>How to measure</h2>
<ol>
<li><strong>Bust:</strong> wrap the tape around the fullest part of your chest, under your arms, keeping it level at the back.</li>
<li><strong>Waist:</strong> measure around your natural waist, the narrowest part, usually just above the navel.</li>
<li>Keep the tape snug but not tight, and breathe out normally.</li>
</ol>
${figure(TAPE_ORANGE, "A soft tailor's tape gives the truest number")}
<h2>Between sizes?</h2>
<p>For fitted styles like the Red Polka Dot Midi Dress and the Bias-Cut Satin Slip Dress, go by your bust and size up if you are between two. For relaxed styles like the Belted Linen Shirt Dress, the Sage Tiered Sundress and the Floral Wrap Maxi Dress, your usual size is fine; the belt or the wrap tie takes care of the waist.</p>
<p>The Chambray Button-Down Dress comes in one relaxed fit that suits sizes S to L.</p>
<p>Each product page also tells you what size the model is wearing and how tall she is. And if you are still unsure, send us your measurements and we will tell you what we would pick.</p>`,
    },
    {
        slug: "choosing-your-sunscreen-shade",
        title: "Choosing your shade of Sheer Tint Sunscreen",
        category: "help",
        excerpt:
            "Fair, Medium or Deep: how to pick the right tint without trying it on, and what to do if you get it wrong.",
        cover: SUNSCREEN_CHEEK,
        daysAgo: 120,
        body: `<p>Our Sheer Tint Sunscreen SPF 50 PA++++ comes in three shades: <strong>Fair</strong>, <strong>Medium</strong> and <strong>Deep</strong>. The tint is light, so it evens things out rather than covering them, which means the shades are forgiving. Still, a close match looks best.</p>
<h2>A quick way to choose</h2>
<ul>
<li><strong>Fair</strong> suits lighter skin that burns easily and looks pinkish or pale beige.</li>
<li><strong>Medium</strong> suits most wheatish and light-brown skin, which is where most of our customers land.</li>
<li><strong>Deep</strong> suits deeper brown skin. It leaves no grey or white cast.</li>
</ul>
<p>If you wear a foundation or a tinted cream already, pick the shade that sounds closest to it. If you are between two, choose the deeper one: a sheer tint that is a touch deep blends in; one that is too light can look ashy.</p>
${figure(SWATCHES_LEAVES, "Swatch along your jawline, not the back of your hand")}
<h2>Try it at the shop</h2>
<p>We keep testers of all three shades at 14 Commercial Street. Swatch them on your jaw near a window and see which one disappears.</p>
<h2>If you picked the wrong shade</h2>
<p>As long as the tube is unopened and sealed, you can return it within 7 days. Once it has been opened, we cannot take it back, so it is worth swatching first if you can.</p>
<p>Prefer no tint at all? The Aqua Gel Sunscreen SPF 50 is clear and works on every skin tone.</p>`,
    },
    {
        slug: "collecting-from-the-shop",
        title: "Collecting your order from the shop",
        category: "help",
        excerpt:
            "Order online and pick it up on Commercial Street with no delivery charge. Here is how it works and what to bring.",
        cover: BUSY_STREET,
        daysAgo: 140,
        body: `<p>If you live or work near central Bengaluru, you can skip the courier and collect your order from us.</p>
<h2>How to choose it</h2>
<p>At checkout, pick <strong>Collect from the shop</strong> instead of delivery. There is no delivery charge, whatever the order size.</p>
<h2>When it is ready</h2>
<p>Most orders are ready the same day if you order before 4pm. We send you an email when it is packed and waiting. We hold collections for 7 days; after that, we will get in touch before we cancel and refund.</p>
<h2>Where to find us</h2>
<p>Leela &amp; Loom, 14 Commercial Street, Bengaluru 560001. We are open 11am to 8:30pm every day except Tuesday, when the shop is closed.</p>
${figure(BAGS_IN_HAND, "Your order, bagged and waiting at the counter")}
<h2>What to bring</h2>
<ul>
<li>Your order number, on your phone is fine</li>
<li>If someone else is collecting for you, send us their name, and ask them to show the order email</li>
</ul>
<h2>Try before you take it home</h2>
<p>One nice thing about collecting: you can try a dress on at the shop when you pick it up. If the size is wrong, we can swap it there and then, as long as we have the other size in stock.</p>
<p>Parking on Commercial Street is hard at the weekend. The metro to MG Road and a short walk is usually quicker.</p>`,
    },
    {
        slug: "using-a-discount-code",
        title: "Using a discount code",
        category: "help",
        excerpt:
            "Where to enter a code, the codes running now, and why a code might not apply.",
        cover: PHONE_LAPTOP,
        daysAgo: 16,
        body: `<p>Discount codes go in your bag, before you pay. Type the code into the box marked <strong>Discount code</strong> and tap <strong>Apply</strong>. The new total shows straight away.</p>
<h2>Codes running now</h2>
<ul>
<li><strong>WELCOME100</strong> takes ₹100 off your first order with us.</li>
<li><strong>GLOW15</strong> takes 15% off our serums this festive season: the Vitamin C 10% Brightening Serum, the Niacinamide 5% Clarifying Serum, the Hyaluronic Water-Drop Serum and the Saffron &amp; Kumkumadi Night Face Oil.</li>
</ul>
${figure(PHONE_SCROLL, "Codes are entered in your bag, not at payment")}
<h2>Why a code might not work</h2>
<ol>
<li><strong>A typo.</strong> Codes are not case-sensitive, but spaces count. Try typing it rather than pasting it.</li>
<li><strong>It has already been used.</strong> WELCOME100 works once per customer.</li>
<li><strong>Nothing in your bag qualifies.</strong> GLOW15 applies only to serums; a bag of dresses will not change.</li>
<li><strong>It has ended.</strong> Festive codes have an end date, which we put in the post or email that announced them.</li>
</ol>
<p>Only one code can be used per order. If you have two, use the one that saves you more; the bag shows you the difference before you pay.</p>
<p>Forgot to add a code? Write to us within a day of ordering and we will see what we can do, but we cannot promise to apply it after the fact.</p>`,
    },
    {
        slug: "sending-an-order-as-a-gift",
        title: "Sending an order as a gift",
        category: "help",
        excerpt:
            "Ship straight to someone else, add a note, and keep the prices out of the box.",
        cover: GIFT_PINK,
        daysAgo: 25,
        body: `<p>A lot of our orders this time of year are presents. Sending one is simple.</p>
<h2>Ship it to them</h2>
<p>At checkout, enter their name and address as the delivery address, and your own email for updates. Use a phone number that the courier can reach them on, or the parcel may be held.</p>
<h2>Add a note</h2>
<p>There is a box at checkout called <strong>Note for us</strong>. Write "Gift" and your message, up to a few lines, and we will hand-write it on a card and tuck it in.</p>
<h2>No prices in the box</h2>
<p>When an order is marked as a gift, we leave the invoice out of the parcel. You still get it by email, and it stays in your account.</p>
${figure(GIFT_OLIVE, "A plain box, a ribbon and your card")}
<h2>Ideas that travel well</h2>
<ul>
<li>The Daily Grooming Kit (₹1,799), which already comes in a gift-ready box</li>
<li>The Saffron &amp; Kumkumadi Night Face Oil (₹1,299)</li>
<li>The Kannauj Rose Water Toner Mist (₹399), an easy add-on</li>
</ul>
<p>If you are sending a dress and not sure of their size, choose a relaxed style like the Floral Wrap Maxi Dress, which adjusts with its tie. They can still exchange it within 7 days, tags on.</p>
${figure(PACKING_BOX, "We pack gift orders by hand at the shop")}`,
    },
    {
        slug: "how-to-patch-test",
        title: "How to patch test a new product",
        category: "help",
        excerpt:
            "Two minutes now can save you a week of irritated skin. Here is how we suggest testing anything new.",
        cover: FOREARMS,
        daysAgo: 100,
        body: `<p>Even gentle products can disagree with some skin. A patch test is the simplest way to find out before you put something all over your face.</p>
<h2>How to do it</h2>
<ol>
<li>Choose a small, clean patch of skin: the inside of your forearm, or just behind your ear or along the jawline.</li>
<li>Apply a small amount, about the size of a ten-rupee coin, the way you would normally use it.</li>
<li>Leave it on and do the same once a day for three days.</li>
<li>Watch for redness, itching, burning or small bumps.</li>
</ol>
<p>If nothing happens after three days, you are probably fine to start using it on your face, slowly at first.</p>
${figure(DROPPER_SAND, "A drop is enough for a patch test")}
<h2>When it matters most</h2>
<ul>
<li>Products with active ingredients, such as the Vitamin C 10% Brightening Serum, the Niacinamide 5% Clarifying Serum or the Overnight Bakuchiol Repair Cream</li>
<li>Anything with essential oils or fragrance, such as the Cedar &amp; Vetiver Beard Oil</li>
<li>If you have sensitive skin, eczema, or have reacted to products before</li>
</ul>
<h2>If your skin reacts</h2>
<p>Wash the area with plain water and stop using the product. A mild reaction usually settles in a day or two. If it does not, or if you notice swelling, please see a doctor or a dermatologist.</p>
<p>A patch test does not open the product's seal, and it does not count as using it up; but once a product has been opened, we cannot take it back. For many of our serums, we can give you a small sample at the shop to test first. Just ask.</p>`,
    },
    {
        slug: "caring-for-linen-and-satin",
        title: "Caring for linen and satin",
        category: "help",
        excerpt:
            "Hand wash cold, dry in the shade, and a few tricks for creases. How to keep our linen and satin dresses looking new.",
        cover: HAND_WASH,
        daysAgo: 85,
        body: `<p>Linen and satin are the two fabrics people ask us about most. Neither is fussy, but each likes to be treated a certain way.</p>
<h2>The basics, for every dress</h2>
<ul>
<li><strong>Hand wash in cold water</strong> with a mild liquid detergent.</li>
<li><strong>Do not wring.</strong> Press the water out gently, or roll the dress in a towel.</li>
<li><strong>Dry in the shade.</strong> Strong sun fades colour, especially terracotta, rust and wine.</li>
<li>Wash dark colours separately the first few times.</li>
</ul>
${figure(LINE_SHADE, "Dry on a line in the shade, not in full sun")}
<h2>Linen</h2>
<p>Our Belted Linen Shirt Dress is made from pre-washed linen, so it will not shrink, and it gets softer every time you wash it. Linen creases; that is part of its charm. If you want a crisper look, iron it warm while it is still slightly damp, on the inside.</p>
<p>In the monsoon, linen can take a while to dry indoors. Hang it under a fan rather than folding it damp, or it can smell musty.</p>
<h2>Satin</h2>
<p>The Bias-Cut Satin Slip Dress is the one to be gentle with.</p>
<ol>
<li>Turn it inside out before washing.</li>
<li>Swish it in cold water; do not scrub.</li>
<li>Lay it flat on a towel to dry, or hang it on a padded hanger.</li>
<li>Iron on the lowest setting, inside out, with a cotton cloth between the iron and the satin.</li>
</ol>
<p>Avoid spraying perfume directly onto satin: it can leave marks.</p>
${figure(SATIN_BLUE, "Satin shows water marks if it dries in patches, so let it dry evenly")}`,
    },

    // ------------------------------------------------------------ News
    {
        slug: "the-festive-edit-is-in",
        title: "The festive edit is in",
        category: "news",
        featured: true,
        excerpt:
            "Red polka dots, wine satin and rust cotton-linen: what we have picked for Navratri, Diwali and the weddings in between.",
        cover: POLKA_RED,
        daysAgo: 22,
        body: `<p>The festive edit is on the rails at Commercial Street and on the site from today.</p>
<p>We wanted dresses you can wear to a Diwali lunch, a cousin's sangeet and an office party without buying three outfits. So the edit is built around colour rather than embellishment:</p>
<ul>
<li><strong>The Red Polka Dot Midi Dress</strong> (₹1,899): cherry red crepe, lined to the knee, with a slit that makes dancing easy.</li>
<li><strong>The Bias-Cut Satin Slip Dress in Wine</strong> (₹2,299): heavy, fluid satin that looks right under fairy lights.</li>
<li><strong>The Rust Cottage Maxi Dress</strong> (₹3,499): bishop sleeves, a smocked bodice and side pockets.</li>
<li><strong>The Dot-Print Flared Georgette Dress</strong> (₹2,599): a full, twirling skirt in ivory or black.</li>
</ul>
${figure(SLIP_WINE, "The wine slip, our favourite of the edit")}
<p>Come in and try them on: the shop is open 11am to 8:30pm, every day except Tuesday. Online orders over ₹1,499 ship free.</p>`,
    },
    {
        slug: "glow15-serums-this-festive-season",
        title: "15% off serums this festive season",
        category: "news",
        excerpt: "Use GLOW15 for 15% off all four of our serums until Diwali.",
        cover: AMBER_LINEN,
        daysAgo: 18,
        body: `<p>From today until Diwali on 8 November, the code <strong>GLOW15</strong> takes 15% off every serum we make:</p>
<ul>
<li>Vitamin C 10% Brightening Serum, from ₹549</li>
<li>Niacinamide 5% Clarifying Serum, from ₹599</li>
<li>Hyaluronic Water-Drop Serum, from ₹649</li>
<li>Saffron &amp; Kumkumadi Night Face Oil, ₹1,299</li>
</ul>
<p>Enter the code in your bag before you pay. It works on both sizes of each serum, and on as many bottles as you like, but cannot be combined with WELCOME100.</p>
${figure(DROPPER_PLATE, "All four serums are part of the offer")}
<p>Not sure which one to choose? Our article on niacinamide and vitamin C goes through who each one suits. And if you are new to any of them, please patch test first.</p>`,
    },
    {
        slug: "shop-hours-over-diwali-2026",
        title: "Our shop hours over Diwali",
        category: "news",
        excerpt:
            "Longer evenings in the week before Diwali, open on Tuesday 3 November, and a short break after.",
        cover: RANGOLI_DIYAS,
        daysAgo: 6,
        body: `<p>Diwali falls on Sunday 8 November this year. Here is when you can find us at 14 Commercial Street:</p>
<ul>
<li><strong>Sunday 1 to Saturday 7 November:</strong> 11am to 9:30pm, an hour later than usual.</li>
<li><strong>Tuesday 3 November:</strong> open, for once, 11am to 9:30pm.</li>
<li><strong>Sunday 8 November (Diwali):</strong> 11am to 3pm.</li>
<li><strong>Monday 9 and Tuesday 10 November:</strong> closed.</li>
<li><strong>Wednesday 11 November:</strong> back to our usual 11am to 8:30pm.</li>
</ul>
${figure(FESTIVE_BAGS, "Gift wrapping is free at the counter all week")}
<h2>Online orders</h2>
<p>Orders placed by noon on Friday 6 November should reach Bengaluru addresses before Diwali. Orders placed from Saturday 7 to Tuesday 10 November will be packed on Wednesday 11 November.</p>
<p>From all of us at Leela &amp; Loom, a very happy Diwali.</p>`,
    },
    {
        slug: "hyaluronic-serum-back-in-50-ml",
        title: "The Hyaluronic Water-Drop Serum is back in 50 ml",
        category: "news",
        excerpt: "The bigger bottle sold out in August. It is back, at ₹949.",
        cover: WHITE_DROPPER,
        daysAgo: 40,
        body: `<p>The 50 ml Hyaluronic Water-Drop Serum sold out in the second week of August, when air conditioners and a dry spell sent everyone looking for it. It is back on the shelf and online today, at ₹949. The 30 ml bottle stays at ₹649.</p>
<p>If you have not tried it: it is a water-light serum with three weights of hyaluronic acid, centella and a little glycerin. Press it into damp skin, then seal it with a moisturiser such as our Oat &amp; Ceramide Gel Moisturiser.</p>
${figure(DROPPER_BROWN, "Use it on damp skin, then moisturise")}
<p>We made a larger batch this time, so it should last through the festive season. If you would like a reminder the next time it runs low, sign in and add it to your bag; we will let you know before it sells out again.</p>`,
    },
    {
        slug: "monsoon-sale-has-ended",
        title: "The monsoon sale has ended",
        category: "news",
        excerpt:
            "Thank you for a busy three weeks. Prices are back to normal, and the dresses that sold out are being restocked.",
        cover: RAIN_STREET,
        daysAgo: 62,
        body: `<p>Our monsoon sale ended at midnight. Thank you to everyone who came into the shop in the rain, and to the many of you who ordered from Shillong, Kochi and Goa.</p>
<p>A few things you asked about:</p>
<ul>
<li><strong>Orders placed during the sale</strong> are all packed. If yours has not shipped yet, it will by Monday.</li>
<li><strong>Prices are back to normal</strong> from today. If you bought something just before the sale started, we are sorry, but we cannot refund the difference.</li>
<li><strong>The Sage Tiered Sundress and the Blue Block-Print Tiered Dress</strong> sold out in most sizes. Both are being restocked for September.</li>
</ul>
${figure(PRINT_RAIL, "The rails, a little emptier than usual")}
<p>Exchanges on sale dresses work the same as always: within 7 days of delivery, unworn, with the tags on.</p>`,
    },
    {
        slug: "new-sizes-xs-and-xxl",
        title: "New sizes: XS and XXL in more dresses",
        category: "news",
        excerpt:
            "Three dresses now go up to XXL, and the Red Polka Dot Midi now starts at XS.",
        cover: BLUSH_RAIL,
        daysAgo: 33,
        body: `<p>The most common thing you write to us about is sizes. So we have added two.</p>
<h2>XXL (bust 42", waist 36")</h2>
<p>Now available in:</p>
<ul>
<li>the Belted Linen Shirt Dress, in terracotta and ivory</li>
<li>the Printed A-Line Kurta Dress, in mustard, indigo and rust</li>
<li>the Blue Block-Print Tiered Dress</li>
</ul>
<h2>XS (bust 32", waist 26")</h2>
<p>Now available in the Red Polka Dot Midi Dress, which used to start at S.</p>
${figure(LEANING_MIRROR, "Come in and try the new sizes at the shop")}
<p>Prices do not change with size. The full size chart is in our help pages, and you can always send us your measurements if you are not sure.</p>
<p>We are working on XXL for the Rust Cottage Maxi Dress next. We will post here when it is in.</p>`,
    },
    {
        slug: "diwali-gift-boxes",
        title: "Diwali gift boxes, and a card in every one",
        category: "news",
        excerpt:
            "Every order marked as a gift goes out in a ribboned box with a hand-written card, free, until Diwali.",
        cover: GIFT_GOLD,
        daysAgo: 12,
        body: `<p>Until Diwali on 8 November, every order marked as a gift goes out in a kraft box tied with ribbon, with your message hand-written on a card. There is no charge for it.</p>
<p>To ask for it, write "Gift" and your message in the <strong>Note for us</strong> box at checkout. We will leave the invoice out of the parcel and email it to you instead.</p>
<p>Some of the things people are sending this year:</p>
<ul>
<li>The Daily Grooming Kit (₹1,799): face wash, moisturiser, beard oil and a travel-size sunscreen in a matte black box</li>
<li>The Saffron &amp; Kumkumadi Night Face Oil (₹1,299)</li>
<li>The Cedar &amp; Vetiver Beard Oil (from ₹399), for the man who says he does not need anything</li>
</ul>
${figure(OIL_DROP, "The beard oil, our most-gifted small thing")}
<p>Gift boxes are also wrapped free at the shop counter.</p>`,
    },
    {
        slug: "printed-kurta-dress-restocked",
        title: "The Printed A-Line Kurta Dress is back",
        category: "news",
        excerpt: "All three colours, all sizes from XS to XXL, at ₹1,499.",
        cover: KURTA_MANNEQUIN,
        daysAgo: 3,
        body: `<p>Our everyday kurta dress sold out in rust and indigo by the end of September. All three colours are back on the rail and online today, in every size from XS to XXL, still at ₹1,499.</p>
<ul>
<li><strong>Mustard</strong>, with an embroidered yoke</li>
<li><strong>Indigo</strong>, with a paisley border</li>
<li><strong>Rust</strong>, with a small buti print</li>
</ul>
<p>It is an A-line dress with a round neck, a short placket and three-quarter sleeves. Wear it on its own, or with leggings for the office and small family functions.</p>
${figure(KURTA_BLOCK, "Easy cotton prints for the weeks of visits ahead")}
<p>At ₹1,499, one dress on its own qualifies for free delivery anywhere in India.</p>
<p>As before, it's cut from a soft cotton that's been pre-washed, so it won't shrink in the machine.</p>
`,
    },
    {
        slug: "goodbye-coffee-walnut-scrub",
        title: "Saying goodbye to the Coffee & Walnut Face Scrub",
        category: "news",
        excerpt:
            "We have stopped making our face scrub. Here is why, and what we suggest instead.",
        cover: CREAM_OPEN,
        daysAgo: 95,
        body: `<p>We have made our last batch of the Coffee &amp; Walnut Face Scrub.</p>
<p>It was one of the first products we sold, and some of you have bought it for years. But the more we learnt, the less comfortable we were with walnut shell on faces. Gritty scrubs can be too rough for many skin types, especially if you scrub hard or often, and we found that most customers were using it more than the twice a week we suggested.</p>
<p>So the page stays up, for anyone who wants to check the ingredients, but we will not be making more.</p>
<h2>What we suggest instead</h2>
<ul>
<li>For a gentle daily clean, the <strong>Rice Water Gentle Foaming Cleanser</strong> (from ₹349).</li>
<li>For that fresh, just-washed feel, the <strong>Ubtan Glow Face Wash</strong> (₹299), made with besan and haldi in our workroom.</li>
<li>Follow either with a mist of <strong>Kannauj Rose Water Toner</strong> (₹399).</li>
</ul>
${figure(ROSE_BOWL, "Rose water from Kannauj, nothing added but a gentle preservative")}`,
    },

    // ------------------------------------------------------------ Articles
    {
        slug: "one-slip-dress-three-ways",
        title: "One slip dress, three ways",
        category: "articles",
        featured: true,
        excerpt:
            "How our Bias-Cut Satin Slip Dress goes from a Monday at work to a Diwali party to a Sunday brunch, with things you probably already own.",
        cover: SLIP_COAT,
        daysAgo: 28,
        body: `<p>If we had to keep only one dress on the rails, it would probably be the Bias-Cut Satin Slip Dress (₹2,299). It comes in black, wine and rust, sits just below the knee, and is cut on the bias so it skims rather than clings. It is also the dress customers are most nervous about. "Where would I even wear it?" is the question we hear most.</p>
<p>So here are three answers, all tried by our team, all with things you probably already own.</p>
<h2>1. To work, with a tee and a jacket</h2>
<p>This is the one that surprises people. Put a fitted white or black T-shirt <em>under</em> the slip, so the sleeves and neckline show. Add a blazer or a long shirt worn open as a jacket, and flat sandals or loafers. Suddenly the satin reads as a skirt with a bit of shine, not a party dress.</p>
<p>Black is the easiest colour for this. In Bengaluru's in-between weather, a light cotton shirt over the top works better than a heavy blazer.</p>
${figure(SLIP_BLACK, "Black satin is the easiest place to start")}
<h2>2. To a Diwali party, with gold and a shawl</h2>
<p>For an evening, wear the slip on its own. Wine is our pick for the festive season, because it glows under diyas and fairy lights. Then:</p>
<ul>
<li><strong>Jewellery:</strong> big gold or oxidised silver jhumkas, and leave the neck bare. The V-neck is the frame.</li>
<li><strong>A dupatta or shawl:</strong> draped over one shoulder or around your arms. A Banarasi, a bandhani or a plain silk all work.</li>
<li><strong>Shoes:</strong> heels if you like them, or embellished juttis if you plan to be on your feet all night.</li>
</ul>
<p>The adjustable straps mean you can wear a regular bra under it. If you want straps that do not show, choose one in a colour close to your skin.</p>
<h2>3. For a Sunday brunch, with a knit</h2>
<p>When the evenings turn cool in December, throw a loose cardigan or a cropped sweater over the slip, and wear white trainers. Rust looks especially good with cream, oatmeal and denim blue.</p>
${figure(SLIP_CHAIR, "Satin and knitwear: an easy winter pairing")}
<h2>A few things to know before you buy</h2>
<ul>
<li><strong>Sizing:</strong> the slip is fitted at the bust. If you are between two sizes, choose the bigger one.</li>
<li><strong>Length:</strong> it falls just below the knee on someone around 5'5".</li>
<li><strong>Care:</strong> hand wash cold, inside out, and dry it flat or on a padded hanger in the shade. Iron on low, through a cotton cloth.</li>
</ul>
<p>One dress, three outfits, and a lot fewer "I have nothing to wear" mornings. Come and try all three colours at the shop; it is the only way to choose.</p>`,
    },
    {
        slug: "simple-skincare-routine-for-bengaluru-weather",
        title: "A simple skincare routine for Bengaluru weather",
        category: "articles",
        featured: true,
        excerpt:
            "Not quite humid, not quite dry, and never the same two months running. A four-step routine that keeps up with the city.",
        cover: TREE_ROAD,
        daysAgo: 55,
        body: `<p>Bengaluru weather is famously pleasant, and quietly confusing for skin. March and April are hot and dry. The monsoon brings damp air and long commutes in the rain. December mornings are cool enough for a sweater, and then there is the air conditioning in every office. A routine that works in May can feel too heavy in August.</p>
<p>The good news is you do not need a ten-step routine. You need four steps, and the sense to change one or two products as the weather turns.</p>
<h2>Morning</h2>
<h3>1. Cleanse</h3>
<p>A gentle cleanser in the morning is enough. Our Rice Water Gentle Foaming Cleanser (from ₹349) lifts away the night's oil without leaving skin tight. If your skin is dry, you can even skip it and just splash with water.</p>
<h3>2. Treat (optional)</h3>
<p>If you use a serum, morning is a good time for vitamin C, which pairs well with sunscreen. A few drops of the Vitamin C 10% Brightening Serum, pressed in, is plenty.</p>
<h3>3. Moisturise</h3>
<p>The Oat &amp; Ceramide Gel Moisturiser (from ₹499) is light enough for humid months and still comfortable in an air-conditioned office.</p>
<h3>4. Sunscreen</h3>
<p>Every day, including cloudy monsoon days. Bengaluru sits at about 900 metres, and UV is strong here even when it is overcast. Our Aqua Gel Sunscreen SPF 50 (from ₹449) dries clear, which helps if you hate the feel of sunscreen.</p>
${figure(MIRROR_ROUTINE, "Four steps in the morning, three at night")}
<h2>Night</h2>
<ol>
<li><strong>Cleanse</strong>, twice if you wore sunscreen and makeup: once to lift it off, once to clean.</li>
<li><strong>Treat</strong>: niacinamide if you are oily, or the Saffron &amp; Kumkumadi Night Face Oil if you are dry.</li>
<li><strong>Moisturise</strong>: the gel moisturiser again, or the richer Overnight Bakuchiol Repair Cream in winter.</li>
</ol>
<h2>How to adjust through the year</h2>
<ul>
<li><strong>March to May (hot, dry):</strong> add the Hyaluronic Water-Drop Serum under your moisturiser, and reapply sunscreen at lunch if you are out.</li>
<li><strong>June to September (monsoon):</strong> go lighter. Skip the face oil and keep to the gel moisturiser. If you get breakouts from sweat under a helmet, a niacinamide serum may help.</li>
<li><strong>November to February (cool, dry mornings):</strong> this is the time for richer creams and a face oil at night.</li>
</ul>
${figure(CREAM_FLOAT, "A richer cream for December nights")}
<h2>The one rule</h2>
<p>Change one thing at a time, and give it two or three weeks. If you change three products at once and your skin reacts, you will not know which one caused it. And patch test anything new.</p>
<p>If something is bothering your skin for more than a few weeks, such as persistent acne, patches or redness, please see a dermatologist. A good routine supports skin; it is not a treatment.</p>`,
    },
    {
        slug: "niacinamide-or-vitamin-c",
        title: "Niacinamide or vitamin C: which one is for you?",
        category: "articles",
        excerpt:
            "Two of the most popular serums on our shelf, often confused. What each one does, who it suits, and whether you can use both.",
        cover: DROPPER_ORANGE,
        daysAgo: 75,
        body: `<p>At the counter, the question we hear most about serums is some version of: "Niacinamide or vitamin C?" Both are good. They just do different jobs.</p>
<h2>Vitamin C: for dullness and uneven tone</h2>
<p>Our Vitamin C 10% Brightening Serum (from ₹549) uses ethyl ascorbic acid, a stable form of vitamin C, with ferulic acid and vitamin E. Vitamin C is an antioxidant. Used regularly, it may help skin look brighter and more even, and it works well alongside sunscreen.</p>
<p><strong>It may suit you if:</strong></p>
<ul>
<li>your skin looks tired or dull</li>
<li>you have uneven tone, or marks that linger after a breakout</li>
<li>you have normal, combination or oily skin</li>
</ul>
<p><strong>How to use it:</strong> in the morning, after cleansing, 3–4 drops pressed into face and neck. Moisturiser and sunscreen on top.</p>
${figure(OIL_SWATCHES, "Serums differ in texture as well as in what they do")}
<h2>Niacinamide: for oil and the look of pores</h2>
<p>Our Niacinamide 5% Clarifying Serum (from ₹599) pairs 5% niacinamide with zinc PCA and panthenol. Niacinamide is a form of vitamin B3. It may help skin look less shiny and keep the look of pores in check, and it is gentle enough for most people to use every day.</p>
<p><strong>It may suit you if:</strong></p>
<ul>
<li>your skin gets oily by lunchtime</li>
<li>you notice your pores in the mirror</li>
<li>you find stronger actives irritating</li>
</ul>
<p>We kept it at 5% on purpose. Higher percentages are not always better, and some people find them irritating.</p>
<h2>Can you use both?</h2>
<p>Yes. The old advice that the two cancel each other out comes from studies with very different forms of the ingredients. The simplest way to use both is:</p>
<ul>
<li><strong>Morning:</strong> vitamin C, then moisturiser and sunscreen</li>
<li><strong>Night:</strong> niacinamide, then moisturiser</li>
</ul>
<p>Start one at a time, two weeks apart, so you know how your skin takes each.</p>
${figure(DROPPER_PINK, "Start with one, add the other after two weeks")}
<h2>A quick way to decide</h2>
<blockquote>"If someone tells me their face looks tired, I hand them vitamin C. If they tell me it looks shiny, I hand them niacinamide. If they say both, I tell them to start with whichever bothers them more." <br />— Meera, who runs our skincare counter</blockquote>
<h2>A few honest notes</h2>
<ul>
<li>Serums take time. Give either one six to eight weeks before you judge it.</li>
<li>Neither replaces sunscreen.</li>
<li>Patch test first, especially if you have sensitive skin.</li>
<li>For acne that is painful or does not settle, or for pigmentation that bothers you, see a dermatologist. A serum may help skin look better; it is not a treatment.</li>
</ul>
<p>Whichever you choose, give it time: skin takes about four to six weeks to show what a new product is doing. Change one thing at a time, so you know what helped.</p>
`,
    },
    {
        slug: "skincare-for-men-who-hate-skincare",
        title: "Skincare for men who hate skincare",
        category: "articles",
        excerpt:
            "Three steps, under two minutes, no jargon. A routine for men who would rather not have one.",
        cover: MAN_SINK,
        daysAgo: 90,
        body: `<p>A lot of the men who come into the shop have been sent by someone. They stand near the door, they say "I just need something for my face", and they would like to leave as quickly as possible. This is for them.</p>
<h2>The whole routine</h2>
<p>Three things. That is it.</p>
<ol>
<li><strong>Wash your face</strong>, morning and night.</li>
<li><strong>Moisturise</strong> after you wash.</li>
<li><strong>Sunscreen</strong> in the morning, every day.</li>
</ol>
<p>Total time: under two minutes.</p>
<h2>Step 1: wash</h2>
<p>Bar soap dries your face out, which is why it feels tight afterwards. Use a face wash instead. Our Activated Charcoal Face Wash for Men (from ₹299) has a little salicylic acid and menthol. It takes off sweat, oil and the grime from a day under a helmet, and leaves your face feeling cool.</p>
<h2>Step 2: moisturise</h2>
<p>"But my skin is oily." Oily skin still needs moisture; when it is stripped, it can make more oil. Use something light, like our Oat &amp; Ceramide Gel Moisturiser. A pea-sized amount. It sinks in in a minute and does not feel greasy.</p>
<h2>Step 3: sunscreen</h2>
<p>This is the one that makes the biggest difference over the years, and the one most men skip. The Aqua Gel Sunscreen SPF 50 dries clear in seconds. No white face, no shine. Two finger-lengths for face and neck.</p>
${figure(BEARD_MAN, "Beards need looking after too")}
<h2>If you have a beard</h2>
<p>The skin under a beard gets dry and itchy, especially in winter. A few drops of the Cedar &amp; Vetiver Beard Oil (from ₹399) after a shower softens the hair and helps the skin underneath feel less itchy. Rub it between your palms, then work it in from the roots.</p>
<h2>If you shave</h2>
<p>Most razor burn comes from dry shaving or a dull blade. Use a proper lather, like our Sandalwood Shaving Cream (₹349), whipped up with a brush if you have one or with your hands if you do not. Shave in the direction of growth. Finish with the Cooling Aftershave Mist (₹449), which is alcohol-free, so it does not sting.</p>
${figure(SHAVE_KIT, "A brush and a good lather make shaving easier on the skin")}
<h2>The lazy option</h2>
<p>If even choosing is too much, The Daily Grooming Kit (₹1,799) has the face wash, a moisturiser, the beard oil and a travel-size sunscreen in one box. Put it next to the sink and use it from left to right.</p>
<h2>What not to worry about</h2>
<ul>
<li>Toners, serums, masks: optional, and you can ignore them completely.</li>
<li>Fancy techniques: there are none. Wash, pat dry, apply.</li>
</ul>
<p>If you have acne that hurts, or a rash that will not go away, see a dermatologist. For everything else, three steps will do.</p>`,
    },
    {
        slug: "dressing-for-a-bengaluru-office",
        title: "Dressing for a Bengaluru office",
        category: "articles",
        excerpt:
            "Cold air conditioning, a hot commute and a sudden downpour, all before lunch. How we dress for it.",
        cover: OFFICE_BLAZER,
        daysAgo: 130,
        body: `<p>Getting dressed for work in Bengaluru means dressing for three climates. There is the commute, warm and sometimes wet. There is the office, where the air conditioning is set for people in suits. And there is the walk to lunch, when the sun comes out at full strength. Here is what we have learnt from years of doing it ourselves.</p>
<h2>Start with breathable fabric</h2>
<p>Natural fabrics are your friend on the commute. Linen and cotton let air through and dry quickly if you get caught in the rain. Our Belted Linen Shirt Dress (₹2,499) is the dress most of our team owns: knee length, patch pockets, and a belt you can tie loose or cinched. In terracotta or ivory, it looks put-together without looking like you tried too hard.</p>
${figure(TERRACOTTA_SHIRTDRESS, "The belted shirt dress: smart enough for a client meeting")}
<h2>Then add a layer for the air conditioning</h2>
<p>Keep a light layer at your desk: a cotton blazer, a long shrug, or a soft cardigan. It turns a summer dress into office wear, and stops you shivering by four o'clock. Neutral colours, like navy, cream or olive, go with almost everything on our rails.</p>
<h2>Kurta dresses count</h2>
<p>A lot of offices here are relaxed about dress codes, and a kurta dress is as smart as anything Western. The Printed A-Line Kurta Dress (₹1,499) works on its own or with leggings, and the three-quarter sleeves are practical. The indigo, with its paisley border, is our pick for meetings.</p>
${figure(WHITE_KURTA, "A kurta dress is office wear too")}
<h2>A few rules we follow</h2>
<ul>
<li><strong>Pockets.</strong> Phone, ID card, metro card. Every dress should have them, and ours mostly do.</li>
<li><strong>Midi or knee length</strong> for scooter commutes; very long hems get caught and very short ones ride up.</li>
<li><strong>Dark or printed fabric</strong> in the monsoon, which hides splashes from the road.</li>
<li><strong>Shoes you can walk in.</strong> Keep a nicer pair under your desk if you must.</li>
</ul>
<h2>A week from one rail</h2>
<ol>
<li><strong>Monday:</strong> the Belted Linen Shirt Dress in ivory, with a navy blazer.</li>
<li><strong>Tuesday:</strong> the Printed A-Line Kurta Dress in indigo, with leggings.</li>
<li><strong>Wednesday:</strong> the Chambray Button-Down Dress, belted, with white trainers.</li>
<li><strong>Thursday:</strong> the Blue Block-Print Tiered Dress, with a cardigan.</li>
<li><strong>Friday:</strong> the Bias-Cut Satin Slip Dress in black, over a white tee, for drinks after work.</li>
</ol>
<p>Five dresses, five days, and nothing that needs dry cleaning. Every one of them can be hand washed cold and dried in the shade.</p>
<p>One last thing: keep a light layer at your desk. Bengaluru offices run their air-conditioning cold, and a cotton shrug or a linen overshirt turns a summer dress into something you can wear from nine to seven.</p>
`,
    },
    {
        slug: "linen-in-the-monsoon",
        title: "Yes, you can wear linen in the monsoon",
        category: "articles",
        excerpt:
            "People put linen away when the rains come. We think that is a mistake. Why it works, and how to look after it when nothing dries.",
        cover: LINEN_SHIFT,
        daysAgo: 105,
        body: `<p>Every June, customers tell us they are putting their linen away until October. We understand the instinct: linen creases, and the monsoon makes everything feel damp. But linen is one of the best fabrics for the rainy season. Here is why, and how to make it work.</p>
<h2>Why linen works when it is wet</h2>
<ul>
<li><strong>It dries quickly.</strong> Linen fibres let water out faster than cotton does. Get caught in a shower on the way to work, and a linen dress is usually dry by the time you have had your coffee.</li>
<li><strong>It breathes.</strong> Monsoon air is warm and muggy. Synthetic fabrics trap that heat against you; linen lets it escape.</li>
<li><strong>It does not cling.</strong> When it does get wet, linen is less likely to stick to your skin than thin cotton or polyester.</li>
<li><strong>It is strong.</strong> Linen is one of the toughest natural fibres, and it gets stronger when wet.</li>
</ul>
${figure(LINEN_STACK, "Pre-washed linen gets softer with every wash")}
<h2>What to wear</h2>
<p>Our Belted Linen Shirt Dress is made from pre-washed linen, so it is soft from the first day and will not shrink in the wash. Knee length is ideal in the monsoon: long enough to cover, short enough to keep out of puddles.</p>
<p>Choose your colour with the season in mind. Terracotta and darker linens hide splashes from the road far better than ivory. Save the ivory for dry days, or for days you know you will be indoors.</p>
<h2>Looking after linen in the rains</h2>
<p>The real challenge in the monsoon is drying. Here is what works for us:</p>
<ol>
<li><strong>Wash it the same day.</strong> Linen that stays damp in a laundry basket can start to smell musty.</li>
<li><strong>Hand wash cold</strong> with a mild detergent, and do not wring it.</li>
<li><strong>Dry it under a fan</strong>, on a hanger, with space around it. Do not fold it until it is completely dry.</li>
<li><strong>Iron while slightly damp</strong> if you want it crisp. Or do not iron it at all. Linen's creases are part of what it is.</li>
</ol>
${figure(UMBRELLA_RAIN, "Dark colours hide splashes from the road")}
<h2>What to avoid</h2>
<ul>
<li>Tumble drying on high heat, which can make linen stiff.</li>
<li>Storing linen in plastic bags in the monsoon. Cotton bags or an open shelf let it breathe.</li>
<li>Drying in harsh sun when it finally comes out. Strong sun fades the colour; the shade is gentler.</li>
</ul>
<p>Next time the clouds come over Commercial Street, keep the linen out. You may find it is the most comfortable thing you own.</p>
<p>And if a linen dress does get caught in a downpour, hang it on a hanger rather than folding it damp — it will dry with fewer creases and no musty smell.</p>
`,
    },
    {
        slug: "what-spf-numbers-mean",
        title: "What SPF numbers actually mean",
        category: "articles",
        excerpt:
            "SPF 30, SPF 50, PA++++: what the numbers and plus signs on a sunscreen tell you, and how much to put on.",
        cover: KRAFT_TUBE,
        daysAgo: 145,
        body: `<p>Sunscreen labels are full of numbers and symbols, and most of us pick whichever one has the biggest number. Here is what they actually mean.</p>
<h2>Two kinds of sun</h2>
<p>Sunlight carries two kinds of ultraviolet light that matter for skin:</p>
<ul>
<li><strong>UVB</strong> is the one that burns. It is strongest in the middle of the day.</li>
<li><strong>UVA</strong> goes deeper into skin and is linked to tanning and to skin ageing. It is present all day, all year, and passes through clouds and glass.</li>
</ul>
<h2>SPF: protection from UVB</h2>
<p>SPF stands for sun protection factor, and it measures protection from UVB. The numbers do not go up evenly:</p>
<ul>
<li>SPF 15 filters roughly 93% of UVB</li>
<li>SPF 30 filters roughly 97%</li>
<li>SPF 50 filters roughly 98%</li>
</ul>
<p>So SPF 50 is not "twice as strong" as SPF 30. But in strong sun, like a Bengaluru afternoon in April, that last little bit is worth having, especially if you do not apply as much as the label assumes. That is why both our sunscreens are SPF 50.</p>
${figure(DAB_UNDER_EYE, "Dot it on, then spread it evenly")}
<h2>PA: protection from UVA</h2>
<p>The PA rating, common on sunscreens made for Asian markets, measures UVA protection. More plus signs means more protection, from PA+ up to PA++++. Our Sheer Tint Sunscreen is SPF 50 PA++++, the highest on that scale.</p>
<p>You may also see <strong>broad spectrum</strong> on a label. That means it protects against both UVA and UVB.</p>
<h2>How much to use</h2>
<p>Most of us use far less sunscreen than the SPF was tested with. A simple rule: squeeze two finger-lengths for your face and neck. It feels like a lot. It is the right amount.</p>
${figure(CREAM_DOTS, "Two finger-lengths for face and neck")}
<h2>When to reapply</h2>
<ul>
<li>Every two to three hours if you are outdoors</li>
<li>After sweating heavily, swimming or wiping your face</li>
<li>Indoors at a desk, once in the morning is usually enough, unless you sit by a sunny window</li>
</ul>
<h2>Which of ours to choose</h2>
<ul>
<li><strong>Aqua Gel Sunscreen SPF 50</strong> (from ₹449): clear, watery, invisible on every skin tone. Good for oily skin and for people who hate sunscreen.</li>
<li><strong>Sheer Tint Sunscreen SPF 50 PA++++</strong> (₹699): a light tint in Fair, Medium or Deep that evens out the look of skin, with iron oxides that also help filter visible light.</li>
</ul>
<p>The best sunscreen is the one you will wear every day. If you have a history of skin cancer in the family, or a mole that changes, please see a dermatologist; sunscreen is protection, not a check-up.</p>`,
    },
    {
        slug: "festive-dressing-without-a-lehenga",
        title: "Festive dressing without buying a lehenga",
        category: "articles",
        excerpt:
            "Four dresses, a pair of jhumkas and your mother's dupatta. How to dress for a season of pujas, parties and weddings without a new lehenga for each.",
        cover: JHUMKAS,
        daysAgo: 38,
        body: `<p>From Navratri to the wedding season, the invitations pile up. A Lakshmi puja at a friend's place. A Diwali card party. A cousin's mehendi. An office celebration. A new lehenga for each is expensive, and most of them end up wrapped in a cupboard for years. Here is how we dress for the season with what is on our rails, and what is already in your cupboard.</p>
<h2>The idea: one dress, Indian accessories</h2>
<p>A well-cut dress in a rich colour becomes festive the moment you add jewellery, a dupatta and the right shoes. You keep the comfort of a dress, and you do not look like you came straight from the office.</p>
${figure(WRAP_MAXI, "A floral wrap maxi, easy to dress up")}
<h2>Four dresses that work</h2>
<h3>The Rust Cottage Maxi Dress (₹3,499)</h3>
<p>Our most "occasion" dress. Rich rust cotton-linen, a square neckline and bishop sleeves. It is ankle length, so it moves like a skirt. Add gold jhumkas and a maang tikka if you are feeling bold, and it is ready for a sangeet.</p>
<h3>The Floral Wrap Maxi Dress (₹2,799)</h3>
<p>Ivory georgette with a small green vine print. For a daytime puja, wear it with a bright bandhani dupatta in red or green, and kolhapuri chappals.</p>
<h3>The Bias-Cut Satin Slip Dress in Wine (₹2,299)</h3>
<p>For the evening card party. Wine satin looks wonderful in candlelight. Keep the neck bare and wear statement earrings, with a silk shawl for the drive home.</p>
<h3>The Red Polka Dot Midi Dress (₹1,899)</h3>
<p>Fun, a little retro, and easy to dance in. Red is festive on its own; add gold bangles and you are done.</p>
<h2>The accessories that do the work</h2>
<ul>
<li><strong>Jhumkas:</strong> the single biggest change you can make. Oxidised silver with cotton dresses, gold with satin and georgette.</li>
<li><strong>A dupatta:</strong> borrow one. Your mother's Banarasi, your aunt's phulkari. Drape it over one shoulder and pin it at the back.</li>
<li><strong>Bangles:</strong> glass or metal, a stack on one wrist.</li>
<li><strong>A bindi</strong>, if you wear one.</li>
<li><strong>Juttis or kolhapuris</strong> instead of heels, for long evenings standing.</li>
</ul>
${figure(MARIGOLDS, "Marigold season: wear something that can sit on the floor for a puja")}
<h2>Practical notes for festive days</h2>
<ul>
<li><strong>Floor seating:</strong> pujas often mean sitting cross-legged. Maxis and wrap dresses are much easier than fitted midis.</li>
<li><strong>Diyas and dupattas:</strong> keep georgette and long sleeves away from flames.</li>
<li><strong>Food:</strong> darker colours forgive a splash of dal far more easily.</li>
</ul>
<p>Our festive edit is on the rails now. Come in and try a dress with your own jewellery; we are always happy to help you put an outfit together.</p>`,
    },
    {
        slug: "inside-our-workroom-ubtan-and-kumkumadi",
        title: "Inside our workroom: ubtan and kumkumadi",
        category: "articles",
        excerpt:
            "Two of our products are made a few streets from the shop, in small batches. How we make the Ubtan Glow Face Wash and the Saffron & Kumkumadi Night Face Oil.",
        cover: SAFFRON_JAR,
        daysAgo: 175,
        body: `<p>Most of what we sell is made for us by small labs we trust. But two products are made in our own workroom, in small batches, a few streets from Commercial Street. People ask about them all the time, so here is how they are made.</p>
<h2>The Ubtan Glow Face Wash</h2>
<p>Ubtan is older than any of us. For generations, families across India have mixed besan, haldi and something fragrant into a paste for the skin, especially before weddings and festivals. Our Ubtan Glow Face Wash (₹299) is our take on it, made gentle enough to use every day.</p>
<p>We start with chickpea flour, which gives it a soft, creamy body. Then turmeric, sandalwood extract and a pinch of saffron. It is mixed into a mild gel with decyl glucoside, a gentle cleanser made from plant sugars.</p>
${figure(TURMERIC_BOWL, "Turmeric, one of the four things that make it ubtan")}
<p>Each batch is about forty bottles. We make it every two weeks, so what reaches you is fresh. Because it is made by hand, the colour can vary a little from batch to batch, a touch more golden or a touch paler. That is the turmeric, and it is normal.</p>
<h3>Does it stain?</h3>
<p>Not your skin, in our experience. But turmeric can mark white towels and a white sink if you leave it, so rinse both after use.</p>
<h2>The Saffron &amp; Kumkumadi Night Face Oil</h2>
<p>Kumkumadi tailam is a traditional Ayurvedic oil with saffron, the "kumkum" in its name, and a long list of herbs. The traditional recipes are heavy and can leave your pillow greasy. We wanted something lighter.</p>
<p>So we slow-infuse Kashmiri saffron, manjistha, vetiver and licorice root in a base of cold-pressed sesame and almond oils, with a little jojoba to make it sink in faster. The infusion takes about three weeks. Then we strain it, bottle it and label every bottle by hand.</p>
${figure(OIL_POUR, "Three weeks of infusion, three drops at night")}
<h3>How to use it</h3>
<ol>
<li>At night, after cleansing.</li>
<li>Warm three drops between your palms.</li>
<li>Press it into your face and neck; do not rub.</li>
</ol>
<p>Most people find their skin feels softer and looks rested by morning. It is especially welcome in the dry months, from December to March.</p>
<h2>A note on "natural"</h2>
<p>Natural does not mean it will suit everyone. Saffron, turmeric and essential oils can irritate some skin. Please patch test both of these, as you would anything else. And because the oil contains almond oil, avoid it if you have a nut allergy.</p>
<blockquote>"We could make these faster and cheaper somewhere else. But then they would not be ours." <br />— Leela, who started the shop</blockquote>`,
    },
];
