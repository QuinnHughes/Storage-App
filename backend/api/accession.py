# backend/api/accession.py
from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import pandas as pd
import io
import re

from db.session import get_db
from api.catalog import get_empty_slot_details
from schemas.emptyslots import EmptySlotDetail
from db.models import Item
from core.auth import require_book_worm

router = APIRouter()

def parse_alternative_call_number(acn: str) -> Dict:
    """Parse alternative call number into components for comparison"""
    # Format: S-{floor}-{range}-{ladder}-{shelf}-{position}
    # Range format: digits followed by letters (e.g., 01B)
    match = re.match(r'S-(\w+)-(\d+[A-Z]+)-(\d+)-(\d+)-(.+)', acn)
    if not match:
        return None
    
    floor, range_code, ladder, shelf, position = match.groups()
    return {
        'floor': floor,
        'range': range_code,
        'ladder': int(ladder),
        'shelf': int(shelf),
        'position': position
    }

def is_in_range(slot_acn: str, start_acn: str, end_acn: str) -> bool:
    """Check if a slot's alternative call number falls within the specified range"""
    slot_parts = parse_alternative_call_number(slot_acn)
    start_parts = parse_alternative_call_number(start_acn)
    end_parts = parse_alternative_call_number(end_acn)
    
    if not all([slot_parts, start_parts, end_parts]):
        return False
    
    # Create comparison tuples (floor, range, ladder, shelf, position)
    slot_tuple = (slot_parts['floor'], slot_parts['range'], slot_parts['ladder'], slot_parts['shelf'], slot_parts['position'])
    start_tuple = (start_parts['floor'], start_parts['range'], start_parts['ladder'], start_parts['shelf'], start_parts['position'])
    end_tuple = (end_parts['floor'], end_parts['range'], end_parts['ladder'], end_parts['shelf'], end_parts['position'])
    
    return start_tuple <= slot_tuple <= end_tuple

@router.get("/empty-slots", response_model=List[str])
def get_empty_slots(
    limit: int = Query(..., gt=0, description="Number of individual slots to fetch"),
    start_range: Optional[str] = Query(None, description="Start of alternative call number range"),
    end_range: Optional[str] = Query(None, description="End of alternative call number range"),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    Return empty slots (excluding full shelves) formatted as alternative call numbers.
    If start_range and end_range are provided, only return slots within that range.
    """
    try:
        slots: List[EmptySlotDetail] = get_empty_slot_details(db)
        # Filter out shelves (empty_position is None)
        indy = [s for s in slots if s.empty_position is not None]
        
        # Convert to alternative call numbers
        slot_acns = []
        for slot in indy:
            ladder = str(slot.ladder).zfill(2)
            shelf = str(slot.shelf).zfill(2)
            acn = f"S-{slot.floor}-{slot.range}-{ladder}-{shelf}-{slot.empty_position}"
            slot_acns.append(acn)
        
        # Filter by range if provided
        if start_range and end_range:
            filtered_acns = [acn for acn in slot_acns if is_in_range(acn, start_range, end_range)]
        else:
            filtered_acns = slot_acns
        
        # Return up to limit
        return filtered_acns[:limit]
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching empty slots: {e}")

@router.get("/empty-shelves", response_model=List[str])
def get_empty_shelves(
    limit: int = Query(..., gt=0, description="Number of shelves to fetch"),
    start_range: Optional[str] = Query(None, description="Start of alternative call number range"),
    end_range: Optional[str] = Query(None, description="End of alternative call number range"),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    Return entirely empty shelves formatted as call numbers with position XXX.
    If start_range and end_range are provided, only return shelves within that range.
    """
    try:
        slots: List[EmptySlotDetail] = get_empty_slot_details(db)
        # Filter only shelves (empty_position is None)
        shelf_slots = [s for s in slots if s.empty_position is None]
        
        # Get unique shelves by floor, range, ladder, shelf
        seen = set()
        shelves = []
        for s in shelf_slots:
            key = (s.floor, s.range, s.ladder, s.shelf)
            if key not in seen:
                seen.add(key)
                shelves.append(s)
        
        # Convert to alternative call numbers
        shelf_acns = []
        for s in shelves:
            ladder = str(s.ladder).zfill(2)
            shelf = str(s.shelf).zfill(2)
            acn = f"S-{s.floor}-{s.range}-{ladder}-{shelf}-XXX"
            shelf_acns.append(acn)
        
        # Filter by range if provided
        if start_range and end_range:
            # For shelves, we need to modify the range check since they end with XXX
            filtered_acns = []
            for acn in shelf_acns:
                # Create a test ACN with position "001" to check if shelf falls in range
                test_acn = acn.replace("-XXX", "-001")
                if is_in_range(test_acn, start_range, end_range):
                    filtered_acns.append(acn)
        else:
            filtered_acns = shelf_acns
        
        # Return up to limit
        return filtered_acns[:limit]
        
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