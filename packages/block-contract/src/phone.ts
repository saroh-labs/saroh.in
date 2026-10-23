/**
 * Phone numbers (#1036): the one rule for what a typed number means, how it
 * is kept and how it is shown. Pure, with no dependencies, so the API (which
 * judges and stores), the workspace's `PhoneInput` (`@saroh/ui/phone-input`)
 * and the merchant site's own field (`@saroh/site-blocks`) all read the same
 * answer from the same code.
 *
 * - **Kept as E.164**: "+919845012345", a `+`, the country code and the
 *   number, digits only, 8 to 15 of them. What `tel:` and `wa.me` want.
 * - **Typed the way people say it**: spaces, dashes, dots and brackets
 *   between the digits are fine. An Indian number typed without the `+`
 *   (ten digits, a trunk 0, or 91 / 0091 in front) means +91: Saroh's
 *   businesses are in India.
 * - **Shown grouped**: "+91 98450 12345" wherever a saved number is read.
 */

/** A stored number: `+`, a country code that doesn't start with 0, 8–15 digits. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/** What may sit between a number's digits: spaces, dashes, dots, brackets. */
export const PHONE_SEPARATORS = /[\s\-.()]/g;

/** The example every phone problem quotes. */
export const PHONE_EXAMPLE = "+91 98450 12345";

/**
 * An Indian number typed without the `+`: ten digits ("98450 12345"), a
 * trunk 0 ("098450 12345"), or 91 / 0091 in front. These mean +91.
 */
const INDIAN_WITHOUT_PLUS = /^(?:0091|91|0)?([1-9]\d{9})$/;

export type PhoneResult = { phone: string | null } | { problem: string };

/**
 * A typed number as it is stored, or why it can't be: "" clears it (null),
 * "+91 98450-12345" is kept as "+919845012345", and an Indian number typed
 * without the + ("98450 12345") gets +91. The API's one rule
 * (`normalisePublicPhone` there re-exports it).
 */
export function normalisePhoneNumber(raw: string): PhoneResult {
    const trimmed = raw.trim();
    if (trimmed === "") return { phone: null };
    let compact = trimmed.replace(PHONE_SEPARATORS, "");
    const indian = INDIAN_WITHOUT_PLUS.exec(compact);
    if (indian) compact = `+91${indian[1]}`;
    else if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
    if (/[^\d+]/.test(compact)) {
        return {
            problem: `A phone number is only digits, like ${PHONE_EXAMPLE}.`,
        };
    }
    if (!compact.startsWith("+")) {
        return {
            problem: `Start with + and the country code, like ${PHONE_EXAMPLE}.`,
        };
    }
    if (!E164.test(compact)) {
        return {
            problem: `That isn't a whole phone number. Check the digits and the country code, like ${PHONE_EXAMPLE}.`,
        };
    }
    // India's numbers are ten digits after +91, mobile and landline alike.
    if (compact.startsWith("+91") && compact.length !== 13) {
        return { problem: "An Indian number is +91 and then 10 digits." };
    }
    return { phone: compact };
}

/** What is wrong with a typed number, or null when it will be kept. */
export function phoneNumberProblem(typed: string): string | null {
    const result = normalisePhoneNumber(typed);
    return "problem" in result ? result.problem : null;
}

/**
 * A typed number as E.164 when it can be read, else "" for nothing typed or
 * the trimmed text as it was (so a caller that sends it lets the server say
 * why it was refused).
 */
export function phoneE164(typed: string): string {
    const result = normalisePhoneNumber(typed);
    if ("phone" in result) return result.phone ?? "";
    return typed.trim();
}

// ---------------------------------------------------------------------------
// Countries

export interface PhoneCountry {
    /** ISO 3166-1 alpha-2, upper case ("IN"). */
    code: string;
    /** As people read it ("India"). */
    name: string;
    /** The calling code, digits only ("91"). */
    dial: string;
}

/**
 * Every country a number may be from. Where several share a calling code
 * (+1, +7, +44, …) the first listed is the one a pasted number is read as.
 */
