# backend/api/sudoc.py

from typing import List, Optional, Dict
from fastapi import APIRouter, HTTPException, Query, Body, Path, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError
import io

from core.sudoc import search_records, get_marc_by_id, get_record_fields
from schemas.sudoc import (
    SudocSummary, 
    MarcFieldOut,
    SudocCartRead,
)
from core.auth import get_current_user, require_cataloger
from db.session import get_db
from db import crud
from db.models import SudocCart

from sqlalchemy.orm import Session
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

# Cart routes should come before the /{record_id} route
@router.post("/cart", response_model=SudocCartRead)
def create_cart(
    name: str = Body(..., embed=True),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Create a new cart for SuDoc records"""
    return crud.create_sudoc_cart(db, name)

@router.get("/cart", response_model=List[SudocCartRead])
def get_carts(
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Get all carts"""
    try:
        carts = crud.get_carts(db)
        return [
            SudocCartRead(
                id=cart.id,
                name=cart.name,
                created_at=cart.created_at,
                items=[item.record_id for item in cart.items] if cart.items else []
            )
            for cart in carts
        ]
    except Exception as e:
        print("Error in get_carts:", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch carts: {str(e)}"
        )

@router.post("/cart/{cart_id}/records/{record_id}")
def add_record_to_cart(
    cart_id: int,
    record_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Add a SuDoc record to a cart"""
    # Verify record exists using your existing MARC record system
    record = get_marc_by_id(record_id, include_edits=False)  # Check original only for verification
    if not record:
        raise HTTPException(404, f"SuDoc record {record_id} not found")
        
    return crud.add_to_cart(db, cart_id, record_id)

@router.delete("/cart/{cart_id}")
def delete_cart(
    cart_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Delete a cart and all its items"""
    try:
        crud.delete_cart(db, cart_id)
        return {"message": "Cart deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete cart: {str(e)}"
        )

@router.get("/carts/{cart_id}/records")
async def get_cart_records(
    cart_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Get full record data for all items in a cart"""
    # Get the cart
    cart = db.query(SudocCart).filter(
        SudocCart.id == cart_id
    ).first()
    
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    # Get record IDs from cart items
    record_ids = [item.record_id for item in cart.items] if cart.items else []
    
    if not record_ids:
        return []
    
    # Use the existing sudoc index/search system to get record summaries
    import sqlite3
    import os
    
    try:
        # Connect to the sudoc index database
        db_path = os.path.join(os.path.dirname(__file__), "..", "cgp_sudoc_index.db")
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get records by IDs from the index - using correct table and column names
        placeholders = ','.join(['?' for _ in record_ids])
        query = f"""
            SELECT id, sudoc, title, oclc 
            FROM records 
            WHERE id IN ({placeholders})
        """
        
        cursor.execute(query, record_ids)
        rows = cursor.fetchall()
        conn.close()
        
        # Convert to the expected format
        records = []
        for row in rows:
            records.append({
                "id": row[0],
                "sudoc": row[1] or "",
                "title": row[2] or "Untitled",
                "oclc": row[3]
            })
        
        return records
        
    except Exception as e:
        print(f"Error fetching cart records: {e}")
        return []

# Then the record_id route
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
        # Use the version that includes edits
        rec = get_marc_by_id(rid, include_edits=True)
        if rec is None:
            raise HTTPException(404, f"SuDoc record {rid} not found")
        writer.write(rec)

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
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    try:
        record = get_marc_by_id(record_id, include_edits=True)  # Include edits for editing
        if not record:
            raise HTTPException(404, "Record not found")
            
        fields = record.get_fields()
        if field_index >= len(fields):
            raise HTTPException(400, "Field index out of range")
            
        # Get the field to update
        field = fields[field_index]
        
        # Update the field based on the provided data
        if field.is_control_field():
            field.data = field_data.get("data", field.data)
        else:
            # Update indicators
            field.indicator1 = field_data.get("ind1", field.indicator1)
            field.indicator2 = field_data.get("ind2", field.indicator2)
            
            # Update subfields
            if "subfields" in field_data:
                # Clear existing subfields and add new ones
                field.subfields = []
                for code, value in field_data["subfields"].items():
                    field.add_subfield(code, value)
                
        # Save the edited version - this should save to a separate location
        # You'll need to implement save_edited_record in your crud module
        marc_data = record.as_marc()
        crud.save_edited_record(db, record_id, marc_data, current_user.id)
        
        return {
            "tag": field.tag,
            "ind1": field.indicator1 or " ",
            "ind2": field.indicator2 or " ",
            "subfields": field_data.get("subfields", {})
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to update field: {str(e)}")

@router.post("/{record_id}/field/add", response_model=MarcFieldOut)
def add_marc_field(
    record_id: int = Path(...),
    field_data: Dict = Body(...),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Add a new MARC field to a record"""
    try:
        record = get_marc_by_id(record_id, include_edits=True)  # Include edits for adding fields
        if not record:
            raise HTTPException(404, "Record not found")
        
        # Create new field
        from pymarc import Field, Subfield
        
        tag = field_data.get("tag")
        ind1 = field_data.get("ind1", " ")
        ind2 = field_data.get("ind2", " ")
        subfields = field_data.get("subfields", {})
        
        # Create subfield list using Subfield objects for newer pymarc
        subfield_list = []
        for code, value in subfields.items():
            if value:  # Only add non-empty subfields
                subfield_list.append(Subfield(code=code, value=value))
        
        new_field = Field(
            tag=tag,
            indicators=[ind1, ind2],
            subfields=subfield_list
        )
        
        # Add field to record
        record.add_field(new_field)
        
        # Save the edited version
        marc_data = record.as_marc()
        crud.save_edited_record(db, record_id, marc_data, current_user.id)
        
        return {
            "tag": tag,
            "ind1": ind1,
            "ind2": ind2,
            "subfields": subfields
        }
        
    except Exception as e:
        raise HTTPException(500, f"Failed to add field: {str(e)}")
