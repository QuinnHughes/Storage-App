# backend/api/catalog.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from typing import List, Optional

from db import models
from db.session import get_db
from schemas.analytics import AnalyticsRead
from schemas.item import ItemRead
from schemas.emptyslots import EmptySlotDetail

router = APIRouter()


# ──────────── Item Search Endpoint ────────────

@router.get(
    "/search/items",
    summary="Search items by barcode, alternative_call_number, floor, range_code, ladder, or shelf (includes analytics title/status)",
)
def search_items(
    barcode: Optional[str] = Query(None, description="Exact or partial match on Item.barcode"),
    alternative_call_number: Optional[str] = Query(None, description="Exact or partial match on Item.alternative_call_number"),
    floor: Optional[str] = Query(None, description="Exact match on Item.floor"),
    range_code: Optional[str] = Query(None, description="Exact match on Item.range_code"),
    ladder: Optional[str] = Query(None, description="Exact match on Item.ladder"),
    shelf: Optional[str] = Query(None, description="Exact match on Item.shelf"),
    db: Session = Depends(get_db),
):
    """
    Returns a list of items matching any of the provided filters. Each item
    includes an embedded 'analytics' object with 'title' and 'status' if
    a matching analytics row exists (matching both barcode and alternative_call_number).

    - If both 'barcode' and 'alternative_call_number' are provided, items matching either will be returned.
    - Additional filters (floor, range_code, ladder, shelf) are combined with AND.
    - Returns an empty list if no items match.
    """
    query = db.query(models.Item)

    # Build OR conditions for barcode/alternative_call_number if either provided
    or_conditions = []
    if barcode:
        or_conditions.append(models.Item.barcode.ilike(f"%{barcode}%"))
    if alternative_call_number:
        or_conditions.append(models.Item.alternative_call_number.ilike(f"%{alternative_call_number}%"))

    if or_conditions:
        query = query.filter(or_(*or_conditions))

    # Apply exact-match filters
    if floor:
        query = query.filter(models.Item.floor == floor)
    if range_code:
        query = query.filter(models.Item.range_code == range_code)
    if ladder:
        query = query.filter(models.Item.ladder == ladder)
    if shelf:
        query = query.filter(models.Item.shelf == shelf)

    items = query.all()

    # Build result list with embedded analytics data
    results = []
    for item in items:
        analytics_match = (
            db.query(models.Analytics)
            .filter(
                models.Analytics.barcode == item.barcode,
                models.Analytics.alternative_call_number == item.alternative_call_number,
            )
            .first()
        )

        analytics_data = None
        if analytics_match:
            analytics_data = {
                "title": analytics_match.title,
                "status": analytics_match.status,
            }

        results.append({
            "id": item.id,
            "barcode": item.barcode,
            "alternative_call_number": item.alternative_call_number,
            "floor": item.floor,
            "range_code": item.range_code,
            "ladder": item.ladder,
            "shelf": item.shelf,
            "position": item.position,
            "analytics": analytics_data,
        })

    return results


@router.get(
    "/search/item-filters",
    summary="Get distinct floor, range_code, ladder, and shelf values from items",
)
def get_item_filters(db: Session = Depends(get_db)):
    """
    Return distinct non-null values for:
      - Item.floor
      - Item.range_code
      - Item.ladder
      - Item.shelf

    so that the frontend can populate dropdowns for item filters.
    """
    floors = db.query(models.Item.floor).distinct().all()
    ranges = db.query(models.Item.range_code).distinct().all()
    ladders = db.query(models.Item.ladder).distinct().all()
    shelves = db.query(models.Item.shelf).distinct().all()

    return {
        "floors": sorted([f[0] for f in floors if f[0]]),
        "ranges": sorted([r[0] for r in ranges if r[0]]),
        "ladders": sorted([l[0] for l in ladders if l[0]]),
        "shelves": sorted([s[0] for s in shelves if s[0]]),
    }


# ──────────── Analytics Search Endpoint ────────────

@router.get(
    "/search/analytics",
    response_model=List[AnalyticsRead],
    summary="Search analytics by title, call_number, item_policy, or location_code",
)
def search_analytics(
    title: Optional[str] = Query(None, description="Substring (case-insensitive) to match Analytics.title"),
    call_number: Optional[str] = Query(None, description="Substring (case-insensitive) to match Analytics.call_number"),
    item_policy: Optional[str] = Query(None, description="Exact match on Analytics.item_policy"),
    location_code: Optional[str] = Query(None, description="Exact match on Analytics.location_code"),
    db: Session = Depends(get_db),
):
    """
    Return analytics records filtered by any combination of:
      - title (partial, ILIKE)
      - call_number (partial, ILIKE)
      - item_policy (exact)
      - location_code (exact)

    If an analytics record's alternative_call_number is null, attempts to fill it
    from the matching Item (matching barcode). Returns empty list if none matched.
    """
    query = db.query(models.Analytics)

    if title:
        query = query.filter(models.Analytics.title.ilike(f"%{title}%"))
    if call_number:
        query = query.filter(models.Analytics.call_number.ilike(f"%{call_number}%"))
    if item_policy:
        query = query.filter(models.Analytics.item_policy == item_policy)
    if location_code:
        query = query.filter(models.Analytics.location_code == location_code)

    results = query.all()
    for rec in results:
        if rec.alternative_call_number is None:
            item = db.query(models.Item).filter(models.Item.barcode == rec.barcode).first()
            if item:
                rec.alternative_call_number = item.alternative_call_number

    return results


@router.get(
    "/search/analytics/filters",
    summary="Get distinct item_policy, location_code, and status values from analytics",
)
def get_analytics_filters(db: Session = Depends(get_db)):
    """
    Return all distinct non-null values for:
      - Analytics.item_policy
      - Analytics.location_code
      - Analytics.status
    so the frontend can populate dropdowns for analytics filters.
    """
    policies = db.query(models.Analytics.item_policy).distinct().all()
    locations = db.query(models.Analytics.location_code).distinct().all()
    statuses = db.query(models.Analytics.status).distinct().all()

    return {
        "item_policies":  sorted([p[0] for p in policies  if p[0]]),
        "location_codes": sorted([l[0] for l in locations if l[0]]),
        "status":         sorted([s[0] for s in statuses  if s[0]]),
    }

@router.get(
    "/search/empty-slot-details",
    response_model=List[EmptySlotDetail],
    summary="Get a list of every empty slot per shelf",
)
def get_empty_slot_details(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT floor, "range", ladder, shelf, empty_position
        FROM empty_slot_details
        ORDER BY floor, "range", ladder, shelf, empty_position
    """)).mappings().all()
    return [EmptySlotDetail(**r) for r in rows]