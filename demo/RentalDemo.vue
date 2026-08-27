<template>
    <div class="demo">
        <header class="demo__bar">
            <div class="demo__nav">
                <button type="button" @click="prev">←</button>
                <button type="button" @click="today">Сьогодні</button>
                <button type="button" @click="next">→</button>
                <strong class="demo__title">{{ title }}</strong>
            </div>

            <label class="demo__control">
                Кімнат
                <select v-model.number="roomCount">
                    <option :value="10">10</option>
                    <option :value="50">50</option>
                    <option :value="300">300</option>
                </select>
            </label>

            <label class="demo__control">
                Тема
                <select v-model="theme">
                    <option value="auto">системна</option>
                    <option value="light">світла</option>
                    <option value="dark">темна</option>
                </select>
            </label>

            <label class="demo__control">
                <input v-model="draggable" type="checkbox" />
                Редагування (pro)
            </label>

            <label class="demo__control">
                <input v-model="linked" type="checkbox" />
                Зв'язки (pro)
            </label>

            <div v-if="draggable" class="demo__nav">
                <button type="button" :disabled="!canUndo" @click="undoRedo.undo()">↶ Скасувати</button>
                <button type="button" :disabled="!canRedo" @click="undoRedo.redo()">↷ Повторити</button>
            </div>

            <span class="demo__stat">рядків: {{ rooms.length }} · броней: {{ bookings.length }}</span>
        </header>

        <Timeline
            :key="`${draggable}-${linked}`"
            class="demo__timeline"
            :resources="rooms"
            :items="bookings"
            :range="range"
            :today="highlightedDay"
            :item-class="bookingClass"
            :plugins="allPlugins"
            :theme="theme"
            :slot-width="44"
            :resource-width="180"
            @cell-click="onCellClick"
            @item-click="onItemClick"
        >
            <template #corner>
                <span class="demo__corner">Кімнати</span>
            </template>

            <template #slot-label="{ slotData }">
                <span class="demo__day">{{ slotData.date.getDate() }}</span>
                <span class="demo__weekday">{{ weekdayOf(slotData.date) }}</span>
            </template>

            <template #resource="{ resource }">
                <span class="demo__room">
                    <strong>{{ resource.title }}</strong>
                    <small>{{ resource.meta?.floor }} поверх · {{ resource.meta?.seats }} місць</small>
                </span>
            </template>

            <template #item="{ placed }">
                {{ placed.item.meta?.guest }}
            </template>
        </Timeline>

        <p class="demo__log">{{ lastAction || "клікни по брони або по порожній клітинці" }}</p>
    </div>
</template>

<script setup lang="ts">
/**
 * Друге демо — навмисно інший домен, ніж у застосунку: кімнати й броні,
 * без аватарів, посад і свят. Його завдання — довести, що API загальний:
 * якщо якийсь пункт вимагає правки core/ або vue/, значить, у контракті дірка.
 *
 * Самодостатнє: жодних імпортів застосунку, дані генеруються тут же.
 */
import { computed, ref } from "vue";
import Timeline from "../vue/Timeline.vue";
import { useTimelineRange } from "../vue/useTimelineRange";
import { drag } from "../pro/drag";
import { create } from "../pro/create";
import { history } from "../pro/history";
import { links } from "../pro/links";
import type { Link } from "../pro/links";
import type { DragMove, DragResize } from "../pro/drag";
import type { DragCreate } from "../pro/create";
import type { Item, PlacedItem, Plugin, Resource } from "../core/types";

interface Room {
    floor: number;
    seats: number;
}

interface Booking {
    guest: string;
    status: "confirmed" | "pending" | "cleaning";
}

const GUESTS = ["Іванченко", "Петрук", "Ковальчук", "Сорока", "Гнатюк", "Марченко", "Лисенко"];
const STATUSES: Booking["status"][] = ["confirmed", "pending", "cleaning"];

const roomCount = ref(10);
const lastAction = ref("");
const theme = ref<"auto" | "light" | "dark">("auto");

const { range, title, prev, next, today } = useTimelineRange({ date: "2026-03-01", locale: "uk-UA" });

