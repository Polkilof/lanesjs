/**
 * Спільна механіка платних жестів: натиснули, провезли більше за поріг, ведемо,
 * відпустили. Кожен жест відрізняється лише чотирма відповідями — чи брати
 * початок, куди веде вказівник, чи там можна відпустити і що робити далі.
 *
 * Винесено, бо перетягування й створення виділенням однакові в усьому, крім
 * цих відповідей, а розкладені по різних плагінах вони мають бути:
 * застосунок може дозволити створювати, не дозволяючи тягати.
 */
import type { Geometry } from "../core/types";

/** Прямокутник, який показує привид; усі жести зводяться до нього. */
export interface Target {
    slotIndex: number;
    slotSpan: number;
    resourceIndex: number;
}

export interface Ghost {
    show(target: Target, geometry: Geometry, valid: boolean): void;
    /**
     * Приміряти привида до бара, який узяли: він стане тієї ж висоти й на тому
     * самому місці в рядку, а сам бар пригасне — але аж тоді, коли жест
     * справді почнеться.
     */
    fit(bar: HTMLElement): void;
    remove(): void;
}

/**
 * Привид у шарі накладок. Інлайном лишається тільки те, без чого він опиниться
 * не там: позиція й прозорість для вказівника. Вигляд — у таблиці стилів
 * компонента, під токенами --rt-ghost-*: інлайн б'є будь-який селектор, тож
 * поки колір стояв тут, застосунок не міг перефарбувати привида взагалі, і
 * обіцяний плагінами className лишався наполовину порожньою обіцянкою.
 */
export function makeGhost(overlay: HTMLElement, className?: string): Ghost {
    let element: HTMLElement | null = null;
    let source: HTMLElement | null = null;
    let box: { top: number; height: number } | null = null;

    return {
        fit(bar) {
            source = bar;
            box = { top: bar.offsetTop, height: bar.offsetHeight };
        },

        show(target, geometry, valid) {
            if (element === null) {
                element = document.createElement("div");
                element.className = ["rt__ghost", className].filter(Boolean).join(" ");
                element.style.cssText = "position:absolute;pointer-events:none";
                overlay.appendChild(element);

                // Бар гасне тут, а не в fit: приміряються на натисканні, а
                // жест починається порогом руху або утриманням. Інакше кожне
                // натискання на бар давало б блимання.
                source?.classList.add("rt__bar--dragging");
            }

            const top = geometry.rowOffsets[target.resourceIndex];
            const rowHeight = geometry.rowOffsets[target.resourceIndex + 1] - top;

            element.style.left = `${target.slotIndex * geometry.slotWidth}px`;
            element.style.width = `${target.slotSpan * geometry.slotWidth}px`;

            // Привид повторює силует бара, а не всю смугу рядка: прямокутник
            // удвічі вищий за те, що тягнуть, показує рядок, а не місце. Там,
            // де бара немає — виділення на порожньому, — смуга рядка якраз
            // доречна; нульова висота означає середовище без розкладки
            // (jsdom), і там теж береться рядок.
            const fitted = box !== null && box.height > 0;
            element.style.top = `${top + (fitted && box !== null ? box.top : 0)}px`;
            element.style.height = `${fitted && box !== null ? box.height : rowHeight}px`;

            // Заборонену ціль видно одразу, а не після відпускання: інакше
            // жест мовчки нічого не робить, і це читається як поламане.
            element.classList.toggle("rt__ghost--invalid", !valid);
        },

        remove() {
            source?.classList.remove("rt__bar--dragging");
            element?.remove();
            element = null;
            source = null;
            box = null;
        },
    };
}

/** Скільки тримати палець, перш ніж жест почнеться на дотик. */
const LONG_PRESS = 400;

/** Наскільки палець може поїхати за час утримання й це ще не прокрутка. */
const TOUCH_SLOP = 10;

export interface PointerGesture<S> {
    root: HTMLElement;
    /**
     * Скільки пікселів треба провезти, перш ніж це вважатиметься жестом. Без
     * порога кожен клік починав би тягнення, і клік зникав би.
     */
    threshold: number;
    /**
     * Скільки тримати палець, щоб жест почався на дотик. Поріг руху там не
     * годиться — чому саме, розказано над `trackPointer`.
     */
    longPress?: number;
    /** Взяти початок жесту або відмовитись. */
    press(event: PointerEvent): S | null;
    /** Куди веде вказівник зараз; null — лишити попереднє. */
    track(state: S, event: PointerEvent): Target | null;
    /**
     * Чи можна тут відпустити. Заборонена ціль показується перекресленою, але
     * не застосовується: користувач має бачити межу правила під час жесту, а
     * не дізнаватись про неї з мовчання.
     */
    validate?(state: S, target: Target): boolean;
    /** Відпустили. Викликається лише для дозволеної цілі. */
    commit(state: S, target: Target): void;
}

