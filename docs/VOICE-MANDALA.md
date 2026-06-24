# Voice Mandala — реализация и развитие

> **Статус:** v1.2 (июнь 2026) · ветка `main`  
> **Live:** честный EQ-круг · **Экспорт:** структурированная мандала из голоса

---

## Что сделано

### Live (экран «Момент» / «Процесс»)

- **8 зон спектра** — дуги по частотам, усиленная чувствительность сегментов.
- **Кольцо уровня** + **% · Уровень** — нормализация через калибровку (`VoiceProfile`).
- **Hz + точка тона** — основная частота на круге.
- **Калибровка ~12 сек** — таймер независим от rAF (`CalibrationRunner`), кнопка «Перекалибровать», пропуск.
- Режим **Процесс** — слепки по ходу; на экране по-прежнему спектр, не мандала.

### Экспорт (PNG / SVG / ZIP сессии)

Отдельный рендер `MandalaRenderer` + слои в `voiceMandalaLayers.ts`.

**Принцип:** один акустический параметр → один визуальный слой. Без «леса» из десяти типов мотивов.

| Слой | Источник | Файл |
|------|----------|------|
| Вложенные кольца | гармоники → `elementCount` | `drawHarmonicRings` |
| 8 дуг спектра | `snapshot.spectrum` | `drawSpectrumArcs` |
| Лучи (3–12) | тон → `rays`, `pitchAngle` | `drawToneRays` |
| Звезда N-лучей | ритм → `symmetry` | `drawRhythmStar` |
| Малый многоугольник | тембр → `lineWidth` | `drawTimbreCore` |
| Цветок жизни | каркас стиля `flower` | `drawFlowerScaffold` |
| **Линия следа голоса** | `pitchTrail` за сессию | `drawVoiceTrace` |
| Внешнее кольцо | RMS → `radius`, `opacity` | `drawRmsRing` |
| Метка Hz | `features.frequency` | `drawPitchMarker` |
| Дыхание (редко) | пауза → `breathRing` | `MandalaRenderer` |

Экспорт **не** рисует live-canvas: offscreen Paper.js 960×960, проверка на пустые файлы (`exportValidation.ts`).

### Калибровка и профиль

- `VoiceProfile` — границы RMS / f₀ / centroid, `localStorage` (`sgl-voice-profile`).
- `spectrumGain()` — только для live-сегментов EQ, не подменяет экспорт.

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
   setSpectrum / rmsNorm                         ↓
                                         MandalaRenderer (export)
                                         voiceMandalaLayers
```

1. **Начать** → микрофон, при первом запуске — калибровка.
2. Каждый кадр → признаки → params; `PitchContour` копит `pitchTrail`.
3. **Стоп** → кнопки «Мандала PNG/SVG»; `getExportSnapshot()` + `mandalaExport.ts`.
4. **Процесс ZIP** — слепки + итог + `session-report.txt`.

---

## Аудит (июнь 2026)

### Сильные стороны

- Чёткое разделение **live = спектр**, **export = мандала**.
- Документированный маппинг params ↔ акустика (`MappingEngine`, PROJECT.md).
- Калибровка устойчива к обрыву rAF (таймер).
- Экспорт с валидацией размера PNG/SVG.
- 11 unit-тестов (маппинг, калибровка, экспорт-валидация).

### Риски и ограничения

| Проблема | Влияние | Приоритет |
|----------|---------|-----------|
| Короткая сессия без речи | пустой `pitchTrail` → мандала «без голоса» | высокий |
| Один профиль на устройство | похожие мандалы «каждый день» при том же голосе | высокий |
| `pickVoiceMotif` не влияет на экспорт напрямую | след — только polyline, оттенки смены мотива теряются | средний |
| Three.js модули в репо | не в live-пути, мёртвый вес bundle если подключат | низкий |
| Нет e2e в браузере | регрессии UI/экспорта ловятся вручную | средний |

### Безопасность / приватность

- Аудио не отправляется на сервер (кроме опционального «Сохранить узор» для авторизованных).
- Слова не распознаются — только акустика.

---

## Дорожная карта: чувствительность и вариативность

**Цель:** мандала **не одна и та же каждый день** — считываются оттенки голоса, не только громкость.

### 1. Богаче след голоса (export)

- [ ] Кодировать **тип изменения** в следе: толщина/штрих от `VoiceMotifKind`, не отдельные «лепестки».
- [ ] Второе кольцо следа для **Process** (слепки как узлы на орбите).
- [ ] Минимальная длина сессии для экспорта + предупреждение «мало данных».

### 2. Чувствительность live и params

- [ ] Тонкая настройка `normalizeFeatures` — больше динамики в mid-range RMS.
- [ ] Per-session drift: лёгкий сдвиг hue/scale от **session hash** (дата + profile), детерминированно.
- [ ] Микро-jitter от shimmer f₀ (PROJECT.md) — асимметрия звезды.

### 3. Спектр и тембр

- [ ] 8 дуг экспорта — сильнее контраст между полосами (per-band normalize + gamma).
- [ ] Formant bands → форма `drawTimbreCore` (F1–F3), когда появится extractor.

### 4. Калибровка и профиль

- [ ] «Мягкая» перекалибровка раз в N дней без сброса истории.
- [ ] Экспорт метрик профиля в `session-report.txt` для сравнения сессий.

### 5. QA

- [ ] Golden PNG tests (fixture snapshots → hash).
- [ ] Dev-панель: waveform + spectrum + params рядом с мандалой.

---

## Ключевые файлы

| Путь | Назначение |
|------|------------|
| `assets/ts/lab/LabApp.ts` | сессия, калибровка, экспорт |
| `assets/ts/lab/CalibrationRunner.ts` | таймер калибровки |
| `assets/ts/geometry/EqLabRenderer.ts` | live EQ |
| `assets/ts/geometry/MandalaRenderer.ts` | export orchestrator |
| `assets/ts/geometry/voiceMandalaLayers.ts` | слои мандалы |
| `assets/ts/geometry/MappingEngine.ts` | звук → params |
| `assets/ts/geometry/PitchContour.ts` | pitchTrail |
| `assets/ts/export/mandalaExport.ts` | PNG/SVG pipeline |
| `assets/ts/audio/VoiceProfile.ts` | калибровка, normalize |

---

## Команды

```bash
npm run dev          # Vite + Symfony
npm run build        # production assets
npm test             # vitest
npm run typecheck    # tsc
```

---

## Связанные документы

- `PROJECT.md` — продуктовая спецификация и таблица маппингов v1.
- Этот файл — **фактическая реализация** и план шлифовки.
