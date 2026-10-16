/**
 * Desk 42's posts — Help, News and Articles for the coworking space's site.
 * Written for this seed; every member named here is fictional. Dates are
 * relative to the seed's "today" (15 October 2026).
 *
 * Data only; the Desk 42 seed writes it.
 */

import type { DemoImage, DemoPost } from "./demo-content";
import { demoAsset, figure } from "./demo-content";
import { DK_PHOTOS } from "./desk42-photos";

const RHEA = "Rhea Deshpande";
const OMKAR = "Omkar Pawar";
const SUNITA = "Sunita Gaikwad";

/** A picture the seed draws for Desk 42 (1600×1000). */
const drawn = (file: string, alt: string): DemoImage => ({
    url: demoAsset("desk-42", file),
    alt,
    width: 1600,
    height: 1000,
    creditName: null,
    creditUrl: null,
});

const FLOOR_PLAN = drawn(
    "floor-plan.png",
    "Floor plan of Desk 42: hot desks in the open area, dedicated desks along the windows, the Sahyadri Room, the call booth, the café counter and the lockers",
);
const PLANS_CARD = drawn(
    "plans-card.png",
    "The three Desk 42 memberships side by side: Hot desk ₹6,500, Dedicated desk ₹9,500 and Virtual office ₹1,999 a month",
);
const DIWALI_HOURS = drawn(
    "diwali-hours.png",
    "Diwali hours card: open 10:00 to 18:00 on Saturday 7 and Tuesday 10 November, closed Sunday 8 and Monday 9 November",
);
const WIFI_PRINTING = drawn(
    "wifi-printing.png",
    "How-to card for Wi-Fi and printing: the Desk42-Members and Desk42-Guest networks, and page prices for black and white and colour",
);
const ROOM_BOOKING = drawn(
    "room-booking.png",
    "Steps for booking the Sahyadri Room: pick a date, choose your hours, pay or use included hours, sign guests in at the desk",
);
const EVENTS_NOVEMBER = drawn(
    "events-november.png",
    "November events calendar with the Diwali potluck on 5 November and Founders' Chai on 6 November",
);

