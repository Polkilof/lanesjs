<template>
    <div class="team">
        <div class="team__bar">
            <div class="team__group">
                <button type="button" class="team__icon" aria-label="Previous month" @click="prev">
                    <Icon name="left" :size="16" />
                </button>
                <button type="button" class="team__today" @click="today">Today</button>
                <button type="button" class="team__icon" aria-label="Next month" @click="next">
                    <Icon name="right" :size="16" />
                </button>
                <strong class="team__month">{{ title }}</strong>
            </div>

            <button type="button" class="team__toggle-all" @click="toggleAll">
                {{ allOpen ? "Collapse all" : "Expand all" }}
            </button>
        </div>

        <Timeline
            class="team__timeline"
            label="Team schedule"
            :resources="seats"
            :items="work"
            :range="range"
            :theme="theme"
            :item-class="workClass"
            :item-label="workLabel"
            :slot-width="34"
            :resource-width="196"
            locale="en-GB"
        >
            <template #corner>
                <span class="team__corner">Team</span>
            </template>

            <!--
                Уся ієрархія — тут. Компонент бачить плоский список рядків і не
                знає, що якісь із них комусь належать: трикутник, відступ і «+»
                малює застосунок у слоті, як і будь-що своє.
            -->
            <template #resource="{ resource }">
                <div v-if="resource.meta?.kind === 'team'" class="team__head">
                    <button
                        type="button"
                        class="team__chevron"
                        :aria-expanded="expanded.has(resource.id)"
                        :aria-label="(expanded.has(resource.id) ? 'Collapse ' : 'Expand ') + resource.title"
                        @click="toggle(resource.id)"
                    >
                        <Icon :name="expanded.has(resource.id) ? 'down' : 'right'" :size="14" />
                    </button>
                    <span class="team__name">{{ resource.title }}</span>
                    <span class="team__count">{{ sizeOf(resource.id) }}</span>
                    <button
                        type="button"
                        class="team__add"
                        :aria-label="'Add someone to ' + resource.title"
                        @click="openForm(resource.id)"
                    >
                        <Icon name="plus" :size="14" />
                    </button>
                </div>

                <div v-else class="team__person">
                    <strong>{{ resource.title }}</strong>
                    <small>{{ resource.meta?.role }}</small>
                </div>
            </template>

            <template #item="{ placed }">
                <span class="team__work">{{ placed.item.meta?.title }}</span>
            </template>
        </Timeline>

        <p class="team__log" role="status">
            <span>{{ seats.length }} rows · {{ teams.length }} teams · {{ people }} people</span>
        </p>

        <!--
            Форма нового рядка. У справжньому застосунку тут була б ваша модалка
            з вашими полями й вашим збереженням; таймлайн про неї не знає нічого
            і дізнається лише про новий рядок у `resources`.
        -->
        <div v-if="form !== null" class="team__form-backdrop" @click.self="form = null">
            <form class="team__form" @submit.prevent="save">
                <h3 class="team__form-title">Add to {{ nameOf(form.teamId) }}</h3>

                <label class="team__field">
                    <span>Name</span>
                    <input ref="nameRef" v-model="form.name" type="text" required placeholder="J. Whitfield" />
                </label>

                <label class="team__field">
                    <span>Role</span>
                    <input v-model="form.role" type="text" required placeholder="Frontend" />
                </label>

                <div class="team__form-actions">
                    <button type="button" class="team__ghost" @click="form = null">Cancel</button>
                    <button type="submit" class="team__save">Save</button>
                </div>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * Другий сценарій того самого компонента: команди замість номерів.
 *
 * Написаний, щоб перевірити здогад, а не щоб її проілюструвати: чи вміє
 * застосунок зробити групування сам, без жодної зміни в бібліотеці. Виявилось,
 * що вміє, і причина в рішенні 04 — ядро не сортує й не фільтрує, тож «згорнути
 * команду» це не його справа, а коротший масив `resources` від застосунку.
 *
 * Тому тут немає нічого, чого не міг би написати покупець: слот `#resource`,
 * власний стан і власна форма.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { Timeline, useTimelineRange } from "lanesjs";
import type { PlacedItem, Resource } from "lanesjs";
import Icon from "./Icon.vue";
import { TEAMS, buildSeats, buildWork } from "../team-data";
import type { Seat, Work } from "../team-data";
import { useTheme } from "../theme";

const { theme } = useTheme();
const { range, title, prev, next, today } = useTimelineRange({ unit: "month", locale: "en-GB" });

/** Команди мутуються: у демо можна додати людину. */
const teams = ref(TEAMS.map((team) => ({ ...team, members: [...team.members] })));

/**
 * Розгорнуті команди. Множина замінюється цілком, а не мутується: інакше Vue
 * не побачить зміни й рядки не перемалюються.
 */
const expanded = ref(new Set(TEAMS.map((team) => team.id)));

const seats = computed<Resource<Seat>[]>(() => buildSeats(teams.value, expanded.value));
const work = computed(() => buildWork(range.value));

const people = computed(() => teams.value.reduce((sum, team) => sum + team.members.length, 0));
const allOpen = computed(() => expanded.value.size === teams.value.length);

