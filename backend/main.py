# backend/main.py

import os
import sys
# Add the backend directory itself to sys.path so "db", "api", etc. resolve correctly
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from db.session import engine
from db.models import Base, User

from api.upload import router as upload_router
from api.catalog import router as catalog_router
from api.analytics import router as analytics_router
from api.analytics_errors import router as analytics_errors_router
from api.sudoc import router as sudoc_router
from api.auth import router as auth_router
from api.logs import router as logs_router
from api.accession import router as accession_router
from api.weed import router as weed_router
from api.users import router as users_router
from api.record_management import router as record_management_router
from core.auth import (
    require_viewer,
    require_book_worm,
    require_cataloger,
    require_admin,
)
from middleware.logging import LoggingMiddleware

# Create tables (development only—use Alembic in prod)
if os.getenv("ENV", "dev") == "dev":
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Shelf Catalog API",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    debug=True  # Enable debug mode
)
# CORS (restrict origins before production)
origins = os.getenv("FRONTEND_URL", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/docs", include_in_schema=False)
async def docs_redirect():
    return RedirectResponse(url="/api/docs")

@app.get("/openapi.json", include_in_schema=False)
async def openapi_redirect():
    return RedirectResponse(url="/api/openapi.json")

@app.get("/redoc", include_in_schema=False)
async def redoc_redirect():
    return RedirectResponse(url="/api/redoc")

# Health check (for Kubernetes/LB probes)
@app.get("/api/health", include_in_schema=False)
async def health():
    return {"status": "ok"}
# ── ROUTES ───────────────────────────────────────────────────────────────────
# Request-logging middleware
app.add_middleware(LoggingMiddleware)

# ── AUTHENTICATION ───────────────────────────────────────────────────────────
# Registers POST /auth/token (and GET /auth/me if implemented)
app.include_router(
    auth_router,
    prefix="/api/auth",        
    tags=["Auth"],
)

# ── PROTECTED ROUTES ─────────────────────────────────────────────────────────
app.include_router(
    upload_router,
    prefix="/api/upload",
    tags=["Upload"],
    dependencies=[Depends(require_book_worm)],
)
app.include_router(
    analytics_errors_router,
    prefix="/api/catalog/analytics-errors",
    tags=["AnalyticsErrors"],
    dependencies=[Depends(require_cataloger)],
)
app.include_router(
    analytics_router,
    prefix="/api/analytics",
    tags=["Analytics"],
    dependencies=[Depends(require_viewer)],
)
app.include_router(
    catalog_router,
    prefix="/api/catalog",
    tags=["Catalog"],
    dependencies=[Depends(require_viewer)],
)
app.include_router(
    sudoc_router,
    prefix="/api/catalog/sudoc",
    tags=["SuDoc"],
    dependencies=[Depends(require_cataloger)],
)
app.include_router(
    accession_router,
    prefix="/api/accession",
    tags=["Accession"],
    dependencies=[Depends(require_book_worm)],
)
app.include_router(
    weed_router,
    prefix="/api/weed",
    tags=["Weeded Items"],
    dependencies=[Depends(require_cataloger)],
)
app.include_router(
    record_management_router,
    prefix="/api/record-management",
    tags=["record-management"],
    dependencies=[Depends(require_cataloger)]
)
    
# ── ADMIN-ONLY ROUTES ─────────────────────────────────────────────────────────
app.include_router(
    logs_router,
    prefix="/api/logs",
    tags=["Logs"],
    dependencies=[Depends(require_admin)],
)


# ── USER MANAGEMENT (admin only) ─────────────────────────────────────────────
app.include_router(
    users_router,
    prefix="/api/users",
    tags=["Users"],
    dependencies=[Depends(require_admin)],
)
