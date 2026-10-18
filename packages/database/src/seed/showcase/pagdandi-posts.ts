/**
 * Margin Books & Café's journal: the posts on the bookshop's own site.
 * Help (how ordering, the club and events work), news (what's on, most of
 * it recent) and articles (Anagha's and Siddharth's own writing).
 *
 * Every photo is a vetted, free Unsplash photo (no Unsplash+), checked by eye
 * for legible in-copyright covers and captioned generically — never as the
 * shop or its people. Books named are public-domain classics or the shop's
 * fictional local writers.
 */
import type { DemoPost } from "./demo-shop-types";

/** A 1600-wide Unsplash address. */
function photo(id: string): string {
    return `https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`;
}

/** One body figure; `height` is the real height of the 1600-wide render. */
function figure(
    id: string,
    height: number,
    alt: string,
    caption: string,
    credit: string,
): string {
    return `<figure><img src="${photo(id)}" alt="${alt}" width="1600" height="${height}"><figcaption>${caption} Photo: ${credit} / Unsplash</figcaption></figure>`;
}

export const PAGDANDI_POSTS: DemoPost[] = [
    // ─── News ────────────────────────────────────────────────────────────
    {
        slug: "kasba-peth-rains-launch-evening",
        title: "Kasba Peth Rains: launch evening on Thursday 5 November",
        category: "news",
        daysAgo: 0,
        featured: true,
        excerpt:
            "Meghna Apte reads from her new Pune novel at our Thursday evening on 5 November, 6:30pm. Thirty seats, ₹200 with chai.",
        image: photo("1753269045298-08cb92bd7374"),
        html: `<p>We have been waiting a long time to write this one. Meghna Apte's new novel, <em>Kasba Peth Rains</em>, ships on 1 November, and on <strong>Thursday 5 November at 6:30pm</strong> she will read from it at the shop.</p>
<p>The book follows three generations of one family in a wada off Kasba Peth over a single monsoon, from the first downpour in June to the last of the rain in September. Anyone who has stood under a shop awning near Shaniwar Wada waiting for a shower to pass will know the street it is set on.</p>
<h2>The evening</h2>
<ul>
<li>Thursday 5 November, doors at 6:15pm, reading at 6:30pm</li>
<li>₹200 a seat, which includes Siddharth's chai and a biscuit from Friday's batch</li>
<li>30 seats, booked from the events page</li>
<li>Meghna will sign copies afterwards; pre-ordered copies can be collected that evening</li>
</ul>
${figure("1517664121940-f819957bb072", 1200, "A fountain pen nib above a single drop of ink on white paper", "Bring your copy along; there will be time for signing after the reading.", "Nicolas Thomas")}
<p>If you have pre-ordered and cannot make it, nothing changes: your copy leaves us on 1 November as planned. If you would like it signed and held for you instead, reply to your order email and we will set it aside.</p>`,
    },
    {
        slug: "diwali-hours-and-gift-sets-2026",
        title: "Diwali hours, and this year's gift sets",
        category: "news",
        daysAgo: 2,
        excerpt:
            "When we're open around Diwali, the last day for Pune deliveries, and three gift sets put together by Anagha.",
        image: photo("1577083753695-e010191bacb5"),
        html: `<p>Diwali falls on Sunday 8 November this year. Here is how the week around it looks at Margin.</p>
<h2>Opening hours</h2>
<ul>
<li><strong>Saturday 7 November:</strong> 10am–9pm as usual, with story hour at 11am</li>
<li><strong>Sunday 8 November:</strong> 10am–2pm only</li>
<li><strong>Monday 9 November:</strong> closed, as every Monday</li>
<li><strong>Tuesday 10 November:</strong> closed, so the three of us get a day with our families</li>
<li><strong>Wednesday 11 November:</strong> back to 10am–9pm (and used-book buying as usual)</li>
</ul>
<p>The last day for Pune deliveries before Diwali is Friday 6 November. Courier orders to the rest of India should be in by Sunday 1 November if you want them there in time.</p>
<h2>Gift sets</h2>
${figure("1513201099705-a9746e1e201f", 1200, "A parcel wrapped in brown paper and tied with a pink ribbon", "Every set goes out wrapped in plain brown paper with a ribbon.", "Jess Bailey")}
<ul>
<li><strong>The reader's box (₹1,199):</strong> two good used classics chosen by Anagha, an A6 field notebook and a bookmark</li>
<li><strong>The writer's box (₹1,450):</strong> the A5 field notebook, a bottle of fountain-pen ink in a colour of your choice and a tote</li>
<li><strong>The children's box (₹899):</strong> a Panchatantra retelling, a Sushma Kale picture book and a voucher for one Saturday story hour</li>
</ul>
<p>Tell us who the box is for when you order and we will pick the books to suit.</p>`,
    },
    {
        slug: "november-book-of-the-month-the-home-and-the-world",
        title: "November's Book of the Month: The Home and the World",
        category: "news",
        daysAgo: 4,
        excerpt:
            "After Premchand's village, Tagore's drawing room: Ghare Baire is the club's November book, and the meet-up is Sunday 29 November.",
        image: photo("1474366521946-c3d4b507abf2"),
        html: `<p>November's club book is Rabindranath Tagore's <em>The Home and the World</em> (<em>Ghare Baire</em>), first published in 1916.</p>
<p>It is a short novel told in turns by three people: Bimala, her husband Nikhil, and Sandip, the charismatic nationalist who comes to stay. Swadeshi is in the air, foreign cloth is being burned, and the question of what a country owes its people is argued out inside one household. It reads quickly and argues slowly, which makes it a very good book to talk about over coffee.</p>
${figure("1588666309990-d68f08e3d4a6", 2416, "An open book on a wooden tray beside a cup of coffee and a small vase of white flowers", "A short novel, three narrators, and a lot to argue about.", "Julia Kicova")}
<p>Members' copies go out from Tuesday 3 November (Pune deliveries) or can be collected from the counter from the same day. The meet-up is on <strong>Sunday 29 November at 5pm</strong> in the café corner.</p>
<p>Not a member yet? Join before 20 November and this is your first book. The club is ₹649 a month and comes with a café coupon each month.</p>`,
    },
    {
        slug: "story-hour-november-talking-animals",
        title: "Story hour in November: animals who talk back",
        category: "news",
        daysAgo: 7,
        excerpt:
            "Four Saturdays of Panchatantra and Jataka tales, and one morning with Sushma Kale.",
        image: photo("1757877219270-3cc753c4b4d5"),
        html: `<p>Every Saturday in November our 11am story hour is about animals who are cleverer than they look, and a few who are not.</p>
<ul>
<li><strong>7 November:</strong> the monkey and the crocodile</li>
<li><strong>14 November:</strong> the lion and the clever hare (and the well)</li>
<li><strong>21 November:</strong> Sushma Kale reads two stories of her own and draws with the children</li>
<li><strong>28 November:</strong> Jataka tales: the golden deer and the talkative tortoise</li>
</ul>
${figure("1709802247879-3d4241a05dc4", 1067, "A row of children on a wooden bench, each bent over an open book", "Fifteen places each Saturday, for ages four to eight.", "Sarang Bhojwani")}
<p>Story hour is ₹150 a child, for ages 4–8, with 15 places each week. Parents are welcome to stay in the café corner; Siddharth will have the Saturday biscuits out. Book from the events page, and cancel by Friday 6pm if plans change.</p>`,
    },
    {
        slug: "new-ink-colours-in",
        title: "New ink colours on the counter",
        category: "news",
        daysAgo: 11,
        excerpt:
            "Five new fountain-pen inks, including a deep monsoon green and a brick red.",
        image: photo("1509652839609-d94a8ad572db"),
        html: `<p>The ink shelf by the till has grown. Five new colours came in this week, all in 50ml bottles:</p>
<ul>
<li><strong>Monsoon green</strong>, the colour of the Prabhat Road trees in August</li>
<li><strong>Brick red</strong>, close to the old Peth houses</li>
<li><strong>Slate blue-black</strong>, for people who want black but not quite</li>
<li><strong>Turmeric</strong>, a warm yellow for headings and underlining</li>
<li><strong>Ink-cap brown</strong>, a sepia that looks old the moment it dries</li>
</ul>
${figure("1703950104186-aeb81511cfd2", 1067, "Four small bottles of blue, magenta, yellow and black ink on a white table", "There is a swatch card for every colour next to the testers.", "A J")}
<p>Testers and a pad of the same paper as our A5 field notebook are on the counter, so you can see how each colour behaves before you buy. Courier orders get a small swatch card in the parcel.</p>`,
    },
    {
        slug: "cold-brew-in-the-cafe-corner",
        title: "Cold brew has arrived in the café corner",
        category: "news",
        daysAgo: 16,
        excerpt:
            "October heat is not over yet, so Siddharth has started a slow cold brew alongside the filter coffee.",
        image: photo("1531835207745-506a1bc035d8"),
        html: `<p>Pune's October afternoons are still warm, and a few regulars have been asking for something cold. So Siddharth has started a cold brew, steeped overnight for sixteen hours from the same beans he uses for filter coffee.</p>
${figure("1527156231393-7023794f363c", 2263, "A tall glass of iced coffee with milk swirling through it on a wooden tray", "With milk and a little jaggery syrup, or black over ice.", "Eiliv Aceron")}
<p>It comes black over ice or with milk and a spoon of jaggery syrup. There are only about twenty glasses a day, so it tends to run out by four. Filter coffee and chai carry on as before, and the biscuits still come out on Tuesdays and Fridays.</p>
<p>Book club coupons work on the cold brew too.</p>`,
    },
    {
        slug: "october-book-of-the-month-godaan",
        title: "October's Book of the Month: Godaan",
        category: "news",
        daysAgo: 22,
        excerpt:
            "Premchand's last completed novel is this month's club book. The meet-up is Sunday 25 October.",
        image: photo("1694730750153-8b66cf3dd014"),
        html: `<p>For October, the club is reading Munshi Premchand's <em>Godaan</em> (1936), the story of Hori, a farmer who wants one thing in his life: a cow of his own.</p>
<p>It is the longest book we have picked this year, and we know it. But it moves between Hori's village and the city in a way that keeps it from ever feeling heavy, and the last chapters are among the best things written in Hindi. Members can choose the Hindi original or an English translation when they collect.</p>
${figure("1591951425328-48c1fe7179cd", 1067, "The pages of an open paperback fanned out in soft light", "Choose Hindi or English when you collect your copy.", "Olga Tutunaru")}
<p>The meet-up is on <strong>Sunday 25 October at 5pm</strong> in the café corner. Anagha has also written a longer piece about reading it again; it's on the journal.</p>`,
    },
    {
        slug: "closed-anant-chaturdashi",
        title: "Closed on Anant Chaturdashi, Friday 25 September",
        category: "news",
        daysAgo: 24,
        excerpt:
            "Lane 3 will be full of processions and so will we. Back on Saturday morning for story hour.",
        image: photo("1598090216740-eb040d8c3f82"),
        html: `<p>The shop will be closed on <strong>Friday 25 September</strong> for Anant Chaturdashi. Prabhat Road and the lanes around it are closed to traffic for most of the day, deliveries cannot get out, and frankly none of us wants to miss the procession.</p>
<p>Orders placed online on Friday will be packed on Saturday morning. Pune deliveries go out on Saturday afternoon, and courier parcels on Tuesday, since we are closed on Monday as usual.</p>
${figure("1608019425630-bec4810ccb60", 2133, "Stone steps and a round bastion on a hill fort in the Sahyadris", "A hill fort in the Sahyadris, a short drive from the city.", "Abhijeet Gaikwad")}
<p>We are back at 10am on <strong>Saturday 26 September</strong>, and story hour runs at 11am as usual. Ganpati Bappa Morya.</p>`,
    },
    {
        slug: "three-hundred-books-from-a-prabhat-road-house",
        title: "Three hundred books from a house on Prabhat Road",
        category: "news",
        daysAgo: 29,
        excerpt:
            "A family two lanes away asked us to find new homes for their grandfather's library. The first shelves are out now.",
        image: photo("1596123068611-c89d922a0f0a"),
        html: `<p>Last month a family two lanes from us asked if we would take their late grandfather's books. He was a schoolteacher who bought carefully for sixty years, and there were a little over three hundred of them.</p>
<p>We have spent two weeks going through every one, page by page. About two hundred and forty made it. The rest were too damp, too foxed or too far gone, and the family has kept the ones with his notes in the margins.</p>
${figure("1654124803048-597350406baf", 1067, "A very old, worn book open at its title page on a pale table", "Some of these books are older than the shop's building.", "Kelly Sikkema")}
<p>What's out now, on the two shelves by the window:</p>
<ul>
<li>A run of old Marathi editions, including two copies of Sane Guruji's <em>Shyamchi Aai</em></li>
<li>Hardback Dickens and Thackeray in matching bindings</li>
<li>A good Conan Doyle collection and several Stevensons</li>
<li>Gandhi's autobiography in three languages</li>
</ul>
<p>Most are graded Good or Very good and priced between ₹120 and ₹450. Come early; the Dickens will not last.</p>`,
    },
    {
        slug: "monsoon-reading-discount-has-ended",
        title: "The monsoon reading discount has ended",
        category: "news",
        daysAgo: 37,
        excerpt:
            "Thank you to everyone who bought a rainy-day book with us this season. Prices are back to normal from 8 September.",
        image: photo("1600721946649-e26bc4424d9d"),
        html: `<p>The rain has eased, and so has our monsoon offer. The 10% off used books that ran through July and August ended with Sunday 6 September.</p>
<p>It was our busiest monsoon yet. Between the offer and a lot of wet Sunday afternoons, nearly six hundred used books left the shop, and the café corner got through more chai than in any month since we opened.</p>
${figure("1470432581262-e7880e8fe79a", 1065, "Raindrops on a dark window with heavy clouds beyond", "Thank you for coming out in it.", "Glenn Carstens-Peters")}
<p>Club members keep their usual café coupon, and the Wednesday used-book buying carries on as normal. If you sold us books over the summer and have store credit left, it does not expire.</p>`,
    },

    // ─── Help ────────────────────────────────────────────────────────────
    {
        slug: "how-to-order-collect-and-pay",
        title: "How to order, collect and pay",
        category: "help",
        daysAgo: 150,
        excerpt:
            "Order on the site and collect from the counter, or have it brought to you. Every way to pay, in one place.",
        image: photo("1485322551133-3a4c27a9d925"),
        html: `<p>You can buy from us in three ways: walk in, order on this site and collect, or order here and have it delivered.</p>
<h2>Ordering and collecting</h2>
<ol>
<li>Add books to your bag and choose <strong>Collect from the shop</strong> at checkout.</li>
<li>We set the books aside and send you a message when they are ready, usually within two hours while we are open.</li>
<li>Come to 14 Prabhat Road, Lane 3, any time Tuesday to Sunday between 10am and 9pm, and give your name or order number at the counter.</li>
</ol>
<p>We hold collected orders for seven days. If you need longer, tell us; we would rather hold a book a little longer than put it back on the shelf.</p>
${figure("1495446815901-a7297e633e8d", 1067, "A row of books standing on a table with their page edges facing out", "Orders are set aside behind the counter, labelled with your name.", "Tom Hermans")}
<h2>Paying</h2>
<ul>
<li><strong>Online:</strong> UPI, cards and net banking at checkout.</li>
<li><strong>At the counter:</strong> UPI, cards or cash.</li>
<li><strong>Pay on collection:</strong> choose it at checkout and pay when you pick up. This is only for collection, not delivery.</li>
</ul>
<p>Store credit from selling us used books and club café coupons can be used at the counter. Every order gets a proper GST invoice by email.</p>`,
    },
    {
        slug: "delivery-in-pune-and-courier-across-india",
        title: "Delivery in Pune and courier across India",
        category: "help",
        daysAgo: 140,
        excerpt:
            "₹50 within Pune and free over ₹799. ₹80 by courier anywhere in India. How long each takes.",
        image: photo("1566576721346-d4a3b4eaeb55"),
        html: `<p>We deliver within Pune ourselves and send everything else by courier.</p>
<h2>Within Pune</h2>
<ul>
<li><strong>₹50</strong> a delivery, and <strong>free on orders over ₹799</strong>.</li>
<li>Orders placed before 2pm usually go out the same evening; later orders go the next day we are open.</li>
<li>We cover the whole city, from Aundh to Hadapsar and Kothrud to Viman Nagar. Outer areas like Wagholi or Talegaon can take an extra day.</li>
</ul>
<p>Delivery runs Tuesday to Sunday, since the shop is closed on Mondays.</p>
${figure("1577702312706-e23ff063064f", 1067, "A plain cardboard box on a table in a dim room", "Books travel wrapped in paper inside a plain box, with card at the corners.", "Brandable Box")}
<h2>Anywhere else in India</h2>
<ul>
<li><strong>₹80</strong> per order by courier, whatever its size.</li>
<li>Metros usually take 3–4 days, smaller towns 5–7.</li>
<li>You get a tracking link by message once the parcel is booked.</li>
</ul>
<p>Every book is wrapped and boxed; we do not send books in plastic envelopes. If anything arrives damaged, send us a photo within three days and we will replace it.</p>`,
    },
    {
        slug: "reserving-a-book-and-pre-orders",
        title: "Reserving a book, and how pre-orders work",
        category: "help",
        daysAgo: 9,
        featured: true,
        excerpt:
            "Hold a book on the shelf for three days, or pre-order a new one like Kasba Peth Rains before it's out.",
        image: photo("1517770413964-df8ca61194a6"),
        html: `<p>Sometimes you see a book and are not ready to take it home. Sometimes the book is not out yet. Both are easy.</p>
<h2>Reserving a book that's in stock</h2>
<p>On any book's page, choose <strong>Reserve</strong>. We take it off the shelf and keep it behind the counter for three days. There is nothing to pay until you collect, and if you change your mind, it simply goes back on the shelf. You can hold up to three books at a time this way.</p>
<p>For used books, which are usually one copy only, a reservation is the safest way to stop someone else getting there first.</p>
<h2>Pre-ordering a new book</h2>
<p>Books that are not out yet show a <strong>Pre-order</strong> button and their release date. You pay when you order, and the book goes out to you, or is ready to collect, on release day.</p>
${figure("1455390582262-044cdead277a", 1201, "A fountain pen writing in cursive on lined paper", "Pre-ordered copies can be signed at the launch evening.", "Aaron Burden")}
<p>Right now the one everyone is asking about is Meghna Apte's <em>Kasba Peth Rains</em>:</p>
<ul>
<li>₹499, shipping on <strong>1 November</strong></li>
<li>Pune deliveries go out that day; courier copies leave the same day</li>
<li>If you are coming to the launch reading on Thursday 5 November, choose collection and pick up your copy there, signed</li>
</ul>
<p>You can cancel a pre-order for a full refund any time before it ships.</p>`,
    },
    {
        slug: "used-books-grading-and-selling-to-us",
        title: "Used books: how we grade them, and selling yours to us",
        category: "help",
        daysAgo: 95,
        excerpt:
            "Four grades, checked page by page. And every Wednesday we buy books across the counter.",
        image: photo("1491841573634-28140fc7ced7"),
        html: `<p>About a third of what we sell is second-hand. Every used book is checked page by page before it is priced, and each one carries one of four grades.</p>
<h2>Our grades</h2>
<ul>
<li><strong>As new:</strong> read once, if at all. No marks, a tight spine.</li>
<li><strong>Very good:</strong> clearly read, but clean. Perhaps a name on the first page.</li>
<li><strong>Good:</strong> a creased spine, some yellowing, maybe light pencil marks. Everything is there.</li>
<li><strong>Reading copy:</strong> loved hard. Loose spine or a stained cover, but every page is present and readable.</li>
</ul>
<p>If a book has a missing page, we do not sell it. Anything we notice beyond the grade, like underlining or a loose plate, is written on the book's page here and on a slip inside.</p>
${figure("1519884705082-b505c3001e63", 1067, "An old book lying open in low, warm light, its page edges worn", "Every page is turned before a used book is priced.", "Sergiu Vălenaș")}
<h2>Selling us your books</h2>
<p>We buy books across the counter <strong>every Wednesday, 11am to 5pm</strong>. Bring up to two bags; for a whole library, message us first and we'll come and look.</p>
<ul>
<li>We buy fiction, classics, poetry, Marathi and Hindi books, and children's books in good shape.</li>
<li>We don't buy textbooks, guides, magazines or anything that has been damp.</li>
<li>You can take cash, or store credit worth 20% more.</li>
</ul>`,
    },
    {
        slug: "book-of-the-month-club-join-pause-skip",
        title: "The Book of the Month club: joining, pausing and skipping",
        category: "help",
        daysAgo: 44,
        excerpt:
            "₹649 a month for one book chosen by Anagha, a café coupon and a Sunday meet-up. How to join, pause, skip or change delivery.",
        image: photo("1460518451285-97b6aa326961"),
        html: `<p>Each month Anagha chooses one book. Members get it collected or delivered, a coupon for the café corner, and a seat at the meet-up on the last Sunday of the month.</p>
<h2>Joining</h2>
<p>The club is <strong>₹649 a month</strong>, paid monthly. Join from the club page before the 20th and you get that month's book; join later and you start with the next one. Delivery within Pune is included.</p>
<h2>Skipping a month</h2>
<p>Already own the book, or going to be away? Skip it from your account, or message us, by the 20th. You won't be charged that month and you keep your place.</p>
${figure("1537495329792-41ae41ad3bf0", 2400, "A pair of reading glasses resting on a stack of books", "Skip a month you've already read; your place stays yours.", "Kari Shea")}
<h2>Pausing</h2>
<p>You can pause for up to three months at a time. Nothing is charged while you're paused, and the club starts again on its own afterwards.</p>
<h2>Changing delivery</h2>
<p>Switch between collecting from the counter and Pune delivery, or change your address, any time before the 20th. Members outside Pune can have the book couriered for ₹80 a month.</p>
<h2>The meet-up</h2>
<p>5pm on the last Sunday of the month in the café corner. Come having finished the book, half-way through it, or having hated it. All three make for a good evening.</p>`,
    },
    {
        slug: "booking-author-evenings-and-story-hour",
        title: "Booking an author evening or story hour, and cancelling",
        category: "help",
        daysAgo: 60,
        excerpt:
            "Thursday readings are ₹200 with chai; Saturday story hour is ₹150. How to book, and what happens if you can't come.",
        image: photo("1506880018603-83d5b814b5a6"),
        html: `<p>We run two regular events, and both fill up, so it's worth booking.</p>
<h2>Author reading evenings</h2>
<ul>
<li>Thursdays at <strong>6:30pm</strong>, about an hour and a half</li>
<li><strong>₹200 a seat</strong>, including chai and a biscuit</li>
<li>30 seats</li>
</ul>
<h2>Saturday story hour</h2>
<ul>
<li>Saturdays at <strong>11am</strong>, about 45 minutes</li>
<li><strong>₹150 a child</strong>, for ages 4 to 8</li>
<li>15 places. Parents can stay in the café corner or browse.</li>
</ul>
${figure("1599689868384-59cb2b01bb21", 1063, "A young child leaning over a book on a table, following the words with a finger", "Story hour is for ages four to eight.", "Michał Parzuchowski")}
<h2>Booking</h2>
<p>Pick the date on the events page, choose how many seats, and pay. You'll get a confirmation by message and email. There is nothing to print; we have the list at the door.</p>
<h2>Cancelling</h2>
<ul>
<li><strong>Author evenings:</strong> cancel up to 24 hours before for a full refund. Later than that, we'll give you store credit instead.</li>
<li><strong>Story hour:</strong> cancel by 6pm on Friday for a full refund. Children get ill on Saturday mornings; if that happens, message us and we'll move the booking to another week.</li>
</ul>
${figure("1544787219-7f47ccb76574", 2208, "A mug of milky tea on a wooden coaster beside two biscuits", "Thursday's ticket includes chai and a biscuit.", "Rumman Amin")}
<p>If an evening is full, join the waiting list. Somebody almost always cancels.</p>`,
    },
    {
        slug: "gift-wrapping-and-gift-notes",
        title: "Gift wrapping and gift notes",
        category: "help",
        daysAgo: 13,
        excerpt:
            "Brown paper, a ribbon and a handwritten note, for ₹30. And how to send a book without a price in it.",
        image: photo("1549465220-1a8b9238cd48"),
        html: `<p>Most books that leave here around Diwali leave as presents, so we've made wrapping simple.</p>
<h2>Wrapping</h2>
<p>Tick <strong>Gift wrap</strong> at checkout, or ask at the counter. It's ₹30 per book: plain brown paper, a cotton ribbon and a sprig of whatever is growing outside. Gift sets come wrapped already.</p>
<h2>A gift note</h2>
<p>Write your message in the gift note box at checkout and Anagha will copy it by hand onto a card, in fountain pen, in an ink of her choosing. Keep it to about forty words so it fits. There's no charge for the note.</p>
${figure("1632180807550-5a46d458b5a9", 2400, "A hand dipping a fountain pen into a small ink bottle against a yellow background", "Gift notes are written out by hand.", "Lucia Macedo")}
<h2>Sending a gift straight to someone</h2>
<ul>
<li>Put their name and address as the delivery address, and yours as the billing address.</li>
<li>We never put an invoice or price inside a gift parcel. The invoice comes to you by email.</li>
<li>Used books going as gifts get an extra check, and we'll message you if anything looks less than gift-worthy.</li>
</ul>
<p>If the person would rather have another book, they can exchange it at the counter within 10 days without needing the receipt.</p>`,
    },
    {
        slug: "returns-and-exchanges",
        title: "Returns and exchanges",
        category: "help",
        daysAgo: 110,
        excerpt:
            "New books can come back within 10 days, used books can be exchanged within 7, and anything damaged on the way is on us.",
        image: photo("1610116306796-6fea9f4fae38"),
        html: `<p>We'd rather a book find the right reader than sit unread on your shelf, so here is how returns work.</p>
<h2>New books</h2>
<p>Bring back or send back a new book in the condition it reached you within <strong>10 days</strong> for an exchange or a refund. A book that has been read through, written in, or has a broken spine can't come back, unless it was faulty.</p>
<h2>Used books</h2>
<p>Each used book is one of a kind, so we offer <strong>exchange or store credit within 7 days</strong> rather than a refund. If a book doesn't match the grade we gave it, that's our mistake, and you get a full refund.</p>
${figure("1497633762265-9d179a990aa6", 1064, "A tall stack of hardback books in blue, red and green", "If a book isn't what we described, the return is on us.", "Kimberly Farmer")}
<h2>Damaged or wrong books</h2>
<ul>
<li>Send us a photo within three days of delivery.</li>
<li>We'll send a replacement straight away and arrange collection of the wrong one. You pay nothing.</li>
</ul>
<h2>How refunds are paid</h2>
<p>Refunds go back the way you paid, usually within five working days. Pre-orders can be cancelled in full any time before they ship. Club months that have already gone out can't be refunded, but you can skip or pause future ones.</p>`,
    },
    {
        slug: "caring-for-old-books-in-the-pune-monsoon",
        title: "Caring for old books through a Pune monsoon",
        category: "help",
        daysAgo: 85,
        excerpt:
            "Humidity, silverfish and that musty smell. What we do with our own shelves from June to September.",
        image: photo("1433863448220-78aaa064ff47"),
        html: `<p>Pune's monsoon is kind to people and hard on paper. From June to September the air holds enough water to curl pages, grow spots of mould and bring out the silverfish. This is what we do with the shop's own shelves.</p>
<h2>Keep them off the outer wall</h2>
<p>Walls that face the rain stay cold and damp. Leave a gap of a couple of inches behind a bookcase on an outside wall, and don't shelve your oldest books there at all.</p>
<h2>Let them breathe</h2>
<ul>
<li>Don't seal books in plastic or a closed steel cupboard. Trapped damp is worse than open air.</li>
<li>A few sachets of silica gel on each shelf help; dry them in a low oven when they turn colour.</li>
<li>On the first sunny morning after a wet week, open the windows and leave the cupboard doors wide.</li>
</ul>
${figure("1513185041617-8ab03f83d6c5", 1067, "Several old books lying open on top of each other in warm, low light", "Paper takes on water from the air; give it somewhere to let it go.", "Rey Seven")}
<h2>Silverfish</h2>
<p>They eat the glue and the starch in paper. Dried neem leaves and a few cloves tucked at the back of each shelf deter them, and dusting the tops of books once a month gives them less to live in. Never spray insecticide on books.</p>
<h2>If a book does get damp</h2>
<p>Stand it upright, fanned open, in a dry room with a fan running, not in direct sun. Put a sheet of plain paper between every twenty pages or so. Once it's dry, press it flat under a few heavy books for a day. If spots of mould appear, bring it in on a Wednesday and we'll have a look.</p>`,
    },
    {
        slug: "ordering-a-book-we-dont-stock",
        title: "Ordering a book we don't stock, or forty copies of one",
        category: "help",
        daysAgo: 170,
        excerpt:
            "We can order most books in print in 7 to 14 days, and we take school and group orders too.",
        image: photo("1699443817739-cf2f7cbcd18d"),
        html: `<p>We're a small shop and can't keep everything. But we can order most books that are in print in India.</p>
<h2>A single book</h2>
<ol>
<li>Use the enquiry form on the contact page, or ask at the counter. Give us the title, the author and, if you know it, which edition.</li>
<li>We check with our distributors and reply within a day with the price and how long it will take, usually 7 to 14 days.</li>
<li>If you say yes, we order it. There's no advance for books under ₹1,000.</li>
<li>When it arrives, we message you and hold it for seven days, or send it out with the usual delivery charges.</li>
</ol>
<p>Out-of-print books are harder. Tell us what you're looking for anyway; we keep a list, and it's surprising how often something turns up on a Wednesday.</p>
${figure("1554757387-fa0367573d09", 1067, "A blank spiral notebook lying open on a grey table beside a pencil", "We keep a list of every book someone is hunting for.", "Ashley West Edwards")}
<h2>Schools, libraries and groups</h2>
<p>For class sets, school libraries, reading groups or office gifts, we take orders of any size.</p>
<ul>
<li>10% off on orders of 20 or more copies of one title</li>
<li>A GST invoice made out to the school or organisation</li>
<li>Free delivery within Pune, and we can bring orders to the school</li>
</ul>
<p>Message us with the list and the date you need them by. For class sets, a month's notice is best.</p>`,
    },

    // ─── Articles ────────────────────────────────────────────────────────
    {
        slug: "ten-classics-for-a-pune-monsoon",
        title: "Ten classics for a Pune monsoon",
        category: "articles",
        daysAgo: 100,
        featured: true,
        excerpt:
            "Books for the months when the trees on Prabhat Road drip all afternoon and nobody wants to go out.",
        image: photo("1541963463532-d68292c34b19"),
        html: `<p>There is a particular kind of afternoon in Pune in July. The rain has been going since lunch, the light has gone green, and the trees along Prabhat Road drip steadily onto the awning. Nobody is coming into the shop, and that is fine. It is a day for a long book.</p>
<p>These are the ten I put on the front table every June. They are all old enough to be in the public domain, and all of them, somehow, are better with rain outside.</p>
<h2>1. Kalidasa, <em>Meghaduta</em></h2>
<p>A banished yaksha asks a monsoon cloud to carry a message to his wife, and describes the whole route north. It is the original rainy-season poem, and you can read it in an evening. Read it in July, when the clouds really are heading that way.</p>
<h2>2. Premchand, <em>Godaan</em></h2>
<p>A long, patient novel about a farmer and a cow. The village chapters have the weight of a wet season; you can feel the mud.</p>
<h2>3. Sarat Chandra Chattopadhyay, <em>Srikanta</em></h2>
<p>A wandering, episodic book about a young man who never quite settles. Good for reading in pieces, a chapter between showers.</p>
<h2>4. Charles Dickens, <em>Bleak House</em></h2>
<p>It opens in London fog and mud, and Dickens never lets the weather go. "Fog everywhere," he writes, and on a grey Deccan afternoon you will believe him. It is enormous; that is the point.</p>
${figure("1509635022432-0220ac12960b", 2398, "Rain running down a glass window with green plants blurred behind it", "Long books, short days.", "Suhyeon Choi")}
<h2>5. Fyodor Dostoevsky, <em>White Nights</em></h2>
<p>A short story about a lonely young man and four nights of talking. Wrong season entirely, but it is about weather and loneliness, and it takes an hour.</p>
<h2>6. Jane Austen, <em>Persuasion</em></h2>
<p>Austen's autumn book: quieter and sadder than the others, with a seaside town out of season. A good one to reread at forty.</p>
<h2>7. Rabindranath Tagore, <em>The Postmaster</em> and other stories</h2>
<p>The postmaster of the title is posted to a village in the rains and does not know what to do with himself. Few short stories are this good about loneliness.</p>
<h2>8. Arthur Conan Doyle, <em>The Hound of the Baskervilles</em></h2>
<p>Moors, mist, a great dog. Best read late, with the power gone and a candle.</p>
<h2>9. Leo Tolstoy, <em>The Death of Ivan Ilyich</em></h2>
<p>Short, frightening and finally consoling. It is a novella you will think about for a week.</p>
<h2>10. Sane Guruji, <em>Shyamchi Aai</em></h2>
<p>Because every Marathi child has a memory of being made to read it, and every Marathi adult should be made to read it again. The Konkan rain runs all the way through it.</p>
<p>All ten are on the front table until the end of September, new and used. If you would like one couriered somewhere wetter than Pune, we can do that too.</p>`,
    },
    {
        slug: "why-we-sell-used-books",
        title: "Why we sell used books",
        category: "articles",
        daysAgo: 160,
        excerpt:
            "A third of our shelves are second-hand. That was not the plan when we opened. Anagha on why it became the heart of the shop.",
        image: photo("1457369804613-52c61a468e7d"),
        html: `<p>When we opened, the plan was simple: new books, carefully chosen, and good coffee. Used books were going to be a single shelf by the door. Three years later, they take up a third of the shop, and most of what I love about running it.</p>
<h2>It started with one box</h2>
<p>In our first month a retired professor from Bhandarkar Road came in with a cardboard box. He was moving to his daughter's flat in Baner and couldn't take his books. "I don't want money," he said. "I want them read." We sold every one within a fortnight, and people kept asking whether more were coming.</p>
<p>That is when I understood something about this part of Pune. Deccan, Prabhat Road, Erandwane: these are neighbourhoods of teachers and doctors and lawyers who bought books all their lives. Their children live in Bengaluru or Toronto. The books are still here, and there are a great many of them.</p>
<h2>A used book is a better book, sometimes</h2>
<p>I don't mean that sentimentally. A new paperback of <em>Anna Karenina</em> costs what it costs. A good hardback from the 1950s, sewn rather than glued, with proper paper, often costs less and will outlast the new one by decades. For classics especially, the older editions are frequently the better-made ones.</p>
${figure("1585521747230-516376e5a85d", 2400, "A leaning stack of old hardback books with worn cloth spines and coloured page edges", "Older editions are often better made than new ones.", "Priscilla Du Preez")}
<p>And then there are the traces. A name on the flyleaf in a careful hand, a date from 1968, a bus ticket used as a bookmark. Someone underlined one sentence in a Chekhov story forty years ago, and when you reach it you stop and wonder why. I have never once been bored opening a box of used books.</p>
<h2>Why we check every page</h2>
<p>The thing people distrust about second-hand books is that you don't know what you'll get. So we check every one, page by page, before it goes on a shelf. It's slow. On a Wednesday, when people bring books in to sell, Siddharth makes the coffee and I sit at the back table turning pages for most of the afternoon.</p>
<p>If a page is missing, the book doesn't go out. If there's underlining, we say so. The grade on the slip inside is a promise, and if we get it wrong, you get your money back.</p>
<h2>What it does for the shop</h2>
<p>Used books let us be generous. A student can walk in with ₹200 and leave with a Dickens and a Tagore. A child who has finished every Panchatantra retelling we have can take home three more without anyone worrying about the cost. And the book club, which needs new copies, is easier to keep affordable because the used shelves carry some of the weight.</p>
<p>They also make the shop different every week. A new-book shop changes when the publishers say so. Ours changes every Wednesday, depending on who has cleared out a cupboard. Regulars come in on Thursday mornings to see what arrived, and I don't blame them. I'm usually just as curious.</p>`,
    },
    {
        slug: "rereading-godaan-at-forty",
        title: "Rereading Godaan at forty",
        category: "articles",
        daysAgo: 33,
        featured: true,
        excerpt:
            "I first read Premchand's last novel for an exam. Picking it for the club, I read it again, and found a different book.",
        image: photo("1643316791771-ac9b7b5a2238"),
        html: `<p>The first time I read <em>Godaan</em> I was sixteen and it was on the syllabus. I read it the way you read anything you will be examined on: for the plot, the characters, and the themes that would make a ten-mark answer. Hori wants a cow. He gets one. Things go badly. I wrote that the novel was a portrait of the exploitation of the Indian peasant, got a decent mark, and didn't open it again for twenty-four years.</p>
<p>Choosing it for October's club, I thought I had better reread it. I expected duty. What I got was one of the best weeks of reading I have had in years.</p>
<h2>Hori is not a symbol</h2>
<p>At sixteen, Hori was a type: the poor farmer, put upon by the moneylender, the priest and the zamindar. At forty, he is a man I recognise. He is proud and a little vain. He lies to his brother about the cow, then lies to protect him. He wants the respect of his village badly enough to ruin himself for it, and he knows it, and he does it anyway.</p>
<p>And there is Dhaniya, his wife, who at sixteen I barely noticed. She is the sharpest person in the book. She shouts at Hori, she takes in a pregnant girl when the village turns its back, she sees through every pandit and every promise. I found myself waiting for her chapters.</p>
${figure("1529589941132-43606325dfb4", 2052, "An old paperback lying open on a rumpled linen sheet", "Some books wait for you to be old enough for them.", "Annie Spratt")}
<h2>The city chapters</h2>
<p>I had remembered the novel as purely rural, and I was wrong. Half of it is in Lucknow, among a professor, a doctor, a mill owner and a newspaper editor who talk endlessly about reform over dinner. At sixteen I skipped these chapters. Now they read like satire, and quite sharp satire. Premchand clearly enjoyed writing those clever, comfortable people, and clearly didn't think much of them.</p>
<p>The two halves never quite meet, which used to seem like a flaw. Reading again, I think it's the whole point. The people in the city talk about people like Hori. They never meet him.</p>
<h2>What I had missed</h2>
<p>Mostly, I had missed how funny it is. There is a long scene of Hori trying to look casual while negotiating for the cow that made me laugh out loud in the café corner. The village gossip is merciless. Premchand loved these people too much to make them only victims.</p>
<p>I had also missed how carefully he handles money. Every rupee in the book is accounted for. You always know what Hori owes and to whom, and the sums get worse in a way that feels completely real. If you have ever helped an older relative sort out a loan, these pages are hard to read.</p>
<h2>Why the ending hurts more now</h2>
<p>I won't spoil the last chapter for anyone who hasn't read it. I will only say that at sixteen I found it sad, and at forty I found it unbearable, because I now know how ordinary it is. The title, which I used to think was simply ironic, is the cruellest thing in the book.</p>
<p>If you read <em>Godaan</em> at school, I'd like you to read it again. Come and tell us on the last Sunday of the month whether it is the same book for you. I suspect it won't be.</p>`,
    },
    {
        slug: "tagore-short-stories-for-sceptics",
        title: "Tagore's short stories, for people who think they don't like short stories",
        category: "articles",
        daysAgo: 75,
        excerpt:
            "Five stories to start with, why they work, and the order I'd read them in.",
        image: photo("1630343710506-89f8b9f21d31"),
        html: `<p>A lot of people tell me they don't like short stories. When I ask why, the answers are usually the same: they end just as you get interested, or nothing happens, or they feel like exercises. Fair enough. Plenty of short stories are exactly like that.</p>
<p>Tagore's are not. He wrote most of his best ones in his early thirties, in the 1890s, while managing the family estates in rural Bengal. He spent his days on a houseboat on the Padma, watching villages from the water, and the stories are full of the people he saw: postmasters, clerks, widows, children, boatmen. They are about ordinary lives, and they have the shape and pull of novels squeezed into twenty pages.</p>
<p>Here is where I'd start, and in this order.</p>
<h2>1. The Postmaster</h2>
<p>A young man from Calcutta is posted to a remote village, hates it, and is looked after by an orphan girl called Ratan. It is about eight pages long. Read it first because it shows you what Tagore does: very little happens, and by the end you feel as though something enormous has.</p>
<h2>2. Kabuliwala</h2>
<p>You may know it already from a film, or from school. Read it again anyway. A five-year-old girl in Calcutta befriends an Afghan dried-fruit seller, and her father, the narrator, watches. It is the best story I know about the way adults see children, and about fathers.</p>
${figure("1553729784-e91953dec042", 1067, "A woman holding an open book close, reading with her head bent", "Most of these stories take less than half an hour.", "Joel Muniz")}
<h2>3. Subha</h2>
<p>A girl who cannot speak grows up in a village, understood by the river and the cows better than by her family. It is very short and it does not let you off lightly.</p>
<h2>4. The Hungry Stones</h2>
<p>Tagore can also do ghosts. A cotton-duty collector stays alone in an abandoned marble palace, and at night it fills with the sounds of a court long gone. It is atmospheric and genuinely eerie, and it ends with a joke at the reader's expense.</p>
<h2>5. The Living and the Dead</h2>
<p>A widow is thought to have died, and comes back. Nobody, including her, knows what to do. It is a ghost story inside out, and it says more about how widows were treated than any essay could.</p>
<h2>Why they work</h2>
<p>What these share is that Tagore never explains. He watches his people closely, lets them misunderstand one another, and then steps back at exactly the moment you want him to tell you what it meant. That is what people who dislike short stories usually dislike. With Tagore, I think it is the whole pleasure: the story carries on in your head after it ends.</p>
<p>We keep a couple of different English selections in stock, new and used, and the Bengali originals on request. If you try two of these and still don't like short stories, come and tell me, and I will find you a very long novel instead.</p>`,
    },
    {
        slug: "chekhov-for-beginners",
        title: "Chekhov for beginners",
        category: "articles",
        daysAgo: 125,
        excerpt:
            "Where to begin with the doctor who wrote six hundred stories, and the one thing to know before you start.",
        image: photo("1535905557558-afc4877a26fc"),
        html: `<p>Anton Chekhov wrote something like six hundred stories, and he wrote most of them while working as a doctor. That is the first thing to know about him, and maybe the most useful. He looked at people the way a good doctor does: closely, without much judgement, and with a great deal of patience for the ways they make themselves unhappy.</p>
<p>New readers often start with the plays, because they have heard of <em>The Cherry Orchard</em>. I'd suggest the stories first. They are short, there are so many that you can drop the ones that don't speak to you, and the best of them are as good as anything written in any language.</p>
<h2>The one thing to know</h2>
<p>Chekhov's stories often don't end so much as stop. Someone realises something, or almost does, and the story leaves them there. If you read expecting a twist or a resolution, you'll feel cheated. Read expecting to spend twenty minutes beside someone at an important moment in their life, and you won't.</p>
<h2>Five to start with</h2>
<ul>
<li><strong>Misery</strong> (sometimes called <em>Grief</em>). A cab driver whose son has died tries all evening to tell someone, anyone, about it. Nobody will listen, so he tells his horse. Four pages; you won't forget it.</li>
<li><strong>The Bet</strong>. A banker bets a young lawyer two million roubles that he can't survive fifteen years in solitary confinement. Almost a fable, and easy to love.</li>
<li><strong>Vanka</strong>. A nine-year-old apprentice writes a letter on Christmas Eve to his grandfather in the village. The address he writes on the envelope will break your heart.</li>
<li><strong>The Lady with the Dog</strong>. A bored married man begins an affair at a seaside resort and finds, to his alarm, that it matters. The most famous one, and deservedly.</li>
<li><strong>The Student</strong>. A young seminary student, cold and hungry on Good Friday, tells two widows a story by a fire. Chekhov said it was his favourite. It is five pages, and it is hopeful.</li>
</ul>
${figure("1471107340929-a87cd0f5b5f3", 1201, "A fountain pen resting across an open spiral notebook on a wooden table", "Try writing down the sentence in each story that stays with you.", "Aaron Burden")}
<h2>Then, the longer ones</h2>
<p>When you're ready, try <strong>Ward No. 6</strong>, about a doctor in a provincial asylum who starts talking to one of his patients, and <strong>The Steppe</strong>, a long, drifting story of a boy's journey across the grasslands. They take an evening each, and they are where Chekhov's quietness turns into something larger.</p>
<h2>Which translation</h2>
<p>We stock a few. The older translations from the early twentieth century, which are in the public domain, read a little stiffly now but are perfectly good and often the cheapest. If a particular translation is putting you off, bring it to the counter and we'll compare a page of it with another. It is surprising how much difference a translator makes to a writer this quiet.</p>
<p>Start with <em>Misery</em>, tonight. It will take you less time than your chai.</p>`,
    },
    {
        slug: "what-the-children-asked-at-story-hour",
        title: "What the children asked at story hour",
        category: "articles",
        daysAgo: 50,
        excerpt:
            "Fifteen four-to-eight-year-olds every Saturday, and the questions none of the grown-ups think to ask.",
        image: photo("1757877123687-c5d3743f29d3"),
        html: `<p>Every Saturday at eleven, fifteen children between four and eight sit on the rug in the back of the shop while I read to them. I've done it for nearly three years now. I go in thinking I'm the one with the stories, and most weeks I come out with a notebook full of theirs.</p>
<p>I started writing down their questions in the first year, because I kept forgetting the good ones. Here are some, from the Panchatantra months mostly, with the answers I managed at the time.</p>
<h2>"Why did the crocodile believe him?"</h2>
<p>This was about the monkey who tells the crocodile he left his heart in the tree. A six-year-old was outraged. Who keeps their heart in a tree? Why would anyone believe that? We spent ten minutes on it. The conclusion, reached by the children, was that the crocodile wanted the heart so badly that he'd believe anything that meant he might still get it. I have known adults who haven't learned that.</p>
<h2>"Is the lion dead or just in the well?"</h2>
<p>The clever hare tricks the lion into jumping into a well at his own reflection. Four-year-olds want to know exactly what happened next. Can lions swim? Did anybody help? In the end we agreed the lion was probably in the well still, thinking about what he'd done. Everyone seemed satisfied with that.</p>
${figure("1472162072942-cd5147eb3902", 1068, "A small boy in a cap laughing on a bench with an open book on his lap", "Story hour runs every Saturday at 11am.", "Ben White")}
<h2>"Where do the stories go when you close the book?"</h2>
<p>From a very serious five-year-old, at the end of the morning. I didn't have a good answer. Another child did: "In your head, and then you tell your little brother." I've used that answer myself since.</p>
<h2>"Why are the clever ones always small?"</h2>
<p>Hares, mice, jackals, crows. A seven-year-old noticed that in the Panchatantra, the clever animal is nearly always the smaller one. It's true, and I hadn't thought about it. We talked about how the stories might have been told by people who weren't the biggest or the strongest either. She nodded slowly, as if she'd known that all along.</p>
<h2>"Did Shyam's mother get angry?"</h2>
<p>We read a chapter of <em>Shyamchi Aai</em> one Saturday in a simplified retelling. A boy asked whether Shyam's mother ever shouted. He said his mother does. I said yes, she did, and she was a wonderful mother anyway. He looked relieved.</p>
<h2>What they've taught me</h2>
<p>Children ask about fairness, constantly. Who deserved what, who got punished, whether anyone said sorry. They want stories to make moral sense, and they're genuinely upset when they don't. They also want the details. What did the jackal eat for breakfast? How big was the well? I've stopped skipping descriptions when I read aloud.</p>
<p>And they notice everything about the book itself. They'll tell you a picture is wrong because the text says the crow was on the left. They'll ask why a page is torn. They know when you've skipped a line.</p>
<p>November's theme is animals who talk back, and Sushma Kale is joining us on the 21st. Bring your questions. Bring your children's, which will be better.</p>`,
    },
    {
        slug: "a-walk-from-deccan-to-tulshibaug",
        title: "A walk from Deccan to Tulshibaug, with books in mind",
        category: "articles",
        daysAgo: 65,
        excerpt:
            "Over the river, past Shaniwar Wada, into the old city: one Sunday morning on foot, and what to read along the way.",
        image: photo("1614716194506-ef3694ae131a"),
        html: `<p>On Sunday mornings, before the shop opens, I sometimes walk to the old city. It's a little over three kilometres from our door to Tulshibaug, about an hour if you dawdle, and I always dawdle. It is the best way I know to remember that Pune was a city of readers long before it was a city of anything else.</p>
<h2>Prabhat Road to the river</h2>
<p>Start under the rain trees of Prabhat Road while they're still dripping from the night. Walk down past the colleges, where the students who'll be in the shop later in the day are still asleep. By Deccan Gymkhana the chai stalls are open; I stop for one and don't feel guilty about it, since Siddharth isn't watching.</p>
<p>Cross the Mutha on the old bridge. The river is a sad thing in summer and a frightening one in August. In between, at the end of the monsoon, it's at its best.</p>
<h2>Into the Peths</h2>
<p>On the other side the city closes in. The lanes of Shaniwar Peth, Sadashiv Peth and Kasba Peth are where Pune's printing presses, its libraries and its schools grew up. Walk slowly. Many of the old wadas have gone, but some remain, with carved wooden balconies and small courtyards you can glimpse through doorways.</p>
<p>This is the street Meghna Apte has written about in <em>Kasba Peth Rains</em>, out next month. I read it in proof, and now I can't walk through Kasba Peth without seeing her family on every balcony.</p>
${figure("1715678710159-ee67d5bdba85", 2133, "The stone gateway and wooden upper storey of an old fort wall under a grey sky", "The old walls at Shaniwar Wada.", "Aditya Gurav")}
<h2>Shaniwar Wada</h2>
<p>The walls of the Peshwas' palace are still there, though the palace burned in 1828. In the early morning, before the tour buses, it's quiet enough to sit on the steps outside and read a few pages. I've done that more than once.</p>
<h2>Tulshibaug</h2>
<p>And then the market, which is the opposite of quiet: brass and steel, plastic buckets, bangles, kitchen tools and festival things, in narrow lanes around the old Ram temple. I usually come back with a steel tumbler I don't need.</p>
<h2>What to read for the walk</h2>
<ul>
<li><strong>Sane Guruji, <em>Shyamchi Aai</em>.</strong> Not about Pune, but about the Marathi world those Peths were built in.</li>
<li><strong>Gandhi's autobiography.</strong> He spent long stretches in Pune, mostly in Yerawada jail. Read the chapters about his time in the city before you walk.</li>
<li><strong>Rohan Deshpande's poems.</strong> Our local poet, who has been writing about these lanes for years. Several of his short poems would fit on a postcard from Kasba Peth.</li>
<li><strong>Meghna Apte, <em>Kasba Peth Rains</em>.</strong> Pre-order now, read it in November, and then do the walk again.</li>
</ul>
<p>Take a rickshaw back if you must. Or walk, and stop at the shop on the way. We open at ten.</p>`,
    },
    {
        slug: "the-filter-coffee-ritual",
        title: "The filter coffee ritual, by Siddharth",
        category: "articles",
        daysAgo: 90,
        excerpt:
            "Siddharth runs the café corner. Here is how he makes the coffee, and why it takes as long as it does.",
        image: photo("1587955245893-389f2215c6eb"),
        html: `<p><em>Siddharth Kale has run the café corner since we opened. Anagha asked him to write this down after the tenth person in a week asked why the coffee takes so long.</em></p>
<p>It takes long because it starts the night before.</p>
<p>Every evening, after the last customer goes, I put fresh grounds into the top half of the steel filter, press them down lightly, and pour hot water over them. Then I go home. By morning the decoction has dripped through into the bottom half: thick, dark, almost syrupy. That's what the day's coffee is built on, and there is no way to hurry it.</p>
<h2>The beans</h2>
<p>We use a blend that's mostly coffee with a share of chicory, the way it's done in the South. Chicory gives the body and a slight bitterness that stands up to milk. People sometimes ask for pure coffee, and I can make it, but I'd encourage you to try it the usual way first.</p>
<p>I buy from a small roaster who sends a fresh batch every two weeks. Coffee ground too long ago tastes flat, so I grind every evening for the next day's decoction.</p>
${figure("1534516484460-0b6099615d5a", 2409, "A glass coffee dripper sitting on a glass server half full of dark coffee, by a window", "The decoction starts dripping the evening before.", "Anshu A")}
<h2>The milk</h2>
<p>Full-cream milk, boiled until a skin forms, and kept just under the boil all morning. It goes in hot. The ratio is about one part decoction to three parts milk, but it depends on the day's decoction. I taste it every morning and adjust.</p>
<h2>The pull</h2>
<p>This is the part people watch. The coffee goes into a steel tumbler, sugar if you've asked for it, and then I pour it back and forth between the tumbler and the dabara, the little steel bowl, from as high as I can manage without spilling. It cools the coffee to drinking temperature, mixes the sugar without a spoon, and puts a froth on top. It also, I'll admit, looks good.</p>
<p>The tumbler sits inside the dabara when it reaches you. Pour it between them yourself if it's still too hot.</p>
<h2>And the chai</h2>
<p>Chai is quicker: water, tea leaves, crushed ginger and cardamom, boiled hard, then milk and boiled again, then strained. I make it in small batches through the day, never one big pot, because chai that has been sitting goes bitter.</p>
${figure("1611312410928-bdcb480e6239", 2502, "Milky tea being poured through a metal strainer into a cup in warm light", "Small batches through the day, never one big pot.", "Ayaneshu Bhardwaj")}
<h2>The biscuits</h2>
<p>Tuesdays and Fridays I bake: nankhatai, jeera biscuits, and whatever I'm trying out that week. They usually last until Saturday afternoon. If you come on a Sunday, you're relying on luck.</p>
<p>That's the whole ritual. It's slow because good coffee is slow, and because it's a bookshop. Nobody here should be in a hurry.</p>`,
    },
    {
        slug: "shyamchi-aai-and-marathi-childhood-reading",
        title: "Shyamchi Aai, and the books a Marathi childhood is made of",
        category: "articles",
        daysAgo: 115,
        excerpt:
            "Sane Guruji's book about his mother has been read to Marathi children for ninety years. Why it still matters, and what else was on our shelves at home.",
        image: photo("1476234251651-f353703a034d"),
        html: `<p>I don't remember learning to read Marathi, but I remember <em>Shyamchi Aai</em>. My grandmother read it to me in instalments, a chapter a night, in her flat in Sadashiv Peth. I was seven. When we reached the end, she cried, and I cried because she did, and I didn't fully understand why for another twenty years.</p>
<h2>What the book is</h2>
<p>Sane Guruji wrote it in 1933, in a jail in Nashik, where he was imprisoned for his part in the freedom movement. Over a series of nights he told his fellow prisoners about his childhood in a Konkan village and, above all, about his mother. Each chapter is one night's telling. She teaches him not to be ashamed of poverty, to care for animals, to tell the truth when it costs him. Nothing much happens. A boy grows up; his mother is good to him; the family struggles.</p>
<p>That sounds sentimental, and parts of it are. But it is also honest about anger, about humiliation, about money, about the hardness of village life. Shyam is often a difficult, proud child. His mother is often tired and short with him. It is the love inside those ordinary days that has kept the book alive.</p>
${figure("1692269725827-699e04a11cdf", 966, "Two schoolboys in checked uniform shirts reading and writing at a classroom desk", "Read to children for nearly ninety years.", "Swastik Arora")}
<h2>Why every Marathi family has a copy</h2>
<p>For a long time it was simply what you gave children. It was read in schools, adapted for the stage, made into a film. It has a reputation now as a slightly old-fashioned, moral book, and I understand why. But when I reread it at thirty-five, what struck me was how much of it is about a child learning to see other people clearly: servants, neighbours, the poor, animals. That is not old-fashioned at all.</p>
<h2>The other books on our shelf at home</h2>
<p>A Marathi childhood in the eighties, at least in my family, was made of a strange mixture. Alongside <em>Shyamchi Aai</em>:</p>
<ul>
<li><strong>The Panchatantra</strong>, in a fat illustrated retelling with a red cover, its spine held together with tape.</li>
<li><strong>Kipling's <em>Jungle Book</em></strong>, in an abridged Marathi translation where Mowgli somehow seemed to live near Bhimashankar.</li>
<li><strong>Stevenson's <em>Treasure Island</em></strong>, borrowed from a cousin and never returned.</li>
<li><strong>Alcott's <em>Little Women</em></strong>, which I read four times in one summer holiday because Jo was the first writer I had ever met.</li>
</ul>
<p>It's a list that wanders between languages and continents without seeming to notice. I think that's typical of how children in Pune read then, and I hope still do: whatever was in the house, in whatever language it came in.</p>
<h2>Reading it with children now</h2>
<p>If you'd like to share it with your own children, my advice is to read it aloud, a chapter at a time, as it was told. Some of the language is old and needs explaining. Some chapters are too sad for a six-year-old and can wait. And don't be surprised if you're the one who cries.</p>
<p>We keep the original in Marathi in several editions, new and used, and an English translation for families who'd rather start there. The two old copies from the Prabhat Road estate went in a day, but more will come.</p>`,
    },
    {
        slug: "a-reading-list-for-the-diwali-holidays",
        title: "A reading list for the Diwali holidays",
        category: "articles",
        daysAgo: 19,
        excerpt:
            "Nine books for the long weekend: for the train, for the relatives, for the children, and for the quiet morning after.",
        image: photo("1636226942649-ee15d2a7ce04"),
        html: `<p>Diwali is not, if we're honest, a time for reading. There are sweets to make, relatives to visit, children to keep away from the fireworks. But there are always a few hours: a train to the family home, an afternoon when everyone else is asleep, the quiet morning after Lakshmi Pujan when the lamps have burned down. These are for those hours.</p>
<p>I've kept to books that can be picked up and put down, because nobody gets three uninterrupted hours at Diwali. Most of them can be read in a sitting or two; the longer ones are the kind you can leave for a day and come back to without losing the thread. And none of them will make you sad on a festival weekend, with one deliberate exception, which is the club's November book.</p>
<h2>For the journey</h2>
<ul>
<li><strong>Arthur Conan Doyle, <em>The Sign of Four</em>.</strong> Short, quick, and with a plot that runs back to India. It will see you from Pune to Nashik with time to spare.</li>
<li><strong>Mark Twain, <em>The Adventures of Tom Sawyer</em>.</strong> For a long trip with a teenager who claims not to read. Leave it on the seat between you.</li>
</ul>
<h2>For an afternoon among relatives</h2>
<ul>
<li><strong>Jane Austen, <em>Pride and Prejudice</em>.</strong> No book understands the family gathering better. "It is a truth universally acknowledged" will mean something new after your third aunt asks about your plans.</li>
<li><strong>Sarat Chandra Chattopadhyay, <em>Parineeta</em>.</strong> A short novel of neighbours, debts and a love nobody is supposed to notice. Ideal for reading while pretending to listen.</li>
</ul>
${figure("1630748662359-40a2105640c7", 2133, "Two clay cups of milky tea on a wooden table beside a plate of snacks", "Something hot, a quiet hour, and a book.", "VD Photography")}
<h2>For the children</h2>
<ul>
<li><strong>A Panchatantra or Jataka retelling.</strong> Read a story a night over the five days, and talk about who was clever and who was greedy.</li>
<li><strong>Sushma Kale's picture books.</strong> Our Pune children's author; her stories about a grandmother's kitchen are perfect for this week.</li>
<li><strong>Robert Louis Stevenson, <em>Treasure Island</em>.</strong> For the eight-to-twelves, and any grown-up who never read it.</li>
</ul>
<h2>For the quiet morning after</h2>
<ul>
<li><strong>Rabindranath Tagore, <em>The Home and the World</em>.</strong> It's the club's November book, so start it now and you'll be ready for the meet-up on 29 November.</li>
<li><strong>Rohan Deshpande's poems.</strong> One or two at a time, with coffee, before anyone else is up.</li>
</ul>
<p>Everything on this list is on the front table now, and most of it in good used copies as well as new. Remember we're closed on Monday 9 and Tuesday 10 November, so come in on the weekend. If you're giving any of these as presents, we'll wrap them, and write a note by hand.</p>`,
    },
];
