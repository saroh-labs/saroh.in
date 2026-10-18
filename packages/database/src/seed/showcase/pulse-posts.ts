import type { JournalPost } from "./journal";
import { figure, photo } from "./journal";

/**
 * Pulse Fitness's journal: Help for members, gym News and longer Articles
 * from the coaches. Supplements are described for what they are and how
 * people commonly use them — no health claims.
 */

// Photos — free-licence Unsplash, each one looked at before use.
const GYM_DARK = photo(
    "photo-1689877020200-403d8542d95d",
    "A long gym floor with benches, racks and dumbbells under a dark ceiling",
    "Ambitious Studio* | Rick Barrett",
    "https://unsplash.com/@weareambitious",
);
const GYM_TREAD = photo(
    "photo-1593079831268-3381b0db4a77",
    "A row of treadmills on a wooden gym floor",
    "Sven Mieke",
    "https://unsplash.com/@sxoxm",
);
const GYM_BRIGHT = photo(
    "photo-1542766788-a2f588f447ee",
    "A bright gym with treadmills and machines by tall windows",
    "gina lin",
    "https://unsplash.com/@shuttch",
);
const GYM_FLOOR = photo(
    "photo-1671970922029-0430d2ae122c",
    "A gym floor with racks, benches and cardio machines",
    "Jinish Shah",
    "https://unsplash.com/@jinishshah_",
);
const DEADLIFT_W = photo(
    "photo-1772450014622-1c209d012c2e",
    "A woman gripping a loaded barbell at the start of a deadlift",
    "Rodrigo Rodrigues | WOLF Λ R T",
    "https://unsplash.com/@wolfart32",
);
const DEADLIFT_FEET = photo(
    "photo-1706029831405-619b27e3260c",
    "A woman's hands and trainers next to a loaded barbell on the floor",
    "Ambitious Studio* | Rick Barrett",
    "https://unsplash.com/@weareambitious",
);
const GRIP = photo(
    "photo-1606657830879-00d70555b1b6",
    "Hands gripping a barbell above a pair of trainers on gym turf",
    "Susan Q Yin",
    "https://unsplash.com/@syinq",
);
const DEADLIFT_DARK = photo(
    "photo-1782849206337-f826f32f91ce",
    "A man lifting a barbell from the floor in a dimly lit gym",
    "Anastase Maragos",
    "https://unsplash.com/@visualsbyroyalz",
);
const OH_SQUAT = photo(
    "photo-1770026136877-8ddf98cd6500",
    "A woman holding a barbell overhead at the bottom of a squat",
    "Rodrigo Rodrigues | WOLF Λ R T",
    "https://unsplash.com/@wolfart32",
);
const BARBELL_RED = photo(
    "photo-1741478551868-a17b1644228d",
    "A lifter in a red shirt standing over a loaded barbell",
    "Putri Ardhia",
    "https://unsplash.com/@putriardhia",
);
const COACHED_SQUAT = photo(
    "photo-1758875568800-29fb434c7b17",
    "A woman squatting with a barbell in a rack while a trainer watches",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const KB_LUNGE = photo(
    "photo-1618688862225-ac941a9da58f",
    "A man kneeling in a lunge beside a kettlebell in a garage gym",
    "Josh Duke",
    "https://unsplash.com/@joshduke10",
);
const KB_ROW = photo(
    "photo-1632077804406-188472f1a810",
    "A row of kettlebells lined up on a rubber gym floor",
    "Heidi Erickson",
    "https://unsplash.com/@herickson7",
);
const HEX_DB = photo(
    "photo-1603077492340-e6e62b2a688b",
    "Hex dumbbells lined up against a white background",
    "Greg Rosenke",
    "https://unsplash.com/@greg_rosenke",
);
const BOX_JUMP = photo(
    "photo-1536922246289-88c42f957773",
    "Two people doing box jumps onto wooden boxes in a gym",
    "Meghan Holmes",
    "https://unsplash.com/@yellowteapot",
);
const BAND_CLASS = photo(
    "photo-1517130038641-a774d04afb3c",
    "A group class training with resistance bands under coloured lights",
    "Geert Pieters",
    "https://unsplash.com/@shotsbywolf",
);
const JUMP_CLASS = photo(
    "photo-1517931524326-bdd55a541177",
    "Close-up of a person mid-jump in a group class",
    "dylan nolte",
    "https://unsplash.com/@dylan_nolte",
);
const BARBELL_CLASS = photo(
    "photo-1554284126-aa88f22d8b74",
    "Three people lifting barbells together in a class, in black and white",
    "Sven Mieke",
    "https://unsplash.com/@sxoxm",
);
const KB_CLASS = photo(
    "photo-1597076545399-91a3ff0e71b3",
    "Kettlebells and medicine balls laid out on the floor before a class",
    "Ambitious Studio* | Rick Barrett",
    "https://unsplash.com/@weareambitious",
);
const YOGA_SUNSET = photo(
    "photo-1544367567-0f2fcb009e0b",
    "A woman in a yoga pose silhouetted against a pink sunrise",
    "kike vega",
    "https://unsplash.com/@kikekiks",
);
const MATS = photo(
    "photo-1763004871583-4183d64096b1",
    "Two rolled yoga mats standing against a wall in evening light",
    "Tuaans",
    "https://unsplash.com/@tuaans_",
);
const PROTEIN_JAR = photo(
    "photo-1693996045300-521e9d08cabc",
    "A plain tub labelled protein beside a scoop of powder",
    "Alex Saks",
    "https://unsplash.com/@alexsaks",
);
const PROTEIN_JAR2 = photo(
    "photo-1693996045899-7cf0ac0229c7",
    "A tub of protein powder with a scoop of powder spilling beside it",
    "Alex Saks",
    "https://unsplash.com/@alexsaks",
);
const COUNTER = photo(
    "photo-1693996045838-980674653385",
    "Plain tubs of protein, creatine and pre-workout beside a shaker",
    "Alex Saks",
    "https://unsplash.com/@alexsaks",
);
const GRANOLA = photo(
    "photo-1633360821154-1935fb5671e6",
    "A bar packed with nuts and dried fruit on a table",
    "Towfiqu barbhuiya",
    "https://unsplash.com/@towfiqu999999",
);
const DALS = photo(
    "photo-1708436477916-f97964f3ccf1",
    "Small bowls of different dals and lentils with a hand reaching in",
    "Monika Borys",
    "https://unsplash.com/@fotoinshadows",
);
const PANEER_MEAL = photo(
    "photo-1631452180539-96aca7d48617",
    "A bowl of paneer curry with rice, papad and lime",
    "Kalyani Akella",
    "https://unsplash.com/@mekalluakella",
);
const YOGURT_GRANOLA = photo(
    "photo-1612182062572-e29c5dfb5eb4",
    "A bowl of curd with granola, strawberries and blueberries",
    "Jaqueline Pelzer",
    "https://unsplash.com/@jaqui123456",
);
const SOYA = photo(
    "photo-1682482002999-654860dfcb24",
    "A pile of dried soya chunks on a white surface",
    "sidath vimukthi",
    "https://unsplash.com/@sidathkc",
);
const CREATINE_JAR = photo(
    "photo-1693996045435-af7c48b9cafb",
    "A plain tub labelled creatine beside a scoop of white powder",
    "Alex Saks",
    "https://unsplash.com/@alexsaks",
);
const WHITE_SCOOP = photo(
    "photo-1709976142410-9aae3b10e8bc",
    "A scoop heaped with white powder on a dark table",
    "Andrey Khoviakov",
    "https://unsplash.com/@khoviakov",
);
const BELT = photo(
    "photo-1586232710888-675866d80ad2",
    "A worn leather lifting belt hanging from a rack",
    "George Pagan III",
    "https://unsplash.com/@gpthree",
);
const ROLLER = photo(
    "photo-1591741535585-9c4f52b3f13f",
    "A person rolling the side of the leg on a foam roller",
    "Andrew Valdivia",
    "https://unsplash.com/@donovan_valdivia",
);
const ROLLER_BACK = photo(
    "photo-1738524108491-9a0db4067897",
    "A man lying back on a foam roller with his hands behind his head",
    "Sergio Kian",
    "https://unsplash.com/@sergiokian",
);
const SLEEP = photo(
    "photo-1658928784381-6f68bbcf92f6",
    "A woman asleep in white sheets in a sunlit bedroom",
    "iam_os",
    "https://unsplash.com/@iam_os",
);
const STAND_DESK = photo(
    "photo-1623177623442-979c1e42c255",
    "A wooden standing desk with a monitor in a home office",
    "ergonofis",
    "https://unsplash.com/@ergonofis",
);
const DESK_STRETCH = photo(
    "photo-1713946598456-a25ab3645730",
    "A man leaning back at his desk with his hands behind his head",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const RUN_WET = photo(
    "photo-1502224562085-639556652f33",
    "A runner on a wet road at dusk",
    "lucas Favre",
    "https://unsplash.com/@we_are_rising",
);
const RAIN = photo(
    "photo-1692362385851-cf68a6d9604b",
    "Heavy rain splashing on dark water",
    "Abhishek Tewari",
    "https://unsplash.com/@abhi_2410",
);
const MAT_CLASS = photo(
    "photo-1518611012118-696072aa579a",
    "A group of women exercising on mats in a studio",
    "bruce mars",
    "https://unsplash.com/@brucemars",
);
const CLIPBOARD_PEN = photo(
    "photo-1761558794306-466448dab4bc",
    "A hand holding a pen over a blue clipboard",
    "Phil Hearing",
    "https://unsplash.com/@philhearing",
);
const CLIPBOARD = photo(
    "photo-1523705480679-b5d0cc17a656",
    "A clipboard holding a handwritten log on a wooden table",
    "Eco Warrior Princess",
    "https://unsplash.com/@ecowarriorprincess",
);
const COACH_TABLET = photo(
    "photo-1758875570137-8691b7c55033",
    "A trainer going through a plan with a client on a tablet in a gym",
    "Vitaly Gariev",
    "https://unsplash.com/@silverkblack",
);
const ROPES = photo(
    "photo-1599058917212-d750089bc07e",
    "A man training with battle ropes in a covered space",
    "Karsten Winegeart",
    "https://unsplash.com/@_karsten",
);
const ROPES2 = photo(
    "photo-1599058918144-1ffabb6ab9a0",
    "A man swinging battle ropes in an open car park",
    "Karsten Winegeart",
    "https://unsplash.com/@_karsten",
);
const ROPES3 = photo(
    "photo-1605720789771-a7fb8ab19d04",
    "A man training with battle ropes on gym turf",
    "Ryan Snaadt",
    "https://unsplash.com/@ryansnaadt",
);
const TREAD_W = photo(
    "photo-1633394782240-f81aba3f850d",
    "A woman running on a treadmill in a gym",
    "Mike Cox",
    "https://unsplash.com/@iprefermike",
);
const SPIN = photo(
    "photo-1605235186531-bbd852b09e69",
    "A woman riding an indoor bike in a smoky studio",
    "Munbaik Cycling Clothing",
    "https://unsplash.com/@munbaik_cycling",
);
const TEE = photo(
    "photo-1618453292507-4959ece6429e",
    "A man in a black T-shirt jumping down a flight of stairs",
    "Sven Ciupka",
    "https://unsplash.com/@svenciupkab",
);
const REST_BENCH = photo(
    "photo-1579758629938-03607ccdbaba",
    "A man resting on a gym bench with a water bottle",
    "Anastase Maragos",
    "https://unsplash.com/@visualsbyroyalz",
);
const DUFFEL = photo(
    "photo-1448582649076-3981753123b5",
    "A brown duffel bag on a wooden floor beside a chair",
    "Erol Ahmed",
    "https://unsplash.com/@erol",
);
const GREEN_BOTTLE = photo(
    "photo-1602143407151-7111542de6e8",
    "A green metal water bottle on a white table",
    "Joan Tran",
    "https://unsplash.com/@joanofarts",
);
const WHITE_BOTTLE = photo(
    "photo-1585083969600-495ee7e3604b",
    "A white metal water bottle on a log outdoors",
    "Luis Quintero",
    "https://unsplash.com/@jibarox",
);
const PAIR_BENCH = photo(
    "photo-1675897124589-d9829ff9067b",
    "Two people resting and chatting on the gym floor between sets",
    "ASN",
    "https://unsplash.com/@asn_content",
);
const TOWELS = photo(
    "photo-1662386392771-07d5109da175",
    "Rolled white towels stacked on a floor",
    "Aparna Johri",
    "https://unsplash.com/@healthywithaparna",
);
const SNEAKERS = photo(
    "photo-1761946356399-8335dbdce394",
    "Red trainers on the gym floor beside equipment and a towel",
    "Omar Ramadan",
    "https://unsplash.com/@omarvellous14",
);
const DIYA_CIRCLE = photo(
    "photo-1635192592106-77a5aacbe1a3",
    "Lit diyas arranged in a circle on the floor",
    "Suchandra Roy Chowdhury",
    "https://unsplash.com/@artsy_lens21",
);
const RANGOLI = photo(
    "photo-1605302977140-6572a4421aef",
    "A lit diya on a colourful rangoli",
    "Jyoti Singh",
    "https://unsplash.com/@econut",
);
const PLANK = photo(
    "photo-1626444231642-6bd985bca16a",
    "A woman holding a plank on a mat by a bright window",
    "Olivia Bauso",
    "https://unsplash.com/@ohhbee",
);
const PUSHUP = photo(
    "photo-1598971457999-ca4ef48a9a71",
    "A man in a red tank top doing a push-up on a gym floor",
    "Gordon Cowie",
    "https://unsplash.com/@gcowie",
);
const ROW_LEGS = photo(
    "photo-1467818488384-3a21f2b79959",
    "Legs and feet strapped in on a rowing machine",
    "Kyle Kranz",
    "https://unsplash.com/@kjkranz",
);
const ELECTRO = photo(
    "photo-1764182350435-ed46f1e93c2f",
    "Powder poured from a sachet into a glass of water",
    "NutraSeller Manufacturing",
    "https://unsplash.com/@nutraseller",
);
const LUNGE_STRETCH = photo(
    "photo-1602520628350-fbf9db1f02ae",
    "A man in a deep lunge stretch on grass",
    "Dex Ezekiel",
    "https://unsplash.com/@dexezekiel",
);
const ASSIST_STRETCH = photo(
    "photo-1540206276207-3af25c08abc4",
    "A coach helping a man on the floor stretch his hamstring",
    "Annie Spratt",
    "https://unsplash.com/@anniespratt",
);
const COACH_W = photo(
    "photo-1645810798586-08e892108d67",
    "A woman coach standing by the window in a gym",
    "Taylor Daugherty",
    "https://unsplash.com/@tayloradaugherty",
);
const LUNGE_BARBELL = photo(
    "photo-1535202666646-1a0a3884bc34",
    "A man in a teal T-shirt doing a split squat with a barbell",
    "Sopan Shewale",
    "https://unsplash.com/@sopanshewale",
);
const SPRINT = photo(
    "photo-1744060204728-f68e434a3edf",
    "A runner on a track in golden evening light",
    "Jorge Alberto Vega Barrera",
    "https://unsplash.com/@shot_by_pancake",
);

export const PULSE_POSTS: readonly JournalPost[] = [
    // ── Help ────────────────────────────────────────────────────────────
    {
        slug: "how-to-book-a-class",
        title: "How to book a class",
        category: "help",
        excerpt:
            "Book HIIT, yoga or strength up to 21 days ahead and at least two hours before. Here is how it works.",
        cover: BAND_CLASS,
        daysAgo: 171,
        body: `
<p>Classes are small on purpose — twelve for HIIT, fifteen for yoga, ten for Strength foundations — so booking ahead keeps your place.</p>
<h2>Booking online</h2>
<ol>
<li>Open the class timetable on this site.</li>
<li>Pick a class and a time. Full classes are marked, so you can choose another slot.</li>
<li>Sign in with your email if you have not already.</li>
<li>Confirm. If you have a membership or a class pack, the class is taken from it. If not, you can pay for the single class.</li>
</ol>
<p>You will get a confirmation email, and the booking shows in your account.</p>
${figure(KB_CLASS, "Kit is laid out before every class — just bring water")}
<h2>The booking window</h2>
<ul>
<li>You can book up to <strong>21 days ahead</strong>.</li>
<li>Bookings close <strong>two hours before</strong> the class starts.</li>
<li>Free cancellation until <strong>12 hours before</strong>.</li>
</ul>
<h2>At the counter</h2>
<p>Prefer to talk to someone? Ask at the front counter and we will book it for you. It is the same booking, with the same rules.</p>
<p>Please arrive five minutes early so the coach can start on time. Late arrivals may be asked to skip the warm-up-heavy first round of HIIT for safety.</p>
`,
    },
    {
        slug: "cancelling-and-late-cancels",
        title: "Cancelling a class, and what counts as late",
        category: "help",
        excerpt:
            "Cancel up to 12 hours before and the class goes back to you. After that, or if you do not turn up, it is used.",
        cover: CLIPBOARD,
        daysAgo: 148,
        body: `
<p>Classes have a waiting list most weeks, so we ask for a little notice if you cannot make it.</p>
<h2>The rule in one line</h2>
<p><strong>Cancel at least 12 hours before the class and it costs you nothing.</strong> The class goes back into your membership or pack.</p>
<h2>Late cancels and no-shows</h2>
<p>If you cancel within 12 hours of the start, or do not turn up, the class is used — it counts against your monthly classes or your pack, the same as if you had come.</p>
${figure(SNEAKERS, "Your spot could go to someone on the waiting list")}
<h2>How to cancel</h2>
<ul>
<li>From your confirmation email, using the Cancel link.</li>
<li>From your account on this site, where your upcoming bookings are listed.</li>
<li>At the counter, or by calling us during opening hours.</li>
</ul>
<h2>Fair exceptions</h2>
<p>Life happens. If you are ill, if there is a family emergency, or if Koramangala's roads flood in a cloudburst, talk to the counter. We would rather you stayed home with a fever than came in and passed it round the class.</p>
<h2>Waiting lists</h2>
<p>When someone cancels, the first person on the waiting list is offered the spot by email. If you are on the list, keep an eye on your inbox on the morning of the class.</p>
`,
    },
    {
        slug: "how-classes-per-month-work",
        title: "How classes per month work",
        category: "help",
        excerpt:
            "Standard and Yearly members get eight classes a month; Off-peak members get four. When they reset and what happens to unused ones.",
        cover: JUMP_CLASS,
        daysAgo: 131,
        body: `
<p>Every membership includes the gym floor and a set number of coached classes each month.</p>
<ul>
<li><strong>Standard membership</strong> (₹2,500 a month) — 8 classes a month.</li>
<li><strong>Yearly membership</strong> (₹25,000 a year) — 8 classes a month, for twelve months.</li>
<li><strong>Off-peak membership</strong> (₹1,600 a month) — 4 classes a month, and the gym floor from 10am to 4pm on weekdays.</li>
</ul>
<h2>Which classes count</h2>
<p>HIIT, Yoga flow and drop-in Strength foundations sessions all count as one class each. Personal training and the fitness assessment are booked and paid for separately.</p>
${figure(BOX_JUMP, "Every HIIT, yoga or strength class uses one")}
<h2>When they reset</h2>
<p>Your classes reset at the start of each membership month — the date you joined, not the 1st of the calendar month. Your account shows how many you have left and when they reset.</p>
<h2>Unused classes</h2>
<p>Classes do not carry over to the next month. If you often have a few left, that is a sign to book them earlier — or that Off-peak might suit you better.</p>
<h2>Need more?</h2>
<p>If you use up your classes before the month ends, buy a class pack. Classes from a pack are used only once your monthly ones have run out.</p>
`,
    },
    {
        slug: "class-packs-or-membership",
        title: "Class pack or membership: which suits you?",
        category: "help",
        excerpt:
            "Packs are for people who come now and then. Memberships are for regulars. A quick comparison.",
        cover: MAT_CLASS,
        daysAgo: 112,
        body: `
<p>Not everyone wants a monthly commitment. That is what packs are for.</p>
<h2>Class packs</h2>
<ul>
<li><strong>5 classes</strong> — ₹2,200, valid for 60 days.</li>
<li><strong>10 classes</strong> — ₹4,000, valid for 90 days.</li>
<li>Good for HIIT, Yoga flow and Strength foundations drop-ins.</li>
<li>No gym floor access outside classes.</li>
</ul>
<h2>Memberships</h2>
<ul>
<li><strong>Standard</strong> — ₹2,500 a month, 8 classes plus the gym floor and a monthly review with a coach.</li>
<li><strong>Off-peak</strong> — ₹1,600 a month, 4 classes plus the gym floor 10am to 4pm on weekdays.</li>
<li><strong>Yearly</strong> — ₹25,000, the Standard membership for a year, paid once.</li>
</ul>
${figure(BARBELL_CLASS, "Regulars usually find a membership works out cheaper")}
<h2>A rough guide</h2>
<ul>
<li>Coming once a week or less, mostly to classes? A pack.</li>
<li>Working from home and free in the daytime? Off-peak.</li>
<li>Coming three or more times a week, or want to lift on your own too? Standard.</li>
<li>Sure you are staying the year? Yearly saves you two months.</li>
</ul>
<p>Not sure? Book a free trial session. The coach will give you an honest answer on which plan fits.</p>
`,
    },
    {
        slug: "pausing-your-membership",
        title: "Pausing your membership",
        category: "help",
        excerpt:
            "Travelling, injured or swamped at work? You can freeze your membership once a year.",
        cover: REST_BENCH,
        daysAgo: 96,
        body: `
<p>A trip home for a wedding, a sprained ankle, a month of exam duty — sometimes you simply cannot come in. Rather than cancel, you can pause.</p>
<h2>How a pause works</h2>
<ul>
<li>Monthly memberships can be paused for <strong>up to 30 days, once a year</strong>.</li>
<li>Yearly memberships can be paused for <strong>up to 60 days in total</strong> across the year.</li>
<li>While paused, you are not billed and cannot book classes or use the floor.</li>
<li>Your membership end date moves back by the length of the pause.</li>
</ul>
${figure(PAIR_BENCH, "A pause keeps your place without paying for days you cannot use")}
<h2>How to ask</h2>
<p>Tell the front counter at least <strong>seven days before</strong> your next billing date, with the dates you will be away. For an injury, a doctor's note lets us pause at shorter notice.</p>
<h2>Bookings during a pause</h2>
<p>Any classes you had booked during the pause are cancelled for you, free of charge.</p>
<h2>Coming back after an injury</h2>
<p>Have a word with your coach before your first session back. We will adjust your plan, and if your doctor gave you any limits, we will work within them.</p>
`,
    },
    {
        slug: "changing-plans-at-renewal",
        title: "Changing your plan at renewal",
        category: "help",
        excerpt:
            "Moving from Standard to Off-peak, or to Yearly? Plan changes take effect from your next renewal.",
        cover: GYM_TREAD,
        daysAgo: 77,
        body: `
<p>Your routine changes, and your membership can change with it.</p>
<h2>When a change takes effect</h2>
<p>Plan changes take effect at your <strong>next renewal date</strong>. Until then, you keep your current plan and its classes. That way nobody loses classes they have already paid for, and there are no part-month calculations.</p>
<h2>Common changes</h2>
<ul>
<li><strong>Standard to Off-peak</strong> — your price drops to ₹1,600 and your classes to 4 a month. Remember the floor is then open to you from 10am to 4pm on weekdays only.</li>
<li><strong>Off-peak to Standard</strong> — ₹2,500 a month, 8 classes, full opening hours.</li>
<li><strong>Monthly to Yearly</strong> — ₹25,000 paid once at your next renewal, for twelve months.</li>
</ul>
${figure(GYM_BRIGHT, "The floor is quietest between 10am and 4pm")}
<h2>How to change</h2>
<p>Ask at the front counter at least three days before your renewal date. You will get an email confirming the new plan and its start date, and it shows in your account straight away.</p>
<h2>Cancelling</h2>
<p>Standard memberships need a month's notice to cancel. Speak to the counter; we will confirm your last day in writing.</p>
`,
    },
    {
        slug: "paying-and-your-bills",
        title: "Paying, and finding your bills",
        category: "help",
        excerpt:
            "Pay at the counter by UPI or card and you get a bill every time. Your account keeps them all.",
        cover: GYM_FLOOR,
        daysAgo: 58,
        body: `
<p>Whether it is your membership, a class pack, personal training or a tub of whey from the counter, paying works the same way.</p>
<h2>How to pay</h2>
<ul>
<li><strong>At the counter</strong> by UPI or card.</li>
<li><strong>Online</strong> when you buy a pack or book a single class or session on this site.</li>
</ul>
<h2>Your bill</h2>
<p>Every payment gets a bill. It is emailed to you, showing what you bought, the date, and the GST. Company reimbursement? Ask at the counter before you pay and we will put your company's name and GSTIN on it.</p>
${figure(TOWELS, "Towels are at the counter — your bills are in your account")}
<h2>Your account</h2>
<p>Sign in on this site with your email to see:</p>
<ul>
<li>Your membership, its renewal date and classes left this month.</li>
<li>Your upcoming and past bookings.</li>
<li>Every bill, to open or download again.</li>
</ul>
<h2>Renewals</h2>
<p>Monthly memberships renew on the same date each month. You will get a reminder a few days before. If a payment fails, we will let you know and give you a few days to sort it before bookings pause.</p>
`,
    },
    {
        slug: "counter-shop-and-returns",
        title: "What the counter sells, and returns",
        category: "help",
        excerpt:
            "Protein, creatine, bars, shakers, belts, T-shirts and more. Unopened supplements can be returned within 7 days.",
        cover: COUNTER,
        daysAgo: 33,
        body: `
<p>The front counter now carries a small range of supplements and gear under our own Pulse label — the basics members asked for, so you do not have to order online and wait.</p>
<h2>Supplements</h2>
<ul>
<li>Whey protein concentrate — Chocolate, Vanilla, Café mocha and Unflavoured; 1 kg ₹2,499, 2 kg ₹4,599</li>
<li>Whey isolate and plant protein</li>
<li>Creatine monohydrate — 100 g and 250 g</li>
<li>Pre-workout — Fruit punch, Green apple, Watermelon</li>
<li>BCAA and electrolyte sachets</li>
<li>Protein bars — single, box of 6, box of 12</li>
<li>High-protein peanut butter</li>
</ul>
<p>All supplements are FSSAI-licensed. Prices are on the shelf tags. If you are pregnant, take regular medicines or have a health condition, check with your doctor before using any supplement.</p>
<h2>Gear</h2>
<p>Shaker bottles in four colours, lifting gloves and leather lifting belts (S–XL), wrist wraps, resistance bands, skipping ropes, gym towels, Pulse dry-fit T-shirts and tank tops, gym bags, foam rollers, yoga mats and steel water bottles.</p>
${figure(PROTEIN_JAR2, "Sealed tubs can come back within 7 days")}
<h2>Returns</h2>
<ul>
<li><strong>Supplements:</strong> unopened, with the seal intact, within <strong>7 days</strong>, with your bill. Opened tubs cannot be returned, for hygiene and safety.</li>
<li><strong>Clothing:</strong> unworn, with tags, within 7 days — exchange for another size or colour.</li>
<li><strong>Gear:</strong> unused, in its packaging, within 7 days.</li>
</ul>
`,
    },
    {
        slug: "t-shirt-and-tank-sizing",
        title: "Finding your size in Pulse T-shirts and tanks",
        category: "help",
        excerpt:
            "Our dry-fit T-shirts and tanks run true to size, S to XXL. A quick measuring guide.",
        cover: LUNGE_BARBELL,
        daysAgo: 24,
        body: `
<p>Pulse dry-fit T-shirts come in Black, Heather grey, Navy and Red, S to XXL; tank tops in Black and Grey, S to XL. Both have a regular, athletic cut — not skin-tight, not baggy.</p>
<h2>Measure your chest</h2>
<p>Run a tape measure around the fullest part of your chest, under the arms, keeping it level. Breathe normally.</p>
<ul>
<li><strong>S</strong> — chest up to 38 inches</li>
<li><strong>M</strong> — 38 to 40 inches</li>
<li><strong>L</strong> — 40 to 42 inches</li>
<li><strong>XL</strong> — 42 to 44 inches</li>
<li><strong>XXL</strong> — 44 to 46 inches</li>
</ul>
${figure(PUSHUP, "Tanks give the shoulders room for pressing and pull-ups")}
<h2>Between sizes?</h2>
<p>Size up if you like a looser fit or plan to wear it over a layer; size down if you like it close. The fabric does not shrink in a normal wash, but dry it in the shade rather than the hot afternoon sun to keep the colour.</p>
<h2>Try before you buy</h2>
<p>Samples of every size hang behind the counter. Try one on in the changing room. If it is not right once you get home, unworn T-shirts with tags can be exchanged within 7 days.</p>
`,
    },
    {
        slug: "your-first-visit",
        title: "Your first visit: what to bring and what to expect",
        category: "help",
        excerpt:
            "New to Pulse? Here is how the first day goes, from the counter to the floor.",
        cover: GYM_DARK,
        daysAgo: 163,
        body: `
<p>Walking into a new gym can feel like the first day at a new school. It does not need to.</p>
<h2>Bring</h2>
<ul>
<li>Comfortable clothes you can move in, and clean indoor trainers (no outdoor shoes on the floor, please — the monsoon mud thanks you).</li>
<li>A water bottle. There is a filtered water point by the lockers.</li>
<li>A small towel. Or buy one at the counter.</li>
<li>A lock if you want to use a locker.</li>
</ul>
${figure(WHITE_BOTTLE, "Bring a bottle — the water point is by the lockers")}
<h2>What happens</h2>
<ol>
<li><strong>Check in at the counter.</strong> Give your name; we will find your booking.</li>
<li><strong>Meet your coach.</strong> For a free trial session, that is thirty minutes: a tour, a short assessment of how you move, and an honest answer on which plan fits.</li>
<li><strong>Try things out.</strong> No one expects you to know how to use every machine. Ask.</li>
</ol>
<h2>Health first</h2>
<p>Tell the coach about any injuries, conditions or medicines that matter — back problems, blood pressure, a recent surgery, pregnancy. If your doctor has given you limits, we work within them.</p>
<h2>Hours</h2>
<p>Monday to Saturday, 6am to 10pm. Sunday, 7am to 12 noon. Evenings between 6pm and 8pm are the busiest.</p>
`,
    },

    // ── News ────────────────────────────────────────────────────────────
    {
        slug: "new-8pm-hiit-class",
        title: "A new 8pm HIIT class on weekdays",
        category: "news",
        excerpt:
            "The 6:30pm HIIT class fills up every night. From 19 October, there is a second one at 8pm.",
        cover: ROPES2,
        daysAgo: 13,
        body: `
<p>The weekday 6:30pm HIIT class has had a waiting list almost every night since the monsoon ended. So from <strong>Monday 19 October</strong>, we are adding a second evening class at <strong>8pm, Monday to Friday</strong>.</p>
<ul>
<li>Forty-five minutes, capped at twelve, as always.</li>
<li>Coached by Imran Shaikh on Mondays, Wednesdays and Fridays, and Ritika Nair on Tuesdays and Thursdays.</li>
<li>Counts as one class from your membership or pack.</li>
</ul>
${figure(ROPES3, "Expect ropes, sleds and a lot of sweat")}
<p>Bookings are open now, up to 21 days ahead. If you have been stuck on the 6:30 waiting list, this one is for you.</p>
<p>As with every class, you can book up to 21 days ahead and cancel for free up to 12 hours before.</p>
`,
    },
    {
        slug: "strength-foundations-november-batch",
        title: "Strength foundations: next batch starts 4 November",
        category: "news",
        excerpt:
            "Four weeks, eight coached sessions on squat, hinge, push and pull. Eight places.",
        cover: COACHED_SQUAT,
        daysAgo: 20,
        body: `
<p>The current Strength foundations batch is halfway through, and the next one starts on <strong>Wednesday 4 November</strong>.</p>
<h2>What it is</h2>
<p>Four weeks, eight coached sessions — Wednesdays at 7:30pm and Saturdays at 10am. Kabir Sethi teaches the big movements properly: the squat, the hinge (deadlift), the push and the pull, in a group of no more than eight.</p>
<p>It is built for people who are new to the weights floor, or who have been lifting by copying videos and want someone to check their form.</p>
${figure(DEADLIFT_FEET, "Week one starts with the set-up, not the weight")}
<h2>Price and booking</h2>
<p>₹4,800 for the four weeks. Book a place at the counter or on this site. Spare places in individual sessions open to drop-ins once the course is running.</p>
<p>Not sure if you are ready? You are. Every movement starts with a broomstick or an empty bar.</p>
`,
    },
    {
        slug: "counter-now-stocks-supplements-and-gear",
        title: "The counter now stocks supplements and gear",
        category: "news",
        excerpt:
            "Protein, creatine, bars, shakers, belts and Pulse T-shirts — at the front counter, under our own label.",
        cover: PROTEIN_JAR,
        daysAgo: 36,
        featured: true,
        body: `
<p>For months members have asked where to buy a decent whey protein or a lifting belt without waiting for a delivery. From this week, the front counter stocks a small range under our own Pulse label.</p>
<ul>
<li><strong>Whey protein concentrate</strong> in Chocolate, Vanilla, Café mocha and Unflavoured — 1 kg ₹2,499, 2 kg ₹4,599.</li>
<li>Whey isolate, plant protein, creatine monohydrate, pre-workout, BCAA and electrolyte sachets.</li>
<li>Protein bars, singly or by the box, and high-protein peanut butter.</li>
<li>Shakers, gloves, leather lifting belts, wrist wraps, bands, ropes, towels, foam rollers, yoga mats, steel bottles and gym bags.</li>
<li>Pulse dry-fit T-shirts and tank tops.</li>
</ul>
${figure(GRANOLA, "Protein bars by the piece or by the box")}
<p>All supplements are FSSAI-licensed. Nobody needs supplements to train here — food comes first — but if you use them, you can now pick them up on your way out. Pay by UPI or card and you get a bill as usual. Unopened, sealed supplements can be returned within 7 days.</p>
`,
    },
    {
        slug: "new-t-shirt-colours",
        title: "Pulse T-shirts now in Navy and Red",
        category: "news",
        excerpt:
            "Black and Heather grey sold out twice. Navy and Red join them this week, S to XXL.",
        cover: TEE,
        daysAgo: 8,
        body: `
<p>The first run of Pulse dry-fit T-shirts in Black and Heather grey sold out twice in a month. The restock is in, and it brings two new colours: <strong>Navy</strong> and <strong>Red</strong>.</p>
<ul>
<li>Sizes S to XXL in all four colours.</li>
<li>Tank tops in Black and Grey, S to XL.</li>
<li>Light, quick-drying fabric that copes with a Bengaluru afternoon.</li>
</ul>
${figure(DUFFEL, "Light enough to keep a spare in your gym bag")}
<p>Samples of every size hang behind the counter, so try one on before you buy. Unworn T-shirts with tags can be exchanged within 7 days if the size is not right.</p>
<p>Prices are unchanged: ₹799 for a T-shirt and ₹649 for a tank, paid at the counter.</p>
`,
    },
    {
        slug: "diwali-timings",
        title: "Diwali timings",
        category: "news",
        excerpt:
            "Shorter hours over Diwali weekend. No classes on Sunday 8 or Monday 9 November.",
        cover: DIYA_CIRCLE,
        daysAgo: 4,
        featured: true,
        body: `
<p>Happy Diwali from all the coaches and the counter team. Here is how we are open over the festival:</p>
<ul>
<li><strong>Saturday 7 November</strong> — 6am to 1pm. Morning classes run as usual; no evening classes.</li>
<li><strong>Sunday 8 November (Diwali)</strong> — closed.</li>
<li><strong>Monday 9 November</strong> — 7am to 12 noon, gym floor only. No classes or personal training.</li>
<li><strong>Tuesday 10 November</strong> — normal hours and timetable.</li>
</ul>
${figure(RANGOLI, "Enjoy the sweets — we will see you Tuesday")}
<p>Classes on these days have been taken off the timetable, so nobody is charged for a class that is not running. If you had already booked one, it has been cancelled and returned to you.</p>
<p>A word from Kabir: enjoy the festival. One weekend of laddoos changes nothing. Come back on Tuesday and pick up where you left off.</p>
`,
    },
    {
        slug: "deepa-hegde-joins-the-coaching-team",
        title: "Deepa Hegde joins the coaching team",
        category: "news",
        excerpt:
            "Deepa brings ten years of coaching, a love of mobility work, and Sunday yoga.",
        cover: COACH_W,
        daysAgo: 44,
        body: `
<p>We are glad to welcome <strong>Deepa Hegde</strong> to Pulse. Deepa has coached for ten years, first in a sports academy in Mysuru and then in studios across Bengaluru, and she is a certified yoga teacher.</p>
<p>She will be taking Yoga flow on Tuesday and Thursday evenings, the new Sunday morning class, and personal training clients who want to work on mobility, posture and getting back to training after a break.</p>
${figure(ASSIST_STRETCH, "Deepa's sessions start with how you move, not how much you lift")}
<blockquote>"Most people do not need to stretch more. They need to move better, more often. That is where I like to start." — Deepa Hegde</blockquote>
<p>Personal training with Deepa is ₹1,200 an hour, as with all our coaches. Say hello when you see her on the floor.</p>
`,
    },
    {
        slug: "sunday-morning-yoga",
        title: "Yoga flow is now on Sunday mornings",
        category: "news",
        excerpt:
            "A slower start to the week: Yoga flow on Sundays at 8am, with Deepa Hegde.",
        cover: YOGA_SUNSET,
        daysAgo: 40,
        body: `
<p>Sunday mornings at the gym have always been quiet. From <strong>Sunday 13 September</strong>, they get a class: <strong>Yoga flow at 8am</strong>, taught by Deepa Hegde.</p>
<ul>
<li>Sixty minutes of steady vinyasa for mobility and recovery.</li>
<li>Up to fifteen people.</li>
<li>Mats provided — or bring your own.</li>
<li>Counts as one class from your membership or pack.</li>
</ul>
${figure(MATS, "Mats are provided, or bring your own")}
<p>It is a good class for the morning after a hard week of lifting or a long Saturday. All levels are welcome; Deepa offers easier and harder versions of each pose.</p>
<p>The gym is open until 12 noon on Sundays, so you can stay for a session on the floor afterwards.</p>
`,
    },
    {
        slug: "october-plank-and-row-challenge",
        title: "October member challenge: plank and row",
        category: "news",
        excerpt:
            "Two tests, two attempts, a month to improve. Sign up at the counter.",
        cover: PLANK,
        daysAgo: 2,
        body: `
<p>This month's member challenge is simple and suits every level.</p>
<h2>The tests</h2>
<ol>
<li><strong>Plank hold</strong> — how long you can hold a good plank. A coach times you and calls it when your hips drop.</li>
<li><strong>500 m row</strong> — your best time on the rowing machine.</li>
</ol>
${figure(ROW_LEGS, "Five hundred metres — pace it, do not sprint the first 100")}
<h2>How it works</h2>
<ul>
<li>Sign up at the counter and do your first attempt any day this week, with a coach present.</li>
<li>Train for three weeks — your coach can add a few minutes of practice to your sessions.</li>
<li>Re-test in the last week of the month.</li>
</ul>
<p>The board by the counter tracks the biggest improvement, not the best score. Everyone who re-tests gets a Pulse shaker; the three most improved get a Pulse T-shirt in their colour of choice.</p>
`,
    },
    {
        slug: "new-dumbbells-and-kettlebells",
        title: "New dumbbells and kettlebells on the floor",
        category: "news",
        excerpt:
            "Heavier dumbbells up to 50 kg and a full set of kettlebells have arrived.",
        cover: HEX_DB,
        daysAgo: 28,
        body: `
<p>The new equipment has arrived and is on the floor.</p>
<ul>
<li><strong>Dumbbells</strong> now go up to 50 kg, in 2.5 kg steps. The heaviest pairs are on the lower rack by the mirror.</li>
<li><strong>Kettlebells</strong> from 4 kg to 32 kg, on the new rack beside the turf.</li>
<li>Two more adjustable benches, so there should be less waiting at peak time.</li>
</ul>
${figure(KB_ROW, "The new kettlebell rack sits beside the turf")}
<p>Please re-rack everything where it belongs — lighter at the top, heavier at the bottom — and wipe down benches after use. If you have not used kettlebells before, ask any coach for a quick swing check before you start.</p>
<p>Please rack them after use — by weight, left to right.</p>
`,
    },

    // ── Articles ────────────────────────────────────────────────────────
    {
        slug: "starting-strength-training-after-30",
        title: "Starting strength training after 30",
        category: "articles",
        excerpt:
            "It is not too late, and you do not need to be fit first. Kabir Sethi on how to start lifting sensibly in your thirties, forties and beyond.",
        cover: DEADLIFT_W,
        daysAgo: 52,
        featured: true,
        body: `
<p>Every week someone walks in and says, a little apologetically, "I'm 38 and I've never lifted anything heavier than a gas cylinder." Good. That is exactly who strength training is for.</p>
<p>From our thirties onwards, most of us slowly lose muscle unless we do something about it. Strength training is the most direct way to keep it — and to keep doing everyday things easily: carrying shopping up three floors, lifting a child, getting up off the floor without a hand on the sofa.</p>
<h2>Before you start</h2>
<p>If you have a heart condition, high blood pressure, diabetes, a past injury, are pregnant, or have been inactive for a long time, check with your doctor first and tell your coach what they said. Most people are cleared to start; it just shapes how we start.</p>
<h2>Five principles for starting well</h2>
<h3>1. Learn the movements before the weight</h3>
<p>There are only a handful of basic patterns: squat, hinge (bending at the hips, as in a deadlift), push, pull, and carry. Learn them with a broomstick, a light kettlebell or an empty bar. Good form with a light weight beats bad form with a heavy one every time.</p>
${figure(GRIP, "Start with the grip and the set-up — the weight comes later")}
<h3>2. Two or three sessions a week is plenty</h3>
<p>You do not need to train every day. Two or three full-body sessions a week, with a day off in between, gives your body time to recover and adapt.</p>
<h3>3. Add a little, often</h3>
<p>Progress comes from doing slightly more over time — a little more weight, an extra rep, a better-controlled rep. Write down what you lifted so you know what to beat next time.</p>
<h3>4. Leave a couple of reps in the tank</h3>
<p>Early on, finish each set feeling you could have done two more. You will still get stronger, and you will keep your form.</p>
<h3>5. Expect some soreness — not pain</h3>
<p>Stiff muscles for a day or two after a new session are normal. Sharp pain, pain in a joint, or pain that gets worse as you train is not. Stop and tell your coach.</p>
${figure(KB_LUNGE, "Lunges and carries build strength you use every day")}
<h2>A simple first month</h2>
<ul>
<li><strong>Weeks 1–2:</strong> learn the patterns with light weights. Goblet squat, kettlebell deadlift, push-up from a bench, dumbbell row, farmer's carry. Two or three sets of eight to ten.</li>
<li><strong>Weeks 3–4:</strong> add a little weight where form is solid. Keep everything else the same.</li>
</ul>
<h2>Recovery matters as much as training</h2>
<p>Sleep, enough protein through the day, and walking on your off days do more for your progress than any clever programme. If you are wrecked after every session, do less.</p>
<blockquote>"The people who get strong are not the ones with the best genetics. They are the ones who show up twice a week for a year." — Kabir Sethi</blockquote>
<h2>Where to start at Pulse</h2>
<p>Our four-week <strong>Strength foundations</strong> course (₹4,800) teaches the big movements in a group of no more than eight. If you would rather go one-to-one, a <strong>fitness assessment</strong> (₹800) gives you a written plan to begin with, and personal training (₹1,200 an hour) adds a coach at your side.</p>
`,
    },
    {
        slug: "protein-for-vegetarians-in-india",
        title: "Protein for vegetarians in India",
        category: "articles",
        excerpt:
            "Dal, paneer, curd, soya and peanuts can cover most of what you need. Where a scoop of whey fits in — and where it does not.",
        cover: DALS,
        daysAgo: 71,
        featured: true,
        body: `
<p>"I'm vegetarian — can I build muscle?" Yes. Many of our strongest members have never eaten meat. It takes a little more planning, because many everyday Indian meals are built around rice or roti with a small bowl of dal. The fix is not exotic: it is more of the protein foods you already know, spread through the day.</p>
<p>This is general information. If you have kidney disease or another health condition, are pregnant, or have been told to follow a special diet, speak to your doctor or a registered dietitian before changing how much protein you eat.</p>
<h2>How much?</h2>
<p>Needs vary with body size, age and how much you train. Rather than chase a number, a practical start is to include a good protein food at <strong>every meal</strong>, and to notice whether your plate has more rice than dal. A dietitian can give you a figure suited to you.</p>
<h2>The everyday vegetarian staples</h2>
<h3>Dal and legumes</h3>
<p>Toor, moong, masoor, chana, rajma, lobia. A thicker dal and a second katori make a real difference. Sprouts make a good snack or salad. Pairing dal with rice or roti gives a better mix of protein building blocks than either alone.</p>
${figure(PANEER_MEAL, "A thick dal or a paneer dish turns a meal into a protein meal")}
<h3>Paneer and tofu</h3>
<p>Paneer is one of the most protein-dense vegetarian foods, though it also brings a fair amount of fat. Tofu is lighter and works in a bhurji or a stir-fry.</p>
<h3>Curd, Greek-style curd and milk</h3>
<p>A bowl of curd with lunch, buttermilk in the afternoon, a glass of milk at night. Hung curd is thicker and higher in protein per spoon.</p>
${figure(YOGURT_GRANOLA, "Curd with fruit and nuts — an easy post-workout breakfast")}
<h3>Soya</h3>
<p>Soya chunks are among the most protein-rich vegetarian foods and cost very little. Soak, squeeze and add to a pulao, a curry or a keema-style dish.</p>
${figure(SOYA, "Dried soya chunks: cheap, filling and quick to cook")}
<h3>Nuts, seeds and peanuts</h3>
<p>Peanuts, peanut chikki, roasted chana, and a spoon of peanut butter on toast. Calorie-dense, so watch the handfuls.</p>
<h3>Eggs, if you eat them</h3>
<p>Many "vegetarians" eat eggs. If you do, they are an easy addition.</p>
<h2>A sample day</h2>
<ul>
<li><strong>Breakfast:</strong> moong dal chilla or besan cheela with curd.</li>
<li><strong>Lunch:</strong> rajma or chole, rice, salad, buttermilk.</li>
<li><strong>Snack:</strong> roasted chana, or sprouts chaat.</li>
<li><strong>Dinner:</strong> paneer or tofu bhurji with rotis, dal on the side.</li>
</ul>
<h2>Where a scoop of whey fits in</h2>
<p>Whey protein is simply a protein made from milk, dried into a powder. It is not magic and not necessary — but it is <em>convenient</em>. Members commonly use a scoop in water or milk after a morning session when there is no time for breakfast, or on days when meals fall short. For a vegetarian who drinks milk, whey is a dairy product like paneer. If you do not take dairy, a plant protein does the same job.</p>
<p>If you are pregnant, on medication, or have a medical condition, check with your doctor before using any protein supplement.</p>
<blockquote>"Get the kitchen right first. A scoop of whey is a shortcut for busy mornings, not a replacement for dal." — Ritika Nair</blockquote>
`,
    },
    {
        slug: "creatine-explained-plainly",
        title: "Creatine, explained plainly",
        category: "articles",
        excerpt:
            "What creatine monohydrate is, how people commonly use it, and the questions to ask before you start.",
        cover: CREATINE_JAR,
        daysAgo: 47,
        body: `
<p>Creatine is one of the most-asked-about products at our counter, and one of the most misunderstood. Some people think it is a steroid; others think it is a miracle. It is neither. Here is a plain explanation.</p>
<h2>What it is</h2>
<p>Creatine is a compound your body makes on its own, mostly from amino acids, and stores mainly in your muscles. You also get small amounts from food, chiefly meat and fish, so vegetarians typically get less from diet. Muscles use it in short, hard efforts — a heavy lift, a sprint, a jump.</p>
<p><strong>Creatine monohydrate</strong> is the plain, widely studied form sold as a white, nearly tasteless powder. It is what we stock, in 100 g and 250 g tubs.</p>
${figure(WHITE_SCOOP, "Creatine monohydrate: a plain white powder with almost no taste")}
<h2>What it is not</h2>
<ul>
<li>It is not a steroid or a hormone.</li>
<li>It is not a protein powder, and does not replace food.</li>
<li>It is not needed. Plenty of people train well for years without it.</li>
</ul>
<h2>How people commonly use it</h2>
<p>Most people who use creatine take a small daily scoop, as the label directs, mixed into water, juice or a shake, at any time of day. Some people use a short "loading" phase at the start; many simply take the daily amount and skip loading. Whichever approach, follow the label, and do not take more than it says.</p>
<p>Because creatine draws water into the muscles, some people notice a small rise on the scale in the first few weeks. Drink enough water through the day — especially in Bengaluru's hotter months.</p>
${figure(GREEN_BOTTLE, "Keep a bottle with you — drink through the day")}
<h2>Questions to ask before you start</h2>
<ul>
<li><strong>Do I have a kidney condition, or take medicines that affect the kidneys?</strong> Talk to your doctor first.</li>
<li><strong>Am I pregnant or breastfeeding?</strong> Check with your doctor before using any supplement.</li>
<li><strong>Am I on regular medication, or do I have diabetes, high blood pressure or another condition?</strong> Ask your doctor.</li>
<li><strong>Am I under 18?</strong> We do not sell supplements to under-18s; focus on food, sleep and good coaching.</li>
<li><strong>Are my basics in place?</strong> If you are training irregularly, sleeping five hours and skipping meals, creatine is not where to start.</li>
</ul>
<h2>Buying it</h2>
<p>Look for a plain creatine monohydrate with a clear label and an FSSAI licence number. Avoid blends with long ingredient lists and big promises. Ours is house-labelled and FSSAI-licensed, and unopened, sealed tubs can be returned within 7 days.</p>
<blockquote>"Creatine is a small, optional extra. Your training plan, your food and your sleep are the meal; this is the pickle on the side." — Imran Shaikh</blockquote>
`,
    },
    {
        slug: "how-to-choose-a-lifting-belt",
        title: "How to choose a lifting belt",
        category: "articles",
        excerpt:
            "Who needs one, when to wear it, and how to pick the right width, thickness and size.",
        cover: BELT,
        daysAgo: 86,
        body: `
<p>A lifting belt is one of the few pieces of kit that genuinely changes how a heavy lift feels. It is also one of the most misused: we see people wearing one for bicep curls and treadmill walks. Here is when it helps, and how to choose one.</p>
<h2>What a belt does</h2>
<p>A belt does not hold your back up for you. It gives your stomach something to brace against. When you take a big breath into your belly and tighten your core against the belt, your trunk becomes more rigid, which many lifters find helps them stay solid under a heavy squat or deadlift.</p>
<h2>Do you need one?</h2>
<p>Probably not yet if you are new. First, learn to brace without one — breathe in, tighten your trunk as if someone were about to poke your stomach, and keep that tension through the lift. Once you can do that and you are lifting heavy enough that your last reps feel close to your limit, a belt can be a useful tool.</p>
${figure(BARBELL_RED, "Belts are for your heaviest sets, not every set")}
<h2>When to wear it</h2>
<ul>
<li>Heavy sets of squats, deadlifts and overhead presses.</li>
<li>Not for warm-up sets, light accessory work or cardio.</li>
<li>Take it off or loosen it between sets.</li>
</ul>
<h2>Choosing one</h2>
<h3>Material</h3>
<p>Leather belts are stiff, long-lasting, and the usual choice for heavy barbell work. Softer nylon belts are more flexible and suit mixed training. The belts at our counter are leather.</p>
<h3>Width</h3>
<p>A belt that is the same width all the way round, usually about 10 cm, is the common standard. Belts that are wide at the back and narrow at the front were popular once, but give less to brace against at the front.</p>
<h3>Thickness</h3>
<p>Thicker belts are stiffer. Most lifters do well with a medium thickness; very thick belts take a long time to break in.</p>
<h3>Buckle</h3>
<p>A single-prong buckle is simple and easy to adjust. A lever buckle is quick on and off but fixed to one tightness unless you move it with a screwdriver.</p>
<h3>Size</h3>
<p>Measure around your waist where you will wear the belt — usually around the belly button, not your trouser waist size. Our belts come in S to XL; try one on at the counter, tightened to where you can just slide a flat hand between belt and stomach after a big breath.</p>
${figure(DEADLIFT_DARK, "Wear the belt around the belly button, snug but not crushing")}
<h2>A word on health</h2>
<p>If you have high blood pressure, a hernia, are pregnant, or have a heart condition, ask your doctor before heavy lifting with a belt — bracing hard raises pressure in the trunk.</p>
<blockquote>"Learn to brace without the belt first. Then the belt makes a good brace better — it cannot make a bad one good." — Kabir Sethi</blockquote>
`,
    },
    {
        slug: "recovery-and-sleep",
        title: "Recovery and sleep: where the progress happens",
        category: "articles",
        excerpt:
            "Training is the stimulus; recovery is where you adapt. Simple habits for sleep, rest days and soreness.",
        cover: SLEEP,
        daysAgo: 122,
        body: `
<p>Most members who stop making progress are not training too little. They are recovering too little. You do not get stronger during a session — you get tired. You get stronger in the hours and days afterwards, when your body repairs and adapts. Recovery is half of the plan.</p>
<h2>Sleep comes first</h2>
<p>Nothing else on this list comes close. Most adults need around seven to nine hours. Short sleep tends to make sessions feel harder, makes you hungrier for the wrong food, and leaves you sorer for longer.</p>
<ul>
<li>Keep regular bed and wake times, weekends included.</li>
<li>Get some daylight in the morning.</li>
<li>Cut caffeine — including pre-workout — after early afternoon. If you train at 8pm, think twice before a stimulant pre-workout.</li>
<li>Keep the phone away from the bed, and the room dark and cool.</li>
</ul>
<p>If you snore loudly, wake unrefreshed, or struggle to sleep for weeks at a time, speak to a doctor.</p>
${figure(ROLLER_BACK, "A few minutes on the roller after a session")}
<h2>Rest days</h2>
<p>Hard training every day of the week rarely works for long. Plan at least one or two easier days: a walk around Koramangala's lanes, a Yoga flow class, a swim, or simply nothing.</p>
<h2>Food and water</h2>
<ul>
<li>Eat a proper meal with protein within a few hours of training.</li>
<li>Do not train hard on an empty stomach and then skip the next meal too.</li>
<li>Drink enough water, more on hot days and sweaty sessions.</li>
</ul>
<h2>Soreness</h2>
<p>Muscle soreness a day or two after a new or harder session is normal and fades. Gentle movement often helps more than lying still. Foam rolling, an easy walk, or light mobility work can make you feel looser — think of them as comfort, not magic.</p>
${figure(ROLLER, "Rolling feels good — think of it as comfort, not a cure")}
<h2>Signs you need more recovery</h2>
<ul>
<li>Your lifts are going backwards for two weeks or more.</li>
<li>You are sore all the time, or your resting heart rate feels high.</li>
<li>You are irritable, sleeping badly or dreading sessions.</li>
<li>You keep picking up small niggles.</li>
</ul>
<p>If you see these, tell your coach. A lighter week — same exercises, about half the sets — often sorts it out.</p>
<h2>Pain is different</h2>
<p>Sharp pain, pain in a joint, swelling, numbness or pain that wakes you at night is not soreness. Stop that exercise and see a doctor or physiotherapist.</p>
<blockquote>"I would rather you trained three times a week and slept well than six times and slept badly. The first person gets stronger." — Ritika Nair</blockquote>
<p>If you sleep badly for weeks at a time, that is worth raising with a doctor, not only with your coach.</p>
`,
    },
    {
        slug: "training-in-bengaluru-heat-and-monsoon",
        title: "Training through Bengaluru's heat and monsoon",
        category: "articles",
        excerpt:
            "Hot afternoons in April, cloudbursts in September. How to keep training safely through the city's seasons.",
        cover: RUN_WET,
        daysAgo: 104,
        body: `
<p>Bengaluru's weather is kinder than most Indian cities', but it still throws three different seasons at us: a hot, dry spell from March to May, the long monsoon from June to October, and cool, dry mornings in winter. Each one changes how you should train.</p>
<h2>Summer: March to May</h2>
<p>Afternoons in the mid-thirties catch people out, especially those who run or ride outdoors.</p>
<ul>
<li><strong>Train early or late.</strong> Before 8am or after sunset outdoors; the gym is fine any time.</li>
<li><strong>Drink before you are thirsty.</strong> Start sessions hydrated and keep a bottle with you.</li>
<li><strong>Ease off.</strong> The same pace or weight feels harder in heat. Let your effort, not the numbers, guide you.</li>
<li><strong>Know the warning signs:</strong> dizziness, headache, nausea, cramps, cold clammy skin. Stop, get to shade, sip water, and tell a coach.</li>
</ul>
<p>Confusion, fainting, or very hot dry skin are signs of heatstroke — call 108.</p>
${figure(RAIN, "When the rain comes down, the session moves indoors")}
<h2>Monsoon: June to October</h2>
<p>The rain brings cooler air but also very high humidity, so sweat does not evaporate and you can overheat even when it feels mild.</p>
<ul>
<li><strong>Move runs indoors</strong> on heavy-rain days. Wet roads, potholes hidden under water and two-wheelers that cannot stop are a bad mix.</li>
<li><strong>Change out of wet clothes</strong> and shoes quickly. Damp kit all day invites fungal skin infections.</li>
<li><strong>Bring indoor shoes</strong> in a bag. Muddy soles on the gym floor are a slipping risk for everyone.</li>
<li><strong>Take fevers seriously.</strong> Dengue and other infections rise in the monsoon. Never train through a fever; see a doctor and wait until they clear you.</li>
<li><strong>Plan for traffic.</strong> A cloudburst can turn a fifteen-minute ride into an hour. Book classes you can actually reach.</li>
</ul>
<h2>Electrolytes</h2>
<p>After a long, sweaty session, some people add an electrolyte sachet to their water. It is simply a mix of salts (and usually a little sugar) to replace what you lose in sweat. For most hour-long sessions, water and a normal meal are enough. If you have high blood pressure, kidney or heart problems, or are on medication, check with your doctor before using electrolyte drinks regularly.</p>
${figure(ELECTRO, "An electrolyte sachet in water after a long, sweaty session")}
<h2>Winter: November to February</h2>
<p>Cool mornings are the best training weather of the year. Warm up longer — muscles take more time to loosen in the cold — and on hazy days, keep hard outdoor efforts away from busy roads.</p>
<blockquote>"The weather is never a reason to stop. It is a reason to change the plan for the day." — Imran Shaikh</blockquote>
`,
    },
    {
        slug: "mobility-for-desk-workers",
        title: "Mobility for desk workers",
        category: "articles",
        excerpt:
            "Eight hours in a chair stiffens hips, back and shoulders. A ten-minute routine and small habits that help.",
        cover: DESK_STRETCH,
        daysAgo: 141,
        body: `
<p>Koramangala is full of people who sit for a living. Long days at a laptop, an hour in traffic each way, then the sofa. Our bodies adapt to what we do most, and if that is sitting, the front of the hips tightens, the upper back rounds, and the neck pokes forward.</p>
<p>The good news: you do not need an hour of stretching. Small, frequent movement does more than one long session a week.</p>
<h2>Habits through the workday</h2>
<ul>
<li><strong>Move every 30 to 45 minutes.</strong> Stand up, walk to fill your water bottle, take calls on your feet.</li>
<li><strong>Set up your screen</strong> so the top is roughly at eye level, and your elbows rest near your sides.</li>
<li><strong>Feet flat, back supported.</strong> A cushion behind the lower back helps on a hard chair.</li>
<li><strong>Change position often.</strong> The best posture is your next one.</li>
</ul>
${figure(STAND_DESK, "Alternating between sitting and standing helps")}
<h2>A ten-minute routine</h2>
<p>Do this once or twice a day, at your desk or at home. Move slowly and breathe; nothing should hurt.</p>
<ol>
<li><strong>Neck nods and turns</strong> — 5 slow nods, 5 turns each way.</li>
<li><strong>Shoulder rolls</strong> — 10 backwards.</li>
<li><strong>Chin tucks</strong> — draw your head straight back, as if making a double chin. Hold 3 seconds, 8 times.</li>
<li><strong>Seated twist</strong> — sit tall, turn to hold the back of the chair. 20 seconds each side.</li>
<li><strong>Doorway chest stretch</strong> — forearms on the door frame, step through gently. 30 seconds.</li>
<li><strong>Hip flexor stretch</strong> — half-kneeling, tuck your tailbone under and shift forward. 30 seconds each side.</li>
<li><strong>Cat–cow</strong> — on hands and knees, round and arch your back slowly. 8 times.</li>
<li><strong>Bodyweight squats</strong> — 10, to a chair if needed.</li>
</ol>
${figure(LUNGE_STRETCH, "The half-kneeling hip stretch undoes a lot of sitting")}
<h2>In the gym</h2>
<p>Strength training is mobility training when done through a full range: deep goblet squats, Romanian deadlifts, rows and overhead presses all ask your joints to move. Our Yoga flow classes on Tuesday and Thursday evenings and Sunday mornings are another good fit for desk workers.</p>
<h2>When to see a doctor</h2>
<p>Stiffness that eases as you move is normal. See a doctor or physiotherapist for pain that spreads down an arm or leg, numbness or tingling, weakness, pain that is worse at night, or back pain after a fall.</p>
<blockquote>"You do not need to touch your toes. You need to get up from your chair more often." — Deepa Hegde</blockquote>
<p>None of this replaces a coach's eye. If anything hurts rather than stretches, stop, and ask one of us to watch you do it at your next class.</p>
`,
    },
    {
        slug: "how-a-coach-writes-your-plan",
        title: "How a coach writes your plan",
        category: "articles",
        excerpt:
            "From the first assessment to the monthly review: what goes into a Pulse training plan, and why it changes.",
        cover: COACH_TABLET,
        daysAgo: 158,
        body: `
<p>Members sometimes ask why their plan looks nothing like their friend's, or why it changed after a month. Here is how our coaches build one.</p>
<h2>1. Start with you</h2>
<p>Every plan begins with a conversation. Your coach asks:</p>
<ul>
<li>What do you want — to get stronger, run a 10K, lose some weight, feel less stiff, keep up with your kids?</li>
<li>How many days a week can you realistically train, and for how long?</li>
<li>What have you done before, and what did you enjoy?</li>
<li>Any injuries, health conditions or medicines we should know about? If your doctor has given you limits, we work within them.</li>
</ul>
<h2>2. The assessment</h2>
<p>The fitness assessment (₹800, forty-five minutes) looks at posture, how you move through a squat, hinge, lunge and push-up, mobility at the hips and shoulders, some simple strength tests, and body composition. None of it is pass or fail; it is a starting point.</p>
${figure(CLIPBOARD_PEN, "Everything gets written down, so next month has something to beat")}
<h2>3. Choose the building blocks</h2>
<p>Most plans include:</p>
<ul>
<li><strong>A warm-up</strong> built around what you need — tight hips, stiff upper back.</li>
<li><strong>Main lifts</strong>: one squat or lunge, one hinge, one push and one pull.</li>
<li><strong>Accessory work</strong> for weak links and balance between sides.</li>
<li><strong>Conditioning</strong> — intervals, a class, or steady cardio — in the amount your goal needs.</li>
</ul>
<h2>4. Set the dose</h2>
<p>Sets, reps and rest are chosen for your goal and your experience. A beginner might do three sets of eight to ten with a weight that leaves a couple of reps in reserve. Someone training for strength might do fewer, heavier reps with longer rest.</p>
${figure(OH_SQUAT, "Harder variations are earned as the basics get solid")}
<h2>5. Plan the progress</h2>
<p>A good plan says how you will move forward: add a little weight when you hit the top of a rep range, or progress to a harder variation. Then it builds in easier weeks so you do not grind yourself down.</p>
<h2>6. Review every month</h2>
<p>Standard and Yearly members get a monthly review with a coach. We look at your log, ask how you are sleeping and feeling, re-test a few things, and adjust. Plans change because <em>you</em> change — that is the point.</p>
<blockquote>"The best plan is the one you will actually do. I would rather write three sessions you love than five you skip." — Kabir Sethi</blockquote>
<h2>Getting started</h2>
<p>Book a free trial session or a fitness assessment. Personal training clients (₹1,200 an hour) get a plan written for them and reviewed every month.</p>
<p>Your plan is reviewed every month. Bring questions; that's what the review is for.</p>
`,
    },
    {
        slug: "hiit-vs-steady-cardio",
        title: "HIIT or steady cardio: which should you do?",
        category: "articles",
        excerpt:
            "Short and hard, or long and easy? What each one is, who it suits, and why most people do best with some of both.",
        cover: ROPES,
        daysAgo: 177,
        body: `
<p>It is one of the most common questions on the floor: should I do HIIT or just get on the treadmill? The honest answer is that both have a place, and the best choice depends on your goals, your schedule and what you will stick with.</p>
<h2>What they are</h2>
<h3>HIIT — high-intensity interval training</h3>
<p>Short bursts of hard effort — twenty to sixty seconds — with rest in between, repeated for a set time. Our HIIT classes are forty-five minutes including warm-up and cool-down, with battle ropes, kettlebells, box jumps, rowing and bodyweight moves.</p>
<h3>Steady cardio</h3>
<p>Continuous, moderate effort for a longer time: a brisk walk, an easy jog, a steady ride on the bike, a long swim. You should be able to talk in full sentences.</p>
${figure(TREAD_W, "Steady cardio: an effort you could chat through")}
<h2>How they compare</h2>
<ul>
<li><strong>Time:</strong> HIIT packs a lot into a short session. Steady cardio takes longer but is gentler.</li>
<li><strong>Recovery:</strong> HIIT is demanding; most people should do it two or three times a week at most. Steady cardio can be done most days.</li>
<li><strong>Skill and joints:</strong> HIIT involves jumping and fast movements that can be hard on knees and backs if form slips. Steady cardio is lower impact, especially walking, cycling and rowing.</li>
<li><strong>Enjoyment:</strong> some people love the buzz of a class; others find a quiet hour on the bike calming. Enjoyment matters, because you will keep doing it.</li>
<li><strong>Health:</strong> both improve fitness. Doing either regularly matters far more than which one you pick.</li>
</ul>
<h2>Who should go easy on HIIT</h2>
<p>If you are new to exercise, returning after a long break, pregnant, or have a heart condition, high blood pressure, joint problems or another health condition, speak to your doctor first and start with steady cardio. Tell your coach, who will offer lower-impact options in class.</p>
${figure(SPIN, "Indoor cycling works as intervals or as a steady ride")}
<h2>A sensible weekly mix</h2>
<ul>
<li><strong>Two strength sessions</strong> — the base everything else rests on.</li>
<li><strong>One or two HIIT classes</strong>, on days that are not back-to-back.</li>
<li><strong>Two or three steady sessions</strong> — even 30-minute walks count.</li>
<li><strong>One rest or Yoga flow day.</strong></li>
</ul>
<p>Short of time? Two strength sessions and one HIIT class is a solid week. Feeling run down? Swap a HIIT class for a walk.</p>
${figure(SPRINT, "Going hard works best when it is not every day")}
<blockquote>"HIIT is a spice, not the main course. Two good classes a week beat five tired ones." — Imran Shaikh</blockquote>
<p>Whichever you choose, the best cardio is the one you'll still be doing in three months. Try both for a month and keep the one you look forward to.</p>
`,
    },
];
