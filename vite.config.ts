/**
 * Збірка бібліотеки й запуск тестів. Один конфіг на двоє, бо і те, і те тут
 * про одну й ту саму теку: у репозиторії, де бібліотека лежить у корені,
 * ділити його не було б за чим.
 *
 * Дві точки входу, а не одна: хто не імпортує `pro`, той його й не збирає.
 * `vue` — зовнішній: у застосунку він уже є, а другий примірник зламав би
 * реактивність.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const manifest = JSON.parse(readFileSync(at("./package.json"), "utf8"));

export default defineConfig({
    plugins: [vue()],

    resolve: {
        alias: {
            // Тести приїхали з застосунку, де бібліотека лежала в src/lanes.
            // Аліас лишає їхні імпорти без змін: переписувати сім файлів
            // заради різниці в розташуванні — робота без результату.
            "@/lanes": at("."),
        },
    },

    // Вікно оновлень у ключі міряється датою збірки, а не годинником клієнта,
    // тож дата має бути в збірці. У вихідниках цих констант немає — і там
    // перевірка вікна не діє, бо власну збірку не ліцензують.
    define: {
        __LANES_VERSION__: JSON.stringify(manifest.version),
        __LANES_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },

    publicDir: false,

    build: {
        outDir: at("./dist"),
        emptyOutDir: true,
        target: "esnext",
        // Стилі компонента — один файл: різати їх по точках входу нема за чим,
        // усе малює безкоштовна половина.
        cssCodeSplit: false,
        lib: {
            entry: {
                index: at("./index.ts"),
                pro: at("./pro/index.ts"),
            },
            formats: ["es"],
            cssFileName: "style",
        },
        rollupOptions: {
            external: ["vue"],
        },
    },

    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.ts"],
    },
});
