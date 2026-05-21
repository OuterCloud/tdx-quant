from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    DATABASE_URL: str = "postgresql+asyncpg://tdx:tdx_dev@localhost:5432/tdx_quant"
    REDIS_URL: str = "redis://localhost:6380/0"

    APP_NAME: str = "tdx-quant"
    DEBUG: bool = False

    # Data storage
    DATA_DIR: Path = Path("data")

    # TDX settings
    TDX_MAX_WORKERS: int = 4
    TDX_TEST_MODE: bool = False
    TDX_TEST_STOCK_LIMIT: int = 50

    # Screening defaults
    SCREEN_MIN_AMOUNT: float = 2e8  # 2亿


settings = Settings()
