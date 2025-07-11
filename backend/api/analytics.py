# backend/api/analytics.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db import models
from db.session import get_db
from schemas.analytics import AnalyticsRead

router = APIRouter()


@router.get(
    "/search/analytics",
    response_model=List[AnalyticsRead],
    summary="Search analytics by title, barcode, call numbers, policy, location or status",
)
def search_analytics(
    title: Optional[str]                = Query(None, description="substring match on title"),
    barcode: Optional[str]              = Query(None, description="substring match on barcode"),
    alternative_call_number: Optional[str]
                                        = Query(None, alias="alternative_call_number",
                                                description="substring match on alt call#"),
    call_number: Optional[str]          = Query(None, alias="call_number",
                                                description="substring match on permanent call#"),
    item_policy: Optional[str]          = Query(None, description="exact match on item_policy"),
    location_code: Optional[str]        = Query(None, description="exact match on location_code"),
    status: Optional[str]               = Query(None, description="exact match on status"),
    db: Session                         = Depends(get_db),
):
    query = db.query(models.Analytics)
    if title:
        query = query.filter(models.Analytics.title.ilike(f"%{title}%"))
    if barcode:
        query = query.filter(models.Analytics.barcode.ilike(f"%{barcode}%"))
    if alternative_call_number:
        query = query.filter(
            models.Analytics.alternative_call_number.ilike(f"%{alternative_call_number}%")
        )
    if call_number:
        query = query.filter(models.Analytics.call_number.ilike(f"%{call_number}%"))
    if item_policy:
        query = query.filter(models.Analytics.item_policy == item_policy)
    if location_code:
        query = query.filter(models.Analytics.location_code == location_code)
    if status:
        query = query.filter(models.Analytics.status == status)

    results = query.all()
    # back-fill missing alt call numbers from Items if needed
    for rec in results:
        if rec.alternative_call_number is None:
            item = (
                db.query(models.Item)
                  .filter(models.Item.barcode == rec.barcode)
                  .first()
            )
            if item:
                rec.alternative_call_number = item.alternative_call_number

    return results


@router.get(
    "/search/analytics/filters",
    summary="Get distinct item_policy, location_code, and status values from analytics",
)
def get_analytics_filters(db: Session = Depends(get_db)):
    policies = db.query(models.Analytics.item_policy).distinct().all()
    locations = db.query(models.Analytics.location_code).distinct().all()
    statuses = db.query(models.Analytics.status).distinct().all()

    return {
        "item_policies":  sorted([p[0] for p in policies  if p[0]]),
        "location_codes": sorted([l[0] for l in locations if l[0]]),
        "status":         sorted([s[0] for s in statuses  if s[0]]),
    }


@router.get(
    "/analytics/{barcode}",
    response_model=AnalyticsRead,
    summary="Get a single analytics record by barcode",
)
def get_analytics_by_barcode(barcode: str, db: Session = Depends(get_db)):
    rec = db.query(models.Analytics).filter(models.Analytics.barcode == barcode).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Analytics data not found")
    return rec
