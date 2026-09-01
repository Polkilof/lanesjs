<template>
    <div ref="rootRef" class="demo">
        <div class="demo__bar">
            <div class="demo__group demo__group--nav">
                <button type="button" class="demo__icon" aria-label="Previous month" @click="prev">
                    <Icon name="left" :size="16" />
                </button>
                <button type="button" class="demo__today" @click="today">Today</button>
                <button type="button" class="demo__icon" aria-label="Next month" @click="next">
                    <Icon name="right" :size="16" />
                </button>
                <strong class="demo__month">{{ title }}</strong>
            </div>

            <div class="demo__group">
                <span id="demo-rows" class="demo__label">Rows</span>
                <div class="demo__segmented" role="group" aria-labelledby="demo-rows">
                    <button
                        v-for="option in ROW_COUNTS"
                        :key="option"
                        type="button"
                        class="demo__segment"
                        :class="{ 'demo__segment--on': roomCount === option }"
                        :aria-pressed="roomCount === option"
                        @click="roomCount = option"
                    >
                        {{ option }}
                    </button>
                </div>
            </div>

            <div class="demo__group">
                <span id="demo-step" class="demo__label">Step</span>
                <div class="demo__segmented" role="group" aria-labelledby="demo-step">
                    <button
                        type="button"
                        class="demo__segment"
                        :class="{ 'demo__segment--on': step === 'day' }"
                        :aria-pressed="step === 'day'"
                        @click="step = 'day'"
                    >
                        Day
                    </button>
                    <button
                        type="button"
                        class="demo__segment"
                        :class="{ 'demo__segment--on': step === 'week' }"
                        :aria-pressed="step === 'week'"
                        @click="step = 'week'"
                    >
                        Week
                    </button>
                </div>
            </div>

            <div class="demo__group demo__group--pro">
                <button
                    type="button"
                    class="demo__toggle"
                    :class="{ 'demo__toggle--on': editable }"
                    :aria-pressed="editable"
                    @click="editable = !editable"
                >
                    <Icon name="move" :size="15" />
                    Drag &amp; create
                </button>
                <button
                    type="button"
                    class="demo__toggle"
                    :class="{ 'demo__toggle--on': linked }"
                    :aria-pressed="linked"
                    @click="linked = !linked"
                >
                    <Icon name="link" :size="15" />
                    Links
                </button>

                <template v-if="editable">
                    <button
                        type="button"
                        class="demo__icon"
                        aria-label="Undo"
                        :disabled="!canUndo"
                        @click="undoRedo.undo()"
                    >
                        <Icon name="undo" :size="16" />
                    </button>
                    <button
                        type="button"
                        class="demo__icon demo__icon--flip"
                        aria-label="Redo"
                        :disabled="!canRedo"
                        @click="undoRedo.redo()"
                    >
                        <Icon name="undo" :size="16" />
                    </button>
                </template>
            </div>
        </div>

        <Timeline
            :key="pluginKey"
            class="demo__timeline"
            label="Room availability"
            :resources="rooms"
            :items="bookings"
            :range="range"
            :step="step"
            :plugins="plugins"
            :theme="theme"
            :item-class="statusClass"
            :item-label="bookingLabel"
            :slot-width="step === 'week' ? 92 : 40"
            :resource-width="164"
            locale="en-GB"
            @cell-click="onCellClick"
            @item-click="onItemClick"
        >
            <template #corner>
                <span class="demo__corner">Room</span>
            </template>

            <template #resource="{ resource }">
                <span class="demo__room">
                    <strong>{{ resource.title }}</strong>
                    <small>{{ resource.meta?.kind }} · {{ beds(resource.meta?.beds) }}</small>
                </span>
            </template>

            <template #item="{ placed }">
                <span class="demo__guest">{{ placed.item.meta?.guest }}</span>
            </template>
        </Timeline>

        <!--
            Картка над баром. Нічого спеціального для неї в бібліотеці немає:
            вона стоїть за `target` із payload кліку — тим самим елементом бара.
        -->
        <div
            v-if="popup !== null"
            class="demo__popup"
            role="dialog"
            aria-label="Booking details"
            :style="{ top: popup.top + 'px', left: popup.left + 'px', width: POPUP_WIDTH + 'px' }"
        >
            <div class="demo__popup-head">
                <strong>{{ popup.item.meta?.guest }}</strong>
                <button
                    type="button"
                    class="demo__popup-close"
                    aria-label="Close"
                    @click="popup = null"
                >
                    <Icon name="close" :size="14" />
                </button>
            </div>
            <dl class="demo__popup-rows">
                <dt>Room</dt>
                <dd>{{ popup.room }}</dd>
                <dt>Arrives</dt>
                <dd>{{ popup.item.start }}</dd>
                <dt>Leaves</dt>
                <dd>{{ popup.item.end }}</dd>
                <dt>Stay</dt>
                <dd>{{ nights(popup.item.start, popup.item.end) }}</dd>
            </dl>
        </div>

        <p class="demo__log" role="status">
            <Icon :name="lastAction === '' ? 'calendar' : 'bolt'" :size="14" />
            <span>{{ lastAction === "" ? HINT : lastAction }}</span>
            <span class="demo__count">{{ rooms.length }} rows · {{ bookings.length }} bookings</span>
        </p>
    </div>
