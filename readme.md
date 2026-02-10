# Telegram Parser & Translator

Парсер та перекладач постів з Telegram-каналів на українську мову з адмін-панеллю для модерації перед публікацією.

## Можливості

- Парсинг постів з будь-яких Telegram-каналів (реальний час + історія)
- Автоматичний переклад через LLM зі збереженням форматування (жирний, курсив, код, цитати, спойлери, посилання)
- Збереження та пересилання медіафайлів (фото, відео, документи)
- Адмін-панель для перегляду, редагування та модерації перекладів
- Публікація одобрених постів у цільовий канал через бота
- Веб-інсталятор для першого налаштування (без ручного редагування `.env`)

## Швидкий старт

### Вимоги

- **Node.js** 20+
- **Docker** (для PostgreSQL)
- Telegram API credentials з [my.telegram.org](https://my.telegram.org)
- LLM API ключ

### Встановлення

```bash
git clone <repo-url> && cd telegram-parser
npm install
cd admin && npm install && cd ..
npm run dev
```

При першому запуску (коли `.env` ще немає) автоматично відкриється **Setup Wizard** на `http://localhost:3001` — він проведе через усі кроки:

1. Перевірка Docker
2. Запуск PostgreSQL + міграції
3. Створення адмін-акаунту
4. Telegram API credentials
5. Авторизація Telegram-сесії (через браузер, без CLI)
6. Налаштування LLM

Після завершення wizard записує `.env` і автоматично запускає основний додаток.

### Ручне налаштування (альтернатива)

Якщо wizard не потрібен — скопіюйте `.env.example` → `.env` і заповніть вручну:

```bash
cp .env.example .env
docker compose up -d
npx prisma migrate deploy
npm run dev
```

## Змінні середовища

| Змінна | Опис | Обов'язкова |
|--------|------|:-----------:|
| `TELEGRAM_API_ID` | API ID з my.telegram.org | Для парсингу |
| `TELEGRAM_API_HASH` | API Hash | Для парсингу |
| `TELEGRAM_SESSION` | Строка сесії gramjs | Для парсингу |
| `TELEGRAM_BOT_TOKEN` | Токен бота для публікації | Ні |
| `TARGET_CHANNEL_ID` | ID каналу для публікації | Ні |
| `LLM_API_KEY` | Ключ API для LLM | Так |
| `LLM_BASE_URL` | URL LLM API | Ні (default: `https://api.voidai.app/v1`) |
| `LLM_MODEL` | Модель LLM | Ні (default: `gpt-5.1`) |
| `DATABASE_URL` | PostgreSQL connection string | Так |
| `ADMIN_USERNAME` | Логін адмін-панелі | Ні (default: `admin`) |
| `ADMIN_PASSWORD` | Пароль адмін-панелі | Так |
| `JWT_SECRET` | Секрет для JWT токенів | Так |
| `POLLER_INTERVAL_MS` | Інтервал полінгу каналів (мс) | Ні (default: `60000`) |
| `POLLER_INITIAL_SYNC_DAYS` | Глибина початкової синхронізації (дні) | Ні (default: `30`) |

## Архітектура

```
src/
├── launcher.ts           # Entry point — wizard або main app
├── index.ts              # Основний додаток
├── config.ts             # Конфігурація з .env
├── parser/
│   ├── client.ts         # Telegram клієнт (gramjs)
│   ├── listener.ts       # Реальний час — нові повідомлення
│   ├── poller.ts         # Фоновий полінг каналів
│   ├── history.ts        # Завантаження історії каналу
│   └── formatter.ts      # Entities → Telegram HTML
├── translator/
│   └── llm.ts            # Переклад через LLM + верифікація
├── bot/
│   └── publisher.ts      # Публікація через Bot API
├── server/
│   ├── app.ts            # Express сервер
│   ├── routes.ts         # REST API роути
│   └── auth.ts           # JWT автентифікація
├── db/
│   └── repository.ts     # Prisma CRUD операції
├── media/
│   └── downloader.ts     # Завантаження медіафайлів
└── setup/                # Веб-інсталятор
    ├── server.ts         # Express сервер wizard
    ├── routes.ts         # API роути wizard
    ├── html.ts           # UI (inline HTML + Tailwind CDN)
    ├── docker.ts         # Docker утиліти
    ├── env-writer.ts     # Запис .env
    └── telegram-auth.ts  # Telegram авторизація через браузер

admin/                    # React фронтенд (Vite + Tailwind)
├── src/
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── PostList.tsx      # Нові пости (реальний час)
│   │   ├── PostDetail.tsx    # Деталі поста + редагування
│   │   ├── Channels.tsx      # Список каналів
│   │   └── ChannelDetail.tsx # Історія каналу з фільтрами
│   └── components/
│       ├── PostCard.tsx
│       ├── StatusBadge.tsx
│       ├── MediaPreview.tsx
│       └── TargetAutocomplete.tsx
```

## Як це працює

### Пайплайн обробки поста

```
Telegram канал
    ↓
Poller/Listener (gramjs)
    ↓
Збереження в БД (originalText + entities + media)
    ↓
Переклад: entities → HTML → LLM → верифікація тегів
    ↓
Адмін-панель: перегляд, редагування, approve/reject
    ↓
Публікація в цільовий канал (Bot API, parseMode: "html")
```

### Статуси постів

- **PENDING** — новий пост, очікує модерації
- **APPROVED** — схвалений, готовий до публікації
- **REJECTED** — відхилений
- **PUBLISHED** — опублікований у цільовий канал

## Скрипти

```bash
npm run dev          # Запуск (tsx, з авто-wizard)
npm run build        # Компіляція TypeScript
npm run start        # Запуск скомпільованої версії
npm run db:migrate   # Prisma міграції (dev)
npm run db:generate  # Генерація Prisma клієнта
npm run db:studio    # Prisma Studio (GUI для БД)
```

Адмін-панель (окремо):

```bash
cd admin
npm run dev          # Vite dev сервер на :5173
npm run build        # Production збірка
```

## База даних

PostgreSQL 16 через Docker Compose на порту `5433` (щоб не конфліктувати з локальним Postgres).

```bash
docker compose up -d     # Запуск
docker compose down      # Зупинка
docker compose logs -f   # Логи
```

### Схема

- **Channel** — відстежувані канали (username, active, targetChannelId)
- **Post** — пости (originalText, translatedText, entities, status, isHistorical)
- **Media** — медіафайли (type, filePath, mimeType), каскадне видалення з постом
- **Subscription** — кешований список каналів/груп з Telegram

## API

Всі ендпоінти під `/api/`, захищені JWT (крім `/api/auth/login` та `/api/health`).

| Метод | Шлях | Опис |
|-------|------|------|
| POST | `/api/auth/login` | Автентифікація |
| GET | `/api/health` | Перевірка стану |
| GET | `/api/posts` | Список постів (фільтри: status, channelId, isHistorical, since) |
| GET | `/api/posts/:id` | Деталі поста |
| PUT | `/api/posts/:id` | Оновити переклад |
| POST | `/api/posts/:id/translate` | Перекласти пост (LLM) |
| POST | `/api/posts/:id/approve` | Схвалити |
| POST | `/api/posts/:id/reject` | Відхилити |
| POST | `/api/posts/:id/publish` | Опублікувати |
| DELETE | `/api/posts/:id` | Видалити пост + медіа |
| GET | `/api/channels` | Список каналів |
| POST | `/api/channels` | Додати канал |
| PATCH | `/api/channels/:id` | Оновити target channel |
| DELETE | `/api/channels/:id` | Видалити канал |
| POST | `/api/channels/:id/fetch-history` | Завантажити історію (SSE) |
| GET | `/api/telegram/dialogs` | Список діалогів з Telegram |
| GET | `/api/telegram/avatar/:id` | Аватар каналу/групи |
| GET | `/api/media/:id` | Отримати медіафайл |
| POST | `/api/posts/:id/media` | Завантажити медіа |
| DELETE | `/api/media/:id` | Видалити медіа |
