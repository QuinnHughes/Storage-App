# backend/api/analytics_errors.py

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db import models
from schemas.analytics import AnalyticsErrorRead

router = APIRouter()

@router.get(
    "/",  
    response_model=List[AnalyticsErrorRead],
    summary="List all analytics error records"
)
def list_analytics_errors(db: Session = Depends(get_db)):
    """
    Retrieve all rows from the analytics_errors table.
    """
    return db.query(models.AnalyticsError).all()
