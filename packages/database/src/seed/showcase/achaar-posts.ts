import type { DemoPost } from "./demo-shop-types";

/**
 * Ammi Ki Barni's website journal: help pages, kitchen news and Ammi's own
 * articles. Every photo is a vetted, free Unsplash photo; captions describe
 * what the photo shows and never claim it is this kitchen or its people.
 */

const unsplash = (id: string): string =>
    `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;

const figure = (
    id: string,
    height: number,
    alt: string,
    caption: string,
    photographer: string,
): string =>
    `<figure><img src="${unsplash(id)}" alt="${alt}" width="1600" height="${height}"><figcaption>${caption} Photo: ${photographer} / Unsplash</figcaption></figure>`;

export const ACHAAR_POSTS: DemoPost[] = [
    // ── Help ────────────────────────────────────────────────────────────
    {
        slug: "how-to-order",
        title: "How to place an order with us",
        category: "help",
        daysAgo: 178,
        excerpt:
            "Order on WhatsApp, Instagram or right here on the website. Here is what happens after you do, and what we will ask you.",
        image: unsplash("1664791461482-79f5deee490f"),
        html: `<p>There are three ways to order from us, and they all end up in the same notebook on Ammi's kitchen shelf.</p>
<ul>
<li><strong>On this website.</strong> Pick your pickles and jar sizes, choose pick-up or delivery, and place the order. You will get a message from Faizan the same day.</li>
<li><strong>On WhatsApp.</strong> Send a message with what you want, how many jars and which size. A voice note is fine too, Ammi prefers them.</li>
<li><strong>On Instagram.</strong> Send us a direct message. Faizan checks it every evening.</li>
</ul>
${figure("1567337710282-00832b415979", 901, "Roti and bowls of dal and sabzi in a steel thali", "The everyday thali most of our jars end up beside.", "Lai YuChing")}
<h2>What we will ask you</h2>
<p>Whichever way you order, Faizan will confirm three things before anything goes in the pot: the pickles and sizes, whether you are collecting from Nishatganj or want it delivered, and a day that suits you. If you are new to us, he may also ask how much heat you like. Our hari mirch is properly hot, and some people are happier with the nimbu-mirch instead.</p>
<h2>When it will be ready</h2>
<p>Most of what we sell is made after your order comes in, so it is usually ready in three to four days. Bharwa lal mirch and the sweet chunda need five, because they sit in the sun. Papad, aam papad, masalas and sealed hampers are ready sooner if we have them on the shelf.</p>
<p>If you need something for a particular date, a guest arriving or a train to catch, tell us when you order and we will plan around it.</p>`,
    },
    {
        slug: "why-three-to-four-days",
        title: "Why your order takes three to four days",
        category: "help",
        daysAgo: 150,
        excerpt:
            "We do not keep big tubs of ready pickle. Here is what happens in those few days between your message and your jar.",
        image: unsplash("1601702538934-efffab67ab65"),
        html: `<p>People sometimes message us in the morning and ask if they can collect by evening. For most pickles the honest answer is no, and it is not because we are slow.</p>
<h2>What happens on each day</h2>
<ol>
<li><strong>Day one:</strong> Faizan buys what your order needs. Lemons, chillies, garlic or ginger come from the Nishatganj mandi that morning. Mangoes in season come from the same two sellers we have used since 2019.</li>
<li><strong>Day one, afternoon:</strong> everything is washed and dried completely. A drop of water left on a lemon will spoil a whole jar, so this part is never rushed.</li>
<li><strong>Day two:</strong> Ammi roasts and grinds the masala, cuts the fruit and mixes it. The mustard oil is heated until it smokes and then cooled before it goes in.</li>
<li><strong>Days three and four:</strong> the jar rests so the salt and spices can get into the fruit. Ammi tastes it before it is packed. If it is not ready, it waits another day.</li>
</ol>
${figure("1716816211590-c15a328a5ff0", 1128, "Whole and ground spices, dried chillies and curry leaves spread on a dark table", "Saunf, methi, kalonji, haldi: the masala is ground fresh for each batch.", "Anju Ravindranath")}
<h2>And the slower ones</h2>
<p>Bharwa lal mirch and sweet aam ka chunda take five days because they need sun. On a cloudy day they need one more. We would rather tell you that up front than send you something half done.</p>
<p>Dry goods like papad, aam papad and our garam, achaar and chaat masala are made in small batches and kept sealed, so they can usually go out the next day.</p>`,
    },
    {
        slug: "delivery-in-lucknow",
        title: "Delivery across Lucknow: days, areas and charges",
        category: "help",
        daysAgo: 43,
        excerpt:
            "Faizan delivers across Lucknow on Tuesdays, Thursdays and Saturdays. ₹60 a drop, free when your order is above ₹999.",
        image: unsplash("1688287580970-70fe8e0f4bef"),
        html: `<p>Faizan does all our deliveries himself, on his scooter, with the jars wrapped in newspaper and packed upright in a crate. That is why we keep to fixed days.</p>
<h2>Days</h2>
<p>We deliver on <strong>Tuesday, Thursday and Saturday</strong>, usually between 2pm and 8pm. Faizan sends a WhatsApp message when he leaves Nishatganj, and another when he is ten minutes away.</p>
<h2>Charges</h2>
<ul>
<li>₹60 for each delivery, wherever you are in the city.</li>
<li>Free when the order is above ₹999.</li>
<li>Achaar ka Dabba boxes are delivered on the first Saturday of the month at the same ₹60, or free if you add a jar or two and cross ₹999.</li>
</ul>
${figure("1630448927918-1dbcd8ba439b", 1067, "A plain brown cardboard box on a white surface", "Jars travel upright, wrapped and boxed.", "Christopher Bill")}
<h2>Areas</h2>
<p>We go everywhere inside the city: Gomti Nagar, Indira Nagar, Mahanagar, Aliganj, Hazratganj, Aminabad, Chowk, Alambagh, Jankipuram and everything in between. For places further out, past Shaheed Path or towards Chinhat, please ask first. We usually manage it, but it may have to be a Saturday.</p>
<h2>If you are not home</h2>
<p>Faizan will call once. If nobody answers, he can leave the order with a neighbour or the guard if you have told us so, or bring it back and try on the next delivery day at no extra charge.</p>`,
    },
    {
        slug: "pick-up-from-nishatganj",
        title: "Collecting your order from Nishatganj",
        category: "help",
        daysAgo: 104,
        excerpt:
            "Pick-up is from our home in Nishatganj, 11am to 7pm. Closed Friday afternoons for Jumma. How to find the green gate.",
        image: unsplash("1642071547593-12c221a72613"),
        html: `<p>Many of our customers prefer to collect. It saves the delivery charge, and Ammi likes meeting the people who eat her pickles.</p>
<h2>Timings</h2>
<ul>
<li>Every day, 11am to 7pm.</li>
<li>Friday, closed from 12 to 3 for Jumma namaz.</li>
<li>Please collect on the day we tell you your order is ready, or within a few days of it. Jars wait safely, but our shelf is small.</li>
</ul>
<h2>Finding us</h2>
<p>We are in Nishatganj, Lucknow 226006, in a lane off the main road near the sabzi mandi. When you order, Faizan sends you a location pin on WhatsApp, and that is the easiest way. Look for a green iron gate with a mango tree leaning over the wall. Ring the bell once; someone is always in.</p>
<p>Parking a car in the lane is difficult in the evenings. If you are driving, stop on the main road and call. Faizan will bring the order out to you.</p>
${figure("1783309240061-1b962a8f6a32", 1067, "Carrots, chillies, pumpkin and cauliflower piled on a vegetable stall", "We are a short walk from the sabzi mandi, which is handy for us and for finding us.", "Thilina Alagiyawanna")}
<h2>Paying when you collect</h2>
<p>You can pay by UPI on the spot or in cash. If you have already paid online, just tell us your name. There is nothing to sign.</p>`,
    },
    {
        slug: "paying-changing-cancelling",
        title: "Paying for your order, and changing or cancelling it",
        category: "help",
        daysAgo: 86,
        excerpt:
            "UPI or cash, on pick-up or delivery. You can change an order until we start cooking it.",
        image: unsplash("1590502593747-42a996133562"),
        html: `<h2>Paying</h2>