const COUNTRY_TABLE = `IN India 91
US United_States 1
GB United_Kingdom 44
AE United_Arab_Emirates 971
AF Afghanistan 93
AL Albania 355
DZ Algeria 213
AS American_Samoa 1684
AD Andorra 376
AO Angola 244
AI Anguilla 1264
AG Antigua_and_Barbuda 1268
AR Argentina 54
AM Armenia 374
AW Aruba 297
AU Australia 61
AT Austria 43
AZ Azerbaijan 994
BS Bahamas 1242
BH Bahrain 973
BD Bangladesh 880
BB Barbados 1246
BY Belarus 375
BE Belgium 32
BZ Belize 501
BJ Benin 229
BM Bermuda 1441
BT Bhutan 975
BO Bolivia 591
BA Bosnia_and_Herzegovina 387
BW Botswana 267
BR Brazil 55
VG British_Virgin_Islands 1284
BN Brunei 673
BG Bulgaria 359
BF Burkina_Faso 226
BI Burundi 257
KH Cambodia 855
CM Cameroon 237
CA Canada 1
CV Cape_Verde 238
KY Cayman_Islands 1345
CF Central_African_Republic 236
TD Chad 235
CL Chile 56
CN China 86
CO Colombia 57
KM Comoros 269
CG Congo 242
CD Congo_(DRC) 243
CK Cook_Islands 682
CR Costa_Rica 506
CI Côte_d’Ivoire 225
HR Croatia 385
CU Cuba 53
CW Curaçao 599
CY Cyprus 357
CZ Czechia 420
DK Denmark 45
DJ Djibouti 253
DM Dominica 1767
DO Dominican_Republic 1809
EC Ecuador 593
EG Egypt 20
SV El_Salvador 503
GQ Equatorial_Guinea 240
ER Eritrea 291
EE Estonia 372
SZ Eswatini 268
ET Ethiopia 251
FK Falkland_Islands 500
FO Faroe_Islands 298
FJ Fiji 679
FI Finland 358
FR France 33
GF French_Guiana 594
PF French_Polynesia 689
GA Gabon 241
GM Gambia 220
GE Georgia 995
DE Germany 49
GH Ghana 233
GI Gibraltar 350
GR Greece 30
GL Greenland 299
GD Grenada 1473
GP Guadeloupe 590
GU Guam 1671
GT Guatemala 502
GG Guernsey 44
GN Guinea 224
GW Guinea-Bissau 245
GY Guyana 592
HT Haiti 509
HN Honduras 504
HK Hong_Kong 852
HU Hungary 36
IS Iceland 354
ID Indonesia 62
IR Iran 98
IQ Iraq 964
IE Ireland 353
IM Isle_of_Man 44
IL Israel 972
IT Italy 39
JM Jamaica 1876
JP Japan 81
JE Jersey 44
JO Jordan 962
KZ Kazakhstan 7
KE Kenya 254
KI Kiribati 686
XK Kosovo 383
KW Kuwait 965
KG Kyrgyzstan 996
LA Laos 856
LV Latvia 371
LB Lebanon 961
LS Lesotho 266
LR Liberia 231
LY Libya 218
LI Liechtenstein 423
LT Lithuania 370
LU Luxembourg 352
MO Macao 853
MG Madagascar 261
MW Malawi 265
MY Malaysia 60
MV Maldives 960
ML Mali 223
MT Malta 356
MH Marshall_Islands 692
MQ Martinique 596
MR Mauritania 222
MU Mauritius 230
YT Mayotte 262
MX Mexico 52
FM Micronesia 691
MD Moldova 373
MC Monaco 377
MN Mongolia 976
ME Montenegro 382
MS Montserrat 1664
MA Morocco 212
MZ Mozambique 258
MM Myanmar 95
NA Namibia 264
NR Nauru 674
NP Nepal 977
NL Netherlands 31
NC New_Caledonia 687
NZ New_Zealand 64
NI Nicaragua 505
NE Niger 227
NG Nigeria 234
NU Niue 683
KP North_Korea 850
MK North_Macedonia 389
MP Northern_Mariana_Islands 1670
NO Norway 47
OM Oman 968
PK Pakistan 92
PW Palau 680
PS Palestine 970
PA Panama 507
PG Papua_New_Guinea 675
PY Paraguay 595
PE Peru 51
PH Philippines 63
PL Poland 48
PT Portugal 351
PR Puerto_Rico 1787
QA Qatar 974
RE Réunion 262
RO Romania 40
RU Russia 7
RW Rwanda 250
WS Samoa 685
SM San_Marino 378
ST São_Tomé_and_Príncipe 239
SA Saudi_Arabia 966
SN Senegal 221
RS Serbia 381
SC Seychelles 248
SL Sierra_Leone 232
SG Singapore 65
SX Sint_Maarten 1721
SK Slovakia 421
SI Slovenia 386
SB Solomon_Islands 677
SO Somalia 252
ZA South_Africa 27
KR South_Korea 82
SS South_Sudan 211
ES Spain 34
LK Sri_Lanka 94
KN St_Kitts_and_Nevis 1869
LC St_Lucia 1758
VC St_Vincent_and_Grenadines 1784
SD Sudan 249
SR Suriname 597
SE Sweden 46
CH Switzerland 41
SY Syria 963
TW Taiwan 886
TJ Tajikistan 992
TZ Tanzania 255
TH Thailand 66
TL Timor-Leste 670
TG Togo 228
TO Tonga 676
TT Trinidad_and_Tobago 1868
TN Tunisia 216
TR Türkiye 90
TM Turkmenistan 993
TC Turks_and_Caicos_Islands 1649
TV Tuvalu 688
VI US_Virgin_Islands 1340
UG Uganda 256
UA Ukraine 380
UY Uruguay 598
UZ Uzbekistan 998
VU Vanuatu 678
VA Vatican_City 379
VE Venezuela 58
VN Vietnam 84
YE Yemen 967
ZM Zambia 260
ZW Zimbabwe 263`;

