from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db.session import get_db
from db.models import UserLog
from schemas.user_log import UserLogSchema
from core.auth import require_admin

router = APIRouter()

@router.get("", response_model=List[UserLogSchema])
def read_logs(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    path:   Optional[str] = Query(None, description="Filter by URL path prefix"),
    skip:   int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    _:    None = Depends(require_admin),
):

    query = db.query(UserLog)
    if user_id is not None:
        query = query.filter(UserLog.user_id == user_id)
    if path:
        query = query.filter(UserLog.path.startswith(path))
    logs = query.order_by(UserLog.timestamp.desc()).offset(skip).limit(limit).all()
    return logs