</template>

<script setup lang="ts">
/**
 * Живе демо на головній. Це не окремий приклад, а той самий компонент, що його
 * ставить споживач: усе, що тут робиться — робиться пропами й слотами з
 * README, без жодного заглядання всередину.
 *
 * Дані належать сторінці, а не таймлайну: плагіни лише повідомляють, куди
 * користувач щось переніс, а вирішує накладка moves. Так само зробить і
 * застосунок, який ходить по це в API.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Timeline, diffDays, toEpoch, useTimelineRange } from "lanesjs";
import { create, drag, history, links } from "lanesjs/pro";
import type { Item, PlacedItem, Plugin, Resource, SlotStep } from "lanesjs";
import type { DragCreate, DragMove, DragResize, Link } from "lanesjs/pro";
import Icon from "./Icon.vue";
import { buildBookings, buildRooms } from "../demo-data";
import type { Booking, Room } from "../demo-data";
import { useTheme } from "../theme";

const ROW_COUNTS = [12, 60, 300];
const HINT = "Click a booking, or turn on drag to move one";

const { theme } = useTheme();

const roomCount = ref(12);
const step = ref<SlotStep>("day");
const editable = ref(false);
const linked = ref(false);
const lastAction = ref("");

/** Картка прив'язується до бара, тож рахуємо від краю демо, а не сторінки. */
const rootRef = ref<HTMLElement | null>(null);
const POPUP_WIDTH = 232;
const POPUP_HEIGHT = 168;

const { range, title, prev, next, today } = useTimelineRange({ unit: "month", locale: "en-GB" });

const rooms = computed(() => buildRooms(roomCount.value));

/** Те, що згенеровано; переїзди й нові броні лежать окремо й накладаються. */
const generated = computed(() => buildBookings(rooms.value, range.value));

interface Placement {
    resourceId: string;
    start: string;
    end: string;
}

const moves = ref(new Map<string, Placement>());
const added = ref<Item<Booking>[]>([]);

const canUndo = ref(false);
const canRedo = ref(false);
const undoRedo = history<Room, Booking>({
    onChange: () => {
        canUndo.value = undoRedo.canUndo();
        canRedo.value = undoRedo.canRedo();
    },
});

// Місяць змінився — попередні переїзди стосуються вже неіснуючих броней.
watch(range, () => {
    moves.value = new Map();
    added.value = [];
    undoRedo.clear();
});

const bookings = computed<Item<Booking>[]>(() =>
    // Накладка лягає на все, а не лише на згенероване: створена бронь така
    // сама бронь, і переїзди мають діяти й на неї. Поки added дописувався в
    // кінець уже після накладки, щойно створене неможливо було зрушити.
    [...generated.value, ...added.value].map((booking) => {
        const placement = moves.value.get(booking.id);
        return placement === undefined ? booking : { ...booking, ...placement };
    }),
);

