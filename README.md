# Image Search — Yandex Cloud Search API

Веб-приложение для поиска изображений по картинке через [Yandex Cloud Search API](https://aistudio.yandex.ru/docs/ru/search-api/).

![Python](https://img.shields.io/badge/Python-3.12+-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green) ![uv](https://img.shields.io/badge/uv-package%20manager-purple)

## Возможности

- Два режима поиска (переключатель сверху):
  - **По изображению** — похожие изображения по URL или загруженному файлу
  - **По описанию** — изображения по текстовому запросу с фильтрами: формат, размер, ориентация, цвет, семейный фильтр
- Фильтрация результатов по домену
- Настраиваемое количество результатов (по умолчанию 20, до 500)
- Автоматическая постраничная загрузка: страницы запрашиваются параллельно
- Предпросмотр загружаемого файла
- Просмотр изображений в полный размер через lightbox
- Вкладки **Результаты / Request / Response** для отладки API-запросов

## Требования

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Аккаунт Yandex Cloud с доступом к Search API

## Установка

```bash
git clone <repo>
cd yc_image_search_api
uv sync
```

Создайте файл `.env`:

```env
YANDEX_API_KEY=<ваш API-ключ>
YANDEX_FOLDER_ID=<ваш folder ID>
```

## Запуск

```bash
uv run uvicorn main:app --reload
```

Приложение доступно на [http://localhost:8000](http://localhost:8000).

## Структура проекта

```
├── main.py                  # FastAPI app
├── config.py                # Настройки из .env
├── models/schemas.py        # Pydantic-модели
├── routes/search.py         # POST /api/search, GET /api/proxy
├── services/yandex_search.py  # Клиент Yandex Search API
├── templates/index.html     # Интерфейс
└── static/                  # CSS и JS
```

## API

### `POST /api/search` — поиск по изображению

| Параметр | Тип | Описание |
|---|---|---|
| `file` | файл | Изображение для поиска (исключает `url`) |
| `url` | строка | URL изображения (исключает `file`) |
| `site` | строка | Ограничить поиск доменом (необязательно) |
| `limit` | число | Количество результатов, 1–500 (по умолчанию 20) |

### `POST /api/search/text` — поиск по описанию

| Параметр | Тип | Описание |
|---|---|---|
| `query` | строка | Текстовый запрос (обязательно) |
| `site` | строка | Ограничить поиск доменом (необязательно) |
| `limit` | число | Количество результатов, 1–500 (по умолчанию 20) |
| `img_format` | строка | Формат: `IMAGE_FORMAT_JPEG` / `PNG` / `GIF` (необязательно) |
| `img_size` | строка | Размер: `IMAGE_SIZE_LARGE` / `MEDIUM` / … (необязательно) |
| `img_orientation` | строка | Ориентация: `IMAGE_ORIENTATION_HORIZONTAL` / `VERTICAL` / `SQUARE` |
| `img_color` | строка | Цвет: `IMAGE_COLOR_COLOR` / `GRAYSCALE` / `RED` / … |
| `family` | строка | Семейный фильтр: `FAMILY_MODE_MODERATE` (по умолч.) / `NONE` / `STRICT` |

### `GET /api/proxy?url=<url>`

Проксирует изображение через сервер для обхода hotlink protection. При недоступности URL возвращает SVG-заглушку.

## Документация

- [Как искать по изображению](https://aistudio.yandex.ru/docs/ru/search-api/operations/search-images-by-pic.html)
- [Поиск изображений — обзор](https://aistudio.yandex.ru/docs/ru/search-api/concepts/image-search.html)
- [API Reference — ImageSearch](https://aistudio.yandex.ru/docs/ru/search-api/api-ref/ImageSearch/)
- [API Reference — searchByImage](https://aistudio.yandex.ru/docs/ru/search-api/api-ref/ImageSearch/searchByImage.html)
- [Тарифы](https://aistudio.yandex.ru/docs/ru/search-api/pricing.html)
