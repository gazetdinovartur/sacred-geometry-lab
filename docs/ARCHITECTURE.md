# Sacred Geometry Lab — архитектура

> Актуально: **июнь 2026**, ветка `main`  
> Точка входа для разработчиков: что где лежит и как данные текут через систему.

---

## 1. Общая схема

```
┌─────────────────────────────────────────────────────────────┐
│  Браузер                                                     │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐ │
│  │ Alpine.js   │   │ LabApp.ts    │   │ Paper.js export │ │
│  │ theme, UI    │◄──│ orchestrator │──►│ MandalaRenderer │ │
│  └─────────────┘   └──────┬───────┘   └─────────────────┘ │
│                           │                                  │
│                    Web Audio API                             │
│                    (микрофон → AnalyserNode)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ POST /api/patterns (только SVG+JSON)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Symfony 8 · MySQL                                           │
│  OAuth (Google, VK) · users · patterns                       │
└─────────────────────────────────────────────────────────────┘
```

**Принцип:** сервер **не слышит**. Аудио обрабатывается в RAM браузера. На сервер уходит только сохранённый узор (числа + SVG) по явному действию пользователя.

---

## 2. Пользовательские потоки

### 2.1 Live («Мандала момента»)

1. Пользователь на `/` нажимает **Начать**.
2. `AudioEngine` запрашивает микрофон, создаёт `AnalyserNode` (fftSize 2048).
3. Если нет профиля → **калибровка ~12 с** (`CalibrationRunner` + `VoiceProfile`).
4. Каждый кадр (`requestAnimationFrame` через `AudioSessionLoop`):
   - `FeatureExtractor.extract()` → RMS, f₀, FFT, onsets, silence, spectral level
   - `VoiceProfile.normalizeFeatures()` — относительно калибровки
   - `GeometryPipeline` → `MappingEngine` → `GeometryParams`
   - **Live-отрисовка:** `EqLabRenderer` на `#mandala-canvas` (8 дуг EQ, кольцо уровня, Hz)
5. **Стоп** → сессия готова к экспорту.

Тишина обрабатывается `SilenceMapper`: форма не исчезает, вращение замедляется, «дыхательное» кольцо.

### 2.2 Process («След процесса»)

Тот же аудио-конвейер + `ProcessMode`:

| Событие | Поведение |
|---------|-----------|
| Первый слепок | ~7 с после старта (`FIRST_SNAPSHOT_MS`) |
| Далее | каждые ~12 с или при значимом изменении спектра |
| Стоп | `ProcessMode.finalize()` → итоговый композит «Итог» |

На экране — тот же EQ-круг + кнопки таймлайна (скрабинг слепков). Мандала **не** рисуется live — только при экспорте.

### 2.3 Калибровка

- Хранение: `localStorage` ключ `sgl-voice-profile`
- Этапы: шёпот → речь → низкий тон → высокий тон (можно пропустить)
- Перекалибровка из UI; мягкая подсказка через 14 дней
- В кабинете: просмотр hash, сброс профиля (локально)

### 2.4 Экспорт (после «Стоп»)

Единая форма на главной: **Размер · Стиль · Действие · Выполнить**.

| Действие | Условие | Модуль |
|----------|---------|--------|
| PNG / SVG | ≥ мин. данных (`exportValidation`) | `mandalaExport.ts` |
| ZIP сессии | Process, ≥1 слепок | `exportFrames.ts` |
| Видео | Process, ≥2 слепка, `VideoEncoder` | `exportSessionVideo.ts` |
| Кино (голос) | ≥12 сэмплов таймлайна, `AudioEncoder` | `SessionCapture` + `exportSessionCinemaVideo.ts` |
| Сохранить в своё место | авторизация | `POST /api/patterns` |

**Стили экспорта:**

| UI | Рендер | Файлы |
|----|--------|-------|
| Точечная | `dots` | `dotMandalaLayers.ts`, `dotMandalaMath.ts` |
| Слои (линии) | `flower` | `voiceMandalaLayers.ts`, чакровая палитра |

Размеры: 800 / 1600 / 3200 px.

**Кино:** параллельно с сессией `SessionCapture` пишет таймлайн (~12 fps) и аудио через `MediaRecorder`. При экспорте — WebM VP9 + Opus, мандала синхронизирована с голосом. Аудиофайл **не** загружается на сервер.

### 2.5 Личный кабинет (`/account`)

| Состояние | Экран |
|-----------|-------|
| Гость | Кнопки OAuth Google / VK |
| Авторизован | Сетка узоров (inline SVG), переименование, скачать SVG, удалить, ZIP PNG архив |

API требует `ROLE_USER`. Без логина лаборатория работает полностью.

---

## 3. Поток данных (звук → образ)

```
Микрофон
  → AudioEngine (AnalyserNode)
  → FeatureExtractor
       RMS, f₀ (autocorr → FFT peak → centroid),
       spectrum[8], onsets, silenceRatio, spectralLevel, isActive
  → VoiceProfile.normalizeFeatures()
  → GeometryPipeline (+ SilenceMapper, SymmetryResolver)
  → MappingEngine → GeometryParams
  → PitchContour → pitchTrail[]
       │
       ├─► EqLabRenderer          (live canvas)
       └─► FeatureSnapshot        (export / Process)
             → MandalaRenderer    (Paper.js offscreen)
             → applySessionVariety (hue/scale от hash сессии)
             → PNG / SVG / video frames
```