const help: DemoPost[] = [
    {
        slug: "buying-and-using-a-day-pass",
        title: "Buying and using a day pass",
        category: "help",
        excerpt:
            "A day pass is ₹499 for a hot desk from 8:00 to 21:00, Monday to Friday. Here is how to book one, what it includes and what to bring.",
        daysAgo: 40,
        author: OMKAR,
        cover: DK_PHOTOS.hotDesks,
        body: `<p>A day pass gets you a hot desk in the open area from <strong>8:00 to 21:00, Monday to Friday</strong>, for ₹499 including GST. Saturdays are for members only, so a day pass is not sold on a Saturday.</p>
<h2>Booking</h2>
<p>You can book a day pass online or simply walk in and buy one at the front desk. We sell at most 20 a day, one for each hot desk, so on busy weeks — the last week of a quarter, or when it rains hard — booking the night before is wise. If the passes are gone online, they are gone at the desk too.</p>
<h2>When you arrive</h2>
<ol>
<li>Come up to the 4th floor of Sai Capital and say hello at the front desk. Your booking is under your name and phone number.</li>
<li>We give you the Desk42-Guest Wi-Fi password and show you the café counter, the lockers and the washrooms.</li>
<li>Pick any free hot desk. There are no reserved seats in the open area; the dedicated desks by the windows belong to members and are marked with a name card.</li>
</ol>
${figure(FLOOR_PLAN, "The hot desks are in the open area in the middle; dedicated desks run along the windows.")}
<h2>What is included</h2>
<ul>
<li>A desk, a chair and a power point, with 300 Mbps Wi-Fi.</li>
<li>Drinking water. The café counter is open all day; food and coffee are paid separately.</li>
<li>Printing by credits at ₹3 a black and white page and ₹12 a colour page.</li>
</ul>
<p>The meeting room and the call booth are booked by the hour and are not part of a day pass. If you plan to come more than three or four days a week, a hot desk membership usually works out cheaper — ask me at the desk or book a free 30-minute tour with Rhea and she will walk you through it.</p>`,
    },
    {
        slug: "booking-the-sahyadri-room",
        title: "Booking the Sahyadri Room",
        category: "help",
        excerpt:
            "Our meeting room seats eight, with a 65-inch screen and a whiteboard. Book it by the hour online; dedicated-desk members get four hours a month included.",
        daysAgo: 52,
        author: OMKAR,
        cover: DK_PHOTOS.meetingRoom,
        body: `<p>The Sahyadri Room is our one meeting room. It seats eight around a single table and has a 65-inch screen with an HDMI and a USB-C cable, a whiteboard with markers, and a door that actually shuts.</p>
<h2>Hours and price</h2>
<table>
<thead><tr><th>Day</th><th>Bookable</th></tr></thead>
<tbody>
<tr><td>Monday to Friday</td><td>9:00–20:00</td></tr>
<tr><td>Saturday</td><td>10:00–17:00</td></tr>
<tr><td>Sunday</td><td>Closed</td></tr>
</tbody>
</table>
<p>The room is <strong>₹800 an hour</strong>, GST included, booked by the whole hour. Dedicated-desk members have four hours a month included; they do not roll over to the next month.</p>
${figure(ROOM_BOOKING, "Four steps: date, hours, pay or use your included hours, and sign your guests in at the desk.")}
<h2>How to book</h2>
<ol>
<li>Book online: choose the date and the hours you need. Anyone can book, member or not.</li>
<li>Pay when you book, or use your included hours if you have a dedicated desk.</li>
<li>Send your guests the address and tell them to sign in at the front desk when they arrive. I will bring them to the room.</li>
</ol>
<h2>Good to know</h2>
<ul>
<li>Please finish five minutes before the hour so the next group starts on time.</li>
<li>Wipe the whiteboard and take your cups to the café counter.</li>
<li>Need to cancel? Cancel at least 24 hours ahead and the booking is refunded, or the hours go back to your monthly allowance.</li>
<li>Tea and coffee for the room can be ordered from Sunita at the counter and added to your bill.</li>
</ul>`,
    },
    {
        slug: "using-the-call-and-podcast-booth",
        title: "Using the call and podcast booth",
        category: "help",
        excerpt:
            "The soundproofed booth is ₹300 an hour, with two microphones for recording. How to book it, how to plug in and what to leave behind.",
        daysAgo: 33,
        author: OMKAR,
        cover: DK_PHOTOS.booth,
        body: `<p>The booth next to the café counter is soundproofed, fits two people and has a small desk, two chairs and two microphones on boom arms. It is for anything you would not want to do at an open desk: a client call, an interview, a podcast episode.</p>
<h2>Booking</h2>
<p>The booth is <strong>₹300 an hour</strong> including GST and is bookable Monday to Friday 8:00–21:00 and Saturday 9:00–18:00. Book it online by the hour. If it is free and nobody has booked the next slot, a ten-minute call without booking is fine — just put the "In use" card on the door.</p>
${figure(DK_PHOTOS.headphones, "Bring your own headphones; we keep a spare pair at the desk for emergencies.")}
<h2>Recording</h2>
<ul>
<li>Both microphones connect by USB. Use the hub on the desk and they appear on your laptop as two inputs.</li>
<li>Bring headphones so the microphones do not pick up your speakers.</li>
<li>The ceiling fan is the only noise in the booth. Switch it off while you record and on again when you leave.</li>
<li>Guests coming for an interview sign in at the front desk first.</li>
</ul>
<h2>Before you leave</h2>
<p>Put the microphones back on their arms, take your cables and cups, and switch off the light. If something does not work, tell me at the desk rather than fixing it yourself — the mic arms are fiddly and I would rather adjust them than replace them.</p>`,
    },
    {
        slug: "wifi-and-printing",
        title: "Wi-Fi and printing",
        category: "help",
        excerpt:
            "Which network to join, what happens when the main line drops, and how printing credits work at ₹3 a page.",
        daysAgo: 27,
        author: OMKAR,
        cover: WIFI_PRINTING,
        body: `<h2>Wi-Fi</h2>
<p>We have 300 Mbps fibre with a second internet provider as a backup. If the main line drops, the router moves everyone to the backup within a few seconds; a video call may freeze briefly but should not disconnect.</p>
<ul>
<li><strong>Desk42-Members</strong> is for members. Your password is personal and comes with your welcome email; please do not share it.</li>
<li><strong>Desk42-Guest</strong> is for day passes, meeting-room guests and visitors. The password is on the card at the front desk and changes every Monday.</li>
</ul>
<p>Need a wired connection for a big upload? There are two network points under the hot desk nearest the café. Ask me for a cable.</p>
<h2>Printing and scanning</h2>
${figure(DK_PHOTOS.printer, "The printer and scanner sit beside the front desk.")}
<p>Printing works on credits. A black and white page uses ₹3 of credit and a colour page ₹12. Buy a pack of 100 credits at the desk or on the shop, and I add it to your account. Members' unused credits carry over month to month.</p>
<ol>
<li>Send your file to the printer from your laptop while you are on either Desk42 network.</li>
<li>Walk to the printer and enter your four-digit code to release the job.</li>
<li>For scanning, put the pages in the feeder, pick "Scan to email" and type your address.</li>
</ol>
<p>Paper jams happen. Please call me rather than pulling the tray out.</p>`,
    },
    {
        slug: "bringing-guests",
        title: "Bringing guests to Desk 42",
        category: "help",
        excerpt:
            "Members can bring one guest a day for up to two hours, free. Longer visits need a day pass; meeting-room guests sign in at the desk.",
        daysAgo: 75,
        author: RHEA,
        cover: DK_PHOTOS.lounge,
        body: `<p>Desk 42 works because the people at the next desk are people you know. Guests are welcome, with a few simple rules so the space stays calm and the desks stay free for members.</p>
<h2>The rules</h2>
<ul>
<li><strong>One guest a day, up to two hours, free.</strong> Good for a quick catch-up, a client who wants to see where you work, or a friend who is passing through Baner.</li>
<li><strong>Longer than two hours?</strong> Your guest needs a day pass (₹499, Monday to Friday). On Saturdays the space is members-only, so a guest can stay for the two free hours but cannot buy a day pass.</li>
<li><strong>Every guest signs in</strong> at the front desk with their name and phone number. Omkar gives them the guest Wi-Fi.</li>
</ul>
${figure(DK_PHOTOS.smallTeam, "A guest for an hour is fine at your desk; for a longer working session, book a room.")}
<h2>Meetings with more than one guest</h2>
<p>If you are meeting a group, book the Sahyadri Room. Meeting-room guests do not count towards your one-a-day allowance, but they still sign in at the desk, and they stay in the room or the café area rather than at the hot desks.</p>
<h2>Please don't</h2>
<ul>
<li>Bring a guest to work at a hot desk every day on the free allowance. If they like it here, send them to me for a tour.</li>
<li>Leave a guest alone in the space or lend them your key card.</li>
</ul>`,
    },
    {
        slug: "changing-your-membership",
        title: "Upgrading, downgrading, pausing or cancelling your membership",
        category: "help",
        excerpt:
            "Upgrade any time and pay the difference pro-rated. Downgrade or cancel before your renewal date, and pause once a year for up to a month.",
        daysAgo: 88,
        author: RHEA,
        cover: PLANS_CARD,
        body: `<p>Life changes: a project ends, a team grows, you go home for a month. Here is how each change works. All prices include 18% GST.</p>
<table>
<thead><tr><th>Membership</th><th>Per month</th><th>Includes</th></tr></thead>
<tbody>
<tr><td>Hot desk</td><td>₹6,500</td><td>Any free hot desk, members' Wi-Fi</td></tr>
<tr><td>Dedicated desk</td><td>₹9,500</td><td>Your own desk and storage pedestal, 24×7 key card, 4 meeting-room hours</td></tr>
<tr><td>Virtual office</td><td>₹1,999</td><td>Business address, mail scanned, 2 day passes</td></tr>
</tbody>
</table>
<h2>Upgrading</h2>
<p>You can upgrade on any day. You pay the difference for the days left until your renewal date, and the new price applies from then on. Moving from a hot desk to a dedicated desk depends on one being free; if none is, I will put you on the list and tell you the moment one opens.</p>
${figure(DK_PHOTOS.dedicatedDesk, "A dedicated desk is yours: leave your monitor and plant, and lock your pedestal.")}
<h2>Downgrading or cancelling</h2>
<p>Tell me before your next renewal date and the change applies from that date. There is no refund for part of a month already paid. If you are leaving a dedicated desk, please clear it and hand back your key card on your last day.</p>
<h2>Pausing</h2>
<p>Once a year you can pause your membership for up to a month — handy for a long trip or a wedding season. You are not charged while paused, and a dedicated desk stays yours. Tell me at least a week before you want the pause to start.</p>`,
    },
    {
        slug: "virtual-office-mail-and-gst-address",
        title: "Virtual office: your mail and using our address for GST",
        category: "help",
        excerpt:
            "A virtual office gives you a Baner business address for GST registration and letterhead. How we receive and scan your mail, and the papers you get.",
        daysAgo: 97,
        author: RHEA,
        cover: DK_PHOTOS.mail,
        body: `<p>The virtual office membership is ₹1,999 a month including GST. You get a proper business address — 4th floor, Sai Capital, Baner Road, Baner, Pune 411045 — that you can put on your letterhead, your invoices and your GST registration, along with two day passes a month.</p>
<h2>Using the address for GST registration</h2>
<p>To register a principal place of business, the GST portal asks for proof that you may use the premises. When you join, we give you:</p>
<ul>
<li>a signed no-objection certificate from Desk 42 naming your business;</li>
<li>a copy of the latest electricity bill for the premises;</li>
<li>a copy of your virtual office agreement.</li>
</ul>
<p>An officer sometimes visits to verify the address. If that happens, Omkar or I will meet them and show them your mail slot and agreement. Please tell us when your application is filed so we expect the visit.</p>
${figure(DK_PHOTOS.calculator, "Your CA will tell you what else your registration needs; we cover the address part.")}
<h2>Mail</h2>
<ol>
<li>Omkar receives your letters and couriers at the front desk and signs for them.</li>
<li>The same day, he scans the envelope and emails it to you. If you ask, he opens and scans the contents too.</li>
<li>Originals are kept in your slot for 60 days. Collect them when you visit, or ask us to courier them on at cost.</li>
</ol>
<p>We do not accept parcels larger than a shoebox or anything that needs payment on delivery.</p>`,
    },
    {
        slug: "lockers-and-storage",
        title: "Lockers and storage",
        category: "help",
        excerpt:
            "Lockers are ₹600 a month for hot-desk members and day-pass regulars. What fits, how keys work, and what you can leave overnight.",
        daysAgo: 110,
        author: OMKAR,
        cover: DK_PHOTOS.lockers,
        body: `<p>Hot desks are cleared every evening, so if you come often you will want somewhere to keep your things. Our lockers are along the wall by the café counter.</p>
<h2>Renting a locker</h2>
<ul>
<li>A locker is <strong>₹600 a month</strong>, GST included. Rent one at the desk or on the shop.</li>
<li>Each is big enough for a laptop bag, a pair of shoes and a jacket — roughly 30 cm wide and 45 cm deep.</li>
<li>You get one key. A lost key is ₹300 for a new lock.</li>
<li>The rental renews monthly with your membership. Stop it any time before the next month starts.</li>
</ul>
${figure(FLOOR_PLAN, "The lockers are on the wall between the café counter and the booth.")}
<h2>Dedicated desks</h2>
<p>Dedicated-desk members already have a lockable storage pedestal under their desk, and their desk is never cleared, so most do not need a locker.</p>
<h2>What not to keep</h2>
<ul>
<li>Food, even sealed — ants find everything in the monsoon.</li>
<li>Cash or jewellery. Lockers are for convenience, not a safe.</li>
<li>Anything you will need on a Sunday, when we are closed.</li>
</ul>
<p>Things left on hot desks overnight go into the lost-and-found box at the front desk. We keep them for two weeks.</p>`,
    },
    {
        slug: "cafe-tab-and-payments",
        title: "The café counter: your tab and how to pay",
        category: "help",
        excerpt:
            "Filter coffee, chai, poha and more from the counter. Members can run a monthly tab; everyone else pays as they go.",
        daysAgo: 24,
        author: SUNITA,
        cover: DK_PHOTOS.cafe,
        body: `<p>I run the café counter from 8:30 in the morning to 19:00 on weekdays and 9:30 to 16:00 on Saturdays. Hot drinks come in Regular and Large; poha is made fresh until it runs out, usually by noon.</p>
<h2>What we make</h2>
<ul>
<li><strong>Coffee:</strong> filter coffee, cappuccino and cold coffee.</li>
<li><strong>Chai:</strong> masala chai, made strong unless you say otherwise.</li>
<li><strong>Food:</strong> poha in the morning, sandwiches from 11:00, and cookies all day.</li>
</ul>
${figure(DK_PHOTOS.filterCoffee, "Filter coffee, served the proper way in a tumbler and dabara.")}
<h2>Paying</h2>
<ul>
<li><strong>Members</strong> can run a tab. I note each order against your name and the total is added to your next membership invoice. You can ask me for your running total any time.</li>
<li><strong>Day-pass visitors and guests</strong> pay at the counter by UPI or card, or order on the shop and show me the order on your phone.</li>
<li>We do not take cash for amounts under ₹50 — we never have change.</li>
</ul>
<h2>Bringing your own</h2>
<p>Bring your own mug and I will fill it to Large for the Regular price. Outside food is fine at the café tables, but please do not eat at the hot desks or in the booth.</p>`,
    },
];

