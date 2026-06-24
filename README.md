# Sacred Geometry Lab

**[lab.arturlun.ru](https://lab.arturlun.ru)** — лаборатория наблюдения: звук становится геометрией.

Микрофон → акустические признаки → живая визуализация и экспорт мандалы. Без распознавания речи, без отправки аудио на сервер.

**Автор:** [Артур Лун](https://arturlun.ru) · [Артур Газетдинов](https://arturlun.ru) (светлая тема)

---

## Быстрый старт

```bash
bin/dev up          # Docker: nginx :8083, MySQL :3310, Mailpit :8028
bin/dev migrate     # схема БД
bin/dev assets      # npm run build → public/build/
```

Открыть **http://localhost:8083**

Для HMR: `bin/dev watch` (Vite на **5174**).

OAuth (кабинет): ключи в `.env.local` — `OAUTH_GOOGLE_*`, `OAUTH_VK_*`.

---

## Что умеет (кратко)

| Область | Описание |
|---------|----------|
| **Live** | Живой спектральный круг (8 зон EQ, уровень, Hz) |
| **Process** | Слепки по ходу сессии + итоговый композит |
| **Калибровка** | ~12 с, VoiceProfile в `localStorage` |
| **Экспорт** | PNG / SVG · ZIP (Process) · видео · «кино с голосом» · сохранить в кабинет |
| **Стили** | Точечная мандала · Слои (линии) |
| **Кабинет** | OAuth Google/VK, история узоров, переименование, удаление |

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/VOICE-MANDALA.md](docs/VOICE-MANDALA.md)

---

## Стек

| Слой | Технология |
|------|------------|
| SSR | Symfony 8 + Twig |
| UI | Alpine.js 3 |
| Логика | TypeScript (Vite 6) |
| Live-графика | Canvas 2D (`EqLabRenderer`) |
| Экспорт | Paper.js (`MandalaRenderer`) |
| Звук | Web Audio API |
| БД | MySQL 8.4 + Doctrine |

---

## Команды

```bash
npm run dev          # Vite dev server
npm run build        # production assets
npm test             # Vitest (geometry, video timeline)
npm run typecheck    # tsc --noEmit
bin/dev test         # Vitest + PHPUnit
```

Dev-панель на главной: `/?dev=1` (RMS, spectrum, params).

---

## Документация

| Файл | Содержание |
|------|------------|
| [PROJECT.md](PROJECT.md) | Продуктовая спецификация + статус реализации |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Как устроен код: потоки, модули, API |
| [docs/VOICE-MANDALA.md](docs/VOICE-MANDALA.md) | Мандала, слои, калибровка, экспорт |

---

## Структура репозитория

```
assets/ts/          # клиент: audio, geometry, export, lab, account
src/                # Symfony: контроллеры, сущности, OAuth
templates/          # Twig: главная, страницы, футер
public/build/       # собранный Vite (не в git, если в .gitignore)
docker/             # nginx, php
migrations/         # users, patterns
tests/              # PHPUnit functional
```

---

## Лицензия / деплой

Прод: **lab.arturlun.ru** (NetAngels). Symfony отдаёт `public/`; статика из `public/build/`.
