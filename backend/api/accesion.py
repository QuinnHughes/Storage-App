# backend/api/accesion.py
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Dict
import pandas as pd
import io

from db.session import get_db
from api.catalog import get_empty_slot_details
from schemas.emptyslots import EmptySlotDetail
from db.models import Item
from core.auth import require_book_worm

router = APIRouter(
    prefix="/api/accession",
    tags=["Accession"],
    dependencies=[Depends(require_book_worm)],
)

@router.get("/empty-slots", response_model=List[str])
def get_empty_slots(
    limit: int = Query(..., gt=0, description="Number of individual slots to fetch"),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    Return the first N individual empty slots (excluding full shelves) formatted as alternative call numbers.
    """
    try:
        slots: List[EmptySlotDetail] = get_empty_slot_details(db)
        # Filter out shelves (empty_position is None)
        indy = [s for s in slots if s.empty_position is not None]
        result: List[str] = []
        for slot in indy[:limit]:
            ladder = str(slot.ladder).zfill(2)
            shelf  = str(slot.shelf).zfill(2)
            acn = f"S-{slot.floor}-{slot.range}-{ladder}-{shelf}-{slot.empty_position}"
            result.append(acn)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching empty slots: {e}")

@router.get("/empty-shelves", response_model=List[str])
def get_empty_shelves(
    limit: int = Query(..., gt=0, description="Number of shelves to fetch"),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    Return the first N entirely empty shelves formatted as call numbers with position XXX.
    """
    try:
        slots: List[EmptySlotDetail] = get_empty_slot_details(db)
        # Filter only shelves (empty_position is None)
        shelf_slots = [s for s in slots if s.empty_position is None]
        # Unique shelves by floor, range, ladder, shelf
        seen = set()
        shelves = []
        for s in shelf_slots:
            key = (s.floor, s.range, s.ladder, s.shelf)
            if key not in seen:
                seen.add(key)
                shelves.append(s)
                if len(shelves) >= limit:
                    break
        # Format call numbers
        result = []
        for s in shelves:
            ladder = str(s.ladder).zfill(2)
            shelf  = str(s.shelf).zfill(2)
            acn = f"S-{s.floor}-{s.range}-{ladder}-{shelf}-XXX"
            result.append(acn)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching empty shelves: {e}")

@router.post("/generate-excel", response_description="Excel file")
def generate_excel(
    pairs: List[Dict[str, str]],
    db: Session = Depends(get_db)
) -> StreamingResponse:
    try:
        for entry in pairs:
            barcode = entry.get("barcode")
            call_num = entry.get("alternative_call_number")
            if not barcode or not call_num:
                raise HTTPException(400, "Each entry must include barcode and alternative_call_number")
            item = db.query(Item).filter_by(barcode=barcode).first()
            if item:
                item.alternative_call_number = call_num
            else:
                new_item = Item(barcode=barcode, alternative_call_number=call_num)
                db.add(new_item)
        db.commit()

        df = pd.DataFrame(pairs)
        buffer = io.BytesIO()
        with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="accession")
        buffer.seek(0)
        headers = {"Content-Disposition": "attachment; filename=accession.xlsx"}
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers=headers
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB or Excel Error: {e}")

@router.post("/labels", response_description="Plain-text batch-print labels")
def labels(
    pairs: List[Dict[str, str]]
) -> PlainTextResponse:
    try:
        lines: List[str] = []
        for entry in pairs:
            call_num = entry.get("alternative_call_number")
            if call_num:
                lines.append(f"{call_num}\n\n\n===============")
        return PlainTextResponse("\n".join(lines))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Label Generation Error: {e}")