/**
 * Платний шар підключається як звичайний плагін — через той самий проп, що й
 * будь-який чужий. Якщо колись сюди знадобиться щось, чого немає в контракті,
 * це дірка в API, а не привід зазирнути в нутрощі.
 *
 * Список перебудовується разом із ключем компонента: плагіни читаються один
 * раз на монтуванні, тож перемикач має піднімати таймлайн наново.
 */
const draggable = ref(false);
const plugins = computed<Plugin<Room, Booking>[]>(() =>
    draggable.value
        ? [
              drag<Room, Booking>({
                  onMove: applyMove,
                  onResize: applyResize,
                  canMove: (move) => move.from.meta?.floor === move.to.meta?.floor && isFree(move),
                  canResize: (resize) => isFree({ ...resize, to: resize.resource }),
              }),
              create<Room, Booking>({ onCreate: applyCreate, canCreate: (range) => isFree({ ...range, to: range.resource }) }),
              undoRedo,
          ]
        : [],
);

/**
 * Другий платний плагін у тому ж списку — щоб було видно, що вони не заважають
 * один одному: жести слухають вказівник, зв'язки малюють на подію розкладки.
 */
const linked = ref(false);
const allPlugins = computed<Plugin<Room, Booking>[]>(() =>
    linked.value ? [...plugins.value, links<Room, Booking>({ links: () => chains.value })] : plugins.value,
);

