<template>
    <svg
        class="icon"
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        <path v-for="(d, index) in paths" :key="index" :d="d" />
    </svg>
</template>

<script setup lang="ts">
/**
 * Іконки сторінки. Свій набір, а не пакет: їх тут два десятки, усі однієї
 * сітки 24×24 і однієї товщини, і тягнути заради них залежність — платити
 * кілобайтами за те, що вміщається в один файл.
 *
 * Емодзі як іконки не використовуються навмисно: вони різні в кожній системі,
 * не фарбуються токеном і не мають спільної товщини лінії.
 */
import { computed } from "vue";

type IconName =
    | "rows"
    | "bolt"
    | "package"
    | "keyboard"
    | "printer"
    | "palette"
    | "move"
    | "plus"
    | "undo"
    | "link"
    | "github"
    | "npm"
    | "sun"
    | "moon"
    | "copy"
    | "check"
    | "left"
    | "right"
    | "calendar"
    | "shield"
    | "code"
    | "external"
    | "close"
    | "down";

const ICONS: Record<IconName, string[]> = {
    rows: ["M3 6h18", "M3 12h18", "M3 18h18"],
    close: ["M6 6l12 12", "M18 6l-12 12"],
    down: ["M6 9l6 6 6-6"],
    bolt: ["M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"],
    package: ["M12 2 3 7v10l9 5 9-5V7l-9-5z", "M3 7l9 5 9-5", "M12 12v10"],
    keyboard: [
        "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
        "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8",
    ],
    printer: [
        "M6 9V3h12v6",
        "M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2",
        "M6 14h12v7H6z",
    ],
    palette: [
        "M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a2 2 0 0 0-1.4 3.4A1.9 1.9 0 0 1 12 21z",
        "M7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01",
    ],
    move: ["M5 9 2 12l3 3", "M9 5l3-3 3 3", "M15 19l-3 3-3-3", "M19 9l3 3-3 3", "M2 12h20", "M12 2v20"],
    plus: [
        "M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5z",
        "M12 8v8",
        "M8 12h8",
    ],
    undo: ["M3 8h11a5 5 0 0 1 0 10H8", "M7 4 3 8l4 4"],
    link: ["M6 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M18 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", "M9 9h4a4 4 0 0 1 4 4v2"],
    github: [
        "M9 19c-5 1.5-5-2.5-7-3m14 6v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.7A5.2 5.2 0 0 0 20 5.4a4.9 4.9 0 0 0-.1-3.6s-1.1-.3-3.6 1.4a12.3 12.3 0 0 0-6.6 0C7.2 1.5 6.1 1.8 6.1 1.8A4.9 4.9 0 0 0 6 5.4a5.2 5.2 0 0 0-1.4 3.6c0 5.2 3.2 6.4 6.2 6.7a3.4 3.4 0 0 0-.9 2.6V22",
    ],
    npm: ["M2 7h20v10H2z", "M6 17V11h3v6M9 11h2v3", "M13 17v-6h4v6M15 11v3"],
    sun: [
        "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
        "M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
    ],
    moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
    copy: [
        "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z",
        "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
    ],
    check: ["M20 6 9 17l-5-5"],
    left: ["M15 18l-6-6 6-6"],
    right: ["M9 18l6-6-6-6"],
    calendar: ["M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M3 10h18", "M8 3v4M16 3v4"],
    shield: ["M12 2 4 5v7c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V5l-8-3z"],
    code: ["M8 6 2 12l6 6", "M16 6l6 6-6 6", "M13.5 4 10.5 20"],
    external: ["M14 4h6v6", "M20 4 10 14", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
};

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });

/**
 * Обчислюване, а не сталa: `name` у половини викликів залежить від стану —
 * тема, «скопійовано», розгорнута команда. Прочитане один раз при створенні,
 * воно назавжди лишало першу іконку, і жодна з них не мінялась.
 */
const paths = computed(() => ICONS[props.name]);
</script>

<style scoped>
.icon {
    display: block;
    flex: none;
}
</style>
