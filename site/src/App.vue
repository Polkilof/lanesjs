<template>
    <a class="skip" href="#main">Skip to content</a>

    <header class="nav">
        <div class="nav__inner wrap">
            <a class="nav__brand" href="#top">
                <span class="nav__mark" aria-hidden="true">
                    <span></span>
                    <span></span>
                </span>
                Lanes
                <span class="tag nav__version">v{{ VERSION }}</span>
            </a>

            <nav class="nav__links" aria-label="Sections">
                <a href="#features">Features</a>
                <a href="#start">Quick start</a>
                <a href="#pro">Pro</a>
                <a href="#licence">Licence</a>
            </nav>

            <div class="nav__actions">
                <button
                    type="button"
                    class="btn btn--quiet nav__theme"
                    :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
                    @click="toggle"
                >
                    <Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="18" />
                </button>
                <a class="btn btn--ghost nav__github" :href="REPO" rel="noreferrer">
                    <Icon name="github" :size="17" />
                    <span>GitHub</span>
                </a>
            </div>
        </div>
    </header>

    <main id="main">
        <section id="top" class="hero">
            <div class="hero__glow" aria-hidden="true"></div>

            <div class="wrap hero__inner">
                <p class="eyebrow">Vue 3 · TypeScript · 7.3 kB gzipped</p>

                <h1 class="hero__title">
                    A resource timeline<br />
                    that stays out of your way
                </h1>

                <p class="hero__lede">
                    Rows of people, rooms or machines. A day or week axis across the top. Bars your users can
                    drag, stretch and connect — over data the component never touches, fetches or rewrites.
                </p>

                <div class="hero__cta">
                    <button type="button" class="hero__install" @click="copyInstall">
                        <span class="hero__prompt">$</span>
                        <span class="hero__cmd">npm i lanesjs</span>
                        <Icon :name="installed ? 'check' : 'copy'" :size="15" />
                    </button>

                    <a class="btn btn--primary" :href="DOCS" rel="noreferrer">
                        Read the docs
                        <Icon name="external" :size="15" />
                    </a>
                </div>

                <p class="hero__note">
                    Free core, paid plugins, no server in the loop. Everything below runs in this page.
                </p>
            </div>

            <div class="wrap hero__stage">
                <LiveDemo />
                <p class="hero__caption">
                    Real component, real data, 300 rows on demand. Turn on
                    <strong>Drag &amp; create</strong> and a small badge appears in the corner — that is the
                    entire difference an unpaid Pro licence makes.
                </p>
            </div>
        </section>

        <section class="strip">
            <div class="wrap strip__inner">
                <div v-for="stat in STATS" :key="stat.label" class="strip__item">
                    <strong>{{ stat.value }}</strong>
                    <span>{{ stat.label }}</span>
                </div>
            </div>
        </section>

        <section id="teams" class="section">
            <div class="wrap">
                <div class="section__head">
                    <p class="eyebrow">Another shape</p>
                    <h2 class="section__title">Rows can be groups, and groups can fold</h2>
                    <p class="section__lede">
                        The same component with nothing added to it. Teams fold and unfold, and
                        <strong>+</strong> opens a form of your own — because the component never decides
                        which rows exist. A collapsed group is simply a shorter list of resources.
                    </p>
                </div>

                <TeamDemo />
            </div>
        </section>

        <section id="features" class="section">
            <div class="wrap">
                <div class="section__head">
                    <p class="eyebrow">What you get</p>
                    <h2 class="section__title">One component, not a suite</h2>
                    <p class="section__lede">
                        The alternatives are either a calendar pretending to be a timeline, or a bundle you buy
                        whole. Lanes is a single controlled component: you pass rows and bars, you get told what
                        the user did, you decide what happens next.
                    </p>
                </div>

                <div class="grid">
                    <article v-for="feature in FEATURES" :key="feature.title" class="card feature">
                        <span class="card__icon"><Icon :name="feature.icon" :size="19" /></span>
                        <h3 class="card__title">{{ feature.title }}</h3>
                        <p class="card__text">{{ feature.text }}</p>
                    </article>
                </div>
            </div>
        </section>

        <section id="start" class="section">
            <div class="wrap start">
                <div class="start__text">
                    <p class="eyebrow">Quick start</p>
                    <h2 class="section__title">Two imports and an array</h2>
                    <p class="section__lede">
                        No provider, no store, no init call. The visible range is yours to own — move it with
                        <code>useTimelineRange</code> or with your own router state.
                    </p>

                    <ul class="start__list">
                        <li v-for="point in START_POINTS" :key="point">{{ point }}</li>
                    </ul>
                </div>

                <CodeBlock filename="Schedule.vue" :code="QUICK_START" />
            </div>
        </section>

        <section id="pro" class="section">
            <div class="wrap">
                <div class="section__head">
                    <p class="eyebrow">Pro plugins</p>
                    <h2 class="section__title">The half that lets users change things</h2>
                    <p class="section__lede">
                        Gestures ship as plugins through the same <code>plugins</code> prop any third-party
                        extension would use. Nothing in the free half is crippled to make room for them, and
                        nothing here phones home.
                    </p>
                </div>

                <div class="grid pro__grid">
                    <article v-for="plugin in PLUGINS" :key="plugin.name" class="card">
                        <span class="card__icon"><Icon :name="plugin.icon" :size="19" /></span>
                        <h3 class="card__title">
                            <code>{{ plugin.name }}</code>
                        </h3>
                        <p class="card__text">{{ plugin.text }}</p>
                    </article>
                </div>

                <div class="pro__code">
                    <CodeBlock filename="Schedule.vue — with gestures" :code="PRO_SNIPPET" />
                </div>
            </div>
        </section>

        <section id="licence" class="section">
            <div class="wrap">
                <div class="section__head">
                    <p class="eyebrow">Licence</p>
                    <h2 class="section__title">Buy it because it works, not because it stopped</h2>
                    <p class="section__lede">
                        The key is a signed string you hand to <code>setLicense</code>. It is checked offline,
                        it never expires the version you already bought, and without it the plugins keep
                        working — you get a console notice and a small corner badge, and that is all.
                    </p>
                </div>

                <div class="plans">
                    <article class="card plan">
                        <h3 class="plan__name">Core</h3>
                        <p class="plan__price">Free</p>
                        <p class="plan__note">Including commercial products.</p>
                        <ul class="plan__list">
                            <li v-for="line in CORE_INCLUDES" :key="line">{{ line }}</li>
                        </ul>
                        <a class="btn btn--ghost plan__cta" :href="NPM" rel="noreferrer">
                            <Icon name="npm" :size="17" />
                            npm i lanesjs
                        </a>
                    </article>

                    <article class="card plan plan--pro">
                        <span class="tag tag--accent plan__badge">Pro</span>
                        <h3 class="plan__name">Pro plugins</h3>
                        <p class="plan__price">{{ PRO_PRICE }}</p>
                        <p class="plan__note">{{ PRO_TERMS }}</p>
                        <ul class="plan__list">
                            <li v-for="line in PRO_INCLUDES" :key="line">{{ line }}</li>
                        </ul>
                        <a class="btn btn--primary plan__cta" :href="ISSUES" rel="noreferrer">
                            Request a key
                            <Icon name="external" :size="15" />
                        </a>
                    </article>
                </div>

                <p class="licence__fine">
                    That is an introductory price, and it says so because the API is still allowed to move
                    before 1.0. Keys are issued by hand until the store is up. Read
                    <a :href="LICENCE_FILE" rel="noreferrer">LICENSE.md</a> for the terms; the short version is
                    that you may build anything with the free half, including commercial products, but may not
                    republish it as a library of its own.
                </p>
            </div>
        </section>
    </main>

    <footer class="foot">
        <div class="wrap foot__inner">
            <p class="foot__left">
                <strong>Lanes</strong>
                <span>v{{ VERSION }} · in production in one application, API still allowed to move before 1.0</span>
            </p>

            <nav class="foot__links" aria-label="Project links">
                <a :href="REPO" rel="noreferrer"><Icon name="github" :size="16" />GitHub</a>
                <a :href="NPM" rel="noreferrer"><Icon name="npm" :size="16" />npm</a>
                <a :href="ISSUES" rel="noreferrer"><Icon name="shield" :size="16" />Issues</a>
            </nav>
        </div>
    </footer>