/** Ланцюжок заїздів у номері: після виїзду одного — заїзд наступного. */
const chains = computed<Link[]>(() => {
    const byRoom = new Map<string, Item<Booking>[]>();

    for (const booking of bookings.value) {
        if (booking.display === "background") continue;
        byRoom.set(booking.resourceId, [...(byRoom.get(booking.resourceId) ?? []), booking]);
    }

    const result: Link[] = [];
    for (const list of byRoom.values()) {
        const ordered = [...list].sort((left, right) => left.start.localeCompare(right.start));
        for (let index = 1; index < ordered.length; index++) {
            result.push({ from: ordered[index - 1].id, to: ordered[index].id });
        }
    }
    return result;
});

/**
 * Плагіни читаються один раз на монтуванні, тож перемикачі мають піднімати
 * таймлайн наново — звідси ключ.
 */
const pluginKey = computed(() => (editable.value ? "e" : "") + (linked.value ? "l" : "") + step.value);

const plugins = computed<Plugin<Room, Booking>[]>(() => {
    const list: Plugin<Room, Booking>[] = [];

    if (editable.value) {
        list.push(
            drag<Room, Booking>({
                onMove: applyMove,
                onResize: applyResize,
                canMove: (move) => isFree(move.to.id, move.start, move.end, move.item.id),
                canResize: (resize) => isFree(resize.resource.id, resize.start, resize.end, resize.item.id),
            }),
            create<Room, Booking>({
                onCreate: applyCreate,
                canCreate: (created) => isFree(created.resource.id, created.start, created.end),
                doubleClick: true,
            }),
            undoRedo,
        );
    }

    if (linked.value) list.push(links<Room, Booking>({ links: () => chains.value }));

    return list;
});

/**
 * Правило готелю: дві броні не стоять в одному номері одночасно. Питається на
 * кожному русі, тож заборонене місце видно ще під час жесту.
 */
function isFree(resourceId: string, start: string, end: string, exceptId?: string): boolean {
    return !bookings.value.some(
        (booking) =>
            booking.resourceId === resourceId &&
            booking.id !== exceptId &&
            booking.start < end &&
            start < booking.end,
    );
}

function applyMove(move: DragMove<Room, Booking>) {
    record(move.item.id, { resourceId: move.to.id, start: move.start, end: move.end });
    lastAction.value =
        "Moved " + move.item.meta?.guest + " to room " + move.to.title + ": " + span(move.start, move.end);
}

function applyResize(resize: DragResize<Room, Booking>) {
    record(resize.item.id, { resourceId: resize.resource.id, start: resize.start, end: resize.end });
    lastAction.value = "Stretched " + resize.item.meta?.guest + ": " + span(resize.start, resize.end);
}

function applyCreate(created: DragCreate<Room>) {
    const booking: Item<Booking> = {
        id: "new-" + (added.value.length + 1),
        resourceId: created.resource.id,
        start: created.start,
        end: created.end,
        meta: { guest: "New booking", status: "pending" },
    };

    added.value = [...added.value, booking];
    undoRedo.push({
        label: "create",
        undo: () => (added.value = added.value.filter((candidate) => candidate.id !== booking.id)),
        redo: () => (added.value = [...added.value, booking]),
    });

    lastAction.value = "New booking in room " + created.resource.title + ": " + span(created.start, created.end);
}

/**
 * Правка плюс запис у стек. Що саме відкотити, знає лише сторінка — плагін
 * даними не володіє, тож дістає від нас пару замикань.
 */
function record(id: string, next: Placement) {
    const previous = moves.value.get(id);

    remember(id, next);
    undoRedo.push({
        label: "move",
        undo: () => (previous === undefined ? forget(id) : remember(id, previous)),
        redo: () => remember(id, next),
    });
}

