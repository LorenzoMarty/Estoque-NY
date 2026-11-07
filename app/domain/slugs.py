import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Product


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:200] or "produto"


async def unique_slug(session: AsyncSession, name: str) -> str:
    """slugify(name), with -2, -3... appended while another product owns it."""
    base = slugify(name)
    taken = set(
        await session.scalars(select(Product.slug).where(Product.slug.like(f"{base}%")))
    )
    slug, n = base, 2
    while slug in taken:
        slug, n = f"{base}-{n}", n + 1
    return slug