/** The countries, India and the most asked-for first, then A to Z. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = COUNTRY_TABLE.split(
    "\n",
).map((line) => {
    const [code = "", name = "", dial = ""] = line.split(" ");
    return { code, name: name.replace(/_/g, " "), dial };
});

const BY_CODE = new Map(PHONE_COUNTRIES.map((c) => [c.code, c]));
const INDIA: PhoneCountry = { code: "IN", name: "India", dial: "91" };

/** The country a number is assumed to be from when nothing says otherwise. */
export const DEFAULT_PHONE_COUNTRY = "IN";

/** A country by its ISO code ("in" or "IN"), else India. */
export function phoneCountry(code: string | null | undefined): PhoneCountry {
    return BY_CODE.get((code ?? "").toUpperCase()) ?? INDIA;
}

/** A country's flag, from its code's two regional-indicator letters. */
export function countryFlag(code: string): string {
    return code
        .toUpperCase()
        .replace(/[A-Z]/g, (ch) =>
            String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65),
        );
}

/**
 * Whether a country matches what was typed in the picker's search: its
 * name ("ind", "united k"), its code ("ae") or its calling code ("+44",
 * "44").
 */
export function countryMatches(country: PhoneCountry, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    const digits = q.replace(/^\+/, "");
    if (/^\d+$/.test(digits)) return country.dial.startsWith(digits);
    return (
        country.name.toLowerCase().includes(q) ||
        country.code.toLowerCase() === q
    );
}

/** The countries a picker search shows, in the list's order. */
export function searchCountries(query: string): PhoneCountry[] {
    return PHONE_COUNTRIES.filter((c) => countryMatches(c, query));
}

/**
 * The country whose calling code starts these digits (no `+`), the
 * longest code winning ("1876…" is Jamaica, "1415…" the United States).
 * `prefer` breaks a tie between countries sharing a code (+1 for Canada).
 */
