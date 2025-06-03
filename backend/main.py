# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.session import engine
from db.models import Base
from api import upload, catalog  # analytics is optional for now

# Create tables (if they don’t exist)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shelf Catalog API")

# If your frontend runs on another port (e.g. React on 5173), allow CORS:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # you can lock this down later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/upload", tags=["Upload"])
app.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
# For now, leave analytics router commented until you wire it:
# from api import analytics
# app.include_router(analytics.router, prefix="/upload/analytics", tags=["Analytics"])