### Признаки и текстуры

`FeatureExtractor` считает сигнал активным, если есть энергия в **RMS или спектре** (`spectralLevel`). Шипение, дыхание, согласные не «обнуляют» уровень и Hz (fallback на spectral centroid при слабом тоне).

---

## 4. Модули TypeScript

### `assets/ts/lab/`

| Файл | Роль |
|------|------|
| `LabApp.ts` | Оркестратор: сессия, Alpine store `lab`, экспорт, dev panel |
| `CalibrationRunner.ts` | Таймер калибровки (независим от rAF) |

### `assets/ts/audio/`

| Файл | Роль |
|------|------|
| `AudioEngine.ts` | Один поток микрофона |
| `FeatureExtractor.ts` | Извлечение признаков |
| `VoiceProfile.ts` | Калибровка, нормализация, hash |
| `DualAudioEngine.ts` | Заготовка для диалога (**не подключён**) |

### `assets/ts/geometry/`

| Файл | Роль |
|------|------|
| `MappingEngine.ts` | Формулы звук → params |
| `GeometryPipeline.ts` | Тишина, held-form fade |
| `EqLabRenderer.ts` | Live EQ-круг |
| `MandalaRenderer.ts` | Export orchestrator |
| `voiceMandalaLayers.ts` | Слойная мандала (линии, чакры, Process rings) |
| `dotMandalaLayers.ts` | Точечная мандала |
| `paramInterpolation.ts` | Интерполяция между слепками (видео) |
| `sessionVariety.ts` | Fingerprint сессии |

### `assets/ts/export/`

| Файл | Роль |
|------|------|
| `mandalaExport.ts` | PNG/SVG |
| `exportFrames.ts` | ZIP кадров Process |
| `exportSessionVideo.ts` | WebM slideshow (24 fps) |
| `exportSessionCinemaVideo.ts` | WebM + голос (30 fps) |
| `SessionCapture.ts` | Запись таймлайна и аудио в сессии |
| `exportValidation.ts` | Guards (мин. голос, пустой файл) |
| `exportOptions.ts` | Стили, размеры, подписи действий |

### `assets/ts/modes/`

| Файл | Роль |
|------|------|
| `AudioSessionLoop.ts` | rAF-цикл (используется) |
| `ProcessMode.ts` | Слепки, composite, timeline |
| `DialogSessionLoop.ts` | Диалог (**не подключён**) |

### `assets/ts/three/`

Экспериментальный Three.js — **не импортируется** в `main.ts`.

---

## 5. Symfony backend

### Страницы (Twig)

| Маршрут | Имя | Шаблон |
|---------|-----|--------|
| `/` | `home` | `home/index.html.twig` |
| `/about` | `about` | `pages/about.html.twig` |
| `/ethics` | `ethics` | `pages/ethics.html.twig` |
| `/how` | `how` | `pages/how.html.twig` |
| `/account` | `account` | `account/index.html.twig` |

OAuth: `/auth/google`, `/auth/vk` (+ callbacks).

### API (JSON, session auth)

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/patterns` | Список узоров |
| POST | `/api/patterns` | Сохранить (params, timeline, svg, hash) |
| GET | `/api/patterns/{id}` | Один узор |
| PATCH | `/api/patterns/{id}` | Переименование |
| DELETE | `/api/patterns/{id}` | Удалить |
| DELETE | `/api/account` | Удалить аккаунт и узоры |

### БД

- `users` — oauth_provider, oauth_id, email, display_name
- `patterns` — mode, geometry_style, geometry_params (JSON), feature_timeline (JSON), svg (TEXT), voice_profile_hash, title

---

## 6. Сборка и окружение

```
assets/ts/main.ts  →  Vite  →  public/build/main.js + main.css
public/index.php   →  Symfony front controller
```

Twig проверяет `assets_built()` — без `npm run build` показывается предупреждение.

### Docker (`docker-compose.yml`)

| Сервис | Порт |
|--------|------|
| nginx | **8083** |
| MySQL | **3310** |
| Mailpit | **8028** / SMTP **1028** |
| Vite (dev) | **5174** |

---

## 7. Реализовано / не реализовано

### ✅ Работает

- Live + Process, калибровка, Rest & Breath
- Экспорт PNG/SVG/ZIP/видео/кино
- Два стиля мандалы (точки / слои)
- Кабинет, OAuth Google + VK, CRUD узоров
- Светлая/тёмная тема, футер с sigil и именем по теме
- Unit-тесты: geometry, calibration, export, video timeline

### ⏳ Частично / ограничения

- Live ≠ export (намеренно: EQ на экране, мандала при экспорте)
- Видео/кино — WebCodecs (Chrome/Firefox; Safari ограничен)
- SVG в БД, без server-side PNG thumbnail
- OAuth требует `.env.local`

### ❌ Не подключено (код есть)

- Режим диалога (`DualAudioEngine`, `DialogSessionLoop`)
- Three.js live viz
- Max OAuth
- Formant bands → timbre core
- GDPR JSON export из кабинета
- `GET /api/pages/{slug}`

---

## 8. Связанные документы

- [PROJECT.md](../PROJECT.md) — продукт, этика, MVP-чеклисты
- [VOICE-MANDALA.md](./VOICE-MANDALA.md) — слои мандалы, калибровка, дорожная карта
- [README.md](../README.md) — быстрый старт
