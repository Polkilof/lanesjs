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

            <span class="demo__stat">рядків: {{ rooms.length }} · броней: {{ bookings.length }}</span>
        </header>

        <Timeline
            class="demo__timeline"
            :resources="rooms"
            :items="bookings"
            :range="range"
            :today="highlightedDay"
            :item-class="bookingClass"
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
import type { Item, PlacedItem, Resource } from "../core/types";

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

const { range, title, prev, next, today } = useTimelineRange({ date: "2026-03-01", locale: "uk-UA" });
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

            result.push({
                id: `${room.id}-${slot}`,
                resourceId: room.id,
                start: iso(day),
                end: iso(day + length),
                meta: {
                    guest: GUESTS[(roomIndex + slot) % GUESTS.length],
                    status: STATUSES[(roomIndex + slot) % STATUSES.length],
                },
            });
        }
    });

    return result;
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