const news: DemoPost[] = [
    {
        slug: "diwali-hours-2026",
        title: "Diwali hours: closed 8 and 9 November",
        category: "news",
        excerpt:
            "We close on Sunday 8 and Monday 9 November, and open 10:00 to 18:00 on Saturday 7 and Tuesday 10. Normal hours from Wednesday 11.",
        daysAgo: 3,
        author: RHEA,
        cover: DK_PHOTOS.diwali,
        body: `<p>Diwali falls on Sunday 8 November this year, and the team is taking a couple of days with family. Here are our hours for that week:</p>
<table>
<thead><tr><th>Day</th><th>Hours</th></tr></thead>
<tbody>
<tr><td>Friday 6 November</td><td>8:00–21:00 (normal)</td></tr>
<tr><td>Saturday 7 November</td><td>10:00–18:00</td></tr>
<tr><td>Sunday 8 November</td><td>Closed</td></tr>
<tr><td>Monday 9 November</td><td>Closed</td></tr>
<tr><td>Tuesday 10 November</td><td>10:00–18:00</td></tr>
<tr><td>Wednesday 11 November</td><td>Normal hours, 8:00–21:00</td></tr>
</tbody>
</table>
${figure(DIWALI_HOURS, "Diwali week at a glance. Dedicated desks keep their 24×7 access throughout.")}
<p>Dedicated-desk members keep their 24×7 key-card access all week; the café counter and front desk are closed on the 8th and 9th, so mail delivered those days will be scanned on Tuesday.</p>
<p>The Sahyadri Room and the booth can only be booked during the hours above. Our Diwali potluck is on Thursday 5 November — more on that in the November events post. Shubh Deepavali from all of us.</p>`,
    },
    {
        slug: "founders-chai-november-december",
        title: "Founders' Chai: 6 November and 4 December",
        category: "news",
        excerpt:
            "Our monthly evening for founders and freelancers is on the first Friday at 17:30. November's comes the day after the Diwali potluck.",
        daysAgo: 6,
        author: RHEA,
        cover: DK_PHOTOS.event,
        body: `<p>Founders' Chai is our first-Friday evening: an hour of chai, Sunita's snacks and one member talking for ten minutes about something they have learnt the hard way, followed by questions. It starts at <strong>17:30</strong> and is free for members.</p>
<h2>Coming up</h2>
<ul>
<li><strong>Friday 6 November</strong> — Ashwini Patil, the CA who works from desk 11, on "What I wish freelancers sent me before 31 March".</li>
<li><strong>Friday 4 December</strong> — Ananya and Siddharth from Pixel and Paper Studio on pricing their first retainer.</li>
</ul>
${figure(EVENTS_NOVEMBER, "November at Desk 42: the Diwali potluck on Thursday 5th, Founders' Chai on Friday 6th.")}
<p>The evening before, Thursday 5 November, is our Diwali potluck from 18:00. Bring one dish from home; we will do the chai, the lights and the rangoli.</p>
<p>Members can bring one guest to either evening. Tell Omkar their name by the morning of the event so we have enough cups.</p>`,
    },
    {
        slug: "new-cafe-menu",
        title: "New on the café menu: poha and cold coffee in two sizes",
        category: "news",
        excerpt:
            "Fresh poha every morning, cold coffee now in Regular and Large, and the masala chai recipe members kept asking about.",
        daysAgo: 11,
        author: SUNITA,
        cover: DK_PHOTOS.poha,
        body: `<p>From this week, the café counter has a few changes.</p>
<ul>
<li><strong>Poha every morning.</strong> Kanda poha with peanuts, a squeeze of lime and sev on top, made from 8:30 until it runs out. On most days that is around noon.</li>
<li><strong>Cold coffee in two sizes.</strong> Regular, and a Large that lasts a whole afternoon of emails.</li>
<li><strong>Coffee and chai in Regular and Large</strong> too, for filter coffee, cappuccino and masala chai.</li>
<li>Sandwiches — veg grilled and paneer — from 11:00, and the chocolate chip cookies stay.</li>
</ul>
${figure(DK_PHOTOS.chai, "Masala chai with ginger, cardamom and a little black pepper.")}
<p>Several of you have asked what goes in the chai. It is Assam tea, fresh ginger, green cardamom, a clove and a pinch of black pepper, boiled twice. No secret beyond patience.</p>
<p>Members can still put everything on their monthly tab. And if you bring your own mug, a Regular becomes a Large.</p>`,
    },
    {
        slug: "member-spotlight-pixel-and-paper",
        title: "Member spotlight: Pixel and Paper Studio",
        category: "news",
        excerpt:
            "Ananya Kulkarni and Siddharth Joshi run a two-person design studio from two dedicated desks by the window. We asked how they work.",
        daysAgo: 17,
        author: RHEA,
        cover: DK_PHOTOS.smallTeam,
        body: `<p>Ananya Kulkarni and Siddharth Joshi joined Desk 42 in March 2024 with one hot-desk membership between them. Today Pixel and Paper Studio has two dedicated desks by the window and clients in Pune, Mumbai and London.</p>
<blockquote><p>"Working from home, we spent half our time deciding whose turn it was to make tea. Here, Sunita decides." — Siddharth</p></blockquote>
<p>They design packaging and brand identities for food and wellness businesses, mostly small ones. Ananya draws; Siddharth does the type, the files and, as he puts it, "the polite emails about invoices".</p>
${figure(DK_PHOTOS.hotDesks, "They started at the hot desks, sharing one membership on alternate days.")}
<p>Their favourite corner of the space is the Sahyadri Room's whiteboard, which they book on Thursdays for client reviews. Their tip for new members: "Come to Founders' Chai even if you think you have nothing to say. Half our clients came from someone we met there."</p>
<p>They will be speaking at Founders' Chai on 4 December.</p>`,
    },
    {
        slug: "gst-workshop-for-freelancers",
        title: "Workshop: GST and invoicing for freelancers, Saturday 24 October",
        category: "news",
        excerpt:
            "Ashwini Patil, a CA and Desk 42 member, runs a free two-hour session on registration, invoices and quarterly returns.",
        daysAgo: 21,
        author: RHEA,
        cover: DK_PHOTOS.whiteboard,
        body: `<p>Every March the café counter fills with members asking each other the same questions about GST. This year we are getting ahead of it.</p>
<p>On <strong>Saturday 24 October, 11:00–13:00</strong>, Ashwini Patil — a chartered accountant who has worked from desk 11 since 2024 — will run a plain-language session in the Sahyadri Room on:</p>
<ul>
<li>when a freelancer has to register for GST, and when it makes sense to register anyway;</li>
<li>what a proper tax invoice needs to show;</li>
<li>export of services and clients outside India;</li>
<li>the return calendar, and what to send your CA each quarter.</li>
</ul>
${figure(DK_PHOTOS.calculator, "Bring your questions and one of your own invoices — names blanked out, please.")}
<p>The session is free for members and limited to eight people, the size of the room. Saturdays are members-only, so this one is for members; you may bring one guest as usual. Put your name down with Omkar at the front desk.</p>
<p>Ashwini is clear that this is general information, not advice for your situation. Chai and poha are on us.</p>`,
    },
    {
        slug: "wifi-backup-line",
        title: "A second internet line, so calls keep going",
        category: "news",
        excerpt:
            "We have added a backup line from a second provider. If the fibre drops, the network switches over in a few seconds.",
        daysAgo: 29,
        author: OMKAR,
        cover: DK_PHOTOS.router,
        body: `<p>On two afternoons in August, roadworks on Baner Road cut our fibre line, once for almost three hours. For a space where people take client calls all day, that is three hours too many.</p>
<p>As of this week we have a <strong>second internet line from a different provider</strong>, coming into the building by a different route. Our router watches the main 300 Mbps fibre line and, if it drops, moves everyone to the backup within a few seconds.</p>
<ul>
<li>Nothing changes for you: same networks, Desk42-Members and Desk42-Guest, same passwords.</li>
<li>On the backup line, very large uploads will be slower. Video calls, email and normal work are fine.</li>
<li>The router switches back to the fibre by itself once it returns.</li>
</ul>
${figure(WIFI_PRINTING, "The Wi-Fi and printing card at the front desk, updated with the backup line.")}
<p>If you ever notice the internet misbehaving, tell me at the desk with the time it happened. It helps me spot a pattern faster than any dashboard.</p>`,
    },
    {
        slug: "member-spotlight-nikhil-bhosale",
        title: "Member spotlight: Nikhil Bhosale, remote engineer",
        category: "news",
        excerpt:
            "Nikhil writes code for a Bengaluru startup from a dedicated desk in Baner. He told us why he stopped working from his bedroom.",
        daysAgo: 45,
        author: RHEA,
        cover: DK_PHOTOS.laptopWork,
        body: `<p>Nikhil Bhosale is a backend engineer for a payments startup in Bengaluru. His team is spread across four cities; he has not lived in Bengaluru since 2022.</p>
<blockquote><p>"For a year I worked from my bedroom in Balewadi. My day had no start and no end. Now it starts when I badge in and ends when I walk out."</p></blockquote>
<p>He took a dedicated desk last October, partly for the 24×7 key card: his team's release window is late on Thursday nights, and he would rather be at a proper desk with a second monitor than on his bed.</p>
${figure(DK_PHOTOS.dedicatedDesk, "Nikhil's desk: laptop on a stand, a plant he insists is thriving, and nothing else.")}
<p>What he likes most is not the internet (although he checks it). It is lunch. "Remote work is quiet in a bad way. Here I eat with a CA, a podcaster and two designers, and I learn something every time."</p>
<p>His advice for anyone working for a company in another city: "Tell your manager where you work. Mine visits Pune twice a year now and books the Sahyadri Room for our team day."</p>`,
    },
    {
        slug: "podcast-booth-is-open",
        title: "The call and podcast booth is open",
        category: "news",
        excerpt:
            "Our new soundproofed booth has two microphones and room for two. Book it by the hour for calls, interviews and recordings.",
        daysAgo: 68,
        author: RHEA,
        cover: DK_PHOTOS.booth,
        body: `<p>The most common request in our member survey last year was simple: somewhere to take a call without everyone hearing it. The corner beside the café counter has been a building site for three weeks. As of today it is a soundproofed booth.</p>
<ul>
<li>Room for two, with a small desk and two chairs.</li>
<li>Two microphones on boom arms, connected by USB, so you can record a two-person conversation without bringing any kit.</li>
<li>Acoustic panels on every wall and a door seal that keeps café noise out.</li>
</ul>
${figure(FLOOR_PLAN, "The booth sits between the café counter and the lockers.")}
<p>The booth is ₹300 an hour and is bookable online, Monday to Friday 8:00–21:00 and Saturday 9:00–18:00. Short unbooked calls are fine when it is free.</p>
<p>Thanks to Tanvi Rao, who records her interview podcast from Desk 42, for testing the setup and telling us — kindly — that the first ceiling fan was too loud. We changed it.</p>`,
    },
    {
        slug: "monsoon-at-desk-42",
        title: "Getting through the monsoon at Desk 42",
        category: "news",
        excerpt:
            "Umbrella stand, shoe rack, power backup and an earlier café opening. A few changes for the rainy months.",
        daysAgo: 140,
        author: OMKAR,
        cover: DK_PHOTOS.monsoon,
        body: `<p>The rains are here early, and Baner Road floods at Balewadi Phata the way it does every year. A few changes to make the next four months easier:</p>
<ul>
<li><strong>Umbrella stand and shoe rack</strong> at the entrance. Please leave wet umbrellas there rather than at your desk.</li>
<li><strong>Power backup</strong> has been serviced and now covers every desk, the Wi-Fi and the café counter for up to four hours.</li>
<li><strong>Spare chargers</strong> at the front desk for the days you leave in a hurry.</li>
<li><strong>Café opens at 8:30</strong> instead of 9:00, because nobody wants to make chai at home in a power cut.</li>
</ul>
${figure(DK_PHOTOS.chai, "Hot masala chai at the counter from 8:30 on rainy mornings.")}
<p>If heavy rain makes the roads unsafe, we will stay open but email members to suggest they stay home. Day passes booked for that day can be moved to another weekday — just reply to your booking email.</p>
<p>Stay dry, and please don't drive through the underpass when it's flooded.</p>`,
    },
];

