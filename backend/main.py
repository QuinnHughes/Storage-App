# shelf-app/backend/main.py
from fastapi import FastAPI
from backend.api import upload, catalog, analytics
from backend.db.session import engine
from backend.db import models

# Create DB tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shelf Catalog API")

# Include routers
app.include_router(upload.router, prefix="/upload", tags=["Upload"])
app.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
app.include_router(analytics.router, prefix="/upload/analytics", tags=["Analytics"])
