# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.session import engine
from db.models import Base
from api import upload, catalog, analytics_errors  
from api.sudoc import router as sudoc_router 

# This will make new tables in postgres if no matching table is available, 
# use this if setting up a new database and instead of making tables just run the backend via uvicorn, if that doesnt work kick rocks.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Shelf Catalog API")

# Dont change the ports unless you want this to look like hell
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # lock this down later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/upload", tags=["Upload"])
app.include_router(catalog.router, prefix="/catalog", tags=["Catalog"])
app.include_router(analytics_errors.router, prefix="/catalog", tags=["AnalyticsErrors"])
app.include_router(sudoc_router, prefix="/catalog", tags=["SuDoc"])

# upload router used for item uploads/database
# catalog router allows quieres of items in database
# app.include_router(analytics.router, prefix="/upload/analytics", tags=["Analytics"])