function countryOfDigits(digits: string, prefer?: string): PhoneCountry | null {
    for (let n = Math.min(4, digits.length); n >= 1; n--) {
        const dial = digits.slice(0, n);
        const all = PHONE_COUNTRIES.filter((c) => c.dial === dial);
        if (all.length > 0) {
            return all.find((c) => c.code === prefer) ?? all[0];
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// The field: a country and the number as typed

/** What a phone field holds: the picked country and the number as typed. */
export interface PhoneParts {
    /** ISO code of the picked country ("IN"). */
    country: string;
    /** The number after the country code, as typed (spaces kept). */
    national: string;
}

/**
 * A value (a stored number, or a whole number pasted into the field) as
 * the field's country and number. "+91 98765 43210", "0091 98765 43210",
 * "919876543210" and "098765 43210" are all India's "98765 43210"; "+44 20
 * 7946 0958" picks the United Kingdom. A value with no country code stays
 * under `fallback`'s country, as typed.
 */
export function splitPhone(value: string, fallback?: string): PhoneParts {
    const base = phoneCountry(fallback);
    const text = value.trim();
    if (text === "") return { country: base.code, national: "" };
    const compact = text.replace(PHONE_SEPARATORS, "");
    // Ten digits, or a trunk 0 and ten, are India's where the field is;
    // 91 or 0091 in front says India wherever it is typed.
    const indian = INDIAN_WITHOUT_PLUS.exec(compact);
    if (indian && (base.code === "IN" || /^(?:0091|91)/.test(compact))) {
        return { country: "IN", national: groupNational("91", indian[1]) };
    }
    const plus = /^(?:\+|00)/.exec(compact);
    if (plus) {
        const digits = compact.slice(plus[0].length);
        const country = countryOfDigits(digits, base.code);
        if (country) {
            const rest = digits.slice(country.dial.length);
            return {
                country: country.code,
                national: /^\d+$/.test(rest)
                    ? groupNational(country.dial, rest)
                    : rest,
            };
        }
    }
    return { country: base.code, national: text };
}

/** Countries whose numbers keep their leading 0 after the country code. */
const KEEPS_LEADING_ZERO = new Set(["IT", "SM", "VA"]);

/**
 * The field's value from its parts: "" when no number is typed, else the
 * number with its country code, as E.164 when the digits make one
 * ("+919876543210"). A trunk 0 typed in front is dropped, and India's 91
 * or 0091 typed again is read as the code. What isn't digits is kept, so
 * the rule can say what is wrong with it.
 */
export function joinPhone(parts: PhoneParts): string {
    const country = phoneCountry(parts.country);
    let national = parts.national.trim().replace(PHONE_SEPARATORS, "");
    if (national === "") return "";
    if (/^(?:\+|00)/.test(national)) {
        return `+${national.replace(/^(?:\+|00)/, "")}`;
    }
    if (country.code === "IN") {
        const indian = INDIAN_WITHOUT_PLUS.exec(national);
        if (indian) return `+91${indian[1]}`;
    }
    if (!KEEPS_LEADING_ZERO.has(country.code)) {
        national = national.replace(/^0/, "");
    }
    return `+${country.dial}${national}`;
}

/**
 * The digits after a country code, in groups people read: India's
 * "98450 12345"; elsewhere the last four together and threes before them
 * ("207 946 0958", "415 555 0100").
 */
function groupNational(dial: string, digits: string): string {
    if (dial === "91" && digits.length === 10) {
        return `${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    if (digits.length <= 4) return digits;
    const groups = [digits.slice(-4)];
    let rest = digits.slice(0, -4);
    while (rest.length > 3) {
        groups.unshift(rest.slice(-3));
        rest = rest.slice(0, -3);
    }
    if (rest) groups.unshift(rest);
    return groups.join(" ");
}

/**
 * A saved number as a person reads it: "+91 98450 12345", "+44 207 946
 * 0958". One saved before numbers were checked is read by the same rule
 * first ("98450 12345" reads "+91 98450 12345"), except that one written
 * with its code and its own spaces ("+91 22 4000 0000", a landline) keeps
 * them, as the person who knew the number grouped it; one that can't be
 * read is shown as it was.
 */
export function phoneLabel(stored: string | null | undefined): string {
    if (!stored) return "";
    const typed = stored.trim();
    const result = normalisePhoneNumber(typed);
    const e164 = "phone" in result ? result.phone : null;
    if (!e164) return typed;
    if (typed.startsWith("+") && /\s/.test(typed)) return typed;
    const digits = e164.slice(1);
    const country = countryOfDigits(digits);
    if (!country) return e164;
    return `+${country.dial} ${groupNational(country.dial, digits.slice(country.dial.length))}`;
}

/**
 * The cases every reader of a phone must agree on: the API's rule, the
 * workspace's field and the site's field each run them (#1036). `stored` is
 * the E.164 kept, or null where the typed text is refused.
 */
export const PHONE_CASES: readonly {
    typed: string;
    stored: string | null;
    country: string;
}[] = [
    { typed: "+91 98765 43210", stored: "+919876543210", country: "IN" },
    { typed: "098765 43210", stored: "+919876543210", country: "IN" },
    { typed: "0091 98765 43210", stored: "+919876543210", country: "IN" },
    { typed: "919876543210", stored: "+919876543210", country: "IN" },
    { typed: "98765 43210", stored: "+919876543210", country: "IN" },
    { typed: "+44 20 7946 0958", stored: "+442079460958", country: "GB" },
    { typed: "+971 50 123 4567", stored: "+971501234567", country: "AE" },
    { typed: "+1 415 555 0100", stored: "+14155550100", country: "US" },
    { typed: "98765", stored: null, country: "IN" },
    { typed: "+91 98765 4321", stored: null, country: "IN" },
    { typed: "call me", stored: null, country: "IN" },
    { typed: "98765 4321x", stored: null, country: "IN" },
];
