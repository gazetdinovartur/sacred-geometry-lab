# Voice Mandala — реализация и развитие

> **Статус:** v1.3 (июнь 2026) · ветка `main`  
> **Live:** честный EQ-круг · **Экспорт:** структурированная мандала из голоса

---

## Что сделано

### Live (экран Live / Process)

- **8 зон спектра** — дуги по частотам, усиленная чувствительность сегментов.
- **Кольцо уровня** + **% · Уровень** — нормализованный RMS (`levelNorm`), **0% в тишине** (не подмена через `opacity` params).
- **Hz + точка тона** — основная частота на круге.
- **Калибровка ~12 сек** — таймер независим от rAF (`CalibrationRunner`), кнопка «Перекалибровать», пропуск.
- Режим **Process** — слепки по ходу; на экране по-прежнему спектр, не мандала.

### Экспорт (PNG / SVG / ZIP сессии)

Отдельный рендер `MandalaRenderer` + слои в `voiceMandalaLayers.ts`.

**Принцип:** один акустический параметр → один визуальный слой. Без «леса» из десяти типов мотивов.

| Слой | Источник | Файл |
|------|----------|------|
| Вложенные кольца | гармоники → `elementCount` | `drawHarmonicRings` |
| 8 дуг спектра | `snapshot.spectrum` (peak + gamma) | `drawSpectrumArcs` |
| Лучи (3–12) | тон → `rays`, `pitchAngle` | `drawToneRays` |
| Звезда N-лучей | ритм → `symmetry` + shimmer f₀/flux | `drawRhythmStar` |
| Малый многоугольник | тембр → `lineWidth` | `drawTimbreCore` |
| Цветок жизни | каркас стиля `flower` | `drawFlowerScaffold` |
| **Линия следа голоса** | `pitchTrail`, штрих/толщина от `VoiceMotifKind` | `drawVoiceTrace` |
| Орбита Process | слепки как узлы | `drawProcessOrbit` |
| Внешнее кольцо | RMS → `radius`, `opacity` | `drawRmsRing` |
| Метка Hz | `features.frequency` | `drawPitchMarker` |
| Дыхание (редко) | пауза → `breathRing` | `MandalaRenderer` |

Экспорт **не** рисует live-canvas: offscreen Paper.js 960×960, проверка на пустые файлы и короткий след (`exportValidation.ts`).

### Калибровка и профиль

- `VoiceProfile` — границы RMS / f₀ / centroid, `localStorage` (`sgl-voice-profile`), дата калибровки.
- `spectrumGain()` — только для live-сегментов EQ, не подменяет экспорт.
- **Мягкая перекалибровка** — подсказка через 14 дней без сброса профиля.
- **Session variety** — детерминированный сдвиг hue/scale/star от `profileHash + sessionStarted` (`sessionVariety.ts`).

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
                                         voiceMandalaLayers
                                         + applySessionVariety
```

1. **Начать** → микрофон, при первом запуске — калибровка.
2. Каждый кадр → признаки → params; `PitchContour` копит `pitchTrail`.
3. **Стоп** → кнопки «Мандала PNG/SVG»; `getExportSnapshot()` + проверка `validateExportReadiness`.
4. **Process ZIP** — слепки + итог + `session-report.txt` (метрики профиля).

---

## Аудит (июнь 2026)

### Сильные стороны

- Чёткое разделение **live = спектр**, **export = мандала**.
- Документированный маппинг params ↔ акустика (`MappingEngine`, PROJECT.md).
- Калибровка устойчива к обрыву rAF (таймер).
- Экспорт с валидацией размера PNG/SVG и минимального следа голоса.
- Unit-тесты (маппинг, калибровка, экспорт, session variety).

### Оставшиеся ограничения

| Проблема | Статус |
|----------|--------|
| Короткая сессия без речи | **исправлено** — guard + сообщение пользователю |
| Похожие мандалы каждый день | **смягчено** — session fingerprint + motif stroke в следе |
| Three.js модули в репо | не в live-bundle; экспериментальный код |
| Нет e2e в браузере | golden PNG / e2e — в backlog |

### Безопасность / приватность

- Аудио не отправляется на сервер (кроме опционального «Сохранить узор» для авторизованных).
- Слова не распознаются — только акустика.

---

## Дорожная карта: чувствительность и вариативность

**Цель:** мандала **не одна и та же каждый день** — считываются оттенки голоса, не только громкость.

### 1. Богаче след голоса (export)

- [x] Кодировать **тип изменения** в следе: толщина/штрих от `VoiceMotifKind`.
- [x] Второе кольцо следа для **Process** (слепки как узлы на орбите).
- [x] Минимальная длина сессии для экспорта + предупреждение «мало данных».

### 2. Чувствительность live и params

- [x] Тонкая настройка `normalizeFeatures` — больше динамики в mid-range RMS.
- [x] Per-session drift: сдвиг hue/scale от **session hash** (дата + profile).
- [x] Микро-jitter от shimmer f₀ — асимметрия звезды.

### 3. Спектр и тембр

- [x] 8 дуг экспорта — per-band peak normalize + gamma.
- [ ] Formant bands → форма `drawTimbreCore` (F1–F3), когда появится extractor.

### 4. Калибровка и профиль

- [x] «Мягкая» перекалибровка раз в N дней без сброса истории.
- [x] Экспорт метрик профиля в `session-report.txt`.

### 5. QA

- [ ] Golden PNG tests (fixture snapshots → hash).
- [x] Dev-панель: `?dev=1` — RMS, spectrum, params рядом с кругом.

---

## Ключевые файлы

| Путь | Назначение |
|------|------------|
| `assets/ts/lab/LabApp.ts` | сессия, калибровка, экспорт, dev panel |
| `assets/ts/lab/CalibrationRunner.ts` | таймер калибровки |
| `assets/ts/geometry/EqLabRenderer.ts` | live EQ |
| `assets/ts/geometry/MandalaRenderer.ts` | export orchestrator |
| `assets/ts/geometry/voiceMandalaLayers.ts` | слои мандалы |
| `assets/ts/geometry/sessionVariety.ts` | fingerprint сессии |
| `assets/ts/geometry/MappingEngine.ts` | звук → params |
| `assets/ts/geometry/PitchContour.ts` | pitchTrail |
| `assets/ts/export/mandalaExport.ts` | PNG/SVG pipeline |
| `assets/ts/export/exportValidation.ts` | guards экспорта |
| `assets/ts/audio/VoiceProfile.ts` | калибровка, normalize |

---

## Команды

```bash
npm run dev          # Vite + Symfony
npm run build        # production assets
npm test             # vitest
npm run typecheck    # tsc
```

Dev-панель на главной: `/?dev=1`

---

## Связанные документы

- `PROJECT.md` — продуктовая спецификация и таблица маппингов v1.
- Этот файл — **фактическая реализация** и план шлифовки.
