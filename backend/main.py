# backend/main.py

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from db.session       import engine
from db.models        import Base, User
from api.upload       import router as upload_router
from api.catalog      import router as catalog_router
from api.analytics_errors import router as analytics_errors_router
from api.sudoc        import router as sudoc_router
from api.auth         import router as auth_router
from api.logs         import router as logs_router
from core.auth        import get_current_user, require_admin
from middleware.logging import LoggingMiddleware

# Create tables (development only—use Alembic in prod)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shelf Catalog API")

# CORS (lock down allow_origins before production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request‐logging middleware (writes every request into user_logs)
app.add_middleware(LoggingMiddleware)

# ── AUTHENTICATION ───────────────────────────────────────────────────────────
# This registers exactly one POST /auth/token (router defines prefix="/auth")
app.include_router(auth_router)

# ── PROTECTED ROUTES ─────────────────────────────────────────────────────────
# All require a valid JWT (any role)
app.include_router(
    upload_router,
    prefix="/upload",
    tags=["Upload"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    analytics_errors_router,
    prefix="/catalog/analytics-errors",
    tags=["AnalyticsErrors"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    catalog_router,
    prefix="/catalog",
    tags=["Catalog"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    sudoc_router,
    prefix="/catalog/sudoc",
    tags=["SuDoc"],
    dependencies=[Depends(get_current_user)],
)

# ── ADMIN‐ONLY ROUTES ─────────────────────────────────────────────────────────
# Viewing logs
app.include_router(
    logs_router,
    prefix="/logs",
    tags=["Logs"],
    dependencies=[Depends(require_admin)],
)

# Example inline admin endpoint
@app.get("/admin-only", tags=["Admin"])
def read_admin_data(current_user: User = Depends(require_admin)):
    return {"msg": f"Hello {current_user.username}, you’re an admin!"}
