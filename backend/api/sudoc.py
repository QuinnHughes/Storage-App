# backend/api/sudoc.py

from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Query, Body, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io

from core.sudoc import search_records, get_marc_by_id, get_record_fields
from schemas.sudoc import SudocSummary, MarcFieldOut

from pymarc import MARCWriter, Record

router = APIRouter()

class ExportRequest(BaseModel):
    record_ids: List[int]

@router.get("/search", response_model=List[SudocSummary])
def search_sudoc(
    query: str = Query(..., description="SuDoc call number (or fragment)"),
    title: Optional[str] = Query(None, description="Substring of title"),
    limit: int = Query(20),
    page: int  = Query(1),
):
    offset = (page - 1) * limit
    rows = search_records(query, title, limit=limit, offset=offset)
    if not rows:
        raise HTTPException(404, "No matching SuDoc records found")
    return rows

@router.get("/{record_id}", response_model=List[MarcFieldOut])
def fetch_sudoc_record(record_id: int):
    fields = get_record_fields(record_id)
    if not fields:
        raise HTTPException(404, f"SuDoc record {record_id} not found")
    return fields

@router.post("/export")
def export_sudoc_records(body: ExportRequest = Body(...)):
    if not body.record_ids:
        raise HTTPException(400, "No record IDs provided for export")

    buffer = io.BytesIO()
    writer = MARCWriter(buffer)

    for rid in body.record_ids:
        rec = get_marc_by_id(rid)
        if rec is None:
            raise HTTPException(404, f"SuDoc record {rid} not found")
        writer.write(rec)

    # leave writer alone — just reset the buffer
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.marc",
        headers={"Content-Disposition": "attachment; filename=\"sudoc_export.mrc\""}
    )

@router.patch("/{record_id}/field/{field_index}", response_model=MarcFieldOut)
def update_marc_field(
    record_id: int = Path(...),
    field_index: int = Path(...),
    field_data: Dict = Body(...),
):
    record = get_marc_by_id(record_id)
    if not record:
        raise HTTPException(404, f"SuDoc record {record_id} not found")
        
    try:
        fields = record.get_fields()
        if field_index >= len(fields):
            raise HTTPException(400, "Field index out of range")
            
        # Get the field to update
        field = fields[field_index]
        
        # Update the field based on the provided data
        if field.is_control_field():
            field.data = field_data.get("subfields", {}).get("a", "")
        else:
            # Update indicators
            field.indicator1 = field_data.get("ind1", " ")
            field.indicator2 = field_data.get("ind2", " ")
            
            # Update subfields
            field.subfields.clear()
            for code, value in field_data.get("subfields", {}).items():
                field.add_subfield(code, value)
                
        # Save the updated record
        # Note: This part needs to be implemented based on how your records are stored
        # For now, we'll return the updated field data
        return {
            "tag": field.tag,
            "ind1": field.indicator1 or " ",
            "ind2": field.indicator2 or " ", 
            "subfields": field_data.get("subfields", {})
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to update field: {str(e)}")
