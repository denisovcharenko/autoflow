# AutoFlow

Автопостинг картинок і тексту в Threads, Instagram та LinkedIn. Працює безкоштовно на Google Sheets і GitHub Actions.

## Як це працює

1. Додаєш у таблицю ідею й картинку, статус `idea`.
2. Просиш Claude Code: «підготуй чернетки». Він пише окремий текст під кожну мережу і ставить `draft`.
3. Перевіряєш тексти, ставиш дату і статус `approved`.
4. Кожні 30 хвилин GitHub перевіряє таблицю й публікує один пост, час якого настав.

Статуси: `idea` → `draft` → `approved` → `publishing` → `published` або `failed`.

- `failed`: причина є в колонці `error`. Виправ її і знову постав `approved`. Мережі, куди пост уже вийшов, не повторюються.
- `publishing` надовго: запуск обірвався. Спершу перевір мережі вручну, щоб не опублікувати пост удруге, і лише потім міняй статус.

## Колонки таблиці

| Колонка | Що писати |
|---|---|
| `id` | Унікальна назва, наприклад `case-studio-1` |
| `status` | Статус зі списку вище |
| `publish_at` | Час у форматі `2026-11-10 10:00`, за Києвом |
| `platforms` | `threads, instagram, linkedin` |
| `media` | Шляхи через кому: `media/a.jpg, media/b.jpg`. До 20 файлів |
| `idea` | Про що пост |
| `threads_text`, `instagram_text`, `linkedin_text` | Тексти постів |
| `published_at`, `results`, `error` | Заповнюються автоматично |

Обмеження: Instagram приймає лише JPG і завжди потребує картинку. Threads приймає JPG і PNG, LinkedIn ще й GIF. Відео поки не підтримується.

## Налаштування

### 1. Таблиця
1. Створи Google Sheet і імпортуй `sheet-template.csv`.
2. Назви вкладку `Queue`.
3. Скопіюй ID таблиці: це частина посилання між `/d/` і `/edit`.

### 2. Доступ до таблиці для GitHub
1. У [Google Cloud Console](https://console.cloud.google.com/) створи проєкт і увімкни Google Sheets API.
2. Створи Service Account і завантаж його JSON-ключ. Не клади цей файл у репозиторій.
3. Дай email цього акаунта доступ редактора до таблиці.

### 3. Threads та Instagram
1. На [Meta for Developers](https://developers.facebook.com/apps/) створи застосунок із доступом до Threads API та Instagram API.
2. Instagram має бути професійним акаунтом (Business або Creator).
3. Додай свої акаунти як тестувальників застосунку.
4. Згенеруй довготривалі токени в панелі застосунку. Вони діють 60 днів, оновлення налаштовано в кроці 6.

Потрібні дозволи: `threads_basic`, `threads_content_publish`, `instagram_business_basic`, `instagram_business_content_publish`.

### 4. LinkedIn
1. Створи застосунок на [LinkedIn Developers](https://www.linkedin.com/developers/apps). Йому потрібна сторінка компанії.
2. На вкладці Products додай **Share on LinkedIn** і **Sign In with LinkedIn using OpenID Connect**.
3. Отримай токен через [Token Generator](https://www.linkedin.com/developers/tools/oauth/token-generator) з дозволами `openid`, `profile`, `w_member_social`.
4. Постав у календар нагадування випускати новий токен приблизно раз на 50 днів. Автоматично він не оновлюється.

### 5. Репозиторій
Репозиторій має бути **публічним**, бо Instagram і Threads забирають картинки за відкритим посиланням. Усе, що лежить у `media/`, видно всім, тому додавай роботу незадовго до публікації. Токени зберігаються в зашифрованих секретах GitHub, а не в коді.

1. У Settings → Pages обери Deploy from a branch, гілку `main`, папку `/ (root)`.
2. У Settings → Secrets and variables → Actions додай секрети:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: увесь вміст JSON-ключа
   - `THREADS_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`
3. Там само додай змінні:
   - `MEDIA_BASE_URL`: `https://ТВІЙ-ЛОГІН.github.io/НАЗВА-РЕПОЗИТОРІЮ`
   - `TIMEZONE`: `Europe/Kyiv`

Мережу можна не підключати: якщо токена немає, а мережа вказана в рядку, цей рядок отримає статус `failed` із поясненням.

### 6. Автооновлення токенів
1. Створи [fine-grained токен GitHub](https://github.com/settings/personal-access-tokens) лише для цього репозиторію з дозволом Secrets: Read and write.
2. Додай його як секрет `GH_SECRETS_PAT`.

Перше оновлення запускай не раніше ніж через 24 години після створення токенів.

## Перевірка перед запуском

Скопіюй `.env.example` у `.env`, заповни значення і запусти:

```bash
npm ci
```

```bash
npm run check
```

```bash
npm run post:dry
```

`check` показує, чи працює кожен доступ. `post:dry` показує, що було б опубліковано, і нічого не змінює.

Для першого реального тесту постав один пост на `threads`, а в GitHub відкрий Actions → Publish due posts → Run workflow.

## Що варто знати
- GitHub може запускати розклад із запізненням, тому пост інколи виходить трохи пізніше.
- GitHub вимикає розклад у публічному репозиторії після 60 днів без активності. Регулярні коміти картинок цьому запобігають.
- Про кожен збій GitHub надсилає лист на пошту.

## Команди

| Команда | Що робить |
|---|---|
| `npm test` | Запускає тести |
| `npm run check` | Перевіряє доступи |
| `npm run post:dry` | Показує, що вийшло б, без публікації |
| `npm run post` | Публікує один пост, час якого настав |