<p>We take <strong>UPI</strong> and <strong>cash</strong>. You can pay when you collect from Nishatganj, or hand it to Faizan when he delivers. If you prefer to pay in advance, he will send our UPI details on WhatsApp after he confirms your order. Please do not send money to any other number claiming to be us.</p>
<p>For courier orders to other cities, and for large wedding or bulk orders, we ask for payment in advance, because the ingredients are bought for you specifically.</p>
${figure("1599987141071-f5810d32e21a", 1189, "A single green chilli on a white background", "Once the chillies are slit and filled, an order can no longer be changed.", "Hari Krishnan")}
<h2>Changing an order</h2>
<p>You can change anything, sizes, pickles, the day, until we start making it. In practice that means until the morning after you order. Send a WhatsApp message, and Faizan will reply to confirm the change. If you do not hear back, call; he may be out on deliveries.</p>
<h2>Cancelling</h2>
<ul>
<li><strong>Before we start:</strong> cancel freely. If you paid in advance, we return the full amount by UPI the same day.</li>
<li><strong>After we start:</strong> the jar is already made, so we cannot take it back. We can hold it for you for up to two weeks, or deliver it later at no extra cost.</li>
<li><strong>Dry goods and hampers on the shelf:</strong> cancel any time before they leave the house.</li>
</ul>
<p>Things happen, and we understand. Just tell us early.</p>`,
    },
    {
        slug: "storing-your-pickles",
        title: "How to store your achaar so it lasts",
        category: "help",
        daysAgo: 78,
        excerpt:
            "A dry spoon, a layer of oil on top, and a little sun now and then. The few rules that keep a jar good for months.",
        image: unsplash("1659694459412-02735752031f"),
        html: `<p>Homemade achaar has no preservatives except salt, oil, spice and sun. Treat it well and it lasts a long time. Treat it carelessly and it will tell you within a week.</p>
${figure("1617854307432-13950e24ba07", 2000, "A glass jar of mixed pickle with a cloth tied over the mouth", "A cloth over the mouth lets the jar breathe in the sun.", "Prchi Palwe")}
<h2>The rules Ammi gives everyone</h2>
<ol>
<li><strong>Always a dry spoon.</strong> Never a wet one, never the spoon you just ate dal with. Water is the enemy. Keep one steel spoon only for the jar if you can.</li>
<li><strong>Keep the oil on top.</strong> The fruit should stay under a thin layer of oil. If the top pieces start sticking out, press them down, or add a little warmed and cooled mustard oil.</li>
<li><strong>Close the lid properly</strong> and keep the jar away from the stove and the sink.</li>
<li><strong>Give it some sun.</strong> Once a month on a dry day, open the lid, tie a clean cotton cloth over the mouth and put the jar in the sun for a few hours.</li>
<li><strong>Take out a small portion.</strong> For daily use, fill a small katori or bottle and leave the big jar closed.</li>
</ol>
<h2>Do I need the fridge?</h2>
<p>Not for oil pickles. They are happier on a shelf. Sweet chunda and gud wala aam are fine outside too, though in the monsoon a fridge does no harm. The winter gajar-gobhi-shalgam is the exception: it is a fresher pickle, and once it is sour enough for you, move it to the fridge.</p>
<p>If you ever see white spots, a bad smell or a fizz where there should not be one, stop using it and message us a photo.</p>`,
    },
    {
        slug: "if-a-jar-leaks",
        title: "What to do if a jar arrives leaking",
        category: "help",
        daysAgo: 59,
        excerpt:
            "Oil gets everywhere, we know. Take a photo, wipe the jar, and message us. Here is how we put it right.",
        image: unsplash("1622428051717-dcd8412959de"),
        html: `<p>Mustard oil is generous and it finds every gap. We pack carefully, but on a long courier journey, or a hot afternoon in a car, a jar can seep. Here is what to do.</p>
<ol>
<li><strong>Take a photo</strong> of the jar and the packing before you clean anything. It helps us see whether the lid, the seal or the box was the problem.</li>
<li><strong>Wipe the outside</strong> with a dry cloth, then a cloth with a little soap. Do not rinse the jar under the tap.</li>
<li><strong>Check the pickle.</strong> If the fruit is still under oil and smells right, it is perfectly fine to eat. A leaky lid does not spoil achaar; water does.</li>
<li><strong>Tighten or change the lid.</strong> If the lid is cracked or bent, move the pickle to a clean, completely dry glass jar.</li>
<li><strong>Message us</strong> on WhatsApp with the photo and your order name.</li>
</ol>
${figure("1577705998148-6da4f3963bc8", 2400, "A closed brown cardboard box standing on a wooden table", "Courier boxes get a second layer of padding now.", "Brandable Box")}
<h2>What we will do</h2>
<p>If a jar has lost a lot of oil, or the lid arrived broken, we will send a fresh jar with your next order or the next delivery day, at no charge. For courier orders we will send a replacement on the next Monday's dispatch. If you would rather have the money back, we do that by UPI.</p>
<p>We started double-bagging every courier jar after a customer in Pune sent us a photo of a very oily box. We still think about that box.</p>`,
    },
    {
        slug: "achaar-ka-dabba-monthly-box",
        title: "Achaar ka Dabba: how the monthly box works",
        category: "help",
        daysAgo: 51,
        excerpt:
            "Three 250 g jars of the month's picks for ₹699, on the first Saturday. How to join, skip a month or pause.",
        image: unsplash("1602237514002-c2d8ae2da393"),
        html: `<p>Achaar ka Dabba is our monthly box. Every month Ammi chooses three pickles that are at their best, and you get a 250 g jar of each.</p>
<h2>The basics</h2>
<ul>
<li><strong>₹699 a month</strong> for three 250 g jars.</li>
<li><strong>Collect or delivered</strong> on the first Saturday of the month. Collection is from Nishatganj; delivery inside Lucknow is ₹60, or free if you add enough to cross ₹999.</li>
<li><strong>Pay</strong> by UPI or cash when you receive it, the same as any order.</li>
</ul>
${figure("1711216367582-659a87c89f5b", 1067, "A heap of dried red chillies", "One month's box might lean hot, the next sweet. That is the point.", "Vatsal Tyagi")}
<h2>What goes in</h2>
<p>It follows the season. In summer you will see new mango pickles; in the rains, lemon and garlic; in winter, gajar-gobhi-shalgam and amla. We tell you the month's three on WhatsApp in the last week of the month before. If one of them does not suit you, say so and we will swap it for something you like.</p>
<h2>Skipping or pausing</h2>
<p>Life happens: you travel, you still have half a jar left, guests ate everything. Message us by the <strong>25th of the month</strong> to skip the next box. If you want to stop for longer, tell us how many months and we will pick it up again after that. There is no charge for skipping or pausing, and no form to fill.</p>
<p>To stop altogether, just tell Faizan. No questions, though Ammi may ask which pickle you did not like.</p>`,
    },
    {
        slug: "sending-to-other-cities",
        title: "Sending pickles to other cities",
        category: "help",
        daysAgo: 41,
        excerpt:
            "Sealed jars, dry goods and hampers go by courier anywhere in India for ₹150. Dispatched on Mondays.",
        image: unsplash("1596040033229-a9821ebd058d"),
        html: `<p>Half our courier orders are children sending a taste of home to a hostel or a new flat in Bengaluru, Pune or Delhi. The other half are those children ordering for themselves.</p>
