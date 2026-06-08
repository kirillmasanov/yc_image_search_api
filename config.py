from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    yandex_api_key: str
    yandex_folder_id: str
    root_path: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