const articles: DemoPost[] = [
    {
        slug: "a-day-at-desk-42",
        title: "A day at Desk 42",
        category: "articles",
        excerpt:
            "From the first key card at six to the last light off at nine: one ordinary Wednesday in a small Baner coworking space, hour by hour.",
        daysAgo: 8,
        author: RHEA,
        cover: DK_PHOTOS.hero,
        featured: true,
        body: `<p>People ask what a coworking space is actually like on a normal day. The honest answer is: quieter than you would think, friendlier than an office, and full of small routines. Here is last Wednesday.</p>
<h2>6:10 — the first key card</h2>
<p>Before the front desk opens, the only people in are dedicated-desk members with 24×7 access. On Wednesday that was Nikhil, who writes code for a Bengaluru startup and had a production release to watch. He made his own coffee in the dark and was gone again by eight for a run along the Mula river.</p>
<h2>8:00 — doors open</h2>
<p>Omkar switches on the lights, the air-conditioning and the printer, checks the Wi-Fi is on the main line and not the backup, and puts out the guest password card. The first two day-pass visitors arrive at 8:05, both students preparing for interviews, both heading straight for the hot desks by the window.</p>
${figure(FLOOR_PLAN, "The floor: hot desks in the middle, dedicated desks along the windows, the Sahyadri Room and the booth on the far side.")}
<h2>8:30 — the counter opens</h2>
<p>Sunita's poha is ready by 8:30, and on a weekday the first batch is gone by 10. The morning order is almost always the same: filter coffee for the people who grew up with it, cappuccino for the people who did not, and masala chai for everyone else.</p>
<h2>10:00 — the quiet hours</h2>
<p>Between ten and one, the open area is the quietest it will be all day. Of the twenty hot desks, sixteen are taken. Headphones are on. Ashwini, the CA at desk 11, is filing returns for three clients. Pixel and Paper Studio, the two-person design team by the window, have their screens turned towards each other and are arguing in whispers about a typeface.</p>
<h2>12:00 — the Sahyadri Room</h2>
<p>A founder from Aundh has booked the meeting room for two hours to interview candidates for her first hire. Omkar signs in each candidate at the desk, offers them water and walks them in. The 65-inch screen is used once, for a portfolio; the whiteboard not at all.</p>
<h2>13:30 — lunch</h2>
<p>Lunch happens at the long table near the café. Some bring tiffins, some order in, some buy Sunita's sandwiches. This is where most of the useful conversations at Desk 42 happen: who knows a good lawyer, whose client is late paying, whether anyone has tried the new place at Balewadi High Street.</p>
${figure(DK_PHOTOS.cafe, "The café counter, the unofficial centre of the space.")}
<h2>15:00 — the booth</h2>
<p>Tanvi Rao has the call and podcast booth booked from three to five to record an interview. The booth's light goes red, and the café counter instinctively gets quieter.</p>
<h2>17:30 — the second shift</h2>
<p>By half past five the students have gone and a different group arrives: people with day jobs elsewhere who come in to work on their own projects. It is the friendliest hour of the day. Someone usually brings biscuits.</p>
<h2>21:00 — lights off</h2>
<p>Omkar closes the front desk at nine. Two dedicated-desk members are still in; they will lock up behind themselves. Tomorrow the poha will be ready at 8:30 again.</p>
<p>If you would like to see it for yourself, book a free 30-minute tour. I do them Monday to Saturday, 11:00 to 13:00 and 16:00 to 18:00.</p>`,
    },
    {
        slug: "baner-vs-hinjewadi-commute",
        title: "Working from Baner instead of commuting to Hinjewadi",
        category: "articles",
        excerpt:
            "The Hinjewadi commute can eat three hours a day. What members who switched to working near home found they gained, and what they gave up.",
        daysAgo: 26,
        author: RHEA,
        cover: DK_PHOTOS.pune,
        body: `<p>Ask anyone who works in Hinjewadi about their commute and you will get a number and a sigh. From Baner it is only about ten kilometres to Phase 3, but at nine in the morning that can mean an hour and a quarter each way, more if it is raining or the flyover work has moved again.</p>
<p>A good share of our members used to make that trip every day. Some still do, two or three days a week. We asked them what changed when they started working from Baner on the other days.</p>
<h2>The time comes back, but not all of it</h2>
<p>The obvious gain is time. Two and a half hours a day is twelve hours a week, which is a working day and a half. But nobody we spoke to said they worked twelve more hours. Most said they slept more, ate breakfast sitting down, and walked to work along Baner Road instead of sitting in a cab.</p>
<blockquote><p>"I didn't get more done in hours. I got more done because I arrived awake." — a product manager who now goes to Hinjewadi on Tuesdays and Thursdays only</p></blockquote>
${figure(DK_PHOTOS.officePark, "Office parks at dusk: the trip home is often longer than the trip in.")}
<h2>Why not just work from home?</h2>
<p>Many members tried that first. The trouble is not the work; it is the edges. At home, the day has no start, the laundry is always there, and by evening you have not spoken to anyone outside a video call. A desk ten minutes from home keeps the commute short but keeps the boundary.</p>
<h2>What you give up</h2>
<p>It is not all gain. Members who switched mentioned three things they missed:</p>
<ul>
<li><strong>The hallway.</strong> Running into your manager by the lifts and sorting something in two minutes. Remote days need more deliberate messages.</li>
<li><strong>Free lunch and the company gym,</strong> for those whose campuses have them.</li>
<li><strong>Visibility.</strong> Being seen matters in some teams more than others. Most said the answer was to be in the office on the days that count — planning, reviews — and remote on the days for focused work.</li>
</ul>
<h2>Making the split work</h2>
<p>The members who are happiest with a hybrid week have a few things in common:</p>
<ol>
<li>They pick fixed office days and keep them, so their team knows where they are.</li>
<li>They save deep work — writing, coding, analysis — for Baner days, and meetings for Hinjewadi days.</li>
<li>They leave home at the same time on both kinds of day, so the routine holds.</li>
</ol>
<p>For a two- or three-day week here, a hot desk membership usually costs less than the cab fares it replaces. For two days or fewer, day passes on the days you need them are often enough.</p>
<p>And if your company covers coworking for remote days, as more Pune employers now do, we can send a monthly invoice with our GSTIN in your company's name.</p>`,
    },
    {
        slug: "building-a-routine-as-a-freelancer",
        title: "Building a routine as a freelancer",
        category: "articles",
        excerpt:
            "No boss, no office hours, no commute. That freedom is exactly why so many freelancers drift. Habits our members swear by.",
        daysAgo: 38,
        author: RHEA,
        cover: DK_PHOTOS.notesAndLaptop,
        body: `<p>The first month of freelancing feels like a holiday. By the third month, most people we meet have the same complaint: the days blur, work spills into evenings, and Sunday feels like Tuesday. Freedom without structure turns into drift.</p>
<p>About half of Desk 42's members are freelancers — designers, writers, developers, a CA, a podcaster. Here are the habits they say keep them steady.</p>
<h2>1. A fixed start, even if the end moves</h2>
<p>Nearly everyone said the same thing: decide when your day starts and protect it. The end can flex when a deadline demands it, but a fixed start stops the slow slide into noon.</p>
<blockquote><p>"I'm at my desk by 9:30, five days a week, whether or not I have work. Some days I don't. I still come." — Ananya, designer</p></blockquote>
<h2>2. Separate places for separate jobs</h2>
<p>Working, eating and sleeping in one room is the fastest route to burnout. Even if you cannot afford a desk every day, two or three days a week somewhere else gives your home back its evenings.</p>
${figure(DK_PHOTOS.chai, "The mid-morning chai break is a fixed point in most members' day.")}
<h2>3. Plan the week on Monday morning</h2>
<p>Ten minutes on a Monday morning: what has to go out this week, who owes you money, who you need to chase for work. Members who do this say the rest of the week has fewer surprises. Write it on paper; you will look at it more.</p>
<h2>4. Batch the admin</h2>
<p>Invoices, follow-ups, GST paperwork and the dreaded "just checking in" emails all fit in one weekly block. Friday afternoon is popular: energy is low and the satisfaction of clearing a list is high.</p>
<h2>5. Take breaks you would take in an office</h2>
<p>A chai at eleven. Lunch with other people. A walk around the block at four. At home these quietly vanish; in a shared space they happen because other people take them too.</p>
<h2>6. Have a closing ritual</h2>
<p>Write down the first thing you will do tomorrow, close the laptop and leave. It sounds trivial. Members say it is the single habit that most improved their evenings.</p>
<h2>7. Know your number</h2>
<p>Know how much you need to earn each month, and check against it every Friday. Freelancers who know their number say yes to the right work and no to the wrong work faster.</p>
<h2>When it falls apart</h2>
<p>It will. A big project eats a fortnight, a client goes quiet, someone at home is unwell. The point of a routine is not to never break it; it is having something to come back to. Our members' advice: come back on a Monday, start with the fixed start, and do not try to fix everything at once.</p>`,
    },
    {
        slug: "deep-work-in-a-shared-space",
        title: "Focus and deep work in a shared space",
        category: "articles",
        excerpt:
            "Open desks are good for company and bad for concentration, unless you set things up. Practical ways our members get hours of focus.",
        daysAgo: 57,
        author: RHEA,
        cover: DK_PHOTOS.laptopWork,
        body: `<p>A coworking space is a trade-off. You get people, conversation and a reason to leave home; you also get people, conversation and a reason to look up from your screen. Getting serious work done here takes a bit of design, from us and from you.</p>
<h2>What we do</h2>
<ul>
<li><strong>Calls go to the booth.</strong> Short calls at your desk are fine; anything longer than ten minutes, or on speaker, goes to the booth or the Sahyadri Room.</li>
<li><strong>The window side is the quiet side.</strong> Conversations happen near the café, not between the hot desks.</li>
<li><strong>The front desk handles interruptions.</strong> Couriers, visitors and questions go to Omkar, not to whoever looks closest.</li>
</ul>
${figure(DK_PHOTOS.lounge, "Low-key corners for a chat, away from the people who are concentrating.")}
<h2>What members do</h2>
<h3>Work in blocks, not days</h3>
<p>Our most productive members do not try to focus all day. They plan two blocks of ninety minutes — one before lunch, one after — and protect those. The rest of the day is for email, calls and the café.</p>
<h3>Pick the right hours</h3>
<p>The space is quietest from 10:00 to 13:00 and after 18:00. If you have a choice, schedule your hardest work for then. Mondays are busier than Fridays.</p>
<h3>Use headphones as a signal</h3>
<p>The Desk 42 rule of thumb: headphones on means "not now". Even without music, they tell the person walking past that you are in the middle of something. It is the most effective thing in the space, and it is free.</p>
<h3>Choose the same desk</h3>
<p>On a hot desk membership you can sit anywhere, but members who sit in the same place most days settle in faster. Your brain learns that this chair means work. If you want that guarantee, that is what dedicated desks are for.</p>
<h3>Phone in the bag</h3>
<p>Not face down on the desk — in the bag. Several members swear by this, and none of them has missed anything important.</p>
<h3>Decide the task the evening before</h3>
<p>The worst way to start a focus block is by choosing what to focus on. Members who write tomorrow's first task on a sticky note before they leave get going within minutes of sitting down. Those who decide in the morning often open their email "just for a second" and lose the first hour.</p>
<h3>Eat before you start, not during</h3>
<p>Poha at the café counter, then the desk. Food at the desk turns a focus block into a snack break.</p>
<h2>When you need real silence</h2>
<p>Some work needs a closed door: a difficult piece of writing, a long exam, a recording. Book the booth for an hour or two. At ₹300 an hour it is the cheapest quiet room in Baner.</p>
<h2>The social side is part of it</h2>
<p>Focus is not the only goal. Members who never talk to anyone tend to drift back home within a few months. The best days here combine three hours of real work with one real conversation over chai. That balance is the point of a shared space.</p>`,
    },
    {
        slug: "hiring-your-first-employee",
        title: "Hiring your first employee as a solo founder",
        category: "articles",
        excerpt:
            "The jump from one to two is the hardest hire you will make. Lessons from Desk 42 founders who have made it, including the mistakes.",
        daysAgo: 82,
        author: RHEA,
        cover: DK_PHOTOS.smallTeam,
        body: `<p>Going from one person to two changes a business more than going from two to twenty. Suddenly someone else depends on your cash flow, your clarity and your mood. Several Desk 42 members have made that jump in the last two years. Here is what they told us at Founders' Chai.</p>
<h2>Hire for the work you keep postponing</h2>
<p>Founders often hire a copy of themselves. It feels safe but leaves the same gaps. Look at your to-do list from the last three months and find the work that keeps getting pushed: proposals, invoicing, social posts, testing. That is the job description.</p>
<h2>Write down the first ninety days</h2>
<p>Before you post the job, write what this person will do in their first week, first month and first three months. If you cannot fill ninety days, you might need a freelancer, not an employee.</p>
${figure(DK_PHOTOS.meetingRoom, "Several members interview in the Sahyadri Room; a closed door makes candidates take you seriously.")}
<h2>Mind the paperwork</h2>
<p>Hiring in India means a written offer letter, a clear salary structure, and a decision about whether this is a full-time employee or a consultant, which changes how you pay them and how tax is handled. Talk to your CA before you send the offer, not after. Ashwini, our resident CA, says the most common mistake she sees is founders calling someone a consultant while treating them in every other way as an employee.</p>
<h2>Interview for the work, not the CV</h2>
<p>The founders we spoke to all moved away from conversation-only interviews. Instead:</p>
<ol>
<li>A short, paid task based on real work — a few hours, not a weekend.</li>
<li>A conversation about the task: what they would do differently with more time.</li>
<li>A reference call with someone they actually worked with.</li>
</ol>
<h2>Give them a place to sit</h2>
<p>Remote first hires can work, but most founders here said their first hire learnt far faster sitting next to them for the first few months. A hot desk membership for the new person costs less than a week of mistakes made alone.</p>
<h2>Expect to manage</h2>
<p>The surprise for almost everyone: managing takes time. Plan a one-to-one every week, written goals every month, and plenty of patience. The time you save comes in month three, not week one.</p>
<blockquote><p>"I hired someone to save me ten hours a week. For the first six weeks it cost me ten hours a week. Then it saved me twenty." — a founder at desk 7</p></blockquote>
<p>If you are thinking about your first hire, come to the next Founders' Chai. Someone in the room will have made the mistake you are about to make.</p>`,
    },
    {
        slug: "video-call-etiquette",
        title: "Video-call etiquette in a shared workspace",
        category: "articles",
        excerpt:
            "Calls are half of remote work, and half of the complaints in any shared space. A practical guide to calling without annoying the next desk.",
        daysAgo: 15,
        author: OMKAR,
        cover: DK_PHOTOS.headphones,
        body: `<p>At the front desk I hear about the café, the Wi-Fi and, more than anything else, calls. Someone on speaker. Someone on a ninety-minute call at a hot desk. Someone shouting because the connection is bad. None of it is deliberate. Here is how to call well in a shared space.</p>
<h2>Before the call</h2>
<ul>
<li><strong>Check the length.</strong> Under ten minutes and mostly listening? Your desk is fine. Longer, or you will do most of the talking? Book the booth or the Sahyadri Room.</li>
<li><strong>Book ahead.</strong> The booth is busiest from 10:00 to 12:00 and 15:00 to 17:00, when India's working day overlaps with Europe's morning.</li>
<li><strong>Test your microphone.</strong> A good headset lets you speak at a normal volume. Laptop microphones make people shout.</li>
</ul>
${figure(DK_PHOTOS.booth, "The booth's two microphones are there for recordings, but they make any call sound better.")}
<h2>During the call</h2>
<h3>Always use headphones</h3>
<p>Not just for privacy. Without them, your laptop's speaker plays the other person's voice to the whole room and your microphone picks it up again as echo.</p>
<h3>Speak at the level of the room</h3>
<p>If you cannot hear yourself, you will speak louder. Turn on "hear myself" in your headset settings if it has one, or lift one ear cup a little.</p>
<h3>Mute when you are not talking</h3>
<p>The coffee machine, Sunita calling out an order, and the person at the next desk sneezing do not need to be in your meeting.</p>
<h3>Mind your background</h3>
<p>Members at the next desk did not agree to be on your call. Point your camera at a wall, or use a blurred background.</p>
<h2>When the connection drops</h2>
<p>If the main fibre drops, the backup line takes over in a few seconds. Do not restart your router or your laptop; wait a moment and the call usually recovers. If it does not, come and tell me.</p>
<h2>Interviews and difficult conversations</h2>
<p>Some calls should never happen at an open desk: a job interview, a salary conversation, a client complaint, anything medical or legal. It is not only about the people around you hearing; you will speak more freely behind a closed door. Book the booth for the call and fifteen minutes either side, so you are not rushing in or out.</p>
<h2>Calls with guests in the room</h2>
<p>If a client is visiting and you want to dial in a colleague, use the Sahyadri Room. The 65-inch screen makes a hybrid meeting far easier than everyone crowding round one laptop.</p>
<h2>A few extras</h2>
<ul>
<li>Back-to-back calls all afternoon? Book the booth for the block rather than hopping between desks.</li>
<li>Recording a client meeting? Tell the client, and do it in a room.</li>
<li>Late calls with the US are welcome after 18:00, when the space is quiet. Dedicated-desk members with 24×7 access often take them here rather than wake the house.</li>
</ul>
<p>Most of this is common sense. The trick is remembering that the space only works when everyone gives a little.</p>`,
    },
    {
        slug: "invoicing-and-gst-basics-for-freelancers",
        title: "Invoicing and GST basics for freelancers in India",
        category: "articles",
        excerpt:
            "What a good invoice shows, when GST registration comes in, TDS and advance tax: a plain overview of the questions our members ask most.",
        daysAgo: 130,
        author: RHEA,
        cover: DK_PHOTOS.calculator,
        body: `<p>This is a general overview, written with help from Ashwini Patil, the chartered accountant who works from desk 11. Rules change and every situation is different, so please treat it as a starting point for a conversation with your own CA, not as tax advice.</p>
<h2>A good invoice</h2>
<p>Whether or not you are registered for GST, a clear invoice gets paid faster. It should show:</p>
<ul>
<li>your name or business name, address and PAN, and your GSTIN if you have one;</li>
<li>the client's name and address, and their GSTIN if they are registered;</li>
<li>a unique invoice number, in sequence, and the date;</li>
<li>what you did, with dates or a project reference, and the amount;</li>
<li>if registered, the SAC code for the service and the GST charged;</li>
<li>how to pay you, and by when.</li>
</ul>
${figure(DK_PHOTOS.mail, "Number every invoice in sequence, and keep a copy of every one you send.")}
<h2>When GST registration comes in</h2>
<p>For most service providers, registration becomes mandatory once your turnover crosses ₹20 lakh in a financial year (the limit is lower in some states). Some freelancers register earlier because a large client asks for it, or because they work with clients across states. If you work with clients outside India, ask your CA about export of services; it has its own rules.</p>
<p>If you register, you charge GST on your invoices, file regular returns and can claim credit for GST you pay on business expenses — a coworking membership, for example, comes with a GST invoice.</p>
<h2>TDS</h2>
<p>Many companies deduct TDS from payments to freelancers for professional or technical services, and pay it to the government in your name. That money is not lost: it shows up in your Form 26AS and counts against your income tax for the year. Check it every quarter, and chase clients whose deductions are missing.</p>
<h2>Advance tax</h2>
<p>If you expect to owe more than ₹10,000 in tax for the year, you are generally expected to pay it in instalments during the year rather than all at once. Freelancers using the presumptive scheme for professionals can usually pay it in a single instalment by 15 March. Ask your CA which applies to you.</p>
<h2>The presumptive scheme</h2>
<p>Many professionals with modest receipts use the presumptive taxation scheme, which treats a fixed share of receipts as profit and saves a lot of bookkeeping. Whether it suits you depends on your income and expenses.</p>
<h2>Habits that save money</h2>
<ol>
<li>Open a separate bank account for work, even as a sole proprietor.</li>
<li>Set aside a fixed share of every payment for tax the day it arrives.</li>
<li>Keep every bill — laptop, internet, coworking — in one folder.</li>
<li>Send your CA your books every quarter, not every March.</li>
</ol>
<p>Ashwini runs a free workshop on this for members once or twice a year. Watch our News page for the next one.</p>`,
    },
    {
        slug: "why-small-spaces-beat-big-ones",
        title: "Why a small coworking space beats a big one",
        category: "articles",
        excerpt:
            "Twenty hot desks, one meeting room, one café counter. Why we chose to stay small, and what that means for the people who work here.",
        daysAgo: 50,
        author: RHEA,
        cover: DK_PHOTOS.hotDesks,
        body: `<p>When we opened Desk 42 in 2023, people asked when we would take the second floor. We still have not. Twenty hot desks, fourteen dedicated desks, one meeting room and one booth is the size we want to be. Here is why.</p>
<h2>You know everyone</h2>
<p>In a space with three hundred desks, you know the people from your floor, at best. With thirty-odd regulars, you know everyone's name by the end of your first month, and they know yours. Omkar knows how you take your coffee. Sunita knows when you skipped lunch.</p>
<p>That matters more than it sounds. Most of the good things that have happened to our members — clients, hires, collaborators, a wedding — came from someone they met at the café counter.</p>
${figure(DK_PHOTOS.event, "Founders' Chai works because everyone in the room has seen each other at the coffee machine.")}
<h2>The rules can be human</h2>
<p>Big spaces need policies for everything. We can ask. If you need the meeting room ten minutes longer and nobody has booked it, just carry on. If your guest is staying three hours instead of two, Omkar will notice, and he will be reasonable about it.</p>
<h2>Quiet is easier</h2>
<p>A big open floor is loud even when everyone is behaving. A small floor with a booth and a meeting room means calls and conversations have somewhere to go, and the desks stay calm.</p>
<h2>Problems get fixed the same day</h2>
<p>In a big space, a wobbly chair is a ticket in a queue. Here it is Omkar with a screwdriver before lunch. When members said the old chairs hurt their backs, new ones arrived within the month, because the people asking were the people we have chai with every day. Small means short distances: between you and the person who runs the place, and between a complaint and a fix.</p>
<h2>It is local</h2>
<p>Most of our members live within twenty minutes of Balewadi Phata. They walk, cycle or take a short auto ride in. That changes the feel of the place: people stay for the evening talk because home is close, and the space feels like part of the neighbourhood rather than a stop on a commute.</p>
<h2>What you give up</h2>
<p>Being honest: a small space has limits.</p>
<ul>
<li><strong>One meeting room.</strong> On busy afternoons it is booked. Plan ahead.</li>
<li><strong>Fewer perks.</strong> No gym, no games room, no nap pods. There is a very good filter coffee.</li>
<li><strong>No offices for big teams.</strong> If you grow past six or seven people, you will outgrow us, and we will be glad to help you find your next place.</li>
</ul>
<h2>Small is a choice</h2>
<p>Every few months a broker suggests we expand. Every few months we ask the members, and they say the same thing: please don't. So we spend the money on the things that make the space better at its size: better chairs, power backup that covers every desk, a café counter that makes real poha.</p>
<p>If that sounds like your kind of place, book a free 30-minute tour. You will meet half the members before you get to the coffee.</p>`,
    },
];

export const DK_POSTS: readonly DemoPost[] = [...help, ...news, ...articles];
