# backend/api/catalog.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db import models
from db.session import get_db
from schemas.item import ItemRead
from schemas.analytics import AnalyticsRead

router = APIRouter()   # ← no prefix here any more

@router.get(
    "/search/items",
    response_model=List[ItemRead],
    summary="Search items by barcode or alternative_call_number",
)
def search_items(
    q: str = Query(..., description="Exact barcode or alternative_call_number to search for"),
    db: Session = Depends(get_db),
):
    """
    Return any Item whose barcode OR alternative_call_number matches `q` exactly.
    """
    results = (
        db.query(models.Item)
        .filter(
            (models.Item.barcode == q)
            | (models.Item.alternative_call_number == q)
        )
        .all()
    )
    if not results:
        raise HTTPException(status_code=404, detail="No matching item found")
    return results


@router.get(
    "/search/analytics",
    response_model=List[AnalyticsRead],
    summary="Search analytics by title or call_number",
)
def search_analytics(
    title: Optional[str] = Query(
        None,
        description="Substring to match in the analytics title field (case-insensitive)",
    ),
    call_number: Optional[str] = Query(
        None,
        description="Substring to match in the analytics call_number field (case-insensitive)",
    ),
    db: Session = Depends(get_db),
):
    """
    Return analytics records matching given title and/or call_number substrings.
    If an analytics record's alternative_call_number is null, replace it with the corresponding
    Item.alternative_call_number (matched by barcode) before returning.
    """
    if not title and not call_number:
        raise HTTPException(
            status_code=400,
            detail="Provide at least one of 'title' or 'call_number' to search analytics.",
        )

    query = db.query(models.Analytics)
    if title:
        query = query.filter(models.Analytics.title.ilike(f"%{title}%"))
    if call_number:
        query = query.filter(models.Analytics.call_number.ilike(f"%{call_number}%"))

    results = query.all()
    if not results:
        raise HTTPException(status_code=404, detail="No matching analytics records found")

    # Fill in missing alternative_call_number from the Item table if needed
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
