# Image Search — Yandex Cloud Search API

Веб-приложение для поиска изображений по картинке через [Yandex Cloud Search API](https://aistudio.yandex.ru/docs/ru/search-api/).

![Python](https://img.shields.io/badge/Python-3.11+-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green) ![uv](https://img.shields.io/badge/uv-package%20manager-purple)

## Возможности

- Поиск похожих изображений по URL или загруженному файлу
- Фильтрация результатов по домену
- Настраиваемое количество результатов (по умолчанию 20, до 500)
- Автоматическая постраничная загрузка: при лимите > 40 страницы запрашиваются параллельно
- Предпросмотр загружаемого файла
- Просмотр изображений в полный размер через lightbox
- Вкладки **Результаты / Request / Response** для отладки API-запросов

## Требования

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)
- Аккаунт Yandex Cloud с доступом к Search API

## Установка

```bash
git clone <repo>
cd image_search_api
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

### `POST /api/search`

| Параметр | Тип | Описание |
|---|---|---|
| `file` | файл | Изображение для поиска (исключает `url`) |
| `url` | строка | URL изображения (исключает `file`) |
| `site` | строка | Ограничить поиск доменом (необязательно) |
| `limit` | число | Количество результатов, 1–500 (по умолчанию 20) |

### `GET /api/proxy?url=<url>`

Проксирует изображение через сервер для обхода hotlink protection.

## Документация

- [Как искать по изображению](https://aistudio.yandex.ru/docs/ru/search-api/operations/search-images-by-pic.html)
- [API Reference](https://aistudio.yandex.ru/docs/ru/search-api/api-ref/ImageSearch/searchByImage.html)
- [Тарифы](https://aistudio.yandex.ru/docs/ru/search-api/pricing.html)