</template>

<script setup lang="ts">
/**
 * Сторінка проєкту. Один екран зверху донизу: демо, чим воно є, як почати,
 * що платне, скільки коштує.
 *
 * Тексти лежать константами, а не в розмітці: так їх видно списком і легко
 * правити, не розбираючи верстку. Локалізації немає й не планується — сторінка
 * англійською, бо пакет ставлять з npm.
 */
import { ref } from "vue";
import CodeBlock from "./components/CodeBlock.vue";
import Icon from "./components/Icon.vue";
import LiveDemo from "./components/LiveDemo.vue";
import TeamDemo from "./components/TeamDemo.vue";
import { useTheme } from "./theme";

declare const __LANES_VERSION__: string;

const VERSION = __LANES_VERSION__;

const REPO = "https://github.com/Polkilof/lanesjs";
const DOCS = "https://github.com/Polkilof/lanesjs#readme";
const NPM = "https://www.npmjs.com/package/lanesjs";
const ISSUES = "https://github.com/Polkilof/lanesjs/issues";
const LICENCE_FILE = "https://github.com/Polkilof/lanesjs/blob/main/LICENSE.md";

/**
 * Вступна ціна на час 0.x. Половина від найближчого аналога з тією ж моделлю
 * (FullCalendar Premium, $480) — і не тому, що компонент удвічі гірший, а тому
 * що поруч є безкоштовний Vue-native конкурент, а в нас 0.1.0 і одне
 * впровадження. Під $250 покупку проводить сам розробник, без закупівель;
 * для одноосібного вендора це важить більше за маржу.
 *
 * Що "introductory" написано вголос — теж рішення: підняти ціну на 1.0 тоді
 * буде виконанням обіцянки, а не зміною правил заднім числом.
 */
