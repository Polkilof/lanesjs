/**
 * Три перевірки межі теки Lanes — ті самі, що в брифі, але виконувані.
 *
 * Поки їх треба було пам'ятати й запускати руками, вони трималися на чесному
 * слові: одна забута правка з `@/` — і винесення пакета перестає бути
 * механічним. Тепер це крок збірки: `npm run lanes:build` не почнеться, доки
 * межа не чиста.
 *
 * `demo/` під правила не підпадає — демо на те й демо, що має домен, і в
 * пакет воно не потрапляє (див. `files` у package.json).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCOPE = ["core", "vue"];

const RULES = [
    {
        title: "Нуль імпортів з @/ — усе прикладне приходить ззовні через meta й слоти",
        scope: SCOPE,
        test: /from\s+["']@\//,
    },
    {
        title: "Нуль доменних слів — інакше це спецвипадок HRM, а не продукт",
        scope: SCOPE,
        test: /employee|absence|holiday|hrm/i,
    },
    {
        title: "Безкоштовне не знає про платне — інакше його не зібрати окремо",
        scope: SCOPE,
        test: /from\s+["']\.\.\/pro/,
    },
];

/** Усі .ts і .vue у теці, рекурсивно; зібране (dist) не рахується. */
function files(dir) {
    const found = [];
    for (const name of readdirSync(dir)) {
        if (name === "dist" || name === "node_modules") continue;

        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            found.push(...files(path));
        } else if (name.endsWith(".ts") || name.endsWith(".vue")) {
            found.push(path);
        }
    }
    return found;
}

let broken = 0;

for (const rule of RULES) {
    const hits = [];

    for (const dir of rule.scope) {
        for (const path of files(join(ROOT, dir))) {
            const lines = readFileSync(path, "utf8").split(/\r?\n/);
            lines.forEach((line, index) => {
                if (rule.test.test(line)) {
                    hits.push(`${relative(ROOT, path).replace(/\\/g, "/")}:${index + 1}: ${line.trim()}`);
                }
            });
        }
    }

    if (hits.length === 0) {
        console.log(`ok   ${rule.title}`);
        continue;
    }

    broken += hits.length;
    console.error(`ЗЛАМАНО  ${rule.title}`);
    for (const hit of hits) console.error(`         ${hit}`);
}

if (broken > 0) {
    console.error(`\nМежа теки порушена у ${broken} місцях. Правила — у BRIEF.md.`);
    process.exit(1);
}
