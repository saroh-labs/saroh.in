/**
 * Photos for Pulse Fitness's counter and Rye & Co.'s custom cakes: free-licence
 * Unsplash images, credited to their photographers and hot-linked by address,
 * as the boutique's are (local storage keeps no uploads). Each was looked at
 * before it was used — unbranded tubs, plain tees, real cakes of the kind —
 * and `scripts/check-demo-images.mjs` checks they still load.
 */

export interface ProductPhoto {
    url: string;
    alt: string;
    width: number;
    height: number;
    creditName: string;
    creditUrl: string;
    /** The variant (by its title) this photo pictures. */
    variant?: string;
}

const unsplash = (photo: string) =>
    `https://images.unsplash.com/${photo}?w=1600&q=80&auto=format&fit=crop`;

export const PULSE_PHOTOS: Record<string, readonly ProductPhoto[]> = {
    "whey-protein-1kg": [
        {
            url: unsplash("photo-1693996045899-7cf0ac0229c7"),
            alt: "A white tub labelled Protein beside a scoop spilling pale protein powder",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
        {
            url: unsplash("photo-1693996046865-19217d179161"),
            alt: "A scoop of protein powder tipped onto a heap of powder",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
    ],
    "whey-protein-2kg": [
        {
            url: unsplash("photo-1693996045300-521e9d08cabc"),
            alt: "A white protein tub and a scoop of powder on a dark reflective counter",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
        {
            url: unsplash("photo-1693996045369-781799bbaea0"),
            alt: "An open tub of protein powder beside a full scoop, on black",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
    ],
    "whey-isolate-1kg": [
        {
            url: unsplash("photo-1774793476310-fd7d843184c5"),
            alt: "A white tub labelled Whey Protein with a scoop of powder on a wooden counter",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
    ],
    "plant-protein-1kg": [
        {
            url: unsplash("photo-1633509817627-5a29634475af"),
            alt: "Wooden spoons of different plant protein powders arranged in a circle",
            width: 1600,
            height: 1083,
            creditName: "Emma-Jane Hobden",
            creditUrl: "https://unsplash.com/@emmalejane",
        },
        {
            url: unsplash("photo-1704650312191-005ab02786f5"),
            alt: "Pale protein powder with a measuring scoop",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
    ],
    "creatine-monohydrate": [
        {
            url: unsplash("photo-1693996045435-af7c48b9cafb"),
            alt: "A plain tub labelled Creatine with a scoop of white powder",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
        {
            url: unsplash("photo-1593095948071-474c5cc2989d"),
            alt: "A scoop resting in fine white creatine powder",
            width: 1600,
            height: 1068,
            creditName: "HowToGym",
            creditUrl: "https://unsplash.com/@howtogym",
        },
    ],
    "pre-workout": [
        {
            url: unsplash("photo-1693996045838-980674653385"),
            alt: "A shaker of a red drink beside plain tubs of pre-workout, creatine and protein",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
    ],
    bcaa: [
        {
            url: unsplash("photo-1581269631444-9c6cc00df0b6"),
            alt: "Someone tipping a scoop of red drink powder into a shaker",
            width: 1600,
            height: 995,
            creditName: "Kelly Sikkema",
            creditUrl: "https://unsplash.com/@kellysikkema",
        },
    ],
    "electrolyte-sachets": [
        {
            url: unsplash("photo-1764182350435-ed46f1e93c2f"),
            alt: "Powder from a sachet pouring into a glass of water",
            width: 1600,
            height: 2402,
            creditName: "NutraSeller Manufacturing",
            creditUrl: "https://unsplash.com/@nutraseller",
        },
    ],
    "protein-bar-choco-almond": [
        {
            url: unsplash("photo-1622484212850-eb596d769edc"),
            alt: "Chocolate protein bars broken into chunks with cocoa dusted around them",
            width: 1600,
            height: 1068,
            creditName: "Nature Zen",
            creditUrl: "https://unsplash.com/@nature_zen",
        },
    ],
    "protein-bar-peanut-butter": [
        {
            url: unsplash("photo-1704650312560-4414980bab95"),
            alt: "Two chocolate-coated protein bars lying on a heap of protein powder",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
    ],
    "peanut-butter-high-protein": [
        {
            url: unsplash("photo-1691480208637-6ed63aac6694"),
            alt: "A glass jar of peanut butter with a plain white label",
            width: 1600,
            height: 1600,
            creditName: "personalgraphic.com",
            creditUrl: "https://unsplash.com/@personal_graphic",
        },
    ],
    multivitamin: [
        {
            url: unsplash("photo-1588718889344-f7bd7a565d20"),
            alt: "A pile of white multivitamin tablets",
            width: 1600,
            height: 1068,
            creditName: "James Yarema",
            creditUrl: "https://unsplash.com/@jamesyarema",
        },
    ],
    "omega-3": [
        {
            url: unsplash("photo-1693996047034-311ab7656691"),
            alt: "A white bottle labelled Omega-3 with softgel capsules spilled beside it",
            width: 1600,
            height: 1068,
            creditName: "Alex Saks",
            creditUrl: "https://unsplash.com/@alexsaks",
        },
        {
            url: unsplash("photo-1624362772755-4d5843e67047"),
            alt: "Golden omega-3 softgel capsules on a pale blue surface",
            width: 1600,
            height: 1068,
            creditName: "Leohoho",
            creditUrl: "https://unsplash.com/@leohoho",
        },
    ],
    "shaker-bottle": [
        {
            url: unsplash("photo-1642539088032-41a1fb000bc5"),
            alt: "A translucent shaker bottle with measurement marks, against a dark background",
            width: 1600,
            height: 2097,
            creditName: "Eastman Childs",
            creditUrl: "https://unsplash.com/@eternalseconds",
        },
    ],
    "steel-water-bottle": [
        {
            url: unsplash("photo-1664714628878-9d2aa898b9e3"),
            alt: "A brushed steel water bottle with a loop cap",
            width: 1600,
            height: 898,
            creditName: "personalgraphic.com",
            creditUrl: "https://unsplash.com/@personal_graphic",
            variant: "Silver",
        },
        {
            url: unsplash("photo-1602143407151-7111542de6e8"),
            alt: "A matte green steel water bottle on a white table",
            width: 1600,
            height: 2402,
            creditName: "Joan Tran",
            creditUrl: "https://unsplash.com/@joanofarts",
            variant: "Forest green",
        },
    ],
    "lifting-gloves": [
        {
            url: unsplash("photo-1557127972-1c446ea89ea5"),
            alt: "Black padded lifting gloves with wrist straps, on a hand",
            width: 1600,
            height: 2402,
            creditName: "Alexander Mils",
            creditUrl: "https://unsplash.com/@alexandermils",
        },
        {
            url: unsplash("photo-1789718759468-74522c0083c0"),
            alt: "A pair of black lifting gloves on a gym floor",
            width: 1600,
            height: 1199,
            creditName: "frhnh mzln",
            creditUrl: "https://unsplash.com/@_frhnhmzln_",
        },
    ],
    "lifting-belt-leather": [
        {
            url: unsplash("photo-1532382708467-d720b918f0da"),
            alt: "A lifter fastening a thick leather lifting belt around his waist",
            width: 1600,
            height: 2402,
            creditName: "Alora Griffiths",
            creditUrl: "https://unsplash.com/@aloragriffiths",
        },
        {
            url: unsplash("photo-1549476464-37392f717541"),
            alt: "A man in a gym wearing a lifting belt, a barbell plate beside him",
            width: 1600,
            height: 2402,
            creditName: "John Fornander",
            creditUrl: "https://unsplash.com/@johnfo",
        },
    ],
    "wrist-wraps": [
        {
            url: unsplash("photo-1605868230251-f0e640f3201f"),
            alt: "Black wrist wraps being wound around a lifter's wrist",
            width: 1600,
            height: 1137,
            creditName: "ROOQ Boxing",
            creditUrl: "https://unsplash.com/@rooq_boxing",
            variant: "Black",
        },
        {
            url: unsplash("photo-1555661530-68c8e98db4e6"),
            alt: "Red wrist wraps being tied around a wrist",
            width: 1600,
            height: 1068,
            creditName: "Payam Tahery",
            creditUrl: "https://unsplash.com/@payam__tahery",
            variant: "Red",
        },
    ],
    "resistance-bands": [
        {
            url: unsplash("photo-1584827386916-b5351d3ba34b"),
            alt: "Resistance bands in several colours hanging side by side",
            width: 1600,
            height: 2402,
            creditName: "Delaney Van",
            creditUrl: "https://unsplash.com/@delaneyvan",
        },
        {
            url: unsplash("photo-1685633225541-1e9c1654bc00"),
            alt: "Loop resistance bands hung on a dark gym wall",
            width: 1600,
            height: 2402,
            creditName: "Ambitious Studio* | Rick Barrett",
            creditUrl: "https://unsplash.com/@weareambitious",
        },
    ],
    "skipping-rope": [
        {
            url: unsplash("photo-1516876345887-6dd74f80787a"),
            alt: "An orange skipping rope coiled on a purple background",
            width: 1600,
            height: 1600,
            creditName: "Stoica Ionela",
            creditUrl: "https://unsplash.com/@pupile_gustative",
        },
        {
            url: unsplash("photo-1591311630200-ffa9120a540f"),
            alt: "A speed rope beside trainers and dumbbells on a gym floor",
            width: 1600,
            height: 1145,
            creditName: "Alexandra Tran",
            creditUrl: "https://unsplash.com/@alexgoesglobal",
        },
    ],
    "foam-roller": [
        {
            url: unsplash("photo-1653617748437-895c016e88b1"),
            alt: "A black textured foam roller",
            width: 1600,
            height: 1068,
            creditName: "Alexey Demidov",
            creditUrl: "https://unsplash.com/@alexeydemidov",
        },
        {
            url: unsplash("photo-1591741535585-9c4f52b3f13f"),
            alt: "Someone rolling out a leg on a foam roller",
            width: 1600,
            height: 2402,
            creditName: "Andrew Valdivia",
            creditUrl: "https://unsplash.com/@donovan_valdivia",
        },
    ],
    "yoga-mat": [
        {
            url: unsplash("photo-1718862403436-616232ec6005"),
            alt: "Someone rolling up a blue-teal yoga mat",
            width: 1600,
            height: 1068,
            creditName: "Content Pixie",
            creditUrl: "https://unsplash.com/@contentpixie",
            variant: "Teal",
        },
        {
            url: unsplash("photo-1599901860904-17e6ed7083a0"),
            alt: "A woman in downward dog on a dark grey yoga mat",
            width: 1600,
            height: 1068,
            creditName: "Ginny Rose Stewart",
            creditUrl: "https://unsplash.com/@ginnyrose",
            variant: "Charcoal",
        },
    ],
    "gym-towel": [
        {
            url: unsplash("photo-1638183130424-873c491cca1b"),
            alt: "A grey textured towel draped over gym equipment beside a water jar",
            width: 1600,
            height: 1068,
            creditName: "Intenza Fitness",
            creditUrl: "https://unsplash.com/@intenzafitness",
            variant: "Grey",
        },
        {
            url: unsplash("photo-1662386392771-07d5109da175"),
            alt: "Rolled white towels stacked on a bench",
            width: 1600,
            height: 1068,
            creditName: "Aparna Johri",
            creditUrl: "https://unsplash.com/@healthywithaparna",
            variant: "White",
        },
    ],
    "gym-bag": [
        {
            url: unsplash("photo-1448582649076-3981753123b5"),
            alt: "A brown duffel bag on a wooden floor",
            width: 1600,
            height: 1068,
            creditName: "Erol Ahmed",
            creditUrl: "https://unsplash.com/@erol",
        },
    ],
    "pulse-tee-black": [
        {
            url: unsplash("photo-1610502778270-c5c6f4c7d575"),
            alt: "Three plain black T-shirts on hangers against a white wall",
            width: 1600,
            height: 1072,
            creditName: "Ryan Hoffman",
            creditUrl: "https://unsplash.com/@ryanhoffman007",
        },
        {
            url: unsplash("photo-1759572095384-1a7e646d0d4f"),
            alt: "A folded plain black T-shirt",
            width: 1600,
            height: 2849,
            creditName: "tian dayong",
            creditUrl: "https://unsplash.com/@tonnnyj",
        },
    ],
    "pulse-tee-grey": [
        {
            url: unsplash("photo-1564584217132-2271feaeb3c5"),
            alt: "A plain heather-grey T-shirt on a hanger",
            width: 1600,
            height: 1068,
            creditName: "Cristofer Maximilian",
            creditUrl: "https://unsplash.com/@cristofer",
        },
    ],
    "pulse-tee-navy": [
        {
            url: unsplash("photo-1666358070734-b9d6590278c9"),
            alt: "A plain navy T-shirt on a wooden hanger",
            width: 1600,
            height: 1068,
            creditName: "Or Hakim",
            creditUrl: "https://unsplash.com/@orhakim",
        },
    ],
    "pulse-tee-red": [
        {
            url: unsplash("photo-1599793829933-ffbb5dc35397"),
            alt: "A man in a plain red T-shirt sitting outdoors",
            width: 1600,
            height: 2005,
            creditName: "Sooraj Dev",
            creditUrl: "https://unsplash.com/@sooraj__dev",
        },
    ],
    "pulse-tank-black": [
        {
            url: unsplash("photo-1785355146243-6a944d173298"),
            alt: "A plain black training tank worn by a man, against a white wall",
            width: 1600,
            height: 2402,
            creditName: "Alexis Maxell",
            creditUrl: "https://unsplash.com/@maxellalexis",
        },
    ],
    "pulse-tank-grey": [
        {
            url: unsplash("photo-1618227637592-99ab98da1d66"),
            alt: "A plain light-grey sleeveless top on a man, against a grey wall",
            width: 1600,
            height: 2402,
            creditName: "Marcelo Marques",
            creditUrl: "https://unsplash.com/@marcelomarques68",
        },
    ],
};

export const RYE_CAKE_PHOTOS: Record<string, readonly ProductPhoto[]> = {
    "chocolate-truffle-cake": [
        {
            url: unsplash("photo-1713274786002-fc911a7939e5"),
            alt: "A glossy chocolate cake topped with piped chocolate kisses, one slice cut",
            width: 1600,
            height: 2402,
            creditName: "Olga Petnyunene",
            creditUrl: "https://unsplash.com/@12tones",
        },
        {
            url: unsplash("photo-1607257882338-70f7dd2ae344"),
            alt: "A tall slice of layered chocolate truffle cake",
            width: 1600,
            height: 898,
            creditName: "Ayesha Firdaus",
            creditUrl: "https://unsplash.com/@ayeshafirdaus",
        },
    ],
    "red-velvet-cake": [
        {
            url: unsplash("photo-1586788680434-30d324b2d46f"),
            alt: "A slice of red velvet cake with cream-cheese frosting, the cake behind it",
            width: 1600,
            height: 1430,
            creditName: "amirali mirhashemian",
            creditUrl: "https://unsplash.com/@amir_v_ali",
        },
        {
            url: unsplash("photo-1779885580435-949062b1abb3"),
            alt: "Close-up of red velvet sponge and white frosting",
            width: 1600,
            height: 2402,
            creditName: "An Shved",
            creditUrl: "https://unsplash.com/@anshved",
        },
    ],
    "black-forest-cake": [
        {
            url: unsplash("photo-1606890737304-57a1ca8a5b62"),
            alt: "A layered black forest cake with cream, cherries and chocolate",
            width: 1600,
            height: 1851,
            creditName: "Jacob Thomas",
            creditUrl: "https://unsplash.com/@jacob225",
        },
        {
            url: unsplash("photo-1605807646983-377bc5a76493"),
            alt: "A chocolate-glazed cake topped with cherries on a white stand",
            width: 1600,
            height: 1284,
            creditName: "Umesh Soni",
            creditUrl: "https://unsplash.com/@umeshsonii",
        },
    ],
    "rasmalai-cake": [
        {
            url: unsplash("photo-1716579862099-acd0967de37b"),
            alt: "A cream cake topped with chopped pistachio and dried rose petals",
            width: 1600,
            height: 925,
            creditName: "Aleksandra Gencheva",
            creditUrl: "https://unsplash.com/@inmykitchen_bg",
        },
        {
            url: unsplash("photo-1559329373-78f77851b979"),
            alt: "A slice of sponge layered with cream, pistachio and rose on top",
            width: 1600,
            height: 1068,
            creditName: "K8",
            creditUrl: "https://unsplash.com/@_k8_",
        },
    ],
    "lemon-blueberry-cake": [
        {
            url: unsplash("photo-1647616921122-f47144017ef8"),
            alt: "A slice of lemon and blueberry cake on a grey plate with lemon halves",
            width: 1600,
            height: 1068,
            creditName: "Isabella",
            creditUrl: "https://unsplash.com/@isabellabakes",
        },
        {
            url: unsplash("photo-1767493296465-ec828675c3d7"),
            alt: "A slice of layered lemon sponge with cream on a white plate",
            width: 1600,
            height: 2402,
            creditName: "Natalia Bennett",
            creditUrl: "https://unsplash.com/@ncbennett",
        },
    ],
    "coffee-walnut-cake": [
        {
            url: unsplash("photo-1697320777464-4db89a223861"),
            alt: "A tall coffee cake with chocolate drip and piped coffee buttercream",
            width: 1600,
            height: 2402,
            creditName: "Charis Filer",
            creditUrl: "https://unsplash.com/@cfiler",
        },
        {
            url: unsplash("photo-1685956801990-57ef97b17d45"),
            alt: "A layered coffee cake on a glass stand with a cup of coffee and beans",
            width: 1600,
            height: 1600,
            creditName: "Christian Dala",
            creditUrl: "https://unsplash.com/@kurisuchanxx",
        },
    ],
    "vanilla-fruit-cake": [
        {
            url: unsplash("photo-1589660117682-0728d988a2d2"),
            alt: "A cream-topped sponge cake covered with strawberries and blackberries",
            width: 1600,
            height: 1033,
            creditName: "Daniel Álvasd",
            creditUrl: "https://unsplash.com/@danielalvasd",
        },
        {
            url: unsplash("photo-1660383534593-6b5221ab80d2"),
            alt: "A cream cake decorated with fresh fruit, held up in two hands",
            width: 1600,
            height: 1068,
            creditName: "Michal Mikulec",
            creditUrl: "https://unsplash.com/@mikulecmichal",
        },
    ],
    "theme-cake": [
        {
            url: unsplash("photo-1553710120-23dd1551da41"),
            alt: "A child's birthday cake with rainbow decorations and lit candles",
            width: 1600,
            height: 1122,
            creditName: "Joshua Hoehne",
            creditUrl: "https://unsplash.com/@joshua_hoehne",
        },
        {
            url: unsplash("photo-1555276831-f5996bfbb1cc"),
            alt: "A unicorn-themed birthday cake in pastels",
            width: 1600,
            height: 1068,
            creditName: "Ashley West Edwards",
            creditUrl: "https://unsplash.com/@ashleywedwards",
        },
    ],
    "birthday-candles": [
        {
            url: unsplash("photo-1464347601390-25e2842a37f7"),
            alt: "A row of thin lit birthday candles against a dark background",
            width: 1600,
            height: 1022,
            creditName: "Annie Spratt",
            creditUrl: "https://unsplash.com/@anniespratt",
        },
        {
            url: unsplash("photo-1600566209579-dd9691ed2ff0"),
            alt: "Lit birthday candles close up",
            width: 1600,
            height: 2290,
            creditName: "Hamid Roshaan",
            creditUrl: "https://unsplash.com/@roshaan",
        },
    ],
    "number-candle": [
        {
            url: unsplash("photo-1674550244179-58cd19377799"),
            alt: "A lit gold number 0 candle",
            width: 1600,
            height: 1199,
            creditName: "engin akyurt",
            creditUrl: "https://unsplash.com/@enginakyurt",
            variant: "0",
        },
        {
            url: unsplash("photo-1674550309818-98c1f5f938d5"),
            alt: "A lit number 1 candle",
            width: 1600,
            height: 1199,
            creditName: "engin akyurt",
            creditUrl: "https://unsplash.com/@enginakyurt",
            variant: "1",
        },
        {
            url: unsplash("photo-1674550309767-71a3658cfe7a"),
            alt: "A lit number 5 candle",
            width: 1600,
            height: 1199,
            creditName: "engin akyurt",
            creditUrl: "https://unsplash.com/@enginakyurt",
            variant: "5",
        },
    ],
    "cake-topper": [
        {
            url: unsplash("photo-1664032659284-c836eb98de0a"),
            alt: "A gold Happy Birthday topper on a chocolate cake with candles",
            width: 1600,
            height: 1067,
            creditName: "Asif Khan",
            creditUrl: "https://unsplash.com/@aroosaali9272",
        },
        {
            url: unsplash("photo-1627247359162-4645d9f8543b"),
            alt: "A gold Happy Birthday topper on a cut sponge cake with berries",
            width: 1600,
            height: 2402,
            creditName: "Iulia Buta",
            creditUrl: "https://unsplash.com/@iuliabuta",
        },
    ],
    "message-plaque": [
        {
            url: unsplash("photo-1736601620958-b4fd61a9c9fd"),
            alt: "A chocolate cake slice with a piped message plaque on top",
            width: 1600,
            height: 1068,
            creditName: "Frank Ng",
            creditUrl: "https://unsplash.com/@frankng",
        },
    ],
};
