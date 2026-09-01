/**
 * Тема сторінки. Значення живе на атрибуті html — там його вже поставив
 * скрипт у head, до першого малювання; тут ми його лише читаємо й міняємо.
 *
 * Компонент отримує ту саму тему пропом theme, а не власним "auto": сторінка
 * має перемикач, і таймлайн має слухатись його, а не системи.
 */
import { ref, watchEffect } from "vue";

export type Theme = "light" | "dark";

const KEY = "lanes-theme";

function current(): Theme {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const theme = ref<Theme>(current());

watchEffect(() => {
    document.documentElement.dataset.theme = theme.value;
    try {
        localStorage.setItem(KEY, theme.value);
    } catch {
        // Приватний режим забороняє запис. Тема все одно застосована, просто
        // не переживе перезавантаження — це не привід валити сторінку.
    }
});

export function useTheme() {
    return {
        theme,
        toggle: () => {
            theme.value = theme.value === "dark" ? "light" : "dark";
        },
    };
}