function remember(id: string, placement: Placement) {
    const updated = new Map(moves.value);
    updated.set(id, placement);
    moves.value = updated;
}

function forget(id: string) {
    const updated = new Map(moves.value);
    updated.delete(id);
    moves.value = updated;
}

function beds(count: number | undefined): string {
    return count === 1 ? "1 bed" : count + " beds";
}

/**
 * end ексклюзивний, тож "13 → 15" — це дві ночі, а не три. Самі дати цього не
 * кажуть, і рядок читається як помилка на день: саме так його й прочитали.
 * Лічильник ночей знімає питання, не ховаючи контракт.
 */
function nights(start: string, end: string): string {
    const count = diffDays(toEpoch(start), toEpoch(end));
    return count + (count === 1 ? " night" : " nights");
}

/** Проміжок для очей: стрілка, а не "to", бо "to" читається як "включно по". */
function span(start: string, end: string): string {
    return start + " → " + end + " · " + nights(start, end);
}

function statusClass(placed: PlacedItem<Booking>): string {
    return "demo__bar--" + (placed.item.meta?.status ?? "confirmed");
}

function bookingLabel(placed: PlacedItem<Booking>, resource: Resource<Room>): string {
    const item = placed.item;
    // Читачеві екрана стрілка нічого не скаже, тож тут словами.
    return `${item.meta?.guest}, room ${resource.title}, from ${item.start} to ${item.end}, ${nights(item.start, item.end)}`;
}

function onCellClick(payload: { date: string; resource: Resource<Room> }) {
    popup.value = null;
    lastAction.value = "Empty cell: room " + payload.resource.title + ", " + payload.date;
}

/**
 * Картка над баром. Показана тут, бо саме про це найчастіше питають, дивлячись
 * на демо: чи можна відкрити щось своє поверх події.
 *
 * Нічого спеціального для цього в бібліотеці немає й не треба — у payload разом
 * із подією приїжджає `target`, той самий елемент бара. Окреме поле не примха:
 * `event.currentTarget` обнуляється, щойно діспатч завершився, тож збережена
 * подія віддала б null саме тоді, коли картку треба поставити.
 */
interface Popup {
    item: Item<Booking>;
    room: string;
    top: number;
    left: number;
}

const popup = shallowRef<Popup | null>(null);

function onItemClick(payload: {
    item: Item<Booking>;
    resource: Resource<Room>;
    target: HTMLElement;
}) {
    const item = payload.item;
    lastAction.value =
        item.meta?.guest + " in room " + payload.resource.title + ": " + span(item.start, item.end);

    const host = rootRef.value;
    if (host === null) return;

    // Координати всередині демо, а не сторінки: картка лежить у ньому, тож
    // прокрутка сторінки на неї вже не впливає.
    const bar = payload.target.getBoundingClientRect();
    const box = host.getBoundingClientRect();

    // Демо обрізає вміст, тож картку, якій не вистачає місця знизу, ставимо
    // над баром. Висота відома наперед: рядків у ній рівно чотири.
    const below = bar.bottom - box.top + 8;
    const top = below + POPUP_HEIGHT > box.height ? bar.top - box.top - POPUP_HEIGHT - 8 : below;

    popup.value = {
        item,
        room: String(payload.resource.title),
        top: Math.max(8, top),
        left: Math.min(Math.max(bar.left - box.left, 8), box.width - POPUP_WIDTH - 8),
    };
}

/** Escape закриває — на клавіатурі це єдиний вихід із картки. */
function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") popup.value = null;
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

// Будь-яка зміна даних лишає картку не на місці: бронь могли пересунути або
// скасувати, і бар під нею вже інший. Закриваємо, а не гадаємо.
watch(bookings, () => {
    popup.value = null;
});
</script>

<style scoped>
.demo {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    overflow: hidden;
}

/* Картка деталей: стоїть за баром, якого торкнулись. */
.demo__popup {
    position: absolute;
    z-index: 6;
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    font-size: 0.8rem;
}

.demo__popup-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--line-soft);
}

