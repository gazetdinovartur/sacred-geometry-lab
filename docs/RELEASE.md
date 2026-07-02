# Sacred Geometry Lab — выпуск v1.4

**Домен:** [lab.arturlun.ru](https://lab.arturlun.ru)  
**Автор:** [Артур Лун](https://arturlun.ru)

Документ для релиза: что это за проект, что реализовано, как подключить OAuth и как выкатить на продакшн.

---

## 1. Резюме проекта

**Sacred Geometry Lab** — браузерная лаборатория наблюдения: голос, ритм или инструмент превращаются в геометрию в реальном времени. Это не диагностика, не распознавание речи и не «генератор красивых картинок» — форма рождается из измеримых акустических признаков (громкость, частота, спектр, ритм, паузы).

### Для кого

- Музыканты и вокалисты
- Люди в созерцательном / терапевтическом контексте (как инструмент, не замена специалиста)
- Исследователи звука и автор проекта

### Ключевые обещания

| Обещание | Как выполняется |
|----------|-----------------|
| Аудио не уходит на сервер | Web Audio API целиком в браузере |
| Слова не сохраняются | Нет STT / NLP |
| Уникальность узора | VoiceProfile (калибровка ~12 с) + параметры сессии |
| Прозрачность | `/about`, `/ethics`, `/privacy`, `/how` |

### Два режима

| Режим | UI | Суть |
|-------|-----|------|
| **Live** | «Мандала момента» | Живой EQ-круг: 64 полосы спектра, ритм, нота в центре |
| **Process** | «След процесса» | Автоматические слепки + итоговый композит, таймлайн |

### Экспорт

| Формат | Описание |
|--------|----------|
| PNG / SVG | Точечная или слойная мандала (1600×1600 по умолчанию) |
| ZIP (Process) | Кадры слепков + итог + `session-report.txt` |
| **Скачать видео · 3D** | WebM: полёт через туннель колец (Three.js), звук синхронно |
| **Скачать видео · Мандала** | WebM: мандала + голос, кадры по таймлайну Process |
| Сохранить в кабинет | JSON-параметры + SVG (без WAV) |

Тяжёлые экспорты (видео, ZIP) идут **последовательной очередью** — параллельно не гоняются, PNG/SVG — мгновенно.

### Стек

| Слой | Технология |
|------|------------|
| Backend | Symfony 8, PHP 8.4+, MySQL 8.4, Doctrine |
| Frontend | TypeScript, Vite 6, Alpine.js 3, Twig |
| Live | Canvas 2D (`EqLabRenderer`) |
| Export | Paper.js, Three.js, webm-muxer |
| Auth | Google OAuth2 + VK ID (PKCE) |
| Dev | Docker (nginx :8083, MySQL :3310) |
| Prod | NetAngels, document root `public/` |

---

## 2. Задумывалось → что реализовано

### MVP (первая публикация)

| Задумано | Статус |
|----------|--------|
| Главная = лаборатория, «Как ты сейчас?» | ✅ |
| Live: микрофон → живая визуализация | ✅ (64-band EQ, нота, pulse rings) |
| Process: слепки + итог | ✅ |
| Экспорт SVG/PNG | ✅ два стиля (точки / слои) |
| About, Ethics, How | ✅ + отдельная `/privacy` |
| Адаптив desktop/mobile | ✅ |
| Аудио только в браузере | ✅ |

### v1

| Задумано | Статус |
|----------|--------|
| Личный кабинет, история узоров | ✅ CRUD через `/api/patterns` |
| OAuth Google | ✅ `/auth/google` |
| OAuth VK ID | ✅ `/auth/vk` (PKCE S256) |
| OAuth Max | ❌ backlog (API недоступен) |
| Калибровка VoiceProfile | ✅ ~12 с, `localStorage` |
| Ритм → симметрия (3/4/5/7) | ✅ |
| Режим диалога (2 канала) | ❌ код частично есть, UI не подключён |

### v2 и сверх плана

| Задумано | Статус |
|----------|--------|
| Слойная / точечная мандала, чакровая палитра | ✅ |
| Экспорт анимации / видео | ✅ два типа WebM (3D + мандала) |
| Метатрон, меркаба, янтры как стили | ❌ backlog |
| Formant → timbre geometry | ❌ backlog |
| Server thumbnails для узоров | ❌ backlog |
| Очередь экспорта | ✅ добавлено при доработке UX |
| A/V sync в видео (без скачка EQ, без хвоста) | ✅ |
| 3D: глубина туннеля, radial breathing | ✅ |

### Продуктовые принципы (из спецификации)

| Принцип | Реализация |
|---------|------------|
| Математическая точность | `MappingEngine`, документированные формулы |
| Тишина = покой (Rest & Breath) | `SilenceMapper`, не «дыры» в форме |
| Не диагностика | Copy на `/about`, `/ethics` |
| Светлая / тёмная тема | CSS vars + `localStorage` |

Подробная спецификация: [PROJECT.md](../PROJECT.md). Архитектура кода: [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 3. Подключение Google OAuth

### 3.1. Google Cloud Console

1. Откройте [Google Cloud Console](https://console.cloud.google.com/).
2. Создайте проект (или выберите существующий).
3. **APIs & Services → OAuth consent screen** — настройте экран согласия (External или Internal).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
5. Тип: **Web application**.

**Authorized JavaScript origins** (опционально, для dev):

```
http://localhost:8083
https://lab.arturlun.ru
```

**Authorized redirect URIs** — обязательно совпадают с маршрутом Symfony `auth_google_callback`:

```
http://localhost:8083/auth/google/callback
https://lab.arturlun.ru/auth/google/callback
```

6. Скопируйте **Client ID** и **Client Secret**.

### 3.2. Переменные окружения

Создайте `.env.local` в корне репозитория (не коммитить):

```dotenv
OAUTH_GOOGLE_ID=ваш-client-id.apps.googleusercontent.com
OAUTH_GOOGLE_SECRET=ваш-client-secret
```

Конфиг bundle: `config/packages/knpu_oauth2_client.yaml` → `redirect_route: auth_google_callback`.

### 3.3. Проверка

1. Локально: `bin/dev up`, ключи в `.env.local`.
2. Откройте `/account` → «Войти через Google».
3. После callback — редирект на `/account`, пользователь в БД (`users`).

**Scopes:** `email`, `profile` (задаются в `OAuthController::googleStart`).

---

## 4. Подключение VK ID OAuth

VK реализован **отдельно** от Google: PKCE (S256), эндпоинты `id.vk.com`. См. `OAuthController.php`, `VkIdOAuthService.php`.

### 4.1. Кабинет VK ID

1. [id.vk.com](https://id.vk.com/) → создайте приложение (тип «Веб-сайт» / Web).
2. **Redirect URI** — строго:

```
https://lab.arturlun.ru/auth/vk/callback
```

Для локальной разработки добавьте также:

```
http://localhost:8083/auth/vk/callback
```

3. Включите доступ к **email** (scope `email`).
4. Скопируйте **ID приложения** и **Защищённый ключ** (client secret).

### 4.2. Переменные окружения

```dotenv
OAUTH_VK_ID=12345678
OAUTH_VK_SECRET=ваш-защищённый-ключ
```

Без `OAUTH_VK_ID` кнопка VK покажет flash: «VK ID не настроен».

### 4.3. Как работает flow

1. `GET /auth/vk` — генерируется `code_verifier`, в сессию кладётся verifier, редирект на  
   `https://id.vk.com/authorize?...&code_challenge_method=S256&scope=email`
2. `GET /auth/vk/callback?code=...` — обмен code + verifier на token, `user_info`, `findOrCreate('vk', ...)`.
3. Redirect на `/account`.

**Важно:**

- Нужны **рабочие PHP-сессии** (cookies) между шагами 1 и 2.
- **HTTPS на проде** обязателен для OAuth и для доступа к микрофону.
- Redirect URI в VK должен **байт-в-байт** совпадать с `$request->getSchemeAndHost() + /auth/vk/callback`.

---

## 5. Деплой на продакшн (NetAngels)

Целевой хостинг: **NetAngels**, домен **lab.arturlun.ru**, PHP-FPM + nginx/Apache, MySQL 8.x.

### 5.1. Требования сервера

| Компонент | Версия / расширения |
|-----------|---------------------|
| PHP | **8.4+** |
| PHP ext | `pdo_mysql`, `intl`, `zip`, `opcache`, `ctype`, `iconv` |
| Node.js | **18+** (только на этапе сборки assets) |
| MySQL | **8.4** (utf8mb4) |
| Composer | 2.x |
| SSL | Let's Encrypt / сертификат на `lab.arturlun.ru` |

Document root сайта: **`public/`** (не корень репозитория).

### 5.2. База данных

На NetAngels создайте БД и пользователя. Пример DSN:

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/sacred_geometry?serverVersion=8.4&charset=utf8mb4"
```

### 5.3. `.env.local` на сервере

Минимальный набор для prod:

```dotenv
APP_ENV=prod
APP_DEBUG=0
APP_SECRET=случайная-строка-32+-символов

DATABASE_URL="mysql://..."

OAUTH_GOOGLE_ID=...
OAUTH_GOOGLE_SECRET=...
OAUTH_VK_ID=...
OAUTH_VK_SECRET=...

# если сайт за reverse proxy NetAngels:
# TRUSTED_PROXIES=127.0.0.1,REMOTE_ADDR
```

`APP_SECRET`: `php -r "echo bin2hex(random_bytes(16));"`

### 5.4. Первый деплой (SSH)

```bash
cd /path/to/sacred-geometry-lab

# зависимости PHP (без dev)
composer install --no-dev --optimize-autoloader --no-interaction

# frontend
npm ci
npm run build
# → public/build/manifest.json и бандлы

# Symfony prod
composer dump-env prod    # опционально: зафиксировать .env.local.php
php bin/console doctrine:migrations:migrate --no-interaction --env=prod
php bin/console cache:clear --env=prod
php bin/console cache:warmup --env=prod

# права (пользователь php-fpm, часто www-data)
chmod -R ug+rwx var/
```

### 5.5. Nginx (ориентир)

Аналог `docker/nginx/default.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name lab.arturlun.ru;
    root /path/to/project/public;

    location / {
        try_files $uri /index.php$is_args$args;
    }

    location ~ ^/index\.php(/|$) {
        fastcgi_pass unix:/run/php/php8.4-fpm.sock;
        fastcgi_split_path_info ^(.+\.php)(/.*)$;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        internal;
    }

    location ~ \.php$ {
        return 404;
    }

    location ^~ /build/ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
```

HTTP → редирект на HTTPS (OAuth и `getUserMedia` требуют secure context).

### 5.6. Обновление релиза

```bash
git pull
composer install --no-dev --optimize-autoloader --no-interaction
npm ci && npm run build
php bin/console doctrine:migrations:migrate --no-interaction --env=prod
php bin/console cache:clear --env=prod
```

### 5.7. Чеклист перед публикацией

- [ ] HTTPS работает, редирект с HTTP
- [ ] `public/build/` собран и отдаётся статикой
- [ ] Миграции применены (`users`, `patterns`)
- [ ] Google redirect URI = `https://lab.arturlun.ru/auth/google/callback`
- [ ] VK redirect URI = `https://lab.arturlun.ru/auth/vk/callback`
- [ ] Микрофон запрашивается на главной (Chrome/Firefox/Safari)
- [ ] Экспорт WebM — Chrome/Firefox (Safari может не поддерживать mux)
- [ ] `/privacy`, `/ethics`, `/about`, `/how` открываются
- [ ] `bin/dev test` / CI: Vitest + PHPUnit зелёные

### 5.8. Что не деплоится

| Не нужно на prod | Почему |
|------------------|--------|
| `node_modules/` | только build-time |
| Docker-контейнеры dev | локальная разработка |
| `.env` с секретами в git | только `.env.local` на сервере |
| Mailpit | dev-only |

---

## 6. Локальная разработка (напоминание)

```bash
bin/dev up
bin/dev migrate
bin/dev assets   # или bin/dev watch
```

URL: **http://localhost:8083**

OAuth локально: те же ключи в `.env.local` + redirect URIs с `localhost:8083`.

---

## 7. Известные ограничения v1.4

- Режим диалога (2 микрофона) — не в UI
- Max OAuth — backlog
- Thumbnails узоров на сервере — нет, превью из SVG в браузере
- WebM-экспорт — лучше всего Chrome/Firefox
- README/ARCHITECTURE частично описывают старые названия экспорта; актуальные подписи — в UI и [how.html.twig](../templates/pages/how.html.twig)

---

*Версия документа: июнь 2026, релиз v1.4*
