<template>
    <figure class="code">
        <figcaption v-if="filename" class="code__head">
            <span class="code__name">{{ filename }}</span>
            <button
                type="button"
                class="code__copy"
                :aria-label="copied ? 'Copied' : 'Copy code to clipboard'"
                @click="copy"
            >
                <Icon :name="copied ? 'check' : 'copy'" :size="14" />
                <span>{{ copied ? "Copied" : "Copy" }}</span>
            </button>
        </figcaption>

        <pre class="code__body" tabindex="0"><code v-html="highlighted" /></pre>
    </figure>
</template>

<script setup lang="ts">
/**
 * Блок коду з підсвіткою. Підсвітка своя й навмисно дурна: на сторінці шість
 * фрагментів, усі наші, і жоден із них не містить нічого, на чому спіткнеться
 * десяток регулярок. Повноцінний highlighter коштував би більше, ніж уся
 * бібліотека, про яку ця сторінка.
 */
import { computed, ref } from "vue";
import Icon from "./Icon.vue";

const props = defineProps<{ code: string; filename?: string }>();

const copied = ref(false);
let clearing: ReturnType<typeof setTimeout> | null = null;

async function copy() {
    try {
        await navigator.clipboard.writeText(props.code);
    } catch {
        // Буфер обміну без https або без дозволу. Мовчимо: код видно на
        // екрані, виділити його руками ніхто не заважає.
        return;
    }

    copied.value = true;
    if (clearing !== null) clearTimeout(clearing);
    clearing = setTimeout(() => (copied.value = false), 2000);
}

const KEYWORDS =
    "import|from|export|default|const|let|function|return|type|interface|new|await|async|true|false|null|undefined|as|if|else|for|of|in";

// Порядок гілок — це і є правила: коментар з'їдає все до кінця рядка раніше,
// ніж рядок устигне почати лапку всередині нього.
const PATTERN = new RegExp(
    [
        "(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|&lt;!--[\\s\\S]*?--&gt;)",
        "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*')",
        "(&lt;\\/?[A-Za-z][\\w.-]*)",
        "\\b(" + KEYWORDS + ")\\b",
        "\\b(\\d[\\d.]*)\\b",
    ].join("|"),
    "g",
);

function escape(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const highlighted = computed(() =>
    escape(props.code).replace(PATTERN, (match, comment, string, tag, keyword, number) => {
        if (comment !== undefined) return '<span class="tok-com">' + match + "</span>";
        if (string !== undefined) return '<span class="tok-str">' + match + "</span>";
        if (tag !== undefined) return '<span class="tok-tag">' + match + "</span>";
        if (keyword !== undefined) return '<span class="tok-key">' + match + "</span>";
        if (number !== undefined) return '<span class="tok-num">' + match + "</span>";
        return match;
    }),
);
</script>

<style scoped>
.code {
    margin: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
}

.code__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border-bottom: 1px solid var(--line-soft);
    background: var(--surface-2);
}

.code__name {
    font-family: var(--mono);
    font-size: 0.78rem;
    color: var(--text-3);
}

.code__copy {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 32px;
    padding: 0 0.6rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 0.78rem;
    cursor: pointer;
    transition:
        background-color 160ms ease,
        color 160ms ease;
}

.code__copy:hover {
    background: var(--surface-3);
    color: var(--text);
}

.code__body {
    margin: 0;
    padding: 1.1rem 1.25rem;
    overflow-x: auto;
    font-size: 0.82rem;
    line-height: 1.7;
    tab-size: 4;
}

.code__body code {
    white-space: pre;
}
</style>