.demo__popup-close {
    display: inline-flex;
    padding: 0.2rem;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-2);
    cursor: pointer;
}

.demo__popup-close:hover {
    background: var(--surface-2);
    color: var(--text);
}

.demo__popup-rows {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.3rem 0.75rem;
    margin: 0;
}

.demo__popup-rows dt {
    color: var(--text-2);
}

.demo__popup-rows dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.demo__bar {
    display: flex;
    align-items: center;
    gap: 0.5rem 1.5rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--line-soft);
    background: var(--surface-2);
}

.demo__group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.demo__group--nav {
    margin-right: auto;
}

.demo__group--pro {
    gap: 0.4rem;
}

.demo__label {
    font-size: 0.78rem;
    color: var(--text-3);
}

.demo__month {
    min-width: 10ch;
    margin-left: 0.35rem;
    font-size: 0.92rem;
    font-weight: 600;
}

.demo__icon,
.demo__today,
.demo__segment,
.demo__toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: 32px;
    padding: 0 0.7rem;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
    transition:
        background-color 160ms ease,
        border-color 160ms ease,
        color 160ms ease;
}

.demo__icon {
    width: 32px;
    padding: 0;
}

.demo__icon--flip {
    transform: scaleX(-1);
}

.demo__icon:hover:not([disabled]),
.demo__today:hover,
.demo__segment:hover,
.demo__toggle:hover {
    border-color: var(--accent-line);
    color: var(--text);
}

.demo__icon[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
}

.demo__segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--surface);
}

.demo__segment {
    min-height: 26px;
    border: none;
    background: transparent;
    font-variant-numeric: tabular-nums;
}

.demo__segment--on,
.demo__segment--on:hover {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
}

.demo__toggle--on,
.demo__toggle--on:hover {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
}

.demo__timeline {
    height: clamp(340px, 46vh, 480px);
    /* Токени компонента переводимо на палітру сторінки: він для того їх і
       віддає назовні, і це найкраща демонстрація того, що тема — не картинка. */
    --rt-surface: var(--surface);
    --rt-header-bg: var(--surface);
    --rt-text: var(--text);
    --rt-muted: var(--text-3);
    --rt-grid-line: var(--line-soft);
    --rt-bar-bg: var(--accent);
    --rt-today-bg: var(--accent-soft);
}

.demo__corner,
.demo__room {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 0.9rem;
    line-height: 1.25;
}

.demo__corner {
    /* Кут — звичайний блок, на відміну від клітинок осі: без явної висоти
       підпис ліг би вгору, і при тижневому кроці розійшовся б із датами. */
    height: 100%;
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-3);
}

.demo__room strong {
    font-family: var(--mono);
    font-size: 0.85rem;
    font-weight: 500;
}

.demo__room small {
    font-size: 0.7rem;
    color: var(--text-3);
}

.demo__guest {
    font-size: 0.76rem;
}

.demo__log {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    border-top: 1px solid var(--line-soft);
    background: var(--surface-2);
    font-size: 0.8rem;
    color: var(--text-2);
}

.demo__log > span:first-of-type {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.demo__count {
    margin-left: auto;
    padding-left: 1rem;
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--text-3);
    white-space: nowrap;
}

/* Статуси приходять із даних через item-class — перевизначаємо токен бара. */
.demo__timeline :deep(.demo__bar--pending) {
    --rt-bar-bg: var(--bar-hold);
    --rt-bar-text: var(--bar-hold-ink);
}

.demo__timeline :deep(.demo__bar--in-house) {
    --rt-bar-bg: var(--bar-stay);
    --rt-bar-text: var(--bar-stay-ink);
}

.demo__timeline :deep(.demo__bar--closed) {
    background: repeating-linear-gradient(
        -45deg,
        var(--surface-3),
        var(--surface-3) 6px,
        transparent 6px,
        transparent 12px
    );
}

@media (max-width: 720px) {
    .demo__group--nav {
        width: 100%;
        margin-right: 0;
    }

    .demo__count {
        display: none;
    }
}
</style>
