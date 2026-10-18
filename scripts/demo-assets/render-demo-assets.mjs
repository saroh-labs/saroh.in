#!/usr/bin/env node
/**
 * Draws the pictures the Aarohan Academy and Baithak showcases use that no
 * photograph can be: study-material covers, the academy's T-shirts and lab
 * coat, timetables, a results card, a fee schedule, a floor plan, notices.
 *
 * Each is an HTML card rendered by Playwright's Chromium (the e2e
 * workspace's) at 1600×1000 and saved as a PNG under
 * `apps/app.saroh.in/public/demo/<business>/`, where the local app serves
 * it (https://app.saroh.localhost/demo/…). The seed points at those
 * addresses (`demo-content.ts` demoAsset). Re-run after changing a card:
 *
 *   node scripts/demo-assets/render-demo-assets.mjs
 *
 * Everything drawn is fictional: names, marks, dates and prices match the
 * seed's fixtures (`shiksha-data.ts`, `desk42-data.ts`).
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const require = createRequire(join(root, "e2e", "package.json"));
const { chromium } = require("@playwright/test");

const W = 1600;
const H = 1000;

const page = (
    css,
    body,
) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
${css}</style></head><body>${body}</body></html>`;

// --- Aarohan Academy -------------------------------------------------------

const SA = {
    navy: "#1d3a6b",
    ink: "#14213d",
    saffron: "#e07a1f",
    cream: "#f7f3ea",
    line: "#d9d2c3",
};

const crest = (size = 120, fg = SA.navy, bg = "#fff") => `
<svg width="${size}" height="${size}" viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="56" fill="${bg}" stroke="${fg}" stroke-width="6"/>
  <path d="M30 70 L60 40 L90 70" fill="none" stroke="${SA.saffron}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M36 82 Q60 70 84 82" fill="none" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
  <text x="60" y="104" font-size="13" font-weight="700" text-anchor="middle" fill="${fg}" font-family="Arial">AAROHAN</text>
</svg>`;

const saCard = (title, kicker, inner, extraCss = "") =>
    page(
        `body{background:${SA.cream};color:${SA.ink};padding:64px 80px}
         .top{display:flex;align-items:center;gap:24px;margin-bottom:36px}
         .kicker{font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:${SA.saffron};font-weight:700}
         h1{font-size:56px;line-height:1.05;color:${SA.navy};font-weight:800}
         .foot{position:absolute;left:80px;right:80px;bottom:44px;display:flex;justify-content:space-between;font-size:20px;color:#6b6457;border-top:2px solid ${SA.line};padding-top:16px}
         ${extraCss}`,
        `<div class="top">${crest(96)}<div><div class="kicker">${kicker}</div><h1>${title}</h1></div></div>${inner}
         <div class="foot"><span>Aarohan Academy · Gopalpura Bypass, Jaipur</span><span>+91 00000 00110</span></div>`,
    );

const timetable = () => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const a = [
        "Physics",
        "Chemistry",
        "Physics",
        "Biology",
        "Chemistry",
        "Physics",
    ];
    const b = [
        "Biology",
        "Biology",
        "Chemistry",
        "Physics",
        "Biology",
        "Chemistry",
    ];
    const who = {
        Physics: "Vikram sir",
        Chemistry: "Saurabh sir",
        Biology: "Neha ma'am",
    };
    const cell = (s) =>
        `<td class="${s.toLowerCase()}"><b>${s}</b><span>${who[s]}</span></td>`;
    return saCard(
        "NEET Foundation — Class 11 Morning Batch",
        "Weekly timetable · 2026–27",
        `<table><tr><th></th>${days.map((d) => `<th>${d}</th>`).join("")}<th>Sun</th></tr>
         <tr><th>7:00 – 8:15</th>${a.map(cell).join("")}<td class="test" rowspan="3"><b>Sunday test</b><span>9:00 – 12:20<br>NEET pattern · OMR</span></td></tr>
         <tr><th>8:15 – 9:30</th>${b.map(cell).join("")}</tr>
         <tr><th>9:30 – 10:00</th>${days.map(() => `<td class="doubt"><b>Doubts</b><span>all faculty</span></td>`).join("")}</tr></table>`,
        `table{width:100%;border-collapse:separate;border-spacing:8px;font-size:22px}
         th{font-size:22px;color:#6b6457;text-align:left;padding:6px 10px}
         td{background:#fff;border-radius:12px;padding:18px 14px;height:150px;vertical-align:top;border:2px solid ${SA.line}}
         td b{display:block;font-size:26px;margin-bottom:8px} td span{color:#6b6457;font-size:19px}
         .physics{border-color:#9fb6dd}.chemistry{border-color:#e9b98c}.biology{border-color:#a8d2a9}
         .doubt{height:90px;background:#efeadf}.test{background:${SA.navy};color:#fff}.test span{color:#dfe6f3}`,
    );
};

const results = () =>
    saCard(
        "Results 2026",
        "Our toppers",
        `<div class="cols"><div><h2>NEET 2026</h2>
          ${[
              ["Ananya Sharma", "682 / 720"],
              ["Mohit Kumawat", "664 / 720"],
              ["Sneha Choudhary", "651 / 720"],
              ["Aditya Saini", "640 / 720"],
          ]
              .map(([n, s]) => `<p><span>${n}</span><b>${s}</b></p>`)
              .join("")}
          <div class="note">47 of our 112 NEET students scored above 550</div></div>
          <div><h2>JEE Main 2026</h2>
          ${[
              ["Kunal Agarwal", "99.71 %ile"],
              ["Ritika Jain", "99.12 %ile"],
              ["Harsh Meena", "98.64 %ile"],
          ]
              .map(([n, s]) => `<p><span>${n}</span><b>${s}</b></p>`)
              .join("")}
          <h2 style="margin-top:34px">IELTS</h2>
          ${[
              ["Simran Kaur", "Band 8.0"],
              ["Arjun Rathi", "Band 7.5"],
          ]
              .map(([n, s]) => `<p><span>${n}</span><b>${s}</b></p>`)
              .join("")}</div></div>`,
        `.cols{display:grid;grid-template-columns:1fr 1fr;gap:56px}
         h2{font-size:30px;color:${SA.saffron};margin-bottom:16px;text-transform:uppercase;letter-spacing:.06em}
         p{display:flex;justify-content:space-between;font-size:32px;padding:14px 0;border-bottom:2px dashed ${SA.line}}
         p b{color:${SA.navy}} .note{margin-top:28px;background:${SA.navy};color:#fff;padding:18px 22px;border-radius:12px;font-size:24px}`,
    );

const fees = () =>
    saCard(
        "₹96,000 a year, in four instalments",
        "Two-year NEET/JEE classroom programme",
        `<div class="row">${[
            ["1", "10 April", "₹24,000"],
            ["2", "10 July", "₹24,000"],
            ["3", "10 October", "₹24,000"],
            ["4", "10 January", "₹24,000"],
        ]
            .map(
                ([n, d, a]) =>
                    `<div class="box"><div class="n">Instalment ${n}</div><div class="a">${a}</div><div class="d">due ${d}</div></div>`,
            )
            .join("")}</div>
         <ul><li>₹2,000 registration fee at admission</li><li>Study modules and the Sunday Test Series included</li><li>Fees include 18% GST · UPI, card, bank transfer or cash · a GST invoice for every payment</li><li>Prefer monthly? ₹8,500 a month for Class 11–12</li></ul>`,
        `.row{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:10px 0 40px}
         .box{background:#fff;border:3px solid ${SA.navy};border-radius:16px;padding:28px}
         .n{font-size:22px;color:#6b6457}.a{font-size:52px;font-weight:800;color:${SA.navy};margin:10px 0}.d{font-size:24px;color:${SA.saffron};font-weight:700}
         ul{font-size:28px;line-height:1.7;padding-left:30px}`,
    );

const testCalendar = () => {
    const months = [
        [
            "October",
            [
                ["18", "Sunday test"],
                ["25", "Major Test"],
            ],
        ],
        [
            "November",
            [
                ["1", "Sunday test"],
                ["8", "No test · Diwali"],
                ["15", "Sunday test"],
                ["22", "Sunday test"],
                ["29", "Major Test"],
            ],
        ],
        [
            "December",
            [
                ["6", "Sunday test"],
                ["13", "Sunday test"],
                ["20", "Sunday test"],
                ["27", "Major Test"],
            ],
        ],
    ];
    return saCard(
        "Sunday tests, October to December",
        "Test calendar · 9:00 am, NEET/JEE pattern",
        `<div class="cols">${months.map(([m, rows]) => `<div><h2>${m}</h2>${rows.map(([d, t]) => `<p class="${t.startsWith("Major") ? "major" : t.startsWith("No") ? "off" : ""}"><b>${d}</b><span>${t}</span></p>`).join("")}</div>`).join("")}</div>`,
        `.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
         h2{font-size:32px;color:${SA.navy};margin-bottom:14px}
         p{display:flex;gap:22px;align-items:center;font-size:27px;padding:12px 16px;border-radius:10px;background:#fff;margin-bottom:10px;border:2px solid ${SA.line}}
         p b{width:44px;font-size:32px;color:${SA.navy}} .major{background:${SA.navy};color:#fff;border-color:${SA.navy}} .major b{color:#fff}
         .off{background:#efeadf;color:#8a8273;text-decoration:line-through}`,
    );
};

const steps = (items, accent, ink) =>
    `<div class="steps">${items.map(([t, d], i) => `<div class="step"><div class="num">${i + 1}</div><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>`;
const stepsCss = (
    accent,
    ink,
) => `.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:20px}
 .step{background:#fff;border-radius:18px;padding:30px;min-height:420px;border:2px solid #ddd}
 .num{width:72px;height:72px;border-radius:50%;background:${accent};color:#fff;font-size:38px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:24px}
 h3{font-size:32px;color:${ink};margin-bottom:14px} .step p{font-size:24px;line-height:1.45;color:#555}`;

const admissions = () =>
    saCard(
        "Admission in four steps",
        "Admissions 2027–28",
        steps([
            ["Enquiry", "Fill the form on our site or call +91 00000 00110."],
            [
                "Counselling call",
                "Kavita calls within a day: batch, fees, scholarship test.",
            ],
            [
                "Demo class",
                "Sit in on Saturday 4 pm or Sunday 11 am. Parents welcome.",
            ],
            [
                "Admission",
                "Form, Class 10 marksheet, two photos, ₹2,000 registration.",
            ],
        ]),
        stepsCss(SA.saffron, SA.navy),
    );

const ielts = () =>
    page(
        `body{background:${SA.navy};color:#fff;padding:80px;display:flex;flex-direction:column;justify-content:space-between}
         .k{font-size:28px;letter-spacing:.16em;color:${SA.saffron};font-weight:700}
         h1{font-size:110px;line-height:1;margin:18px 0}
         .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
         .grid div{border:3px solid rgba(255,255,255,.35);border-radius:16px;padding:26px;font-size:30px}
         .grid b{display:block;font-size:46px;color:${SA.saffron}}
         .f{display:flex;justify-content:space-between;align-items:center;font-size:24px;color:#cbd5e6}`,
        `<div><div class="k">NEW · WEEKEND BATCH</div><h1>IELTS in 8 weeks</h1><div style="font-size:40px">From Saturday 14 November · Sat &amp; Sun, 10 am – 12 noon</div></div>
         <div class="grid"><div><b>16</b>weekend classes</div><div><b>4</b>full mock tests</div><div><b>₹14,000</b>incl. GST · 20 seats</div></div>
         <div class="f"><span>With Priya Rathore, CELTA · Academic &amp; General Training</span>${crest(110, "#fff", SA.navy)}</div>`,
    );

const SUBJECT_COLOURS = {
    Physics: "#2f5aa8",
    Chemistry: "#c2410c",
    Biology: "#2f7d4a",
    Mathematics: "#6d28d9",
};
const HINDI = {
    Physics: "भौतिक विज्ञान",
    Chemistry: "रसायन विज्ञान",
    Biology: "जीव विज्ञान",
    Mathematics: "गणित",
};

const bookCover = (kind, subject, medium) => {
    const c = SUBJECT_COLOURS[subject];
    const title = kind === "module" ? "Study Module" : "Sunday Test Series";
    const sub =
        kind === "module"
            ? "Theory · Solved examples · PYQs"
            : "20 chapter tests · Answer key · Solutions";
    const name = medium === "Hindi" ? HINDI[subject] : subject;
    return page(
        `body{background:#ebe5d9;display:flex;align-items:center;justify-content:center}
         .book{width:560px;height:800px;background:${c};border-radius:6px 18px 18px 6px;position:relative;color:#fff;padding:56px 48px;
           box-shadow:30px 30px 60px rgba(0,0,0,.25),inset 18px 0 0 rgba(0,0,0,.18);transform:rotate(-3deg)}
         .k{font-size:22px;letter-spacing:.16em;text-transform:uppercase;opacity:.85}
         h1{font-size:${medium === "Hindi" ? 74 : 66}px;line-height:1.05;margin:26px 0 18px;font-weight:800}
         h2{font-size:34px;font-weight:600;opacity:.95}
         .band{position:absolute;left:0;right:0;bottom:170px;background:rgba(255,255,255,.14);padding:20px 48px;font-size:22px}
         .m{position:absolute;left:48px;bottom:60px;font-size:26px;font-weight:700;background:#fff;color:${c};padding:8px 18px;border-radius:30px}
         .c{position:absolute;right:40px;bottom:40px}`,
        `<div class="book"><div class="k">Aarohan Academy · NEET / JEE</div><h1>${name}</h1><h2>${title}</h2>
         <div class="band">${sub} · 2026–27</div><div class="m">${medium} medium</div><div class="c">${crest(96, "#fff", c)}</div></div>`,
    );
};

const tshirtSvg = (fill, ink, mark) => `
<svg width="900" height="860" viewBox="0 0 900 860">
  <path d="M300 60 Q450 140 600 60 L820 170 L740 360 L660 320 L660 800 L240 800 L240 320 L160 360 L80 170 Z"
        fill="${fill}" stroke="rgba(0,0,0,.18)" stroke-width="4" stroke-linejoin="round"/>
  <path d="M300 60 Q450 150 600 60" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="10"/>
  <g transform="translate(520 220)">${mark}</g>
  <text x="450" y="560" text-anchor="middle" font-family="Arial" font-size="30" fill="${ink}" opacity=".0">.</text>
</svg>`;

const productBg = (svg, caption) =>
    page(
        `body{background:#f3efe7;display:flex;align-items:center;justify-content:center;flex-direction:column}
         .cap{font-size:24px;color:#6b6457;letter-spacing:.08em;text-transform:uppercase;margin-top:6px}`,
        `${svg}<div class="cap">${caption}</div>`,
    );

const saTshirt = (colour) => {
    const fill = colour === "navy" ? "#1f3560" : "#fbfbf8";
    const fg = colour === "navy" ? "#fff" : SA.navy;
    const bg = colour === "navy" ? "#1f3560" : "#fbfbf8";
    return productBg(
        tshirtSvg(fill, fg, crest(120, fg, bg)),
        `Academy T-shirt · ${colour}`,
    );
};

const labCoat = () =>
    productBg(
        `<svg width="760" height="880" viewBox="0 0 760 880">
          <path d="M260 40 L380 120 L500 40 L640 110 L720 520 L640 540 L600 300 L600 840 L160 840 L160 300 L120 540 L40 520 L120 110 Z" fill="#fdfdfb" stroke="#c9c3b6" stroke-width="5" stroke-linejoin="round"/>
          <path d="M380 120 L380 840" stroke="#d6d0c4" stroke-width="5"/>
          <path d="M260 40 L380 260 L500 40" fill="none" stroke="#c9c3b6" stroke-width="5"/>
          ${[380, 470, 560, 650, 740].map((y) => `<circle cx="400" cy="${y}" r="9" fill="#bdb6a8"/>`).join("")}
          <rect x="430" y="330" width="110" height="90" rx="6" fill="none" stroke="#c9c3b6" stroke-width="4"/>
          <g transform="translate(450 340) scale(.55)">${crest(120)}</g>
        </svg>`,
        "Lab coat · S to XL",
    );

const omr = () =>
    productBg(
        `<svg width="1100" height="820" viewBox="0 0 1100 820">
          <rect x="250" y="40" width="620" height="760" rx="8" fill="#f4f1fb" stroke="#b9a9e0" stroke-width="4" transform="rotate(6 560 420)"/>
          <rect x="230" y="30" width="620" height="760" rx="8" fill="#fff" stroke="#b9a9e0" stroke-width="4"/>
          <rect x="230" y="30" width="620" height="90" fill="#6d4fc2"/>
          <text x="540" y="88" text-anchor="middle" font-family="Arial" font-weight="700" font-size="34" fill="#fff">OMR ANSWER SHEET · NEET</text>
          ${Array.from({ length: 10 }, (_, r) =>
              Array.from({ length: 3 }, (_, c) => {
                  const x = 270 + c * 200,
                      y = 170 + r * 60;
                  return (
                      `<text x="${x}" y="${y + 8}" font-family="Arial" font-size="20" fill="#6d4fc2">${c * 50 + r + 1}</text>` +
                      [0, 1, 2, 3]
                          .map(
                              (o) =>
                                  `<circle cx="${x + 50 + o * 34}" cy="${y}" r="12" fill="${(r * 3 + c + o) % 4 === 1 && r < 6 ? "#222" : "none"}" stroke="#6d4fc2" stroke-width="2"/>`,
                          )
                          .join("")
                  );
              }).join(""),
          ).join("")}
        </svg>`,
        "OMR practice pack · 50 sheets",
    );

const formulaBook = () =>
    page(
        `body{background:#ebe5d9;display:flex;align-items:center;justify-content:center}
         .book{width:520px;height:760px;background:#14213d;color:#fff;border-radius:6px 18px 18px 6px;padding:56px 46px;position:relative;box-shadow:30px 30px 60px rgba(0,0,0,.25),inset 16px 0 0 rgba(0,0,0,.25);transform:rotate(2deg)}
         h1{font-size:64px;line-height:1.05;margin:24px 0}
         .f{font-family:Georgia,serif;font-size:34px;color:${SA.saffron};line-height:1.7}
         .k{font-size:22px;letter-spacing:.16em;text-transform:uppercase;opacity:.8}
         .c{position:absolute;right:40px;bottom:40px}`,
        `<div class="book"><div class="k">Aarohan Academy</div><h1>Physics &amp; Maths formula handbook</h1>
         <div class="f">F = ma<br>v² = u² + 2as<br>∫ x dx = x²/2 + C<br>sin²θ + cos²θ = 1</div>
         <div class="c">${crest(90, "#fff", "#14213d")}</div></div>`,
    );

// --- Baithak Cowork ----------------------------------------------------------

const DK = {
    teal: "#0f766e",
    ink: "#1f2933",
    warm: "#f4efe6",
    amber: "#b45309",
    line: "#ddd5c7",
};
const dkMark = (size = 90, fg = "#fff", bg = DK.teal) => `
<svg width="${size}" height="${size}" viewBox="0 0 90 90"><rect width="90" height="90" rx="18" fill="${bg}"/>
<text x="45" y="60" text-anchor="middle" font-family="Arial" font-weight="800" font-size="44" fill="${fg}">B</text></svg>`;

const dkCard = (title, kicker, inner, extraCss = "") =>
    page(
        `body{background:${DK.warm};color:${DK.ink};padding:64px 80px}
         .top{display:flex;align-items:center;gap:24px;margin-bottom:36px}
         .kicker{font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:${DK.teal};font-weight:700}
         h1{font-size:56px;line-height:1.05;font-weight:800}
         .foot{position:absolute;left:80px;right:80px;bottom:44px;display:flex;justify-content:space-between;font-size:20px;color:#6b6457;border-top:2px solid ${DK.line};padding-top:16px}
         ${extraCss}`,
        `<div class="top">${dkMark(88)}<div><div class="kicker">${kicker}</div><h1>${title}</h1></div></div>${inner}
         <div class="foot"><span>Baithak Cowork · 4th floor, Sai Capital, Baner Road, Pune</span><span>Mon–Fri 8–9 · Sat 9–6</span></div>`,
    );

const floorPlan = () =>
    dkCard(
        "The fourth floor",
        "Floor plan",
        `<svg width="1440" height="680" viewBox="0 0 1440 680">
          <rect x="4" y="4" width="1432" height="672" rx="10" fill="#fff" stroke="${DK.ink}" stroke-width="6"/>
          <rect x="20" y="20" width="360" height="300" fill="#e6f2f0" stroke="${DK.teal}" stroke-width="3"/>
          <text x="200" y="150" text-anchor="middle" font-size="30" font-weight="700" fill="${DK.teal}">The Sahyadri Room</text>
          <text x="200" y="190" text-anchor="middle" font-size="22" fill="#555">8 seats · screen</text>
          <rect x="120" y="215" width="160" height="60" rx="30" fill="none" stroke="${DK.teal}" stroke-width="3"/>
          <rect x="20" y="340" width="170" height="150" fill="#fdf1e3" stroke="${DK.amber}" stroke-width="3"/>
          <text x="105" y="410" text-anchor="middle" font-size="24" font-weight="700" fill="${DK.amber}">Booth</text>
          <text x="105" y="442" text-anchor="middle" font-size="18" fill="#555">calls · podcast</text>
          <rect x="20" y="510" width="360" height="150" fill="#f2efe9" stroke="#8a8273" stroke-width="3"/>
          <text x="200" y="580" text-anchor="middle" font-size="26" font-weight="700" fill="${DK.ink}">Front desk · café</text>
          <text x="200" y="614" text-anchor="middle" font-size="20" fill="#555">lockers · printer</text>
          ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, c) => `<rect x="${470 + c * 120}" y="${50 + r * 120}" width="96" height="64" rx="8" fill="#e6f2f0" stroke="${DK.teal}" stroke-width="2.5"/>`).join("")).join("")}
          <text x="770" y="560" text-anchor="middle" font-size="28" font-weight="700" fill="${DK.teal}">20 hot desks</text>
          <text x="770" y="596" text-anchor="middle" font-size="20" fill="#555">by the windows</text>
          ${Array.from({ length: 14 }, (_, i) => `<rect x="${1110 + (i % 2) * 150}" y="${30 + Math.floor(i / 2) * 88}" width="130" height="68" rx="6" fill="#fdf1e3" stroke="${DK.amber}" stroke-width="2.5"/><text x="${1175 + (i % 2) * 150}" y="${72 + Math.floor(i / 2) * 88}" text-anchor="middle" font-size="20" fill="${DK.amber}">${i + 1}</text>`).join("")}
          <text x="1255" y="660" text-anchor="middle" font-size="24" font-weight="700" fill="${DK.amber}">14 dedicated desks</text>
        </svg>`,
    );

const plansCard = () =>
    dkCard(
        "Three ways to be a member",
        "Memberships · monthly · GST included",
        `<div class="cols">${[
            [
                "Hot desk",
                "₹6,500",
                [
                    "Any free desk in the open area",
                    "Mon–Sat, opening hours",
                    "Member printing rates",
                    "Café tab on your invoice",
                ],
            ],
            [
                "Dedicated desk",
                "₹9,500",
                [
                    "Your own desk and pedestal",
                    "24×7 key-card access",
                    "4 meeting-room hours a month",
                    "Deposit: one month",
                ],
            ],
            [
                "Virtual office",
                "₹1,999",
                [
                    "Baner address for GST and letterhead",
                    "Mail received and scanned",
                    "2 day passes a month",
                    "NOC for registration",
                ],
            ],
        ]
            .map(
                ([n, p, items], i) =>
                    `<div class="plan ${i === 1 ? "hi" : ""}"><h2>${n}</h2><div class="p">${p}<small>/month</small></div><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul></div>`,
            )
            .join("")}</div>`,
        `.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:26px}
         .plan{background:#fff;border:2px solid ${DK.line};border-radius:18px;padding:34px;min-height:560px}
         .hi{border:4px solid ${DK.teal}} h2{font-size:34px}.p{font-size:58px;font-weight:800;color:${DK.teal};margin:14px 0 22px}
         small{font-size:22px;color:#777;font-weight:400} li{font-size:24px;line-height:1.5;margin-left:24px;margin-bottom:8px}`,
    );

const diwali = () =>
    page(
        `body{background:#2a1a3a;color:#fff;padding:80px;display:flex;flex-direction:column;justify-content:space-between}
         .k{font-size:26px;letter-spacing:.16em;color:#f5b041;font-weight:700} h1{font-size:96px;margin:16px 0}
         table{width:100%;font-size:38px;border-collapse:collapse} td{padding:18px 0;border-bottom:2px solid rgba(255,255,255,.18)} td:last-child{text-align:right;color:#f5b041;font-weight:700}
         .f{display:flex;justify-content:space-between;align-items:center;font-size:24px;color:#d8cde6}
         .lamp{font-size:24px}`,
        `<div><div class="k">BAITHAK · DIWALI 2026</div><h1>Diwali hours</h1></div>
         <table><tr><td>Saturday 7 November</td><td>10 am – 6 pm</td></tr><tr><td>Sunday 8 November · Diwali</td><td>Closed</td></tr>
         <tr><td>Monday 9 November</td><td>Closed</td></tr><tr><td>Tuesday 10 November</td><td>10 am – 6 pm</td></tr><tr><td>From Wednesday 11 November</td><td>Usual hours</td></tr></table>
         <div class="f"><span>Dedicated desks keep 24×7 access · Potluck on Thursday 5 November, 6 pm</span>${dkMark(90, "#2a1a3a", "#f5b041")}</div>`,
    );

const wifiPrinting = () =>
    dkCard(
        "Wi-Fi and printing",
        "At the desk",
        `<div class="cols"><div class="box"><h2>Wi-Fi</h2><p><b>Baithak-Members</b> — your own login, on all day</p><p><b>Baithak-Guest</b> — password changes every Monday; it's on the board at the front desk</p><p>300 Mbps fibre, with a second provider as backup</p></div>
         <div class="box"><h2>Printing</h2><p>Black &amp; white <b>₹3</b> a page · colour <b>₹12</b></p><p>Credit packs: 100 black &amp; white ₹300 · 50 colour ₹600</p><p>Scan to email is free · credits carry over</p></div></div>`,
        `.cols{display:grid;grid-template-columns:1fr 1fr;gap:30px}.box{background:#fff;border-radius:18px;padding:36px;border:2px solid ${DK.line};min-height:520px}
         h2{font-size:40px;color:${DK.teal};margin-bottom:20px} p{font-size:28px;line-height:1.45;margin-bottom:18px}`,
    );

const roomBooking = () =>
    dkCard(
        "Booking the Sahyadri Room",
        "Meeting room · ₹800 an hour",
        steps([
            [
                "Pick a slot",
                "On the Meeting rooms page. Two hours? Book two slots back to back.",
            ],
            ["Pay online", "UPI or card. Your GST invoice comes by email."],
            ["Guests sign in", "At the front desk; Omkar brings them up."],
            [
                "Leave it tidy",
                "Wipe the board, cables in the drawer. Cancel 24 hours ahead for a refund.",
            ],
        ]),
        stepsCss(DK.teal, DK.ink),
    );

const events = () =>
    dkCard(
        "Coming up at Baithak",
        "Events · October to December",
        `<div class="list">${[
            [
                "Sat 24 Oct",
                "11:00 – 13:00",
                "GST for freelancers — a workshop with Ashwini Patil, CA",
                "Sahyadri Room",
            ],
            [
                "Thu 5 Nov",
                "18:00",
                "Diwali potluck — bring one dish from home",
                "Café",
            ],
            ["Fri 6 Nov", "17:30", "Founders' Chai", "Café"],
            ["Fri 4 Dec", "17:30", "Founders' Chai", "Café"],
        ]
            .map(
                ([d, t, w, p]) =>
                    `<div class="ev"><div class="d">${d}</div><div class="t">${t}</div><div class="w">${w}<span>${p}</span></div></div>`,
            )
            .join("")}</div>`,
        `.ev{display:grid;grid-template-columns:200px 200px 1fr;align-items:center;background:#fff;border-radius:16px;padding:26px 30px;margin-bottom:16px;border:2px solid ${DK.line}}
         .d{font-size:34px;font-weight:800;color:${DK.teal}}.t{font-size:28px;color:#555}.w{font-size:30px;font-weight:600}.w span{display:block;font-size:22px;color:#777;font-weight:400;margin-top:6px}`,
    );

const dkTshirt = () =>
    productBg(
        tshirtSvg("#2b2f33", "#fff", dkMark(110, "#2b2f33", "#e7e2d8")),
        "Baithak T-shirt · charcoal",
    );

// --- Render -----------------------------------------------------------------

const SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics"];
const MEDIUMS = ["English", "Hindi"];
const cards = {
    "aarohan-academy": {
        "timetable-neet-11.png": timetable(),
        "results-2026.png": results(),
        "fee-instalments.png": fees(),
        "test-calendar.png": testCalendar(),
        "admissions-steps.png": admissions(),
        "ielts-weekend.png": ielts(),
        "tshirt-navy.png": saTshirt("navy"),
        "tshirt-white.png": saTshirt("white"),
        "lab-coat.png": labCoat(),
        "omr-pack.png": omr(),
        "formula-handbook.png": formulaBook(),
        ...Object.fromEntries(
            SUBJECTS.flatMap((s) =>
                MEDIUMS.flatMap((m) => [
                    [
                        `module-${s.toLowerCase()}-${m.toLowerCase()}.png`,
                        bookCover("module", s, m),
                    ],
                    [
                        `tests-${s.toLowerCase()}-${m.toLowerCase()}.png`,
                        bookCover("tests", s, m),
                    ],
                ]),
            ),
        ),
    },
    "baithak-cowork": {
        "floor-plan.png": floorPlan(),
        "plans-card.png": plansCard(),
        "diwali-hours.png": diwali(),
        "wifi-printing.png": wifiPrinting(),
        "room-booking.png": roomBooking(),
        "events-november.png": events(),
        "tshirt.png": dkTshirt(),
    },
};

const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: W, height: H } });
let n = 0;
for (const [business, files] of Object.entries(cards)) {
    const dir = join(root, "apps", "app.saroh.in", "public", "demo", business);
    mkdirSync(dir, { recursive: true });
    for (const [file, html] of Object.entries(files)) {
        await tab.setContent(html);
        await tab.screenshot({ path: join(dir, file), type: "png" });
        n += 1;
    }
}
await browser.close();
console.log(`render-demo-assets: ${n} pictures drawn.`);
