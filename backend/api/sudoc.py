# backend/api/sudoc.py

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body, Path, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import sqlite3
import os
import zipfile
from io import BytesIO
from datetime import datetime
from pymarc import Field, Record

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
from pymarc import MARCWriter, Record, MARCReader, Field

router = APIRouter()

# Base directory path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_PATH = os.path.join(BASE_DIR, "cgp_sudoc_index.db")
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")

class ExportRequest(BaseModel):
    record_ids: List[int]

class HostRecordData(BaseModel):
    """Data for creating a new host record"""
    title: str
    series: Optional[str] = None
    publisher: Optional[str] = None
    series_number: Optional[str] = None
    year: Optional[str] = None
    subjects: Optional[List[str]] = None

class BoundwithRequest(BaseModel):
    """Request model for creating boundwith relationships"""
    creation_mode: str  # "existing" or "new-host"
    main_record_id: Optional[int] = None
    related_record_ids: List[int]
    host_record: Optional[HostRecordData] = None

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

@router.post("/boundwith")
async def create_boundwith(
    request: BoundwithRequest,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Create boundwith relationships between records"""
    # Validate the creation mode
    if request.creation_mode not in ["existing", "new-host"]:
        raise HTTPException(status_code=400, detail="Invalid creation mode")
    
    # Existing mode: use an existing record as the main record
    if request.creation_mode == "existing":
        if not request.main_record_id:
            raise HTTPException(status_code=400, detail="Main record ID is required for existing mode")
        
        main_id = request.main_record_id
        related_ids = [id for id in request.related_record_ids if id != main_id]
        
        # Validate that all records exist
        all_ids = [main_id] + related_ids
        for record_id in all_ids:
            if not get_marc_by_id(record_id):
                raise HTTPException(status_code=404, detail=f"Record {record_id} not found")
        
        # Get the main record
        main_record = get_marc_by_id(main_id)
        
        # Extract main record details
        main_title = get_title_from_record(main_record)
        main_control_number = get_control_number(main_record)
        main_oclc = get_oclc_number(main_record)
        
        # Update the main record with 501 "With" notes and 774 fields
        for related_id in related_ids:
            related_record = get_marc_by_id(related_id)
            if related_record:
                # Extract related record details
                related_title = get_title_from_record(related_record)
                related_oclc = get_oclc_number(related_record)
                related_control = get_control_number(related_record)
                
                # Add a 501 "With" note to the main record
                main_record.add_field(
                    Field(
                        tag='501',
                        indicators=[' ', ' '],
                        subfields=['a', f"With: {related_title}"]
                    )
                )
                
                # Add a 774 field (constituent unit entry) to the main record
                main_record.add_field(
                    Field(
                        tag='774',
                        indicators=['0', ' '],
                        subfields=[
                            't', related_title,
                            'w', related_oclc or "",
                            'o', related_control or ""
                        ]
                    )
                )
        
        # Save the updated main record
        marc_data = main_record.as_marc()
        crud.save_edited_record(db, main_id, marc_data, current_user.id)
        
        # Update each related record with a 773 field pointing to the main record
        for related_id in related_ids:
            related_record = get_marc_by_id(related_id)
            if related_record:
                # Add a 773 field (host item entry) to each related record
                related_record.add_field(
                    Field(
                        tag='773',
                        indicators=['0', ' '],
                        subfields=[
                            't', main_title,
                            'w', main_oclc or "",
                            'o', main_control_number or ""
                        ]
                    )
                )
                
                # Save the updated related record
                marc_data = related_record.as_marc()
                crud.save_edited_record(db, related_id, marc_data, current_user.id)
        
        return {
            "status": "success", 
            "message": f"Created boundwith relationship between {len(all_ids)} records"
        }
        
    # New host mode: create a new host record
    else:  # request.creation_mode == "new-host"
        if not request.host_record or not request.host_record.title:
            raise HTTPException(status_code=400, detail="Host record details required")
        
        related_ids = request.related_record_ids
        
        # Validate that all records exist
        for record_id in related_ids:
            if not get_marc_by_id(record_id):
                raise HTTPException(status_code=404, detail=f"Record {record_id} not found")
        
        # Create a new host record
        host_record = create_government_series_host_record(
            title=request.host_record.title,
            series=request.host_record.series,
            publisher=request.host_record.publisher,
            series_number=request.host_record.series_number,
            year=request.host_record.year if hasattr(request.host_record, "year") else None,
            subjects=request.host_record.subjects if hasattr(request.host_record, "subjects") else None
        )
        
        # Save the new host record to the database to get an ID
        host_marc_data = host_record.as_marc()
        host_id = crud.create_new_marc_record(db, host_marc_data, current_user.id)
        
        # Extract host record details
        host_title = get_title_from_record(host_record)
        host_control_number = get_control_number(host_record)
        host_oclc = get_oclc_number(host_record)
        
        # Update the host record with 501 and 774 fields for each related record
        host_record = get_marc_by_id(host_id)  # Get the newly created record
        
        for related_id in related_ids:
            related_record = get_marc_by_id(related_id)
            if related_record:
                # Extract related record details
                related_title = get_title_from_record(related_record)
                related_oclc = get_oclc_number(related_record)
                related_control = get_control_number(related_record)
                
                # Add a 501 "With" note to the host record
                host_record.add_field(
                    Field(
                        tag='501',
                        indicators=[' ', ' '],
                        subfields=['a', f"With: {related_title}"]
                    )
                )
                
                # Add a 774 field (constituent unit entry) to the host record
                host_record.add_field(
                    Field(
                        tag='774',
                        indicators=['0', ' '],
                        subfields=[
                            't', related_title,
                            'w', related_oclc or "",
                            'o', related_control or ""
                        ]
                    )
                )
                
                # Add a 773 field (host item entry) to the related record
                related_record.add_field(
                    Field(
                        tag='773',
                        indicators=['0', ' '],
                        subfields=[
                            't', host_title,
                            'w', host_oclc or "",
                            'o', host_control_number or ""
                        ]
                    )
                )
                
                # Save the updated related record
                marc_data = related_record.as_marc()
                crud.save_edited_record(db, related_id, marc_data, current_user.id)
        
        # Save the updated host record
        marc_data = host_record.as_marc()
        crud.save_edited_record(db, host_id, marc_data, current_user.id)
        
        return {
            "status": "success",
            "message": f"Created new host record ({host_id}) with {len(related_ids)} constituent parts",
            "host_record_id": host_id
        }

# Helper functions for creating a government series host record
def create_government_series_host_record(
    title: str,
    series: Optional[str] = None,
    publisher: Optional[str] = None,
    series_number: Optional[str] = None,
    year: Optional[str] = None,
    subjects: Optional[List[str]] = None
):
    """Create a new MARC record for a government document series"""
    record = Record()
    
    # Use provided year or current year
    pub_year = year or datetime.now().strftime('%Y')
    
    # Leader
    leader = list(' ' * 24)
    leader[5] = 'n'  # New record
    leader[6] = 'c'  # Collection
    leader[7] = 'm'  # Monograph
    leader[17] = '7'  # Full level
    record.leader = ''.join(leader)
    
    # Control fields
    record.add_field(
        Field(tag='008', data=''.join([
            datetime.now().strftime('%y%m%d'),  # Date entered
            's',                  # Publication status (single date)
            pub_year,             # Publication date
            '    ',               # Unused
            'xxu',                # Country code (USA)
            '    ',               # Unused
            'a',                  # Illustrated
            '    ',               # Target audience
            'a',                  # Form of item (regular print)
            '0',                  # Nature of contents
            ' ',                  # Government publication
            '0',                  # Conference publication
            '0',                  # Festschrift
            '0',                  # Index
            ' ',                  # Undefined
            '0',                  # Literary form
            '0',                  # Biography
            ' ',                  # Language
            ' ',                  # Modified record
            'd'                   # Cataloging source
        ]))
    )
    
    # Title (245)
    record.add_field(
        Field(
            tag='245',
            indicators=['0', '0'],
            subfields=[
                'a', title,
                'h', '[electronic resource]'
            ]
        )
    )
    
    # Publication info (260)
    if publisher:
        record.add_field(
            Field(
                tag='260',
                indicators=[' ', ' '],
                subfields=[
                    'a', 'Washington, D.C. :',
                    'b', publisher,
                    'c', pub_year
                ]
            )
        )
    else:
        record.add_field(
            Field(
                tag='260',
                indicators=[' ', ' '],
                subfields=[
                    'a', 'Washington, D.C. :',
                    'b', 'U.S. Government Publishing Office,',
                    'c', pub_year
                ]
            )
        )
    
    # Physical description (300)
    record.add_field(
        Field(
            tag='300',
            indicators=[' ', ' '],
            subfields=[
                'a', '1 online resource',
                'b', 'illustrations'
            ]
        )
    )
    
    # Series (490)
    if series:
        subfields = ['a', series]
        if series_number:
            subfields.extend(['v', series_number])
            
        record.add_field(
            Field(
                tag='490',
                indicators=['1', ' '],
                subfields=subfields
            )
        )
    
    # Content/media/carrier type (33X fields)
    record.add_field(
        Field(
            tag='336',
            indicators=[' ', ' '],
            subfields=[
                'a', 'text',
                'b', 'txt',
                '2', 'rdacontent'
            ]
        )
    )
    
    record.add_field(
        Field(
            tag='337',
            indicators=[' ', ' '],
            subfields=[
                'a', 'computer',
                'b', 'c',
                '2', 'rdamedia'
            ]
        )
    )
    
    record.add_field(
        Field(
            tag='338',
            indicators=[' ', ' '],
            subfields=[
                'a', 'online resource',
                'b', 'cr',
                '2', 'rdacarrier'
            ]
        )
    )
    
    # Add subjects from common subjects
    if subjects:
        for subject in subjects:
            record.add_field(
                Field(
                    tag='650',
                    indicators=[' ', '0'],
                    subfields=[
                        'a', subject
                    ]
                )
            )
    
    # Government document note
    record.add_field(
        Field(
            tag='500',
            indicators=[' ', ' '],
            subfields=[
                'a', 'Boundwith host record for government documents.'
            ]
        )
    )
    
    # Authority heading for US Government (if it's a government series)
    if any(term in title.lower() for term in ['committee', 'congress', 'senate', 'house']) or \
       series and any(term in series.lower() for term in ['committee', 'congress', 'senate', 'house']):
        record.add_field(
            Field(
                tag='110',
                indicators=['1', ' '],
                subfields=[
                    'a', 'United States.',
                    'b', 'Congress.'
                ]
            )
        )
    
    # Add 590 field for local processing
    record.add_field(
        Field(
            tag='590',
            indicators=[' ', ' '],
            subfields=[
                'a', 'Boundwith host record created for cataloging government documents.'
            ]
        )
    )
    
    return record

# Helper functions for extracting data from MARC records
def get_title_from_record(record):
    """Extract title from a MARC record safely"""
    # First check if record has a title() method
    if hasattr(record, 'title') and callable(record.title):
        try:
            return record.title()
        except Exception:
            pass
    
    # If that fails, try to get title from 245 field
    try:
        for field in record.get_fields('245'):
            title_parts = []
            for code in ('a', 'b', 'p'):
                subfields = field.get_subfields(code)
                if subfields:
                    title_parts.append(subfields[0])
            if title_parts:
                return ' '.join(title_parts)
    except Exception:
        pass
    
    # Fallback
    return "Untitled Item"

def get_oclc_number(record):
    """Extract OCLC number from a MARC record"""
    try:
        for field in record.get_fields('035'):
            for subfield in field.get_subfields('a'):
                if '(OCoLC)' in subfield:
                    return subfield
    except Exception:
        pass
    return ""

def get_control_number(record):
    """Extract control number from a MARC record"""
    try:
        for field in record.get_fields('001'):
            return field.data
    except Exception:
        pass
    return ""
