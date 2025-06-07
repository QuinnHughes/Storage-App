# backend/api/analytics.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import models
from db.session import get_db
from schemas.analytics import AnalyticsRead

router = APIRouter()


@router.get("/analytics/{barcode}", response_model=AnalyticsRead)
def get_analytics_by_barcode(barcode: str, db: Session = Depends(get_db)):
    result = db.query(models.Analytics).filter(models.Analytics.barcode == barcode).first()
    if not result:
        raise HTTPException(status_code=404, detail="Analytics data not found")
    return result


@router.get("/analytics-search", response_model=list[AnalyticsRead])
def search_analytics(
    title: str = Query(None),
    alternative_call_number: str = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(models.Analytics)
    if title:
        query = query.filter(models.Analytics.title.ilike(f"%{title}%"))
    if alternative_call_number:
        query = query.filter(models.Analytics.alternative_call_number.ilike(f"%{alternative_call_number}%"))
    return query.all()
