# backend/api/sudoc.py

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Path, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import sqlite3
import os
import zipfile
from io import BytesIO

from core.sudoc import search_records, get_marc_by_id, get_record_fields
from schemas.sudoc import (
    SudocSummary, 
    MarcFieldOut,
    SudocCartRead,
    SudocCartCreate
)
from core.auth import get_current_user, require_cataloger
from db.session import get_db
from db import crud, models
from db.models import SudocCart, SudocCartItem

from sqlalchemy.orm import Session
from sqlalchemy import desc
from pymarc import MARCWriter, Record, MARCReader

router = APIRouter()

# Base directory path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_PATH = os.path.join(BASE_DIR, "cgp_sudoc_index.db")
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")

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
        return []
    return rows

# Cart routes
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
        carts = db.query(SudocCart).order_by(desc(SudocCart.created_at)).all()
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
        print(f"Error getting carts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/cart/{cart_id}/records/{record_id}")
def add_record_to_cart(
    cart_id: int,
    record_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Add a SuDoc record to a cart"""
    # Verify record exists using your existing MARC record system
    try:
        # Check if record exists in index
        with sqlite3.connect(SQLITE_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT id FROM records WHERE id = ?", (record_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Record not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error checking record: {str(e)}")
        
    return crud.add_to_cart(db, cart_id, record_id)

@router.delete("/cart/{cart_id}")
def delete_cart(
    cart_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Delete a cart and all its items"""
    try:
        cart = db.query(SudocCart).filter(SudocCart.id == cart_id).first()
        if not cart:
            raise HTTPException(status_code=404, detail="Cart not found")
            
        # Delete all items first
        db.query(SudocCartItem).filter(SudocCartItem.cart_id == cart_id).delete()
        
        # Then delete the cart
        db.delete(cart)
        db.commit()
        return {"message": "Cart deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/carts/{cart_id}/records")
async def get_cart_records(
    cart_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Get summary record data for items in a cart with pagination"""
    print(f"Looking for records in cart {cart_id}")
    
    # Get the cart
    cart = db.query(SudocCart).filter(
        SudocCart.id == cart_id
    ).first()
    
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    # Get record IDs from cart items with pagination
    offset = (page - 1) * limit
    items_query = db.query(SudocCartItem).filter(
        SudocCartItem.cart_id == cart_id
    ).order_by(SudocCartItem.added_at.desc())
    
    total_count = items_query.count()
    cart_items = items_query.offset(offset).limit(limit).all()
    record_ids = [item.record_id for item in cart_items]
    
    if not record_ids:
        return {"items": [], "total": total_count, "page": page, "pages": (total_count + limit - 1) // limit}
    
    # Fetch records from the index database
    try:
        with sqlite3.connect(SQLITE_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            placeholders = ','.join('?' for _ in record_ids)
            query = f"""
                SELECT id, sudoc, title, oclc 
                FROM records 
                WHERE id IN ({placeholders})
            """
            
            cursor.execute(query, record_ids)
            rows = cursor.fetchall()
        
        # Convert to dictionary for faster lookups
        records_dict = {row['id']: {
            "id": row['id'],
            "sudoc": row['sudoc'] or "",
            "title": row['title'] or "Untitled",
            "oclc": row['oclc'] or ""
        } for row in rows}
        
        # Maintain the order from cart_items
        items = [records_dict.get(rid, {"id": rid, "sudoc": "", "title": "Record not found", "oclc": ""}) 
                for rid in record_ids]
        
        return {
            "items": items,
            "total": total_count,
            "page": page,
            "pages": (total_count + limit - 1) // limit
        }
        
    except Exception as e:
        print(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/cart/{cart_id}/records/{record_id}")
async def remove_from_cart(
    cart_id: int,
    record_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_cataloger)
):
    """Remove a record from a cart"""
    try:
        # Check if item exists
        item = db.query(SudocCartItem).filter(
            SudocCartItem.cart_id == cart_id,
            SudocCartItem.record_id == record_id
        ).first()
        
        if not item:
            raise HTTPException(status_code=404, detail="Item not found in cart")
            
        # Delete the item
        db.delete(item)
        db.commit()
        return {"message": "Item removed from cart"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# Record retrieval with direct byte offset access
@router.get("/{record_id}", response_model=List[MarcFieldOut])
def fetch_sudoc_record(record_id: int):
    print(f"Looking for record ID: {record_id}")
    fields = get_record_fields(record_id)
    if not fields:
        raise HTTPException(status_code=404, detail=f"Record ID {record_id} not found")
    return fields

# Add these functions to core/sudoc.py
def get_marc_by_id_direct(record_id: int):
    """Get MARC record using byte offset for direct access"""
    
    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Get the zip file and byte offset
        cur.execute("""
            SELECT zip_file, marc_file, byte_offset, record_length 
            FROM records WHERE id = ?
        """, (record_id,))
        row = cur.fetchone()
        
        if not row:
            print(f"Record {record_id} not found in index")
            return None
            
        zip_filename = row['zip_file']
        marc_filename = row['marc_file']
        byte_offset = row['byte_offset']
        record_length = row['record_length']
    
    print(f"[SUDOC] id={record_id} -> zip={zip_filename}, byte_offset={byte_offset}")
    
    zip_path = os.path.join(RECORDS_DIR, zip_filename)
    if not os.path.exists(zip_path):
        print(f"ZIP file not found: {zip_path}")
        return None
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            with zf.open(marc_filename) as marc_file:
                # Seek directly to the byte offset
                marc_file.seek(byte_offset)
                
                # Read exactly the record length
                record_data = marc_file.read(record_length)
                
                # Parse the record
                reader = MARCReader(BytesIO(record_data), to_unicode=True, force_utf8=True)
                try:
                    record = next(reader)
                    return record
                except StopIteration:
                    print(f"Failed to parse record at offset {byte_offset}")
                    return None
                
    except Exception as e:
        print(f"Error reading MARC file: {e}")
        return None

@router.post("/export")
def export_sudoc_records(body: ExportRequest = Body(...)):
    """Export MARC records to a single file"""
    if not body.record_ids:
        raise HTTPException(status_code=400, detail="No record IDs provided")
    
    # Create a BytesIO buffer to hold the MARC data
    buffer = BytesIO()
    writer = MARCWriter(buffer)
    
    for record_id in body.record_ids:
        record = get_marc_by_id(record_id)
        if record:
            writer.write(record)
    
    # Reset buffer position
    buffer.seek(0)
    
    # Return as downloadable file
    filename = f"export_{len(body.record_ids)}_records.mrc"
    return StreamingResponse(
        buffer, 
        media_type="application/marc",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