const PRO_PRICE = "$199";
const PRO_TERMS = "Per developer. Perpetual licence, one year of updates.";

const { theme, toggle } = useTheme();

const installed = ref(false);

async function copyInstall() {
    try {
        await navigator.clipboard.writeText("npm i lanesjs");
    } catch {
        return;
    }

    installed.value = true;
    setTimeout(() => (installed.value = false), 2000);
}

const STATS = [
    { value: "7.3 kB", label: "gzipped, component and all" },
    { value: "0", label: "runtime dependencies" },
    { value: "300+", label: "rows without a DOM cell each" },
    { value: "3.4+", label: "Vue, as a peer dependency" },
];

const FEATURES = [
    {
        icon: "rows",
        title: "Virtualized rows and axis",
        text: "Three hundred resources over a year cost three hundred rows in the DOM, not ninety thousand cells. There is no element per grid cell at all: the grid is a gradient, day states are full-height overlays.",
    },
    {
        icon: "shield",
        title: "Controlled, always",
        text: "No store inside, no fetching, no dates rewritten behind your back. The order of resources is the order of rows; the component sorts nothing and filters nothing.",
    },
    {
        icon: "calendar",
        title: "Day and week steps",
        text: "Week columns get a range label like 12-18 Mar, produced by Intl.DateTimeFormat.formatRange, which knows how every language abbreviates that. No locale files ship.",
    },
    {
        icon: "palette",
        title: "Themed by tokens",
        text: "Every colour is a --rt-* custom property, so your design system overrides them the way it overrides anything else. Light, dark, or whatever your app already decided.",
    },
    {
        icon: "keyboard",
        title: "Keyboard and screen readers",
        text: "Bars are reachable and labelled, the table announces itself, and the paid gestures have keyboard equivalents — dragging is never the only way to move something.",
    },
    {
        icon: "printer",
        title: "Prints the whole table",
        text: "One call renders every row, hands the page to the printer and puts virtualization back. What comes out is the schedule, not the visible slice of it.",
    },
] as const;

const START_POINTS = [
    "Dates are wall dates: YYYY-MM-DD, no time zone in the core.",
    "end is exclusive, so a one-day booking is 01 to 02.",
    "Anything of your own lives in meta and renders through a slot.",
];

const QUICK_START = [
    '<script setup lang="ts">',
    'import { ref } from "vue";',
    'import { Timeline } from "lanesjs";',
    'import "lanesjs/style.css";',
    "",
    "const resources = ref([",
    '    { id: "r1", title: "Room 101" },',
    '    { id: "r2", title: "Room 102" },',
    "]);",
    "",
    "const items = ref([",
    '    { id: "b1", resourceId: "r1",',
    '      start: "2026-03-02", end: "2026-03-06" },',
    '    { id: "b2", resourceId: "r2",',
    '      start: "2026-03-04", end: "2026-03-05" },',
    "]);",
    "",
    'const range = { start: "2026-03-01", end: "2026-04-01" };',
    "</" + "script>",
    "",
    "<template>",
    '    <Timeline :resources="resources" :items="items" :range="range" />',
    "</template>",
].join("\n");

