from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


def _build_engine():
    if settings.DATABASE_URL:
        url = settings.DATABASE_URL
        return create_engine(url)
    else:
        url = "sqlite:///./brandguard.db"
        return create_engine(url, connect_args={"check_same_thread": False})


engine = _build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # Import models so they register with Base
    from app.models import db as _  # noqa: F401
    Base.metadata.create_all(bind=engine)
