# backend/api/dashboard.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.session import get_db
from db import models
from api.catalog import get_empty_slot_details

router = APIRouter()


@router.get("/stats", summary="Get dashboard statistics")
def get_dashboard_stats(db: Session = Depends(get_db)):
    """
    Get overview statistics for the dashboard.
    """
    
    # Count total items
    total_items = db.query(func.count(models.Item.id)).scalar() or 0
    
    # Count total analytics records
    total_analytics = db.query(func.count(models.Analytics.id)).scalar() or 0
    
    # Count analytics errors
    analytics_errors = db.query(func.count(models.AnalyticsError.id)).scalar() or 0
    
    # Count weeded items if the model exists
    weeded_items = 0
    try:
        if hasattr(models, 'WeededItem'):
            weeded_items = db.query(func.count(models.WeededItem.id)).scalar() or 0
    except:
        pass
    
    # Get empty slots count
    try:
        empty_slots_data = get_empty_slot_details(db)
        # Count individual empty positions (not full shelves)
        empty_slots_count = len([s for s in empty_slots_data if s.empty_position is not None])
    except Exception:
        empty_slots_count = 0
    
    # Get some basic location statistics
    floors = db.query(func.count(func.distinct(models.Item.floor))).scalar() or 0
    ranges = db.query(func.count(func.distinct(models.Item.range_code))).scalar() or 0
    
    # Analytics status breakdown
    analytics_status = db.query(
        models.Analytics.status,
        func.count(models.Analytics.id).label('count')
    ).group_by(models.Analytics.status).all()
    
    status_breakdown = {status: count for status, count in analytics_status if status}
    
    return {
        "totals": {
            "items": total_items,
            "analytics": total_analytics,
            "analytics_errors": analytics_errors,
            "weeded_items": weeded_items,
            "empty_slots": empty_slots_count
        },
        "locations": {
            "floors": floors,
            "ranges": ranges
        },
        "analytics_status": status_breakdown
    }


@router.get("/recent-activity", summary="Get recent system activity")
def get_recent_activity(db: Session = Depends(get_db)):
    """
    Get recent activity summary.
    """
    
    # Get recently added items (last 10)
    recent_items = db.query(models.Item).order_by(models.Item.id.desc()).limit(10).all()
    
    # Get recent analytics errors (last 10)
    recent_errors = db.query(models.AnalyticsError).order_by(models.AnalyticsError.id.desc()).limit(10).all()
    
    return {
        "recent_items": [
            {
                "id": item.id,
                "barcode": item.barcode,
                "alternative_call_number": item.alternative_call_number,
                "location": item.location
            } 
            for item in recent_items
        ],
        "recent_errors": [
            {
                "id": error.id,
                "barcode": error.barcode,
                "error_reason": error.error_reason
            }
            for error in recent_errors
        ]
    }