const PLUGINS = [
    {
        icon: "move",
        name: "drag",
        text: "Move a bar to another row or another day, or take an edge and stretch it. You are asked on every step whether the target is allowed, so a forbidden drop looks forbidden while the finger is still down.",
    },
    {
        icon: "plus",
        name: "create",
        text: "Drag across empty space to select a range. You get the resource and the two dates; whether that becomes a booking is your call.",
    },
    {
        icon: "undo",
        name: "history",
        text: "Undo and redo over your data, not over ours. Each action hands the stack a pair of closures, because only your app knows what undoing it means.",
    },
    {
        icon: "link",
        name: "links",
        text: "Arrows between bars, redrawn on every layout change — dependencies, hand-overs, the next guest in the same room.",
    },
] as const;

const PRO_SNIPPET = [
    'import { drag, history } from "lanesjs/pro";',
    "",
    "const undoRedo = history();",
    "",
    "const plugins = [",
    "    drag({",
    "        onMove: (move) => save(move.item.id, move.to.id, move.start, move.end),",
    "        canMove: (move) => isFree(move.to, move.start, move.end),",
    "    }),",
    "    undoRedo,",
    "];",
].join("\n");

const CORE_INCLUDES = [
    "The timeline, the axis and the layout engine",
    "Day and week steps, two scroll modes, printing",
    "Slots, tokens, events and the plugin API",
    "Keyboard support and screen reader labels",
];

const PRO_INCLUDES = [
    "drag, create, history and links",
    "Offline key check — nothing is sent anywhere",
    "The version you bought keeps working forever",
    "Renew for another year at half price, or don't",
    "Readable source in the package, no obfuscation",
];
</script>

<style scoped>
.skip {
    position: absolute;
    left: -9999px;
    top: 0;
    z-index: 100;
    padding: 0.75rem 1rem;
    background: var(--accent);
    color: var(--accent-ink);
    border-radius: 0 0 8px 0;
}

.skip:focus {
    left: 0;
}

/* ---------- nav ---------- */

.nav {
    position: sticky;
    top: 0;
    z-index: 40;
    border-bottom: 1px solid var(--line-soft);
    background: color-mix(in srgb, var(--ink) 82%, transparent);
    backdrop-filter: blur(14px);
}

.nav__inner {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    height: 64px;
}

.nav__brand {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-weight: 600;
    letter-spacing: -0.01em;
}

.nav__mark {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 22px;
}

.nav__mark span {
    height: 4px;
    border-radius: 2px;
    background: var(--accent);
}

.nav__mark span:first-child {
    width: 100%;
}

.nav__mark span:last-child {
    width: 62%;
    margin-left: 38%;
    opacity: 0.55;
}

.nav__version {
    font-size: 0.68rem;
}

.nav__links {
    display: flex;
    gap: 1.4rem;
    margin-left: auto;
    font-size: 0.88rem;
    color: var(--text-2);
}

.nav__links a {
    padding-block: 0.25rem;
    border-bottom: 1px solid transparent;
    transition:
        color 160ms ease,
        border-color 160ms ease;
}

.nav__links a:hover {
    color: var(--text);
    border-color: var(--accent-line);
}

.nav__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.nav__theme {
    min-width: 40px;
    padding-inline: 0;
}

/* ---------- hero ---------- */

.hero {
    position: relative;
    padding-top: clamp(3rem, 7vw, 5.5rem);
    padding-bottom: clamp(3rem, 6vw, 4.5rem);
    overflow: hidden;
}

.hero__glow {
    position: absolute;
    inset: -30% 0 auto 0;
    height: 70vh;
    background: radial-gradient(48% 50% at 50% 40%, var(--accent-soft), transparent 70%);
    pointer-events: none;
}

.hero__inner {
    position: relative;
    max-width: 62rem;
    text-align: center;
}

.hero__title {
    font-size: var(--step-4);
    letter-spacing: -0.035em;
    margin-bottom: 1.25rem;
}

.hero__lede {
    max-width: 40rem;
    margin-inline: auto;
    color: var(--text-2);
    font-size: var(--step-1);
    line-height: 1.55;
    text-wrap: pretty;
}

.hero__cta {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 2rem;
}

.hero__install {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-family: var(--mono);
    font-size: 0.86rem;
    cursor: pointer;
    transition:
        border-color 160ms ease,
        background-color 160ms ease;
}

