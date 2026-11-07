"""FastAPI application entry point."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.database import init_db, get_db
from app.api import auth, reviews, guidelines, approvals

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting BrandGuard API — initialising database…")
    init_db()
    logger.info("Database ready.")
    yield
    logger.info("BrandGuard API shutting down.")


app = FastAPI(
    title="BrandGuard AI",
    description="AI-powered brand compliance review platform for Nimbus Bank",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(guidelines.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")


# ---------------------------------------------------------------------------
# Health and status checks
# ---------------------------------------------------------------------------
@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/status", tags=["meta"])
@app.get("/status", tags=["meta"])
def status_check(db: Session = Depends(get_db)):
    db_reachable = False
    try:
        db.execute(text("SELECT 1"))
        db_reachable = True
    except Exception as exc:
        logger.error("DB health check failed: %s", exc)
        db_reachable = False

    llm_configured = bool(settings.GEMINI_API_KEY and settings.GEMINI_API_KEY.strip())

    return {
        "status": "ok" if db_reachable else "degraded",
        "llm_key_configured": llm_configured,
        "db_reachable": db_reachable,
    }


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(status_code=404, content={"detail": "Resource not found"})


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.exception("Unhandled server error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
