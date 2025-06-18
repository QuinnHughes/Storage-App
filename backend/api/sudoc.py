# backend/api/sudoc.py

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import StreamingResponse
from io import BytesIO
from pymarc import MARCWriter 

from core.sudoc import search_records, get_marc_by_id, get_record_fields
from schemas.sudoc import SudocSummary, MarcFieldOut

router = APIRouter()

@router.get(
    "/search/sudoc",
    response_model=List[SudocSummary],
    summary="Search SuDoc call numbers with optional title filter"
)
def search_sudoc(
    query: str = Query(..., description="Substring to match SuDoc call number"),
    title: Optional[str] = Query(None, description="Optional title keyword"),
    limit: int = Query(100, description="Max results to return"),
):
    """
    Return up to `limit` records whose SuDoc contains `query`,
    and whose title contains `title` if given.
    """
    results = search_records(query, title, limit)
    if not results:
        raise HTTPException(status_code=404, detail="No matching SuDoc records found")
    return results

@router.get(
    "/sudoc/{record_id}",
    response_model=List[MarcFieldOut],
    summary="Fetch full MARC fields for one SuDoc record"
)
def fetch_sudoc_record(record_id: int):
    """
    Return the list of MARC fields for a single SuDoc record.
    """
    fields = get_record_fields(record_id)
    if not fields:
        raise HTTPException(status_code=404, detail="SuDoc record not found")
    return fields

@router.post(
    "/sudoc-export",
    summary="Export a batch of SuDoc records as a single MARC21 file"
)
def export_sudoc_records(
    record_ids: List[int] = Body(..., description="List of record IDs to export"),
):
    """
    Stream a MARC21 file (`sudoc_export.mrc`) containing one record
    per requested ID.
    """
    buffer = BytesIO()
    writer = MARCWriter(buffer)
    for rid in record_ids:
        rec = get_marc_by_id(rid)
        if rec:
            writer.write(rec)
    writer.cl
