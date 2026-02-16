import asyncio

from app.core.settings import get_settings

settings = get_settings()


async def run_worker() -> None:
    # placeholder: aqui depois entra o loop que lê inbox/fila
    while True:
        print(f"[worker] running env={settings.app_env}")
        await asyncio.sleep(5)


def main() -> None:
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
