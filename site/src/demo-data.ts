/**
 * Дані для демо на сторінці. Готель: рядки — номери, бари — броні, підкладки —
 * закриття на ремонт.
 *
 * Генеруються, а не лежать списком, бо демо вміє показати триста рядків, і
 * триста рядків руками ніхто не напише. Генератор детермінований: та сама
 * картинка на кожному завантаженні й у кожного відвідувача — інакше знімок
 * екрана в задачі не збігався б із тим, що людина бачить у себе.
 *
 * Дати рахуються від початку видимого діапазону, тож демо однакове в будь-якому
 * місяці, і перегортання вперед не приводить у порожнечу.
 */
import { addDays, diffDays, toEpoch, toIso } from "lanesjs";
import type { DateRange, Item, Resource } from "lanesjs";

export interface Room {
    floor: number;
    beds: number;
    kind: string;
}

export type BookingStatus = "confirmed" | "pending" | "in-house" | "closed";

export interface Booking {
    guest: string;
    status: BookingStatus;
}

const GUESTS = [
    "M. Okafor",
    "L. Bergström",
    "A. Nakamura",
    "R. Delgado",
    "K. Hoffmann",
    "S. Al-Amin",
    "T. Marchetti",
    "N. Petrenko",
    "J. Whitfield",
    "E. Lindqvist",
    "P. Varga",
    "D. Mwangi",
];

const KINDS = ["Standard", "Standard", "Double", "Suite", "Accessible"];

/**
 * Найдешевший генератор із рівномірним розподілом. Своє замість Math.random,
 * бо нам потрібне саме повторюване число: зерно — номер рядка й місяць.
 */
function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function buildRooms(count: number): Resource<Room>[] {
    return Array.from({ length: count }, (_, index) => {
        const floor = Math.floor(index / 12) + 1;
        return {
            id: "room-" + (index + 1),
            title: String(floor * 100 + (index % 12) + 1),
            meta: {
                floor,
                beds: 1 + (index % 3),
                kind: KINDS[index % KINDS.length],
            },
        };
    });
}

export function buildBookings(rooms: Resource<Room>[], range: DateRange): Item<Booking>[] {
    const first = toEpoch(range.start);
    const span = diffDays(first, toEpoch(range.end));

    const items: Item<Booking>[] = [];

    rooms.forEach((room, index) => {
        // Місяць у зерні: перегорнули сторінку — інші броні, але щоразу ті самі.
        const random = seeded(index * 7919 + first / 86400000);

        // Половина номерів починає місяць зайнятою: інакше ліва межа виходить
        // рівною, наче хтось розставляв бари по лінійці.
        let day = random() < 0.5 ? -Math.floor(random() * 4) : Math.floor(random() * 5);

        while (day < span) {
            const nights = 2 + Math.floor(random() * 6);
            const end = day + nights;

            if (end > 0) {
                items.push({
                    id: room.id + "-" + items.length,
                    resourceId: room.id,
                    start: toIso(addDays(first, Math.max(day, -3))),
                    end: toIso(addDays(first, Math.min(end, span + 3))),
                    meta: {
                        guest: GUESTS[(index + items.length) % GUESTS.length],
                        status: statusAt(random()),
                    },
                });
            }

            day = end + 1 + Math.floor(random() * 5);
        }

        // Кожен дванадцятий номер стоїть на ремонті. Це підкладка, а не бар:
        // вона не займає доріжку й малюється під сіткою.
        if (index % 12 === 7) {
            const start = 4 + Math.floor(random() * 10);
            items.push({
                id: room.id + "-closed",
                resourceId: room.id,
                start: toIso(addDays(first, start)),
                end: toIso(addDays(first, Math.min(start + 5, span))),
                display: "background",
                meta: { guest: "Maintenance", status: "closed" },
            });
        }
    });

    return items;
}

/**
 * Більшість броней — підтверджені, і це не лише правда про готелі: кольорових
 * статусів має бути менше, ніж основного, інакше таблиця читається як
 * гірлянда, а не як розклад.
 */
function statusAt(value: number): BookingStatus {
    if (value < 0.13) return "pending";
    if (value < 0.32) return "in-house";
    return "confirmed";
}
