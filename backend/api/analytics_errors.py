# backend/api/analytics_errors.py

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db.session import get_db
from db import models
from schemas.analytics import AnalyticsErrorRead
from schemas.item import ItemRead

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


@router.get(
    "/location-items",
    response_model=List[ItemRead],
    summary="Get items in a specific location"
)
def get_items_by_location(
    location: Optional[str] = Query(None, description="Location code or alternative call number pattern"),
    floor: Optional[str] = Query(None, description="Floor"),
    range_code: Optional[str] = Query(None, description="Range code"),
    ladder: Optional[str] = Query(None, description="Ladder"),
    shelf: Optional[str] = Query(None, description="Shelf"),
    db: Session = Depends(get_db)
):
    """
    Get items that are actually in a specific location based on various location parameters.
    """
    query = db.query(models.Item)
    
    if location:
        # If location is provided, search for items with alternative_call_number containing this location
        query = query.filter(models.Item.alternative_call_number.ilike(f"%{location}%"))
    else:
        # Use specific location components if provided
        if floor:
            query = query.filter(models.Item.floor == floor)
        if range_code:
            query = query.filter(models.Item.range_code == range_code)
        if ladder:
            query = query.filter(models.Item.ladder == ladder)
        if shelf:
            query = query.filter(models.Item.shelf == shelf)
    
    return query.limit(50).all()  # Limit to prevent large results


@router.delete(
    "/cleanup-no-match-errors",
    summary="Delete analytics errors with 'No matching barcode' reason"
)
def cleanup_no_match_errors(db: Session = Depends(get_db)):
    """
    Delete all AnalyticsError records with error_reason='No matching barcode'.
    These are false positives from before the analytics system was updated to save all records.
    Returns the count of deleted records.
    """
    deleted_count = db.query(models.AnalyticsError).filter(
        models.AnalyticsError.error_reason == "No matching barcode"
    ).delete(synchronize_session=False)
    
    db.commit()
    
    return {
        "message": "Successfully cleaned up false analytics errors",
        "deleted_count": deleted_count
    }


@router.delete(
    "/clear-all",
    summary="Delete ALL analytics errors"
)
def clear_all_analytics_errors(db: Session = Depends(get_db)):
    """
    Delete all records from the analytics_errors table.
    Use this to start fresh before re-uploading analytics data.
    Returns the count of deleted records.
    """
    deleted_count = db.query(models.AnalyticsError).delete(synchronize_session=False)
    db.commit()
    
    return {
        "message": "Successfully deleted all analytics errors",
        "deleted_count": deleted_count
    }