function toggle(id: string) {
    const open = new Set(expanded.value);
    if (!open.delete(id)) open.add(id);
    expanded.value = open;
}

function toggleAll() {
    expanded.value = allOpen.value ? new Set<string>() : new Set(teams.value.map((team) => team.id));
}

function sizeOf(id: string): string {
    const count = teams.value.find((team) => team.id === id)?.members.length ?? 0;
    return count === 1 ? "1 person" : count + " people";
}

function nameOf(id: string): string {
    return teams.value.find((team) => team.id === id)?.title ?? "";
}

function workClass(placed: PlacedItem<Work>): string {
    return "team__work-bar team__work-bar--" + (placed.item.meta?.kind ?? "feature");
}

/** Ім'я для тих, хто бара не бачить: типове було б рядком і датами. */
function workLabel(placed: PlacedItem<Work>, resource: Resource<Seat>): string {
    return placed.item.meta?.title + ", " + resource.title + ", from " + placed.item.start;
}

interface Form {
    teamId: string;
    name: string;
    role: string;
}

const form = ref<Form | null>(null);
const nameRef = ref<HTMLInputElement | null>(null);

async function openForm(teamId: string) {
    form.value = { teamId, name: "", role: "" };
    await nextTick();
    nameRef.value?.focus();
}

/**
 * Збереження додає рядок і розгортає команду: інакше людина натисне «+», і на
 * екрані не зміниться нічого — новий рядок опиниться під згорнутою командою.
 */
function save() {
    const draft = form.value;
    if (draft === null) return;

    const team = teams.value.find((candidate) => candidate.id === draft.teamId);
    if (team === undefined) return;

    team.members.push({
        id: "p-" + Date.now(),
        title: draft.name.trim(),
        role: draft.role.trim(),
    });

    const open = new Set(expanded.value);
    open.add(draft.teamId);
    expanded.value = open;
    form.value = null;
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") form.value = null;
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.team {
    /* Скільки місця забирає трикутник разом із проміжком. Назва людини
       відступає рівно на стільки, тож обидві назви починаються з однієї
       вертикалі й не можуть розійтись при зміні розміру іконки. */
    --team-chevron: 20px;
    --team-gap: 6px;
    --team-indent: calc(var(--team-chevron) + var(--team-gap));

    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    overflow: hidden;
}

.team__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--line-soft);
    background: var(--surface-2);
}

.team__group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.team__icon,
.team__today,
.team__toggle-all {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
}

.team__icon {
    padding: 0.35rem;
}

.team__icon:hover,
.team__today:hover,
.team__toggle-all:hover {
    border-color: var(--accent);
    color: var(--accent);
}

.team__month {
    margin-left: 0.4rem;
    font-size: 0.9rem;
}

.team__timeline {
    height: 372px;
}

.team__corner {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-3);
}

/* Заголовок команди: трикутник, назва, розмір і «+». */
.team__head {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: var(--team-gap);
    height: 100%;
}

.team__chevron,
.team__add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--team-chevron);
    height: var(--team-chevron);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-2);
    cursor: pointer;
}

.team__chevron:hover,
.team__add:hover {
    background: var(--surface-2);
    color: var(--accent);
}

.team__name {
    font-weight: 600;
    font-size: 0.82rem;
}

.team__count {
    margin-left: auto;
    font-size: 0.68rem;
    white-space: nowrap;
    color: var(--text-3);
}

/* Відступ показує належність — теж робота застосунку, не компонента. */
.team__person {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    height: 100%;
    padding-left: var(--team-indent);
    line-height: 1.25;
}

.team__person strong {
    font-size: 0.8rem;
    font-weight: 500;
}

.team__person small {
    font-size: 0.68rem;
    color: var(--text-3);
}

.team__work {
    overflow: hidden;
    text-overflow: ellipsis;
}

.team__log {
    display: flex;
    align-items: center;
    padding: 0.7rem 1rem;
    border-top: 1px solid var(--line-soft);
    background: var(--surface-2);
    font-size: 0.8rem;
    color: var(--text-2);
}

.team__form-backdrop {
    position: absolute;
    inset: 0;
    z-index: 8;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: rgb(0 0 0 / 45%);
}

.team__form {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: min(300px, 100%);
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2);
}

.team__form-title {
    margin: 0;
    font-size: 0.95rem;
}

.team__field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.78rem;
    color: var(--text-2);
}

.team__field input {
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
}

.team__field input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
}

.team__form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.2rem;
}

.team__ghost,
.team__save {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
}

.team__save {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
}

/* Тісніше за типове: у панелі стоять дві кнопки, і 12px з кожного боку з'їдають
   рівно ту ширину, якої бракує назві команди. */
.team__timeline :deep(.rt__resource) {
    padding: 0 6px;
}

.team__timeline :deep(.rt__bar) {
    font-size: 11px;
}

.team__timeline :deep(.team__work-bar--feature) {
    --rt-bar-bg: var(--accent);
}

.team__timeline :deep(.team__work-bar--review) {
    --rt-bar-bg: var(--bar-stay);
    --rt-bar-text: var(--bar-stay-ink);
}

.team__timeline :deep(.team__work-bar--leave) {
    --rt-bar-bg: var(--bar-hold);
    --rt-bar-text: var(--bar-hold-ink);
}
</style>
