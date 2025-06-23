# backend/main.py

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from db.session import engine
from db.models  import Base, User

from api.upload           import router as upload_router
from api.catalog          import router as catalog_router
from api.analytics_errors import router as analytics_errors_router
from api.sudoc            import router as sudoc_router
from api.auth             import router as auth_router
from api.logs             import router as logs_router
from api.users import router as users_router
from core.auth        import (
    require_viewer,
    require_book_worm,
    require_cataloger,
    require_admin,
)
from middleware.logging import LoggingMiddleware

# Create tables (development only—use Alembic in prod)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shelf Catalog API")

# CORS (restrict origins before production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request-logging middleware
app.add_middleware(LoggingMiddleware)

# ── AUTHENTICATION ───────────────────────────────────────────────────────────
# /auth/token from api/auth.py
app.include_router(auth_router)

# ── PROTECTED ROUTES ─────────────────────────────────────────────────────────
# Uploads (add/edit items) require book_worm+
app.include_router(
    upload_router,
    prefix="/upload",
    tags=["Upload"],
    dependencies=[Depends(require_book_worm)],
)

# Analytics-errors management requires cataloger+
app.include_router(
    analytics_errors_router,
    prefix="/catalog/analytics-errors",
    tags=["AnalyticsErrors"],
    dependencies=[Depends(require_cataloger)],
)

# Catalog searches require viewer+
app.include_router(
    catalog_router,
    prefix="/catalog",
    tags=["Catalog"],
    dependencies=[Depends(require_viewer)],
)

# SuDoc endpoints require cataloger+
app.include_router(
    sudoc_router,
    prefix="/catalog/sudoc",
    tags=["SuDoc"],
    dependencies=[Depends(require_cataloger)],
)

# ── ADMIN-ONLY ROUTES ─────────────────────────────────────────────────────────
app.include_router(
    logs_router,
    prefix="/logs",
    tags=["Logs"],
    dependencies=[Depends(require_admin)],
)

@app.get("/admin-only", tags=["Admin"])
def read_admin_data(
    current_user: User = Depends(require_admin)
):
    return {"msg": f"Hello {current_user.username}, you’re an admin!"}

# ── USER MANAGEMENT (admin only) ─────────────────────────────────────────────
app.include_router(
    users_router,
    prefix="/users",
    tags=["Users"],
    dependencies=[Depends(require_admin)],
)


