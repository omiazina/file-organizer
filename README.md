# file-organizer

CLI-інструмент на Node.js для аналізу, пошуку дублікатів, сортування та
очищення файлів у директорії.

## Вимоги

- Node.js 18+ (рекомендовано LTS)

## Встановлення

```bash
git clone <your-repo-url>
cd 1_file-organizer
```

Залежностей немає — використовуються лише вбудовані модулі Node.js.

## Структура проєкту

```
file-organizer/
├── package.json
├── .gitignore
├── README.md
├── file-organizer.js
└── lib/
    ├── scanner.js
    ├── duplicates.js
    ├── organizer.js
    └── cleanup.js
```

## Команди

### `scan` — аналіз директорії

Рекурсивно сканує директорію та показує статистику: кількість файлів, розміри,
типи, вік, топ-3 найбільших файлів і найстаріший файл.

```bash
node file-organizer.js scan /path/to/directory
npm run scan -- /path/to/directory
```

### `duplicates` — пошук дублікатів

Обчислює SHA-256 хеші через streams і знаходить файли з однаковим вмістом.
Показує групи дублікатів і витрачене місце на диску.

```bash
node file-organizer.js duplicates /path/to/directory
npm run duplicates -- /path/to/directory
```

### `organize` — сортування по категоріях

Копіює файли в цільову директорію за категоріями:

- Documents
- Images
- Archives
- Code
- Videos
- Other

Оригінали не видаляються. Файли ≥ 10 MB копіюються через streams. При конфлікті
імен додається суфікс `(1)`, `(2)` тощо.

```bash
node file-organizer.js organize /source/directory --output /target/directory
npm run organize -- /source/directory --output /target/directory
```

### `cleanup` — видалення старих файлів

Знаходить файли старші за вказану кількість днів (`mtime`).

Без `--confirm` працює в dry run режимі (тільки список):

```bash
node file-organizer.js cleanup /path/to/directory --older-than 90
npm run cleanup -- /path/to/directory --older-than 90
```

З `--confirm` файли видаляються:

```bash
node file-organizer.js cleanup /path/to/directory --older-than 90 --confirm
npm run cleanup -- /path/to/directory --older-than 90 --confirm
```

## Архітектура

Кожна команда реалізована як окремий клас на базі `EventEmitter` у `lib/`.
Головний файл `file-organizer.js` підписується на події та відповідає за вивід у
консоль (прогрес-бар, звіти).

Файлові операції обгорнуті в `try...catch` з повідомленнями для `ENOENT`,
`EACCES` та інших помилок.