/** Ланцюжок заїздів у кожній кімнаті: після виїзду — наступний гість. */
const chains = computed<Link[]>(() => {
    const byRoom = new Map<string, Item<Booking>[]>();
    for (const booking of bookings.value) {
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
 * Правила готелю: броні не перетинаються, а між поверхами гість не переїжджає.
 * Це і є те, заради чого плагін питає дозволу на кожному русі — межу правила
 * видно під час жесту, а не після нього.
 */
function isFree(range: { to: Resource<Room>; start: string; end: string; item?: Item<Booking> }): boolean {
    return !bookings.value.some(
        (booking) =>
            booking.resourceId === range.to.id &&
            booking.id !== range.item?.id &&
            booking.start < range.end &&
            range.start < booking.end,
    );
}

/**
 * Переїзди, які застосунок прийняв. Плагін нічого не мутує — він лише каже,
 * куди елемент переїхав, а дані лишаються тут. Тому й накладка окремим шаром
 * поверх згенерованих броней, а не правка на місці.
 */
interface Placement {
    resourceId: string;
    start: string;
    end: string;
}

const moves = ref(new Map<string, Placement>());

/**
 * Стек дій. Лічильники дзеркалимо в refs: плагін навмисно не тягне
 * реактивність фреймворка, тож стан кнопок оновлює застосунок.
 */
const canUndo = ref(false);
const canRedo = ref(false);
const undoRedo = history<Room, Booking>({
    onChange: () => {
        canUndo.value = undoRedo.canUndo();
        canRedo.value = undoRedo.canRedo();
    },
});

/** Створені виділенням — теж окремо від генератора, з тієї ж причини. */
const added = ref<Item<Booking>[]>([]);

function applyMove(move: DragMove<Room, Booking>) {
    record(move.item.id, { resourceId: move.to.id, start: move.start, end: move.end }, "переїзд");
    lastAction.value = `переїзд ${move.item.meta?.guest}: ${move.to.title}, ${move.start} (${move.days} дн.)`;
}

function applyResize(resize: DragResize<Room, Booking>) {
    // Ресурс при розтягуванні не змінюється — беремо той, у якому бар лежить
    record(resize.item.id, { resourceId: resize.resource.id, start: resize.start, end: resize.end }, "край");
    lastAction.value = `край ${resize.edge}: ${resize.item.meta?.guest}, ${resize.start} → ${resize.end}`;
}

/**
 * Правка плюс запис у стек. Що саме відкотити, знає лише застосунок — плагін
 * даними не володіє, тож дістає від нас пару замикань.
 */
function record(id: string, next: Placement, label: string) {
    const previous = moves.value.get(id);

    remember(id, next);
    undoRedo.push({
        label,
        undo: () => (previous === undefined ? forget(id) : remember(id, previous)),
        redo: () => remember(id, next),
    });
}

function forget(id: string) {
    const updated = new Map(moves.value);
    updated.delete(id);
    moves.value = updated;
}

function applyCreate(created: DragCreate<Room>) {
    const booking: Item<Booking> = {
        id: `new-${added.value.length + 1}`,
        resourceId: created.resource.id,
        start: created.start,
        end: created.end,
        meta: { guest: "Нова броня", status: "pending" },
    };

    added.value = [...added.value, booking];
    undoRedo.push({
        label: "створення",
        undo: () => (added.value = added.value.filter((candidate) => candidate.id !== booking.id)),
        redo: () => (added.value = [...added.value, booking]),
    });

    lastAction.value = `виділено ${created.days} дн.: ${created.resource.title}, ${created.start} → ${created.end}`;
}

function remember(id: string, next: { resourceId: string; start: string; end: string }) {
    const updated = new Map(moves.value);
    updated.set(id, next);
    moves.value = updated;
}
const highlightedDay = "2026-03-12";

const rooms = computed<Resource<Room>[]>(() =>
    Array.from({ length: roomCount.value }, (_, index) => ({
        id: `room-${index + 1}`,
        title: `Кімната ${101 + index}`,
        meta: { floor: Math.floor(index / 10) + 1, seats: 2 + (index % 4) },
    })),
);

/** Псевдовипадкові, але детерміновані дані: та сама картинка на кожен рендер. */
const bookings = computed<Item<Booking>[]>(() => {
    const result: Item<Booking>[] = [];

    rooms.value.forEach((room, roomIndex) => {
        for (let slot = 0; slot < 3; slot++) {
            const day = 1 + ((roomIndex * 7 + slot * 11) % 26);
            const length = 1 + ((roomIndex + slot) % 4);

            const id = `${room.id}-${slot}`;
            const moved = moves.value.get(id);

            result.push({
                id,
                resourceId: moved?.resourceId ?? room.id,
                start: moved?.start ?? iso(day),
                end: moved?.end ?? iso(day + length),
                meta: {
                    guest: GUESTS[(roomIndex + slot) % GUESTS.length],
                    status: STATUSES[(roomIndex + slot) % STATUSES.length],
                },
            });
        }
    });

    return [...result, ...added.value];
});

function iso(day: number): string {
    return `2026-03-${String(Math.min(day, 31)).padStart(2, "0")}`;
}

function weekdayOf(date: Date): string {
    return new Intl.DateTimeFormat("uk-UA", { weekday: "short" }).format(date);
}

function bookingClass(placed: PlacedItem<Booking>): string {
    return `demo__booking--${placed.item.meta?.status ?? "confirmed"}`;
}

function onCellClick(payload: { date: string; resource: Resource<Room> }) {
    lastAction.value = `нова броня: ${payload.resource.title}, ${payload.date}`;
}

function onItemClick(payload: { item: Item<Booking> }) {
    lastAction.value = `броня ${payload.item.meta?.guest}: ${payload.item.start} → ${payload.item.end}`;
}
</script>

<style scoped>
.demo {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    font-family: system-ui, sans-serif;
}

.demo__bar {
    display: flex;
    align-items: center;
    gap: 20px;
    flex-wrap: wrap;
}

.demo__nav {
    display: flex;
    align-items: center;
    gap: 8px;
}

.demo__title {
    margin-left: 8px;
    text-transform: capitalize;
}

.demo__control,
.demo__stat {
    font-size: 13px;
    color: #6b7280;
}

.demo__timeline {
    max-height: 70vh;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
}

.demo__corner,
.demo__room {
    display: flex;
    flex-direction: column;
    padding: 0 12px;
    font-size: 13px;
    line-height: 1.3;
}

.demo__room small {
    color: #6b7280;
    font-size: 11px;
}

.demo__day {
    font-weight: 600;
}

.demo__weekday {
    font-size: 10px;
    color: #6b7280;
}

/* Кольори приходять із даних через itemClass — перевизначаємо токен бара. */
.demo__timeline :deep(.demo__booking--confirmed) {
    --rt-bar-bg: #2563eb;
}

.demo__timeline :deep(.demo__booking--pending) {
    --rt-bar-bg: #f59e0b;
    --rt-bar-text: #3b2a05;
}

.demo__timeline :deep(.demo__booking--cleaning) {
    --rt-bar-bg: #64748b;
}

.demo__log {
    margin: 0;
    font-size: 13px;
    color: #6b7280;
}
</style>
