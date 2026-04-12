# OC Food Recs — Design Brainstorm

## Context

OC Food Recs is a community-curated restaurant discovery tool — a single-page interactive explorer showing 289 mom-and-pop restaurants in Orange County, CA, sourced from a viral Reddit thread with 735 responses. The audience is food-curious Orange County residents and visitors, skewing younger and Reddit-native (20s-40s), browsing on both desktop and mobile, looking for authentic local dining recommendations rather than chain restaurants. They value community voice over editorial authority.

The tone is community-driven, authentic, approachable, and slightly playful — this is Reddit data curated into a useful tool, not a Michelin guide. The existing brand uses Reddit orange (#ff4500) as its primary accent, a system font stack, off-white (#fafafa) body backgrounds, white card backgrounds with green cuisine tags and blue city tags, and dark headings (#1a1a2e). The technical stack is SvelteKit 5 with TypeScript, scoped CSS (no Tailwind), Leaflet maps, and Fuse.js search.

Competitors are Yelp, Google Maps, Eater LA, and The Infatuation — all corporate or editorially curated. This site's edge is authenticity: real Reddit users, real upvotes, zero sponsored content. Design anti-goals include no background gradients, no mouse-following effects, no parallax scrolling, and no looping animations — tasteful and subtle polish only.

---

## Idea A: "Community Bulletin" — Constructivism meets Digital Zine Culture

**Probability: 0.23**

### Design Movement
Soviet Constructivism's emphasis on bold geometry, asymmetric composition, and art-as-collective-tool is reinterpreted through the lens of DIY zine culture and community bulletin boards — where the medium screams "this was made by people, not a corporation."

### Core Principles
1. **Asymmetry signals authenticity** — reject centered, corporate symmetry in favor of off-grid placements and intentional visual tension that communicates grassroots origin.
2. **Dense information is a feature** — embrace the richness of 289 restaurants and 735 voices rather than hiding it behind minimalism; let the data feel abundant like a well-loved corkboard.
3. **Color blocks replace decoration** — use solid geometric color fields as structural elements, not ornament; every colored shape organizes or emphasizes content.
4. **The collective voice is the hero** — foreground the Reddit community as the source of authority; design choices should make individual comments feel like dispatches from trusted neighbors.

### Color Philosophy
Reddit orange `#FF4500` remains the primary accent but is used sparingly and structurally — as bold ruled lines, tag backgrounds, and the hero's call-to-action — so it reads as a signal flare, not a brand wash. A deep charcoal `#1A1A2E` serves as the dominant text and heading color, grounding the composition with the weight Constructivist posters demand. A warm cream `#FDF6EC` replaces the sterile `#FAFAFA` body, evoking the texture of kraft paper and bulletin board stock — immediately differentiating from Yelp's clinical white. Cuisine tags use a muted olive `#4A7C59` and city tags a dusty slate blue `#5B7B9A`, both desaturated enough to feel hand-picked rather than programmatic.

### Layout Paradigm
The hero section uses an aggressive diagonal split — a rotated `#FF4500` geometric block cutting across cream, with the headline set large and left-aligned at a slight 2-degree rotation, immediately breaking the grid to signal this is not another Yelp clone. Below the hero, the sticky search bar spans full-width as a thick ruled band (4px top/bottom borders in charcoal), acting as a visual divider that references Constructivist horizontal rules. The split-view content area uses a 40/60 map-to-list ratio on desktop, with restaurant cards stacked in a tight rhythm (12px gap) that feels like thumbing through index cards pinned to a board.

### Signature Elements
- **Diagonal accent slashes**: 3px-wide `#FF4500` lines rotated 12 degrees, placed behind section headers as background decoration at 15% opacity — a nod to Constructivist diagonal compositions without overwhelming content.
- **Stamp-style endorsement counts**: Reddit upvote counts displayed inside a 32x32px rounded-square with a 2px `#FF4500` border and a subtle 1-degree rotation, resembling rubber-stamped approval marks.
- **Pull-quote comment treatment**: The top Reddit comment in each accordion drawer is set 20% larger than body text, left-bordered with a 4px `#FF4500` rule, and prefixed with oversized open-quote marks in `#1A1A2E` at 20% opacity — making the community voice literally bigger than the metadata.
- **Card corner notch**: Each restaurant card features a 6px triangular clip-path cut from the top-right corner filled with the cuisine tag color, a subtle reference to pinned paper corners on a bulletin board.

### Interaction Philosophy
Hover states use abrupt geometric shifts rather than fades — cards translate 2px left and gain a 3px left border in `#FF4500`, mimicking the feeling of pulling a card slightly off a board to inspect it. Accordion drawers open with a sharp vertical expansion; the CTA pattern uses high-contrast solid buttons with uppercase text and no border-radius, reinforcing the Constructivist poster-button aesthetic.

### Animation
Card hover translate: `transform: translateX(-2px)` with `transition: transform 120ms cubic-bezier(0.25, 0, 0.2, 1)`. Accordion expand: `max-height` transition at `250ms cubic-bezier(0.4, 0, 0.2, 1)` with content fading in via `opacity 150ms ease 100ms` (staggered 100ms delay). Filter dropdown appearance: `opacity` and `translateY(-4px)` at `180ms ease-out`. **Anti-patterns**: No transitions exceeding 300ms. No spring/bounce easing. No scale transforms on cards. No fade-in-on-scroll for list items — the density should be immediately present, not theatrically revealed.

### Typography System
- **Display font**: Space Grotesk — its geometric construction and slightly quirky proportions channel Constructivist lettering while remaining highly legible; the semi-bold weight at large sizes has the poster-quality impact this design demands.
- **Body font**: Inter — its neutrality and exceptional small-size legibility let the community content speak without typographic interference; it plays the straight-man to Space Grotesk's personality.
- **Type scale**: Display hero `48px` / Section headings `28px` / Restaurant name `20px` / Body and comments `15px` / Tags and metadata `12px` / Caption and attribution `11px`

---

## Idea B: "Driftwood & Salt" — California Coastal Casual meets Community Bulletin Board

**Probability: 0.25**

### Design Movement
California Coastal Casual adapted as a sun-faded community bulletin board — the aesthetic of hand-lettered surf shack menus and weathered pier signage translated into a digital restaurant guide, where the warmth feels like outdoor patio dining at golden hour.

### Core Principles
1. **Sun-bleached warmth over sterile white** — backgrounds use warm sand tones instead of pure white, making the interface feel like it exists outdoors under coastal light.
2. **Rounded and tactile, never sharp** — every interactive element uses generous border-radius to echo the smoothed edges of beach stones and worn wood, reinforcing approachability.
3. **Layered like a community board** — cards, tags, and drawers overlap slightly with soft shadows to feel pinned and posted rather than slotted into a rigid grid.
4. **Ocean as punctuation, not theme** — blue-green accents appear sparingly at moments of action and discovery, the way the ocean appears between buildings in a beach town.

### Color Philosophy
The body background is a warm sand (`#f5f0e8`) instead of the existing cool #fafafa — this single shift anchors the entire coastal feel without decoration. Cards sit on driftwood white (`#fefcf7`) with a barely-there warm shadow. The existing Reddit orange (`#ff4500`) stays as the primary action color but gets a sun-warmed companion in terracotta (`#c2703e`) for secondary emphasis like endorsement counts and hover states. Ocean teal (`#2a8a7a`) replaces the existing green for cuisine tags, while a faded coastal blue (`#5b8fa8`) replaces the existing blue for city tags — both desaturated enough to feel sun-exposed rather than digital. Headings shift from #1a1a2e to a deep driftwood charcoal (`#2c2c2a`), warmer and less stark.

### Layout Paradigm
The hero section uses a generous top padding (80px desktop, 56px mobile) with the heading left-aligned against a large empty margin, mimicking how surf shop signage hugs one side of a weathered wall. The split-view allocates 55% to the restaurant list and 45% to the map on desktop, with the list given visual priority because this is a reading-first, community-voice experience. Vertical rhythm uses 24px as the base unit, with restaurant cards spaced 16px apart and separated by a faint 1px warm-gray (`#e8e0d4`) divider rather than floating in open space — closer to a printed menu than a card grid.

### Signature Elements
- **Cuisine tags** use a pill shape with 20px border-radius, teal (`#2a8a7a`) text on a translucent teal background (`rgba(42, 138, 122, 0.1)`), with a subtle 1px solid border at `rgba(42, 138, 122, 0.2)` — evoking hand-stamped labels.
- **Restaurant cards** have a 12px border-radius with a `0 2px 8px 0 rgba(44, 44, 42, 0.06)` shadow on sand-white (`#fefcf7`), and on hover the shadow deepens to `0 4px 16px 0 rgba(44, 44, 42, 0.1)` — the card lifts like a postcard picked up from a table.
- **The search bar** sits on a slightly darker warm tone (`#ece6da`) with an inset shadow (`inset 0 1px 3px rgba(44, 44, 42, 0.08)`), a 24px border-radius, and a 2px solid border in `#e8e0d4` — feeling recessed like a wooden frame rather than floating.
- **Reddit comment blocks** inside accordion drawers use a left border of 3px solid `#ff4500` with a background of `rgba(255, 69, 0, 0.03)`, tying the community source back to the data without overwhelming the coastal palette.

### Interaction Philosophy
Hovers are warm and unhurried — cards lift gently, links shift from charcoal to terracotta (`#c2703e`), and buttons darken by 8% rather than changing color entirely, like shade passing over a surface. Scroll behavior is passive with no sticky elements beyond the search/filter bar, and CTAs use the Reddit orange (`#ff4500`) only for the single most important action per viewport, keeping the interface calm.

### Animation
Card hover shadow transitions use 220ms ease-out. Accordion drawers expand with 250ms `cubic-bezier(0.25, 0.1, 0.25, 1.0)` and a max-height technique, with content fading in via opacity 180ms ease-in delayed 60ms after the height begins expanding. Tag filter selections apply a background-color transition of 150ms ease. Map pin popups fade in at 160ms ease-out. **Anti-patterns:** no bounce easing, no transform scale on hover (only shadow changes), no entrance animations on scroll, no loading skeleton shimmer — content appears instantly or with a single 120ms opacity fade if asynchronously loaded.

### Typography System
- **Display font:** Quicksand (Google Fonts) — rounded terminals and open letterforms that feel hand-drawn without being novelty, directly channeling surf shop and farmer's market signage while remaining highly legible.
- **Body font:** Inter — the existing system-font-adjacent choice stays for body text, providing neutral readability that lets Quicksand carry the personality in headings without competing.
- **Type scale:** Display hero: 40px / weight 700. Section headings (h2): 28px / weight 600. Restaurant names (h3): 20px / weight 600. Body text: 15px / weight 400. Tags and metadata: 13px / weight 500. Captions and attribution: 12px / weight 400. Line-height is 1.5 for body, 1.2 for display, 1.3 for headings.

---

## Idea C: "The Orange County Table" — Warm Editorial meets Community Potluck

**Probability: 0.29**

### Design Movement
Warm Editorial / Food Magazine typography and layout principles — the kind of confident, appetite-inducing design you see in Bon Appetit or Cherry Bombe — reinterpreted through the lens of a community bulletin board where every recommendation carries the weight of a neighbor's honest opinion rather than an editor's curated pick.

### Core Principles
1. **Feed the eyes before the stomach** — every typographic choice, color swatch, and spatial decision should evoke the warmth of a kitchen table, not the sterility of a search engine.
2. **Let the community be the byline** — Reddit usernames and upvote counts receive the same editorial prominence that a food magazine gives its staff writers; the crowd IS the authority.
3. **Hierarchy through warmth, not weight** — distinguish content levels using color temperature and generous whitespace rather than aggressive size contrasts or heavy borders.
4. **One ingredient at a time** — progressive disclosure mirrors the way a good meal unfolds: hero draws you in, filters narrow your craving, cards reveal the story course by course.

### Color Philosophy
The primary background shifts from cold #fafafa to a warm parchment `#faf7f2` — the color of a well-loved cookbook page — which immediately separates this from every blue-white tech product in the space. Reddit orange `#ff4500` remains the primary accent but is used sparingly: upvote counts, active filter states, and the single hero CTA, so it pops like a fresh pepper on a neutral plate. A deep espresso brown `#3e2c23` replaces #1a1a2e for headings, grounding the typography in food-world warmth rather than tech-world darkness. Cuisine tags shift to a roasted herb palette: background `#f0ebe3` with text `#5d4e37` (earthy taupe), while city tags adopt a soft terracotta: background `#fce8e0` with text `#b5543a` — both warmer than the current green/blue and more cohesive with the editorial tone. A cream white `#fffcf8` replaces pure white on cards, reducing contrast harshness. Secondary text uses `#7a6e63`, a warm gray that reads as approachable rather than corporate.

### Layout Paradigm
The hero section uses a magazine-cover composition: a large editorial headline set flush-left with a warm subhead beneath it, occupying roughly 60% of the hero width on desktop, with the right 40% left as breathing room anchored by a single illustrative element (a subtle fork-and-knife icon or a hand-drawn map pin in the espresso color at about 20% opacity). Below the hero, the sticky search bar sits inside a cream `#fffcf8` band with a thin 1px bottom border in `#e8e0d6`, feeling like a section divider in a printed magazine rather than a floating UI element. The split-view below follows a classic editorial two-column ratio — 45% map / 55% list on desktop — with the restaurant cards stacked in a single column that uses 28px vertical gaps, letting each card breathe like entries in a curated index.

### Signature Elements
- **Pull-quote upvote styling**: When a restaurant card is expanded, the top Reddit comment is displayed as a pull-quote with a 3px left border in `#ff4500`, italic display font at 18px, and the username styled as a small-caps byline in `#7a6e63` at 11px tracking 0.08em — directly borrowing from food magazine testimonial layouts.
- **Section marker dots**: Between filter groups in the sticky bar, small 4px circular dividers in `#d4c8bb` (warm stone) at 60% opacity act as typographic ornaments, evoking the decorative separators found in print menus and editorial layouts.
- **Card hover warmth**: On hover, restaurant cards gain a subtle box-shadow of `0 2px 12px rgba(62, 44, 35, 0.08)` and their left border transitions from transparent to a 3px solid `#ff4500` — like a thumb marking a page in a cookbook.
- **Endorsement count badge**: The Reddit upvote count appears in a small rounded pill (border-radius 12px, padding 2px 10px) with background `#fff0eb` and text in `#ff4500` at 12px font-weight 600, positioned top-right of each card like a magazine editor's pick stamp.

### Interaction Philosophy
Hover states should feel like warmth arriving — color temperature shifts and soft shadows fading in rather than scale transforms or opacity jumps; nothing should bounce or overshoot. CTAs use the editorial convention of underlined text links in `#ff4500` with a subtle thickness transition on hover (`text-decoration-thickness` from 1px to 2px), reserving filled buttons only for the single primary action in the hero.

### Animation
Card expansion uses 280ms with `cubic-bezier(0.25, 0.1, 0.25, 1.0)` — a gentle ease-out that feels like unfolding a menu. Hover box-shadows transition over 200ms ease. The left-border accent on card hover transitions over 180ms ease-in-out. Filter dropdown appearance uses 220ms ease-out with a 4px translateY from top. Sticky search bar shadow on scroll activates over 150ms. **Anti-patterns**: no `transform: scale()` on any hover state; no elastic/bounce easing anywhere; no staggered card entrance animations; no transitions longer than 350ms; absolutely no parallax, gradient shifts, or cursor-tracking effects.

### Typography System
- **Display font**: DM Serif Display — a high-contrast transitional serif with the editorial authority of a food magazine masthead; its generous x-height keeps it legible at large sizes while its sharp serifs signal sophistication without pretension. Used for the hero headline, restaurant names in cards, and expanded-view pull-quotes.
- **Body font**: DM Sans — the geometric sans-serif companion to DM Serif Display, designed by the same foundry for optical harmony; its open apertures and friendly geometry match the approachable community tone while maintaining the clean readability needed for Reddit comment text and filter labels.
- **Type scale**: Hero headline 44px / Restaurant card name 20px / Section headers 16px / Body text 15px / Reddit comment text 14px / Tag labels 12px / Byline and metadata captions 11px. Line heights: display 1.15, body 1.55, captions 1.4. Letter-spacing: display -0.01em, body 0, captions 0.04em.

---

## Idea D: "The Terminal Feed" — Neo-Brutalism meets Community Data Terminal

**Probability: 0.22**

### Design Movement
Neo-Brutalist data tool aesthetic adapted as a community intelligence terminal — where raw structural honesty and monospace precision elevate Reddit crowdsourced data into something that feels like accessing a local knowledge database rather than browsing a lifestyle site.

### Core Principles
1. **Data is the decoration** — every visual element must communicate information; ornament comes only from the structure of the data itself (counts, tags, borders, grids).
2. **Borders over shadows** — all spatial separation uses solid 2-3px borders in dark ink rather than drop shadows or gradual fades, making the hierarchy blunt and scannable.
3. **Density rewards attention** — pack more useful information into less vertical space so power users can scan 20+ restaurants without scrolling past a single screen on desktop.
4. **System-native trust** — the interface should feel like a tool someone built for themselves and shared, not a product being sold; roughness is a feature.

### Color Philosophy
Pure white (`#ffffff`) backgrounds inside content cells with a warm off-white (`#f5f2eb`) page canvas create a subtle paper-on-desk separation without gradients. Reddit orange (`#ff4500`) is used exclusively for interactive affordances — counts, active filters, and the search caret — so it always means "this does something." A near-black (`#1a1a2e`) serves as the primary ink for borders, headings, and monospace labels, while a mid-gray (`#6b7280`) carries secondary metadata. Cuisine tags use a muted sage (`#d4e7d0`) with dark green text (`#2e7d32`), and city tags use a cool steel (`#dce5f0`) with navy text (`#1565c0`) — both desaturated from the originals to avoid competing with the orange signal color.

### Layout Paradigm
The hero is compressed to a tight 280px band: a large monospace counter ("289 spots / 735 redditors / 34 cuisines") dominates the left two-thirds while a brief one-sentence description sits right-aligned, both inside a thick 3px bordered box. Below the hero, the sticky search/filter bar uses a single horizontal row with monospace input fields and chunky bordered filter dropdowns, all flush against each other with no gaps — a toolbar, not a decorative element. The split view allocates 45% to the Leaflet map (bordered, no rounded corners) and 55% to a dense scrollable list where restaurant cards stack with only a 2px border between them, no card gaps, creating a continuous data feed.

### Signature Elements
- **Counter badges**: Reddit endorsement counts displayed in monospace inside 28x28px bordered squares with `#ff4500` text on white, anchored to the top-right corner of each restaurant row — reminiscent of terminal line numbers.
- **Brutalist filter pills**: Active filter tags rendered with 2px black borders, square corners, monospace text at 11px, with a bold "x" close button that inverts to white-on-black on hover.
- **Data density header row**: A fixed sub-header on the restaurant list styled like a spreadsheet column header — "NAME / CUISINE / CITY / VOTES" in 10px uppercase monospace with a 1px bottom border — reinforcing the tool-not-magazine identity.
- **Accordion reveal borders**: When a restaurant drawer expands, the Reddit comments appear inside a distinct inset box with a dashed 1.5px `#6b7280` border and 12px padding, visually quoting the "quoted text" convention of forums and terminals.

### Interaction Philosophy
Hovers are structural, not decorative: hovering a restaurant row shifts its left border from 2px `#1a1a2e` to 4px `#ff4500`, a blunt highlight that feels like cursor selection in a terminal. Scroll behavior is purely functional with no snap points, and the primary CTA (Google Maps link) is styled as an underlined monospace text link with a trailing arrow, not a button — because in this aesthetic, links are honest about being links.

### Animation
Accordion expand uses 180ms with `cubic-bezier(0.25, 0, 0.5, 1)` easing and no max-height hack — use grid row animation (`grid-template-rows: 0fr` to `1fr`) for clean collapse. Border color transitions on hover use 100ms linear. Filter pill additions enter with a 120ms `ease-out` opacity fade from 0 to 1 with a simultaneous 6px upward translate. **Anti-patterns**: no bounce easing anywhere, no staggered list animations, no entrance animations on page load, no transform scale effects on any element.

### Typography System
- **Display font**: Space Mono — a monospace face with enough personality to feel intentional rather than accidental; its slightly quirky letterforms signal "built by someone who cares" while maintaining the terminal-tool identity.
- **Body font**: Inter — the system-adjacent sans-serif that disappears into readability at small sizes; its optical sizing keeps restaurant names and comment text clean at high density.
- **Type scale**: Display counter: 48px / Section heading: 20px / Restaurant name: 15px / Body/comments: 13px / Metadata/labels: 11px / Caption/timestamp: 10px — intentionally compressed to maximize data density.

---

## Evaluation

| Dimension (Weight) | A: Community Bulletin | B: Driftwood & Salt | C: OC Table | D: Terminal Feed |
|---|---|---|---|---|
| Audience Fit (0.30) | 3 | 4 | **5** | 2 |
| Brand Alignment (0.25) | 3 | 4 | **5** | 3 |
| Differentiation (0.20) | **5** | 3 | 4 | **5** |
| Feasibility (0.15) | 3 | **5** | 4 | 4 |
| Completeness (0.10) | 5 | 4 | **5** | 5 |
| **Weighted Score** | **3.60** | **3.95** | **4.65** | **3.45** |
| **Probability** | **0.23** | **0.25** | **0.29** | **0.22** |

---

## Selected Approach: Idea C — "The Orange County Table"

**Rationale:** Approach C wins because it simultaneously solves the two hardest constraints: making Reddit-sourced data feel trustworthy and polished (editorial warmth) while preserving the community voice that gives the data its value (Reddit username prominence, pull-quote treatment). The food-magazine lens is the most natural container for restaurant content, and the warm parchment palette is the least disruptive evolution from the existing brand. It scores highest on the two heaviest-weighted dimensions (Audience Fit and Brand Alignment) without sacrificing differentiation or completeness.

**Tradeoffs acknowledged:** The runner-up, "Driftwood & Salt," trades away editorial sophistication for maximum implementation safety and a stronger sense of geographic place. Its coastal casual warmth and rounded tactile shapes are genuinely appropriate for Orange County, and the Quicksand + Inter pairing is lighter-weight than DM Serif Display + DM Sans. If implementation speed or mobile-first simplicity were weighted more heavily, Driftwood & Salt would close the gap.