<h2>What can go by courier</h2>
<ul>
<li>Our oil pickles, packed in sealed jars and bagged twice.</li>
<li>Dry goods: urad dal papad, aam papad, and our garam, achaar and chaat masala.</li>
<li>Festival hampers.</li>
</ul>
<p>The winter gajar-gobhi-shalgam does not travel well, and we do not send it outside Lucknow.</p>
${figure("1667885098636-f243f060d35a", 3200, "A heap of fresh green amla", "Amla achaar is one of the pickles that travels well.", "Mayur More")}
<h2>Charges and timing</h2>
<p>Courier is <strong>₹150</strong> anywhere in India. We dispatch on <strong>Mondays</strong> only, so the parcel does not sit in a warehouse over a weekend. Most metro cities receive it in three to five days, smaller towns in a week.</p>
<p>Because pickles are made after you order, an order placed on a Monday is made that week and goes out the following Monday. Faizan sends the tracking number on WhatsApp once it is booked.</p>
<h2>Paying</h2>
<p>Courier orders are paid in advance by UPI. If you are sending a gift, give us the receiver's name, address and phone number, and tell us if you want a note inside. We write it by hand.</p>`,
    },
    {
        slug: "gifts-hampers-and-wedding-orders",
        title: "Gift hampers, wedding orders and buying in bulk",
        category: "help",
        daysAgo: 25,
        excerpt:
            "Hampers for Eid and Diwali, small jars for wedding favours, and big orders for functions. How much notice we need.",
        image: unsplash("1695568181747-f54dff1d4654"),
        html: `<p>A jar of achaar is an old Lucknow gift. You take it when you visit, and you send it home with a daughter after her wedding. We make a few things to help with that.</p>
<h2>Hampers</h2>
<p>For <strong>Eid</strong> and <strong>Diwali</strong> we put together hampers: a few jars, aam papad, papad and a packet of masala, in a cloth-lined box. They are on the website in the weeks before each festival. Outside festivals, we can make up a gift box from whatever you choose. Tell us who it is for and we will help pick.</p>
${figure("1636619773834-c7e0762ddfe1", 1197, "Three lit clay diyas in the dark", "Diwali hamper orders open in October.", "Rajyavardhan Singh")}
<h2>Wedding favours and functions</h2>
<p>Small 100 g jars of aam ka achaar or chunda make good favours for a mehendi or a walima. For a function where pickle is served with the meal, we make 1 kg and larger jars.</p>
<ul>
<li><strong>Up to 30 jars:</strong> at least one week's notice.</li>
<li><strong>30 to 150 jars:</strong> two to three weeks.</li>
<li><strong>More than that:</strong> talk to us first. There are only two of us in the kitchen, plus help in mango season, and we will tell you honestly if we cannot do it well.</li>
</ul>
<h2>Paying for big orders</h2>
<p>For orders above ₹5,000 we take half in advance by UPI, because we buy the oil and fruit for you specially. The rest is paid on pick-up or delivery.</p>`,
    },
    {
        slug: "allergens-and-shelf-life",
        title: "Allergens, ingredients and how long things keep",
        category: "help",
        daysAgo: 9,
        excerpt:
            "Nearly everything we make has mustard in it, and a few things have sesame. What is in each jar, and how long it keeps.",
        image: unsplash("1701188542905-01e99a1b8177"),
        html: `<h2>Mustard and sesame</h2>
<p>Almost every pickle we make uses <strong>mustard oil and ground mustard seed</strong>. If you are allergic to mustard, please do not order our oil pickles. The only mustard-free items are the urad dal papad, aam papad and the sweet chunda, but they are made in the same kitchen, with the same spoons and the same air.</p>
<p>Our <strong>lehsun</strong> and <strong>adrak</strong> pickles, and the <strong>chaat masala</strong>, have <strong>sesame</strong> (til). The urad dal papad contains lentils and hing.</p>
${figure("1701188543419-f2e932565056", 1200, "Black mustard seeds spilling from a steel spoon on a white table", "Rai, the seed behind almost everything we make.", "Jaspreet Kalsi")}
<p>Nothing we make contains nuts, gluten-based thickeners, colour or preservatives. The salt is plain sea salt and the vinegar, in the few pickles that use it, is cane vinegar. If you have a question about one jar, ask us before you order.</p>
<h2>How long things keep</h2>
<ul>
<li><strong>Oil pickles</strong> (mango, lemon, mixed, chilli, garlic, ginger, karonda, kathal, amla): a year or more if stored well. They get better for the first few months.</li>
<li><strong>Sweet chunda and gud wala aam:</strong> about a year.</li>
<li><strong>Gajar-gobhi-shalgam:</strong> three to four weeks, in the fridge once sour.</li>
<li><strong>Masalas:</strong> best within three months of opening.</li>
<li><strong>Papad and aam papad:</strong> six months in a dry, closed tin.</li>
</ul>
<p>Every jar has the date it was made written on the lid in Faizan's handwriting.</p>`,
    },

    // ── News ────────────────────────────────────────────────────────────
    {
        slug: "raw-mangoes-are-in",
        title: "The first raw mangoes are in",
        category: "news",
        daysAgo: 174,
        excerpt:
            "Season's first kairi arrived from Malihabad this week. Aam ka achaar orders are open again.",
        image: unsplash("1623497718131-46ace0d4d707"),
        html: `<p>The first proper raw mangoes of the season came into the house on Tuesday. Firm, sour, with the stone still soft enough to cut through, which is what we need for launji and aam ka achaar.</p>
${figure("1705723115413-a0ec375ac414", 2400, "Green raw mangoes hanging in a cluster from a mango tree", "Kairi on the tree, a few weeks before it comes to us.", "Pavan Kumar Nagendla")}
<p>That means orders are open again for:</p>
<ul>
<li>Aam ka achaar in mustard oil</li>
<li>Aam ki launji</li>
<li>Gud wala aam</li>
<li>Sweet aam ka chunda, which takes five days, longer if April turns cloudy</li>
</ul>
<p>The first two weeks are always busy. If you can wait until May, the mangoes are cheaper and your jar will be the same. Lemon, chilli and garlic pickles carry on as usual alongside, though they may take a day longer while the verandah is full of mangoes.</p>`,
    },
    {
        slug: "eid-hampers-2026",
        title: "Eid hampers are ready to order",
        category: "news",
        daysAgo: 146,
        excerpt:
            "Two hampers for Bakrid this year, with new-season mango achaar. Last day for Lucknow delivery is Saturday 23 May.",
        image: unsplash("1547716467-fdb9102f1ac4"),
        html: `<p>Eid ul-Adha is next week, and the hampers are ready.</p>
<ul>
<li><strong>Chhota Dabba, ₹899:</strong> new-season aam ka achaar and lehsun, both 250 g, with a packet of aam papad.</li>
<li><strong>Bada Dabba, ₹1,650:</strong> aam ka achaar, launji, gud wala aam and nimbu-mirch (250 g each), urad dal papad and our garam masala, for the biryani and the kaleji.</li>
</ul>
${figure("1659694459412-02735752031f", 1067, "Two glass jars filled with dark pickle on a sunny ledge", "Both hampers are packed in cloth-lined boxes.", "Sourav Paul")}
<p>Lucknow delivery is free for both. The last delivery before Eid is <strong>Saturday 23 May</strong>, and orders for it need to reach us by Thursday night. Courier hampers for other cities went out on Monday; if you missed it, we can still send one after Eid, which is not a bad thing either.</p>
<p>Eid Mubarak in advance from Ammi, Faizan and the whole house.</p>`,
    },
    {
        slug: "summer-batch-ready",
        title: "This summer's mango pickles are ready",
        category: "news",
        daysAgo: 127,
        excerpt:
            "The big summer batch has rested and Ammi says it is ready. Aam ka achaar, launji and chunda can be collected this week.",
        image: unsplash("1685429631345-3de21cc2eb65"),
        html: `<p>For three weeks the verandah has been full of mangoes, jars, women with knives and Faizan carrying oil. This week it went quiet, which means the summer batch is done.</p>
${figure("1623207485293-fc768c6575fa", 1208, "Chopped raw mango in a round basket on a red printed cloth", "About three hundred kilos were cut this season.", "Ujjwal Jajoo")}
<p>Ammi has tasted every pot. This year's mangoes were especially sour, and the aam ka achaar has come out sharp in a way she says reminds her of 2021. The chunda took an extra two days of sun because of the dust storms, and it is darker than last year.</p>
<p>Everyone who ordered in May will hear from Faizan by Thursday. If you did not order and want some, there is enough. Mango achaar is made through June, and after that only until the mangoes run out.</p>`,
    },
    {
        slug: "monsoon-pause-on-sun-pickles",
        title: "A short pause on sun pickles for the rains",
        category: "news",
        daysAgo: 99,
        excerpt:
            "No bharwa lal mirch or new chunda until the rains ease. Everything else carries on as normal.",
        image: unsplash("1600721946649-e26bc4424d9d"),
        html: `<p>The monsoon has properly arrived in Lucknow. It is lovely for chai and terrible for anything that needs four days of sun.</p>
${figure("1753269045298-08cb92bd7374", 1248, "A person walking with an umbrella on a rainy street", "Not the week for drying chillies on the roof.", "Saad Ahmad")}
<p>Until the rains ease, probably the end of August, we are <strong>not taking new orders</strong> for:</p>
<ul>
<li>Bharwa lal mirch</li>
<li>Sweet aam ka chunda (we have a few jars from the summer batch, ask)</li>
</ul>
<p>Every other pickle is made as usual. Damp air also means we are extra careful with drying, so a few orders may take one day longer than the usual three or four. Faizan will tell you if yours does.</p>
<p>The good news: the rains are the best time for our lehsun and adrak pickles, and the first nimbu of the season is just starting at the mandi.</p>`,
    },
    {
        slug: "mustard-oil-price-change",
        title: "A small price change, and why",
        category: "news",
        daysAgo: 71,
        excerpt:
            "Kachi ghani mustard oil has gone up sharply since spring. From 1 September our jars cost ₹10 to ₹40 more.",
        image: unsplash("1631678783715-f27855736ed2"),
        html: `<p>We do not like writing this kind of note, so we will keep it plain.</p>
<p>The kachi ghani mustard oil we use has gone from ₹165 a litre in March to nearly ₹200 now. A kilo jar of achaar takes a lot of oil, and we have held our prices since last October. We are not going to change the oil to a cheaper one, so the price has to change instead.</p>
${figure("1649858575417-349179f31539", 2133, "A field of yellow mustard flowers under a blue sky", "Where the oil starts: sarson in flower.", "Chirag Bhardwaj")}
<p>From <strong>1 September</strong>:</p>
<ul>
<li>250 g jars: ₹10 more</li>
<li>500 g jars: ₹20 more</li>
<li>1 kg jars: ₹40 more</li>
</ul>
<p>Papad, aam papad, masalas and the Achaar ka Dabba box stay the same price. Any order placed before 1 September is charged at the old price, even if it is made after.</p>
<p>Thank you for understanding. If the oil comes down, so will we.</p>`,
    },
    {
        slug: "new-delivery-days",
        title: "Faizan's delivery days are changing",
        category: "news",
        daysAgo: 45,
        excerpt:
            "From September, deliveries across Lucknow are on Tuesday, Thursday and Saturday instead of Wednesday and Saturday.",
        image: unsplash("1639546218218-4614c6db9609"),
        html: `<p>Until now Faizan has delivered on Wednesdays and Saturdays. On some Saturdays that meant forty drops between Alambagh and Jankipuram, and the last few customers got their jars after nine at night. That is not fair to anyone.</p>
<p>So from <strong>Tuesday 1 September</strong>, deliveries will be on:</p>
<ul>
<li><strong>Tuesday</strong></li>
<li><strong>Thursday</strong></li>
<li><strong>Saturday</strong></li>
</ul>
${figure("1630448927918-1dbcd8ba439b", 1067, "A brown cardboard box on a white background", "Fewer boxes per trip, earlier in the evening.", "Christopher Bill")}
<p>The charge stays ₹60, free above ₹999. Achaar ka Dabba boxes still come on the first Saturday. If you have a standing arrangement for Wednesdays, Faizan will message you to move it.</p>
<p>Pick-up from Nishatganj does not change: every day from 11am to 7pm, closed Friday 12 to 3.</p>`,
    },
    {
        slug: "testing-kathal-achaar",
        title: "Something new on the stove: kathal achaar",
        category: "news",
        daysAgo: 29,
        excerpt:
            "Ammi is testing a new jackfruit pickle recipe. A few trial jars are going to regular customers first.",
        image: unsplash("1569294860071-b2ac12ee73b7"),
        html: `<p>We have made kathal ka achaar for a few years, but Ammi has never been fully happy with it. The pieces went soft too quickly for her liking.</p>
${figure("1593441040270-7e4a9f75091e", 1067, "Green jackfruits hanging from a tree among leaves", "Young kathal, before it is cut.", "jaikishan patel")}
<p>This month she is trying her bhabhi's way from Barabanki: the pieces are steamed for less time, dried for a full day, and the masala has more saunf and a little kalonji. The first trial jars are resting now.</p>
<p>Twelve of these jars will go to regular customers next week, free, with their usual order. We want honest answers. If you get one, please tell Faizan what you think, even if what you think is "go back to the old one."</p>`,
    },
    {
        slug: "closed-2-to-5-october",
        title: "Closed 2 to 5 October for a family wedding",
        category: "news",
        daysAgo: 19,
        excerpt:
            "The kitchen is closed for four days in early October. Orders placed by 29 September will still reach you before we go.",
        image: unsplash("1619581073186-5b4ae1b0caad"),
        html: `<p>Faizan's cousin is getting married in Kanpur, and Ammi would never forgive herself if she missed it. So the house will be locked from <strong>Friday 2 October to Monday 5 October</strong>.</p>
<ul>
<li>Orders placed by <strong>Tuesday 29 September</strong> will be made and delivered or ready to collect by Thursday 1 October.</li>
<li>Saturday's delivery on 3 October is cancelled. The Achaar ka Dabba box moves to Tuesday 6 October.</li>
<li>No courier dispatch on 5 October. The next one goes on 12 October.</li>
</ul>
${figure("1625033405953-f20401c7d848", 2400, "A clay kulhad of chai on a wooden table, seen from above", "Back on the 6th, with stories.", "Shubham Dangi")}
<p>You can still message us while we are away. Faizan will reply in the evenings, between the functions. Orders that come in while we are away will be made first thing when we are back.</p>`,
    },
    {
        slug: "diwali-hampers-open",
        title: "Diwali hampers are open",
        category: "news",
        daysAgo: 6,
        excerpt:
            "Three hampers this Diwali, from ₹899. Order by 1 November for Lucknow delivery, by 25 October for other cities.",
        image: unsplash("1636737512034-518389c47764"),
        featured: true,
        html: `<p>Diwali is on 8 November this year, and the hampers are ready to order.</p>
<ul>
<li><strong>Chhota Dabba, ₹899:</strong> aam ka achaar and meetha nimbu (250 g each), with aam papad.</li>
<li><strong>Bada Dabba, ₹1,650:</strong> four 250 g jars of your choice, urad dal papad and our chaat masala.</li>
<li><strong>Office Dabba:</strong> ten or more hampers for your team, with a handwritten card in each. Ask for a price.</li>
</ul>
${figure("1635952346904-95f2ccfcd029", 2400, "A plate of orange laddoos beside a lit diya on a dark table", "Pickle sits very well next to the mithai.", "Prchi Palwe")}
<h2>Last dates</h2>
<ul>
<li>Courier to other cities: order by <strong>Sunday 25 October</strong>, dispatched Monday 26 October. A last courier goes on 2 November, but we cannot promise it arrives before Diwali.</li>
<li>Lucknow delivery: order by <strong>Sunday 1 November</strong>. Hampers above ₹999 are delivered free.</li>
<li>Collect from Nishatganj until the evening of 7 November.</li>
</ul>
<p>Corporate orders need the most notice, so if you are thinking about one, message Faizan this week.</p>`,
    },
    {
        slug: "winter-pickles-next-month",
        title: "Gajar-gobhi-shalgam returns in November",
        category: "news",
        daysAgo: 1,
        excerpt:
            "The winter pickle comes back once the carrots and turnips are good, around the middle of November. You can tell us now if you want one.",
        image: unsplash("1603462903957-566630607cc7"),
        html: `<p>The mornings are already cooler in Nishatganj, and Ammi has started asking the sabziwalas when the red Delhi carrots will come.</p>
<p>Our gajar-gobhi-shalgam is made only from <strong>November to February</strong>, when the vegetables are sweet and crisp. The first batch should be ready in the third week of November, depending on the carrots.</p>
${figure("1702157896487-6dd66ce3c2c1", 1067, "Bunches of fresh carrots with green tops on a market cart", "We wait for the deep red winter carrots.", "Pon Esakki Sundar")}
<p>It is a sweet-and-sour pickle with gur and a little vinegar, and it does not keep as long as our oil pickles, so it is made in small batches every week. It is only for Lucknow: delivery or pick-up, no courier.</p>
<p>If you want to be in the first batch, send Faizan a message now with the size you want. We will confirm the day once the carrots are right.</p>`,
    },

    // ── Articles ────────────────────────────────────────────────────────
    {
        slug: "how-to-choose-raw-mangoes",
        title: "How to choose raw mangoes for achaar",
        category: "articles",
        daysAgo: 180,
        excerpt:
            "Not every green mango makes a good pickle. Ammi on desi kairi, ramkela, and the thumbnail test she learnt as a girl.",
        image: unsplash("1680008702821-e1b598db30f3"),
        html: `<p>Every April somebody in the family asks me why I am standing at the mango cart for twenty minutes. The answer is simple. A pickle is only as good as the mango you start with, and once it is cut and salted you cannot change your mind.</p>
<p>So here is what I look for. My mother taught me most of it. The rest I learnt by making mistakes, which my mother also said was the only way.</p>
${figure("1698090039552-8aa9791b8748", 2844, "Green raw mangoes hanging on long stalks from a tree", "Kairi still on the tree. For achaar we want them before the stone hardens.", "Akshay Chauhan")}
<h2>Which mango</h2>
<p>For aam ka achaar we use <strong>desi kairi</strong>, the small, sour mangoes from old trees around Malihabad that nobody would eat ripe. They have very little sweetness and a lot of character. If I can get them, I also use <strong>ramkela</strong>, which is a long mango grown almost only for pickle. It has firm flesh that stays crunchy in the oil for a whole year.</p>
<p>Dussehri and Chausa are the pride of Lucknow, but that is for eating, not for achaar. Raw Dussehri goes soft in a pickle within a month. I have nothing against it. It is simply the wrong job.</p>
<h2>What it should look like</h2>
<ul>
<li><strong>Deep green, no yellow at the shoulder.</strong> A blush of yellow near the stalk means it has started to ripen, and the pickle will turn sweet and mushy.</li>
<li><strong>Heavy for its size.</strong> Pick up two of the same size. The heavier one has more flesh and less air.</li>
<li><strong>Tight skin.</strong> No wrinkles, no soft patches, no black spots. A small scratch from the tree is fine.</li>
<li><strong>A little sap at the stalk.</strong> When you break the stalk, a few drops of milky sap should come out. That means it was picked recently. Be careful, the sap burns the skin.</li>
</ul>
<h2>The thumbnail test</h2>
<p>This is the one that makes the mango sellers laugh at me. Press your thumbnail into the skin near the stalk. It should go in with some effort and leave a clean mark. If your nail goes in easily, the mango is already softening. If it will not go in at all, it is too young, the stone will be hard to cut and the flesh will be bitter.</p>
<p>Then I ask the seller to cut one open. For aam ka achaar the stone, the guthli, should still be soft enough to cut through with a heavy knife, with a white, jelly-like inside. Once the stone turns hard and woody, those mangoes are better for launji or chunda, where we grate or peel the flesh and throw the stone away.</p>
<h2>When to buy</h2>
<p>In Lucknow the good pickling mangoes come from the middle of April to the start of June. The first week is expensive and the mangoes are sometimes too young. By the middle of May they are cheaper, better, and the sellers have time to let you choose. By June most of them are turning, and the season for kairi is over until next year.</p>
<p>Buy only what you can cut that day or the next. A raw mango kept for four days on the kitchen floor is already a different mango.</p>
<p>If you are making achaar at home this year, I hope this helps. And if you would rather leave the standing at the cart to me, you know where to find us.</p>`,
    },
    {
        slug: "why-we-make-achaar-after-you-order",
        title: "Why we only make achaar after you order it",
        category: "articles",
        daysAgo: 166,
        excerpt:
            "People ask why we do not just keep jars ready on a shelf. Ammi explains why your jar is made for you, and what that changes.",
        image: unsplash("1601702538934-efffab67ab65"),
        featured: true,
        html: `<p>When we started in 2019, I made big batches the way my mother did. Twenty kilos of mango achaar in the summer, ten kilos of lemon in the winter, and then we sold from those big martabans until they were empty.</p>
<p>It worked when it was only our neighbours. Then more people started ordering, and I found things I did not like.</p>
${figure("1768729340731-85e386e62529", 1067, "Elderly hands pounding spices in a steel mortar on a mud floor", "Some masalas still taste best pounded by hand, a little at a time.", "iKshana Productions")}
<h2>What a big tub does to achaar</h2>
<p>A big jar gets opened many times. Every time a spoon goes in, a little air goes in, sometimes a little moisture. The top of the jar dries, the oil drops, and the pickle at the bottom sits for months under the weight of the rest. By the time the last customer got their jar, it was not the same achaar the first customer got. It was older, softer, sometimes too salty because the salt keeps working.</p>
<p>My mother never had this problem because her achaar was for one family, and that family ate it in a year. Selling is different.</p>
<h2>So we changed</h2>
<p>From 2021 we started making most pickles only when an order comes. Faizan buys the lemons or chillies or garlic that morning, I make the masala fresh, and your jar is filled from a pot that was made for a few orders, not a hundred. It rests for its three or four days, I taste it, and it goes to you.</p>
<p>This has some disadvantages, and I will not hide them.</p>
<ul>
<li>You have to wait. Three or four days, five for the sun pickles. Some people do not want to wait, and I understand.</li>
<li>We cannot do everything at once. In mango season we stop taking certain orders when the kitchen is full.</li>
<li>It costs us a little more, because buying small is never as cheap as buying large.</li>
</ul>
<h2>What you get in exchange</h2>
<p>You get a jar that has been opened only once, by you. You get a pickle at the beginning of its life, when the fruit is still firm and the masala is bright, and you can watch it change in your own kitchen over the months. My aam ka achaar is good in the first week, very good in the second month, and in the sixth month it is something else again. I would like you to have all of that, not just the end of it.</p>
<p>You also get some say. If you like less salt, or no kalonji, or the lemon cut smaller for children, we can do that, because your jar is made for you anyway. A shop with a shelf cannot do that.</p>
<p>And honestly, it is better for us. We do not throw anything away. No tub sits in the corner going sour because nobody ordered karonda that month.</p>
<h2>The exceptions</h2>
<p>Some things we do keep ready. Papad, aam papad and our masalas are dried and sealed, so they keep well, and we make them in small batches. Mango pickles in summer are made in the season and kept, because mangoes do not wait for anyone. And the hampers for Eid and Diwali are packed ahead so they reach people in time.</p>
<p>Everything else waits for you. When Faizan says "ready on Thursday," that is not a delivery estimate. It is the day your achaar will be ready to eat.</p>`,
    },
    {
        slug: "from-my-mothers-kitchen",
        title: "From my mother's kitchen in old Lucknow",
        category: "articles",
        daysAgo: 158,
        excerpt:
            "Ammi grew up near Chowk, in a house where the roof was for drying chillies. This is where her pickles come from.",
        image: unsplash("1601752874509-0e350467dc7b"),
        featured: true,
        html: `<p>I grew up in a narrow house in the old city, near Chowk, close enough to the Imambara that we could hear the azaan from three mosques at once. My father had a small cloth shop. My mother, Ammi Jaan to us and Ammi to the whole lane, ran the house, and in the summer the house ran on achaar.</p>
${figure("1768729340375-5ca3544635d8", 2400, "An elderly woman in a printed sari grinding spices in a mortar, sitting on the floor", "Grinding masala the old way, sitting on the floor.", "iKshana Productions")}
<h2>The roof</h2>
<p>Our roof was not for sitting. In April it was for mangoes. In May it was for chunda in big glass jars with muslin tied over the top. In winter it was for red chillies, spread on old sheets and turned every two hours. I was the one sent up to turn them. I was also the one sent up when it looked like rain, running, to drag everything under the stairs.</p>
<p>My mother did not measure anything. She used her palm for salt, her fingers for haldi and her nose for everything else. When I asked her how much methi went into the masala, she said, "Until it smells right." It took me years to understand that this was the most precise answer she could give.</p>
<h2>What she made</h2>
<p>Her aam ka achaar was the one everybody wanted, sharp, with lots of saunf and kalonji, and the mustard oil so strong it made your eyes water when you opened the jar. She also made a nimbu ka achaar that sat in the sun for forty days and went soft and brown and sweet-sour, which she gave to anybody in the lane who had a stomach ache. And every Bakrid she made a lehsun ka achaar just for the kaleji.</p>
<p>She gave most of it away. A jar to my khala in Kanpur, a jar to the maulvi sahab, a jar to my father's shop for the customers who sat and drank chai. I do not think she ever sold a spoon.</p>
<h2>How it came to Nishatganj</h2>
<p>When I married, I came to Nishatganj, to this house with the mango tree at the gate. I brought her recipes in my head and one of her martabans, which is still in our kitchen and is now too precious to use. For twenty-five years I made achaar only for our family and for whoever asked.</p>
<p>In 2019 my neighbour's daughter-in-law asked if she could buy two jars of my aam ka achaar to take to Mumbai. Then her friend asked. Then Faizan, who had just finished college and was looking for work, said, "Ammi, people want to pay you for this. Let them." That was the beginning.</p>
<h2>What I kept, and what I changed</h2>
<p>I kept her masalas, her mustard oil, her rule about the dry spoon, and her habit of tasting every jar before it leaves the house. I kept her chunda almost exactly. I changed the salt a little, because people eat less salt now, and I changed the forty-day nimbu to something you can have in four, because nobody waits forty days for anything any more.</p>
<p>My mother passed away in 2016, before any of this. I think she would have been surprised that strangers pay for what she gave away. I also think she would have tasted my lemon pickle, made a face, and said it needed more sun.</p>`,
    },
    {
        slug: "the-women-who-cut-mangoes",
        title: "The women who cut mangoes with us",
        category: "articles",
        daysAgo: 141,
        excerpt:
            "Every summer, five women from the lane sit on our verandah for three weeks and cut three hundred kilos of mango. This is about them.",
        image: unsplash("1623207485293-fc768c6575fa"),
        html: `<p>For most of the year our kitchen is two people: me, and Faizan when he is not on his scooter. For three weeks in May it is seven, and the kitchen moves out onto the verandah, because there is no other room big enough.</p>
<p>I want to write about the five women who come, because without them there would be no summer batch, and because people who eat our aam ka achaar should know whose hands cut it.</p>
${figure("1623497718131-46ace0d4d707", 2133, "A heap of green raw mangoes", "A morning's mangoes, before the knives come out.", "Avinash Kumar")}
<h2>Who they are</h2>
<p><strong>Rukhsana Baji</strong> lives two doors down and has been coming since the very first year, when we cut forty kilos and thought it was a lot. She is the fastest with the heavy knife, the one that goes through the stone. Nobody else is allowed to use it.</p>
<p><strong>Kamla Didi</strong> comes from the lane behind the mandi. She does not cut. She salts, mixes and checks, and she can tell by touch whether a piece has been dried enough. When she says a tray needs another hour, it gets another hour.</p>
<p><strong>Shaheen</strong> and her sister <strong>Nazia</strong> are younger, college girls, and they come for the money and, they say, for the gossip. They peel and grate for the chunda, which is the most boring job, and they make it not boring for everybody else.</p>
<p>And <strong>Saira Apa</strong>, who is older than me, sits in the corner with a sil-batta and grinds the masala, because she says the mixie makes it taste of electricity. I do not argue with Saira Apa.</p>
<h2>A day on the verandah</h2>
<p>We start at seven, before the heat. Faizan brings the morning's mangoes in sacks, and they are washed in the big tub and dried on old bedsheets. By nine the cutting starts. Rukhsana Baji splits them, the girls sort the pieces, Kamla Didi salts them, and they go out on trays in the sun on the roof.</p>
<p>Nobody works in the afternoon. In May in Lucknow that would be cruel. We eat together, usually dal, rice and whatever pickle is left from last year, and sleep or talk until four. Then a second, shorter round until the light goes.</p>
<p>There is a lot of talking. Who is getting married, whose son has gone to Dubai, which sabziwala is cheating on the weight, what happened in the serial last night. I have learnt more about Nishatganj on that verandah than in thirty years of living here.</p>
<h2>How we pay</h2>
<p>Everyone is paid by the day, every evening, in cash, the same rate for everyone. Each of them also takes home a 1 kg jar of whatever they helped make. Rukhsana Baji says that is the real reason she comes. I do not believe her, but I like hearing it.</p>
<h2>Why I am writing this</h2>
<p>When you see "made at home" on a jar, it is easy to imagine one old lady alone in a kitchen. That is true for most of the year. But the mango pickle, the one most of you order, is made by seven women who have known each other for years, on a verandah, in the heat, laughing. I think it tastes like that. I hope you do too.</p>`,
    },
    {
        slug: "kachi-ghani-mustard-oil",
        title: "Kachi ghani or refined: why the oil matters",
        category: "articles",
        daysAgo: 113,
        excerpt:
            "The oil is half of any achaar. Ammi explains what kachi ghani mustard oil is, and why she will not use anything else.",
        image: unsplash("1649858575417-349179f31539"),
        html: `<p>When people taste our achaar for the first time, the first thing they notice is not the mango or the lemon. It is the sharpness at the back of the nose, a sort of pleasant sting. That is the mustard oil. It is not a mistake, and I will not take it out.</p>
${figure("1701188543419-f2e932565056", 1200, "A steel spoon full of small black mustard seeds", "Rai, the small dark mustard seed. The oil is pressed from its cousin, the yellow-brown sarson.", "Jaspreet Kalsi")}
<h2>What kachi ghani means</h2>
<p><em>Ghani</em> is the old oil press, a big wooden or stone pestle turning slowly in a mortar, once driven by a bullock and now usually by a small motor. <em>Kachi</em> means raw, or cold. Kachi ghani oil is pressed slowly from mustard seed without heating it, and it is not refined afterwards. It comes out dark gold, thick, and with that strong smell.</p>
<p>Refined oil is made differently. The seed is pressed hot or the oil is pulled out with chemicals, and then it is bleached and deodorised until it has almost no colour, no smell and no taste. That is useful for frying puris for a wedding of five hundred people. It is useless for achaar.</p>
<h2>Why it matters in a pickle</h2>
<p>In achaar the oil is not just for cooking. It does three jobs.</p>
<ol>
<li><strong>It protects.</strong> The fruit sits under the oil for months, and the oil keeps out air and moisture. Kachi ghani mustard oil does this especially well. It is why mustard oil pickles last a year on a shelf without a fridge.</li>
<li><strong>It carries the masala.</strong> Saunf, methi, kalonji and haldi give their flavour to the oil, and the oil carries it into every piece. A neutral oil carries less.</li>
<li><strong>It is a flavour of its own.</strong> The pungency is part of the taste of a north Indian achaar. Without it, a mango pickle from Lucknow tastes like a mango pickle from nowhere.</li>
</ol>
<h2>Smoking the oil</h2>
<p>Raw mustard oil is too harsh to use straight from the bottle. We heat it in a heavy kadhai until it just starts to smoke and turns a shade paler, then switch off the gas and let it cool completely. This takes the rawness off but keeps the bite. If you skip this step, the pickle tastes bitter. If you pour it in hot, you cook the fruit and it goes soft. Patience, again.</p>
<h2>How we buy it</h2>
<p>We buy our oil in tins from one ghani in Barabanki that we have used for four years. I know the family. I have seen the press. I smell every tin before it comes into the kitchen, and once or twice I have sent a tin back.</p>
<p>It is more expensive than what you find in a supermarket, and it got a lot more expensive this year, which is why our prices went up a little. We thought about switching to a cheaper brand. We tried one batch of lemon pickle with it. It was fine. It was just fine, and fine is not what anybody orders from us.</p>
<h2>If you are making achaar at home</h2>
<p>Buy a small bottle of real kachi ghani oil and smell it before you use it. It should make you step back a little. If it smells of nothing, it is either refined or blended, whatever the label says. And always smoke it and cool it first.</p>`,
    },
    {
        slug: "parathas-with-leftover-achaar-oil",
        title: "Don't throw away the oil: achaar ke tel ke parathe",
        category: "articles",
        daysAgo: 93,
        excerpt:
            "When the jar is empty, the best part is still in it. Ammi's recipe for parathas and aloo made with leftover pickle oil.",
        image: unsplash("1789991895360-ad65a685485a"),
        html: `<p>In my house nobody is allowed to wash an empty achaar jar. Not until I have checked it. Because when the last piece of mango is gone, there is usually a finger of oil left at the bottom, red with haldi and mirch, full of saunf and kalonji and the taste of everything that sat in it for months. That oil is gold.</p>
<p>Here are the two things I do with it most often. Both are simple, and both have been breakfast in our house more times than I can count.</p>
${figure("1708783741187-ff1d081d87da", 1600, "A stack of golden parathas on a plate with coriander and a halved lime", "Achaar oil parathas are best eaten straight off the tawa.", "Rimsha Noor")}
<h2>Achaar ke tel ke parathe</h2>
<p>For about six parathas:</p>
<ul>
<li>2 cups atta</li>
<li>3 to 4 tablespoons leftover achaar oil, with any masala bits at the bottom</li>
<li>Half a teaspoon ajwain</li>
<li>Salt, carefully, because the oil is already salty</li>
<li>Water to knead</li>
</ul>
<ol>
<li>Rub two tablespoons of the oil into the atta with your fingers until it feels like wet sand. Add the ajwain and a small pinch of salt.</li>
<li>Knead with water to a soft dough. Cover and leave for twenty minutes.</li>
<li>Roll out a ball, brush with a little more achaar oil, fold into a triangle or roll it up like a rope and coil it, then roll again. This gives you layers.</li>
<li>Cook on a hot tawa, turning once, then brush with oil and press the edges with a cloth until both sides are crisp and spotted.</li>
</ol>
<p>Eat with dahi and nothing else. You do not need more pickle. The paratha already is pickle.</p>
<h2>Achaari aloo</h2>
<p>This is what I make when the parathas are plain and we need something with them.</p>
<ol>
<li>Boil four potatoes, peel and cut into big pieces.</li>
<li>Heat two tablespoons of achaar oil in a kadhai. When it is hot, add a pinch of hing and a pinch of methi seeds.</li>
<li>Add the potatoes, a little haldi, salt to taste, and any small pieces of masala left in the jar.</li>
<li>Toss on a high flame until the potatoes catch at the edges. Finish with a squeeze of lemon and green coriander.</li>
</ol>
<p>If the oil came from a mango pickle, the aloo will be a little sour. If it came from lehsun, it will taste of garlic. If it came from the mixed achaar, it will taste of everything. All of them are good.</p>
<h2>Other ways</h2>
<ul>
<li>A spoon in plain dal, just before serving.</li>
<li>Rubbed on paneer or chicken before it goes on the tawa.</li>
<li>Mixed into hot rice with a little salt, for a child who will not eat anything else. This has worked on Faizan since he was four.</li>
</ul>
<p>And then, finally, you may wash the jar.</p>`,
    },
    {
        slug: "a-lucknow-breakfast-with-achaar",
        title: "A Lucknow breakfast, with a spoon of achaar",
        category: "articles",
        daysAgo: 67,
        excerpt:
            "Puri, kachori, nihari or plain parathas: what a Lucknow morning tastes like, and where the pickle goes.",
        image: unsplash("1717587052948-fb9825de50f8"),
        html: `<p>People who visit Lucknow talk about kebabs and biryani. Those are evening foods. If you want to know the city, get up early, because Lucknow is very serious about breakfast.</p>
${figure("1630748662359-40a2105640c7", 2133, "Two kulhads of milky chai on a wooden table beside a plate of snacks", "Chai in a kulhad, the first thing on every Lucknow morning.", "VD Photography")}
<h2>The weekday breakfast</h2>
<p>In our house on an ordinary day, breakfast is parathas, plain or with ajwain, made one at a time while everybody else sits. With them, a bowl of dahi, a small plate of whatever achaar is open, and tea strong enough to stand a spoon in. Faizan has two parathas before his first delivery run. His father had three until the doctor said otherwise.</p>
<p>The achaar here is not a side thing. A piece of aam ka achaar torn into a hot paratha with a bit of dahi is a complete meal. On cold mornings the nimbu-mirch goes with it, because it wakes you up better than tea.</p>
<h2>Sunday mornings</h2>
<p>On Sundays somebody goes out. In the old city the queues start before seven: puri and aloo sabzi, khasta kachori with sour chhole, jalebi still hot from the oil. In Nishatganj we have our own shops near the market, and the man at the corner has been frying kachoris since before Faizan was born.</p>
<p>When they come home with packets of puris and aloo, I put out three jars on the table: mixed achaar, which goes with everything, lehsun, because some people need garlic in the morning, and sweet chunda, because there is always one child who wants something sweet with a puri. Nobody touches the karonda before noon. I do not know why. It is a rule nobody made.</p>
<h2>Nihari mornings</h2>
<p>And then there are the winter mornings for nihari, the slow-cooked meat stew that the old city eats with sheermal or khameeri roti, very early, after Fajr. It is rich and heavy and almost sweet with spice. With nihari you want something sharp to cut through it, and for that I prefer the adrak achaar, thin slices of ginger in lemon and a little mustard oil. Some people put a slice of fresh lemon on the side instead. Those people have not tried my adrak achaar.</p>
<h2>How much achaar is the right amount</h2>
<p>A small piece. People who are new to homemade pickle sometimes take a big spoonful, as if it were a chutney, and then they are crying into their puris. Our achaar is strong. A piece the size of your thumbnail with each few mouthfuls is plenty. It is there to make the rest of the plate taste more like itself.</p>
<h2>A suggestion</h2>
<p>If you only buy one jar from us to try with breakfast, make it the mixed achaar. It has mango, lemon, carrot, chilli and ginger in it, so whatever you eat in the morning, something in there will suit it. And put the kettle on before you open the jar.</p>`,
    },
    {
        slug: "why-our-chunda-sits-in-the-sun",
        title: "Why our chunda sits in the sun",
        category: "articles",
        daysAgo: 37,
        excerpt:
            "Most chunda today is cooked on the stove in an hour. Ours sits on the roof for five days. Ammi on what the sun does that the gas cannot.",
        image: unsplash("1788238025855-55581a2ed354"),
        html: `<p>Chunda is the sweet one. Grated raw mango, sugar, a little salt, red chilli and roasted jeera, slowly turned into something between a jam and a pickle. Children love it, and so do a lot of grown men who would not say so.</p>
<p>There are two ways to make it, and people sometimes ask us why we choose the slow one.</p>
${figure("1617854307432-13950e24ba07", 2000, "A glass jar of pickle with cotton cloth tied over the mouth with string", "A muslin cloth instead of a lid while the jar is in the sun.", "Prchi Palwe")}
<h2>The quick way</h2>
<p>You grate the mango, mix it with sugar, and cook it on the stove, stirring, until the syrup reaches a one-thread consistency. Then the spices go in and it is done in an hour. It is not wrong. Many good cooks make it this way, and it tastes good.</p>
<h2>The sun way</h2>
<p>We do what my mother did. The grated mango and sugar are mixed in a wide glass jar and left for a few hours until the sugar melts into the juice. Then the jar's mouth is tied with a clean muslin cloth, and it goes up to the roof. Every morning it goes out in the sun. Every evening it comes back in. Every day someone stirs it with a dry wooden spoon.</p>
<p>In a good Lucknow summer, with proper sun, it takes four to five days for the syrup to thicken and for the mango to turn from pale green-white to clear gold. In a cloudy week it can take seven. That is why we say five days for chunda and not three.</p>
<h2>What the sun does</h2>
<p>I have made both. Here is what I notice.</p>
<ul>
<li><strong>The mango stays itself.</strong> On the stove, the mango shreds cook and go soft. In the sun they turn clear but keep a little bite, and you can still taste that it was a raw mango.</li>
<li><strong>The sweetness is gentler.</strong> Cooked sugar tastes of caramel, a little. Sun-made chunda tastes of mango and sugar, nothing in between.</li>
<li><strong>The colour is lighter.</strong> Stove chunda goes amber to brown. Ours stays golden, unless it has been a dusty summer, when it comes out a little darker.</li>
<li><strong>It keeps.</strong> The sun slowly takes out water. A well-sunned chunda keeps for a year on a shelf without spoiling.</li>
</ul>
<h2>What it costs</h2>
<p>Time, roof space and attention. In May our roof has more chunda jars than space to walk, and someone must always remember to bring them in before an aandhi, the dust storm that comes in the afternoon without warning. We have lost two jars in seven years to sand. Faizan still argues that the second one was not his fault.</p>
<p>The same is true of our bharwa lal mirch, the big red chillies stuffed with masala, which also need sun to mellow. And it is why, during the monsoon, we stop taking orders for both. No sun, no chunda.</p>
<p>Our gud wala aam is a different thing: cooked with jaggery on the stove, darker and more toffee-like. If you want to taste the difference between sun and fire, order one of each.</p>`,
    },
    {
        slug: "gajar-gobhi-shalgam-winter-tradition",
        title: "Gajar, gobhi, shalgam: the pickle that means winter",
        category: "articles",
        daysAgo: 15,
        excerpt:
            "Ammi on the sweet-sour winter pickle of carrot, cauliflower and turnip, and why it only appears between November and February.",
        image: unsplash("1702157896487-6dd66ce3c2c1"),
        featured: true,
        html: `<p>Every family in north India has a winter pickle, and in our family it is gajar-gobhi-shalgam. You do not see it in April. You do not see it in August. It arrives with the first quilts out of the trunk and the first smoke from the angithi, and it goes when the carrots start to turn woody in March.</p>
<p>In a few weeks we start making it again, so I wanted to write about it.</p>
${figure("1709450516752-ef31c0f0ed62", 1067, "Baskets of vegetables, greens, garlic and ginger at an Indian market stall", "Winter mornings at the mandi decide what goes into the pickle.", "Harshal More")}
<h2>What it is</h2>
<p>Carrot, cauliflower and turnip, cut into pieces about the size of a finger joint, blanched for a moment, dried in the winter sun, and then mixed with mustard oil, ground rai, red chilli, garlic and ginger. Then comes the part that makes it different from our other achaar: a syrup of <strong>gur</strong> and a little <strong>sirka</strong>, cane vinegar, that turns it sweet and sour at once.</p>
<p>It is a Punjabi pickle originally, I think. My mother learnt it from a Sardarni who lived opposite us in the old city in the 1970s, and they exchanged recipes over the wall for years. She taught my mother the gajar-gobhi-shalgam. My mother taught her the chunda. I like to think there is a kitchen in Amritsar where someone still makes our chunda.</p>
<h2>Why only in winter</h2>
<p>Because that is the only time the vegetables are good. The deep red Delhi carrots come in December, sweet and juicy. Turnips are small and tender in the cold. Cauliflower in Lucknow in January is so white and tight you could knock on it. In summer these vegetables are watery and tired, and the pickle would be too.</p>
<p>Winter sun also matters. It is gentle, so it dries the pieces without cooking them. We spread them on sheets on the roof for a day, sometimes two, until they are dry to the touch but still crisp inside.</p>
<h2>How it is different from our other pickles</h2>
<ul>
<li><strong>It is ready quickly.</strong> In three or four days in the jar it is already sour enough to eat. In a week it is at its best.</li>
<li><strong>It does not keep long.</strong> Because the vegetables have more water, it lasts three or four weeks, longer in the fridge once it is sour enough for your taste.</li>
<li><strong>It does not travel.</strong> We do not send it by courier. It is only for Lucknow, pick-up or Faizan's delivery days.</li>
</ul>
<p>So we make it in small batches every week through the winter, and that suits it.</p>
<h2>How to eat it</h2>
<p>With everything. With makki ki roti and sarson ka saag, of course. With plain dal and rice on a cold night. With a stuffed mooli paratha in the morning. The carrots are always eaten first, and the turnips are always left until last. I have watched this in my family for fifty years and I still do not understand it.</p>
<p>If you have never tried it, this is the winter to start. Tell Faizan you want to be in the first batch.</p>`,
    },
];
