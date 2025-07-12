from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from core.sudoc import search_records, get_record_fields
from schemas.sudoc import SudocSummary, MarcFieldOut

router = APIRouter()

@router.get("/search/sudoc", response_model=List[SudocSummary])
def search_sudoc(
    query: str = Query(...),
    title: Optional[str] = Query(None),
    limit: int = Query(20),
    page: int  = Query(1),
):
    offset = (page - 1) * limit
    rows = search_records(query, title, limit=limit, offset=offset)
    if not rows:
        raise HTTPException(404, "No matching SuDoc records found")
    return rows

@router.get("/sudoc/{record_id}", response_model=List[MarcFieldOut])
def fetch_sudoc_record(record_id: int):
    fields = get_record_fields(record_id)
    if not fields:
        raise HTTPException(404, "SuDoc record not found")
    return fields