/**
 * Підписка на вказівник; повертає функцію зняття. Рух і відпускання слухаємо
 * на вікні, а не на корені: жест не має уриватись, щойно курсор вийшов за межі
 * таблиці — саме туди його й ведуть, коли тягнуть до краю.
 *
 * Миша й палець починають жест по-різному, і це не примха. Мишею його починає
 * рух: поріг у кілька пікселів відрізняє тягнення від кліку. Пальцем той самий
 * рух першим забирає браузер — він з нього починає прокрутку, а нам шле
 * `pointercancel`, і жест уривається, ще не почавшись. Тому на дотик його
 * починає утримання: палець стоїть, прокрутка не почалась, і поки не почалась,
 * її ще можна відхилити — `preventDefault` на `touchmove`. Потім уже нема чого
 * відхиляти: подія приходить із `cancelable: false`.
 *
 * Чому не `touch-action: none` на барах, як роблять половина таких
 * компонентів: тоді пальцем не прокрутити таблицю, почавши з бара, а бар
 * накриває піврядка. Правило CSS не вміє «не заважати, поки не тримають».
 */
export function trackPointer<S>(gesture: PointerGesture<S>, ghost: Ghost, geometry: () => Geometry): () => void {
    const { root, threshold } = gesture;
    const longPress = gesture.longPress ?? LONG_PRESS;

    let state: S | null = null;
    /** jsdom не має PointerEvent, тож ідентифікатора може не бути зовсім. */
    let pointerId: number | null = null;
    let touch = false;
    let origin = { x: 0, y: 0 };
    let active = false;
    let target: Target | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    /** Поки жест веде палець, прокрутка сторінки — не те, чого від нього хочуть. */
    function blockScroll(event: TouchEvent) {
        if (event.cancelable) event.preventDefault();
    }

    /** Не наш вказівник: другий палець у чужий жест не втручається. */
    function foreign(event: PointerEvent): boolean {
        return pointerId !== null && event.pointerId !== pointerId;
    }

    function reset() {
        if (timer !== null) clearTimeout(timer);
        window.removeEventListener("touchmove", blockScroll);

        ghost.remove();
        timer = null;
        state = null;
        target = null;
        active = false;
        touch = false;
        pointerId = null;
        root.style.userSelect = "";
    }

    /**
     * Показати, куди веде вказівник. `take` — чи брати цю ціль як результат:
     * саме утримання ще нічого не змінює, змінює рух. Інакше палець,
     * притиснутий і відпущений на місці, робив би те, чого миша не робить.
     */
    function show(event: PointerEvent, take: boolean) {
        if (state === null) return;

        const next = gesture.track(state, event);
        if (next === null) return;

        // Заборонену ціль показуємо, але не запам'ятовуємо: відпускання на ній
        // не має застосуватись, а повернення на дозволену — має спрацювати.
        const valid = gesture.validate?.(state, next) ?? true;
        if (take) target = valid ? next : null;
        ghost.show(next, geometry(), valid);
    }

    function begin(event: PointerEvent, moved: boolean) {
        active = true;
        // Інакше тягнення виділяє підписи барів і рядків
        root.style.userSelect = "none";
        if (touch) window.addEventListener("touchmove", blockScroll, { passive: false });
        show(event, moved);
    }

    function onPointerDown(event: PointerEvent) {
        if (state !== null) return;
        if (event.button !== 0) return;

        const next = gesture.press(event);
        if (next === null) return;

        state = next;
        pointerId = typeof event.pointerId === "number" ? event.pointerId : null;
        touch = event.pointerType === "touch";
        origin = { x: event.clientX, y: event.clientY };
        active = false;
        target = null;

        if (touch) timer = setTimeout(() => begin(event, false), longPress);
    }

    function onPointerMove(event: PointerEvent) {
        if (state === null || foreign(event)) return;

        if (!active) {
            const moved = Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y);

            // Палець поїхав, не дочекавшись кінця утримання, — це прокрутка, і
            // забирати її в користувача ми не станемо.
            if (touch) {
                if (moved > TOUCH_SLOP) reset();
                return;
            }

            if (moved < threshold) return;
            begin(event, true);
            return;
        }

        show(event, true);
    }

    function onPointerUp(event: PointerEvent) {
        if (state === null || foreign(event)) return;

        const finished = state;
        const finishedTarget = target;
        reset();

        if (finishedTarget !== null) gesture.commit(finished, finishedTarget);
    }

    /**
     * Скасування — не відпускання: вказівник забрав собі браузер, і
     * застосовувати те, чого користувач не завершив, підстав немає.
     */
    function onPointerCancel(event: PointerEvent) {
        if (state === null || foreign(event)) return;
        reset();
    }

    /** Довге утримання на дотик інакше відкриває меню просто поверх жесту. */
    function onContextMenu(event: Event) {
        if (state !== null && touch) event.preventDefault();
    }

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);

    return () => {
        root.removeEventListener("pointerdown", onPointerDown);
        root.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        reset();
    };
}
