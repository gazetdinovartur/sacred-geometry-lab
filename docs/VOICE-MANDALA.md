# Voice Mandala — реализация и развитие

> **Статус:** v1.4 (июнь 2026) · ветка `main`  
> **Live:** честный EQ-круг · **Экспорт:** точечная или слойная мандала из голоса

---

## Что сделано

### Live (экран Live / Process)

- **8 зон спектра** — дуги по частотам, усиление сегментов от калибровки (`spectrumGain`).
- **Кольцо уровня + % · Уровень** — нормализованный RMS; учитывается и **спектральная энергия** (шипение, дыхание, согласные не обнуляют уровень).
- **Hz + точка тона** — f₀ через каскад: автокорреляция → пик FFT → spectral centroid.
- **Калибровка ~12 сек** — таймер независим от rAF (`CalibrationRunner`), пропуск, перекалибровка.
- **Process** — слепки на таймлайне; на экране спектр, не мандала.

### Экспорт

Единая форма: **Размер · Стиль · Действие**.

| Действие | Условие |
|----------|---------|
| PNG / SVG | После «Стоп», мин. данные голоса |
| ZIP сессии | Process, ≥1 слепок |
| Видео | Process, ≥2 слепка, WebCodecs |
| Кино (голос) | ≥12 сэмплов таймлайна + запись голоса в браузере |
| Сохранить в своё место | Авторизация → `POST /api/patterns` |

**Стили:**

| UI | Рендер | Модули |
|----|--------|--------|
| **Точечная мандала** | `dots` | `dotMandalaLayers.ts`, `dotMandalaMath.ts` |
| **Слои (линии)** | `flower` | `voiceMandalaLayers.ts`, чакровая палитра (`mandalaPalette.ts`) |

Offscreen Paper.js, размеры 800 / 1600 / 3200 px. Guards: `exportValidation.ts`.

#### Слойная мандала (layers / flower)

| Слой | Источник |
|------|----------|
| Спектральные кольца Process | EQ каждого этапа, чакровые маркеры |
| Гармонические кольца | `elementCount` |
| Лучи, звезда | тон, ритм, shimmer f₀ |
| След голоса | `pitchTrail`, мотивы |
| Орбита Process | узлы слепков |
| RMS-кольцо, метка Hz, дыхание | финальный кадр |

#### Точечная мандала (dots)

- Кольца от Process / вдохов — точки на лучах по спектру этапа.
- Контраст и размер от уровня внутри кольца; bindu в центре.
- Спираль pitch trail под кольцами; лепестки у сильных лучей.

### Калибровка и профиль

- `VoiceProfile` — границы RMS / f₀ / centroid, `localStorage` (`sgl-voice-profile`).
- **Мягкая перекалибровка** — подсказка через 14 дней.
- **Session variety** — hue/scale от `profileHash + sessionStarted`.

### Видео

- **Слайдшоу Process** (`exportSessionVideo.ts`) — morph между слепками, 24 fps, WebM VP9.
- **Кино** (`exportSessionCinemaVideo.ts`) — 30 fps + голос из `SessionCapture`; аудио не уходит на сервер.

---

## Как это работает (поток данных)

```
Микрофон → AudioEngine → FeatureExtractor
                              ↓
                    VoiceProfile.normalizeFeatures()
                              ↓
                    MappingEngine → GeometryParams
                              ↓
         ┌────────────────────┴────────────────────┐
         ↓                                         ↓
   EqLabRenderer (live)              FeatureSnapshot + pitchTrail
   levelNorm / setSpectrum                     ↓
                                         MandalaRenderer (export)
                                         dots | voiceMandalaLayers
                                         + applySessionVariety
                                         → PNG / SVG / ZIP / WebM
```

1. **Начать** → микрофон; при первом запуске — калибровка.
2. Каждый кадр → признаки → params; `PitchContour` копит `pitchTrail`.
3. **Process** → `ProcessMode.capture()` по таймеру / изменению спектра.
4. **Стоп** → форма экспорта; `validateExportReadiness` перед скачиванием.

---

## Аудит (июнь 2026)

### Сильные стороны

- Чёткое разделение **live = спектр**, **export = мандала**.
- Два зрелых стиля экспорта (точки / слои).
- Текстуры голоса (ш-ш, дыхание) через `spectralLevel` + fallback pitch.
- Process: ZIP, видео, кино, session-report.
- Кабинет + OAuth + patterns API.
- Unit-тесты: geometry, calibration, export, video timeline.

### Ограничения

| Проблема | Статус |
|----------|--------|
| Live ≠ export mandala | **намеренно** — разные рендереры |
| WebCodecs / Safari | видео и кино — Chrome/Firefox надёжнее |
| Three.js в репо | не в bundle |
| Formant → timbre | backlog |
| Golden PNG e2e | backlog |
| Max OAuth, диалог | backlog |

### Приватность

- Аудио не на сервер (кроме локальной записи для «кино» — только скачивание).
- Слова не распознаются.
- Сохранение узора — только params + SVG + timeline (числа).

---

## Дорожная карта

### Сделано (v1.3 → v1.4)

- [x] Точечная мандала: контраст, иерархия колец, спираль
- [x] Слойная: Process spectrum rings, чакры
- [x] Экспорт видео + кино с голосом
- [x] Единая форма экспорта (стиль / размер / действие)
- [x] Кабинет: rename, delete, PNG archive
- [x] FeatureExtractor: spectral activity для текстур

### Backlog

- [ ] Formant bands → `drawTimbreCore`
- [ ] Golden PNG tests
- [ ] Режим диалога (DualAudioEngine)
- [ ] Server thumbnails для patterns
- [ ] GDPR JSON export из кабинета
- [ ] Max OAuth

---

## Ключевые файлы

| Путь | Назначение |
|------|------------|
| `assets/ts/lab/LabApp.ts` | сессия, экспорт, Alpine store |
| `assets/ts/geometry/EqLabRenderer.ts` | live EQ |
| `assets/ts/geometry/MandalaRenderer.ts` | export orchestrator |
| `assets/ts/geometry/dotMandalaLayers.ts` | точечная мандала |
| `assets/ts/geometry/voiceMandalaLayers.ts` | слойная мандала |
| `assets/ts/export/exportOptions.ts` | стили, размеры, действия |
| `assets/ts/export/exportSessionVideo.ts` | видео Process |
| `assets/ts/export/exportSessionCinemaVideo.ts` | кино + голос |
| `assets/ts/export/SessionCapture.ts` | запись таймлайна/аудио |
| `assets/ts/audio/FeatureExtractor.ts` | признаки + текстуры |
| `assets/ts/audio/VoiceProfile.ts` | калибровка |

---

## Команды

```bash
npm run dev          # Vite
npm run build        # → public/build/
npm test             # vitest
npm run typecheck
bin/dev test         # vitest + phpunit
```

Dev-панель: `/?dev=1`

---

## Связанные документы

- [ARCHITECTURE.md](./ARCHITECTURE.md) — полная архитектура
- [PROJECT.md](../PROJECT.md) — продукт и чеклисты MVP/v1/v2
- [README.md](../README.md) — быстрый старт