.hero__install:hover {
    border-color: var(--accent-line);
    background: var(--surface-2);
}

.hero__prompt {
    color: var(--accent);
}

.hero__note {
    margin-top: 1.1rem;
    font-size: 0.85rem;
    color: var(--text-3);
}

.hero__stage {
    position: relative;
    margin-top: clamp(2.5rem, 5vw, 3.5rem);
}

.hero__caption {
    max-width: 44rem;
    margin: 1rem auto 0;
    text-align: center;
    font-size: 0.85rem;
    color: var(--text-3);
    text-wrap: pretty;
}

.hero__caption strong {
    color: var(--text-2);
    font-weight: 500;
}

/* ---------- strip ---------- */

.strip {
    border-block: 1px solid var(--line-soft);
    background: var(--surface);
}

.strip__inner {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
}

.strip__item {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 1.5rem 0;
}

.strip__item + .strip__item {
    padding-left: 1.5rem;
    border-left: 1px solid var(--line-soft);
}

.strip__item strong {
    font-family: var(--mono);
    font-size: var(--step-2);
    font-weight: 500;
    letter-spacing: -0.02em;
}

.strip__item span {
    font-size: 0.82rem;
    color: var(--text-3);
}

/* ---------- features ---------- */

.feature:hover {
    border-color: var(--accent-line);
}

/* ---------- quick start ---------- */

.start {
    display: grid;
    gap: clamp(2rem, 4vw, 3.5rem);
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
    align-items: start;
}

.start__list {
    margin: 1.75rem 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    color: var(--text-2);
    font-size: 0.9rem;
}

.start__list li {
    position: relative;
    padding-left: 1.5rem;
}

.start__list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
}

/* ---------- pro ---------- */

.pro__grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
}

.pro__grid code {
    font-size: 0.95em;
    color: var(--accent);
}

.pro__code {
    margin-top: 1rem;
    max-width: 44rem;
}

/* ---------- licence ---------- */

.plans {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    max-width: 52rem;
}

.plan {
    display: flex;
    flex-direction: column;
    position: relative;
}

.plan--pro {
    border-color: var(--accent-line);
    background: linear-gradient(var(--accent-soft), transparent 40%), var(--surface);
}

.plan__badge {
    position: absolute;
    top: 1.25rem;
    right: 1.25rem;
}

.plan__name {
    font-size: var(--step-1);
}

.plan__price {
    margin-top: 0.35rem;
    font-size: var(--step-2);
    font-weight: 600;
    letter-spacing: -0.02em;
}

.plan__note {
    margin-top: 0.25rem;
    font-size: 0.85rem;
    color: var(--text-3);
}

.plan__list {
    margin: 1.25rem 0 1.75rem;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    font-size: 0.88rem;
    color: var(--text-2);
}

.plan__list li {
    position: relative;
    padding-left: 1.4rem;
}

.plan__list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.42em;
    width: 9px;
    height: 5px;
    border-left: 1.5px solid var(--accent);
    border-bottom: 1.5px solid var(--accent);
    transform: rotate(-45deg);
}

.plan__cta {
    margin-top: auto;
    align-self: flex-start;
}

.licence__fine {
    max-width: 44rem;
    margin-top: 2rem;
    font-size: 0.85rem;
    color: var(--text-3);
}

.licence__fine a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 3px;
}

/* ---------- footer ---------- */

.foot {
    border-top: 1px solid var(--line-soft);
    background: var(--surface);
}

.foot__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
    padding-block: 2rem;
}

.foot__left {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.85rem;
    color: var(--text-3);
}

.foot__links {
    display: flex;
    gap: 1.25rem;
    font-size: 0.88rem;
    color: var(--text-2);
}

.foot__links a {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    transition: color 160ms ease;
}

.foot__links a:hover {
    color: var(--accent);
}

/* ---------- shared inline code ---------- */

.section__lede code,
.start__text code {
    padding: 0.1em 0.35em;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--surface-2);
    font-size: 0.85em;
    color: var(--text);
}

@media (max-width: 900px) {
    .nav__links {
        display: none;
    }

    .start {
        grid-template-columns: 1fr;
    }

    .strip__item + .strip__item {
        padding-left: 0;
        border-left: none;
        border-top: 1px solid var(--line-soft);
    }
}

@media (max-width: 560px) {
    .nav__github span {
        display: none;
    }
}
</style>
