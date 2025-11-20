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
from pymarc import Record, Field, Subfield, MARCWriter, MARCReader

from core.sudoc import (
    search_records, get_marc_by_id, get_record_fields,
    get_title_from_record, get_control_number, get_oclc_number,
    create_government_series_host_record, add_holdings_and_item_fields,
    _preferred_control_number, _strip_existing_link_fields,
    _extract_host_title, _extract_child_ids,
    get_record_with_boundwith_info,
    build_boundwith_preview, build_normalized_child_title,
    _sort_child_records_for_774, create_945_field
)
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
from sqlalchemy import desc, func
import re

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

class HoldingsItemData(BaseModel):
    """Data for creating holdings and item fields"""
    location_code: str = "main"  # e.g., "main", "sci", "spec"
    call_number: Optional[str] = None
    barcode: Optional[str] = None
    item_policy: str = "book"  # e.g., "book", "periodical"
    enumeration: Optional[str] = None  # v.1, etc.
    chronology: Optional[str] = None  # 2023, Jan, etc.

class BoundwithRequest(BaseModel):
    """Request model for creating boundwith relationships"""
    creation_mode: str  # "existing" or "new-host"
    main_record_id: Optional[int] = None
    related_record_ids: List[int]
    host_record: Optional[HostRecordData] = None
    holdings_data: Optional[HoldingsItemData] = None  # Add this field

class BoundwithPreviewRequest(BaseModel):
    record_ids: List[int]

class BoundwithPreviewResponse(BaseModel):
    host_title: str
    publisher: Optional[str] = None
    year_range: Optional[str] = None
    subjects: List[str] = []
    lines_774: List[Dict[str, str]] = []

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
    """Add any record type (original, edited or created) to a cart"""
    # First check if cart exists
    cart = db.query(SudocCart).filter(SudocCart.id == cart_id).first()
    if not cart:
        raise HTTPException(status_code=404, detail="Cart not found")
    
    # First try to get the record using our unified resolver
    record = get_marc_by_id(record_id, include_edits=True)
    if not record:
        # Not found via our resolver, check SQLite directly as fallback
        try:
            with sqlite3.connect(SQLITE_PATH) as conn:
                cur = conn.cursor()
                cur.execute("SELECT rowid FROM records WHERE rowid = ?", (record_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Record not found")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error checking record: {str(e)}")
            
    # If we got here, record exists in some form
    try:
        item = crud.add_to_cart(db, cart_id, record_id)
        return {"message": "Record added to cart successfully", "item_id": item.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error adding record to cart: {str(e)}")

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

@router.get("/cart/{cart_id}/records")
async def get_cart_records(
    cart_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Get summary record data for items in a cart with pagination"""
    print(f"Looking for records in cart {cart_id}")
    
    try:
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
        
        # Initialize results list
        items = []
        
        # First, check for created records in PostgreSQL
        postgres_records = {}
        created_query = db.query(models.SudocCreatedRecord).filter(
            models.SudocCreatedRecord.id.in_(record_ids)
        ).all()
        
        for record in created_query:
            # Parse MARC and extract title
            marc_reader = MARCReader(BytesIO(record.marc_data), to_unicode=True)
            marc_record = next(marc_reader, None)
            title = "Untitled"
            if marc_record:
                title = get_title_from_record(marc_record)
            
            postgres_records[record.id] = {
                "id": record.id,
                "title": title,
                "sudoc": "",  # Created hosts might not have SuDoc numbers
                "oclc": "",
                "type": "created"
            }

        # Check for edited records in PostgreSQL
        edited_query = db.query(models.SudocEditedRecord).filter(
            models.SudocEditedRecord.record_id.in_(record_ids)
        ).all()
        
        for edited_record in edited_query:
            # Parse MARC and extract title
            marc_reader = MARCReader(BytesIO(edited_record.marc_data), to_unicode=True)
            marc_record = next(marc_reader, None)
            title = "Untitled"
            sudoc = ""
            oclc = ""
            
            if marc_record:
                title = get_title_from_record(marc_record)
                # Extract SuDoc from 086 field
                f086 = marc_record.get_fields('086')
                if f086:
                    sudoc_subfields = f086[0].get_subfields('a')
                    if sudoc_subfields:
                        sudoc = sudoc_subfields[0]
                # Extract OCLC from 035 field
                oclc = get_oclc_number(marc_record) or ""
            
            postgres_records[edited_record.record_id] = {
                "id": edited_record.record_id,
                "title": title,
                "sudoc": sudoc,
                "oclc": oclc,
                "type": "edited"
            }
        
        # Get remaining records from SQLite
        remaining_ids = [rid for rid in record_ids if rid not in postgres_records]
        sqlite_records = {}
        
        if remaining_ids:
            with sqlite3.connect(SQLITE_PATH) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                placeholders = ','.join('?' for _ in remaining_ids)
                query = f"""
                    SELECT rowid as id, sudoc, title, oclc 
                    FROM records 
                    WHERE rowid IN ({placeholders})
                """
                
                cursor.execute(query, remaining_ids)
                rows = cursor.fetchall()
            
            # Convert to dictionary for faster lookups
            sqlite_records = {row['id']: {
                "id": row['id'],
                "sudoc": row['sudoc'] or "",
                "title": row['title'] or "Untitled",
                "oclc": row['oclc'] or ""
            } for row in rows}
        
        # Combine results maintaining order
        for rid in record_ids:
            if rid in postgres_records:
                items.append(postgres_records[rid])
            elif rid in sqlite_records:
                items.append(sqlite_records[rid])
            else:
                items.append({"id": rid, "sudoc": "", "title": "Record not found", "oclc": "", "type": "missing"})
        
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
    fields = get_record_fields(record_id, preserve_order=False)  # Return sorted fields
    if not fields:
        raise HTTPException(status_code=404, detail=f"Record ID {record_id} not found")
    return fields

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
    """
    Create / update boundwith relationships.
    Modes:
      existing  -> choose an existing bib as host (main_record_id)
      new-host  -> mint a new host record, then link selected records
    """
    if request.creation_mode not in ("existing", "new-host"):
        raise HTTPException(status_code=400, detail="Invalid creation_mode")

    # ---------- EXISTING HOST MODE ----------
    if request.creation_mode == "existing":
        if not request.main_record_id:
            raise HTTPException(status_code=400, detail="main_record_id required")
        host_id = request.main_record_id
        child_ids = [rid for rid in request.related_record_ids if rid != host_id]
        if not child_ids:
            raise HTTPException(status_code=400, detail="At least one constituent required")

        # Validate existence
        for rid in [host_id] + child_ids:
            if not get_marc_by_id(rid):
                raise HTTPException(status_code=404, detail=f"Record {rid} not found")

        host_rec = get_marc_by_id(host_id, include_edits=True)
        host_title = get_title_from_record(host_rec)
        host_w = _preferred_control_number(host_rec, str(host_id))
        # Ensure it contains explicit LOCAL prefix if it's using the local ID
        if not any(prefix in host_w for prefix in ['(OCoLC)', '(ORG)', '(LOCAL)']):
            host_w = f"(LOCAL){host_id}"

        # Optional holdings only on host
        if request.holdings_data:
            add_holdings_and_item_fields(host_rec, request.holdings_data)

        _strip_existing_link_fields(host_rec)

        for ordinal, cid in enumerate(child_ids, 1):
            child_rec = get_marc_by_id(cid, include_edits=True)
            if not child_rec:
                continue
            _strip_existing_link_fields(child_rec)
            # Normalize child title for consistent 774 $t
            child_title = build_normalized_child_title(child_rec)
            child_w = _preferred_control_number(child_rec, str(cid))

            # 774 on host with sequential numbering - FIXED FOR ALMA COMPLIANCE
            host_rec.add_field(
                Field(
                    tag='774',
                    indicators=['0', '0'],  # Fixed: 0 for display constant, not 8
                    subfields=[
                        Subfield('i', 'Contains (work):'),
                        Subfield('t', child_title),
                        Subfield('w', child_w),  # Keep LOCAL prefix for manual MMS ID replacement
                        Subfield('g', f'no: {ordinal}'),
                        Subfield('9', 'related')  # Fixed: Related for serial/periodical series boundwiths
                    ]
                )
            )
            # 773 on child - FIXED FOR ALMA COMPLIANCE
            child_rec.add_field(
                Field(
                    tag='773',
                    indicators=['0', '0'],  # Fixed: 0 for display constant, not 8
                    subfields=[
                        Subfield('i', 'Bound with:'),
                        Subfield('t', host_title),
                        Subfield('w', host_w),  # Keep LOCAL prefix for manual MMS ID replacement
                        Subfield('9', 'related')  # Fixed: Related for serial/periodical series boundwiths
                    ]
                )
            )
            crud.save_edited_record(db, cid, child_rec.as_marc(), current_user.id)

        crud.save_edited_record(db, host_id, host_rec.as_marc(), current_user.id)
        return {
            "status": "success",
            "message": f"Boundwith established. Host {host_id} with {len(child_ids)} constituents.",
            "host_id": host_id,
            "child_ids": child_ids
        }

    # ---------- NEW HOST MODE ----------
    if not request.host_record or not request.host_record.title:
        raise HTTPException(status_code=400, detail="host_record.title required")
    child_ids = list(request.related_record_ids)
    if not child_ids:
        raise HTTPException(status_code=400, detail="At least one constituent required")
    # Collect child records for enhanced 008 field analysis
    child_records = []
    for rid in child_ids:
        child_rec = get_marc_by_id(rid)
        if not child_rec:
            raise HTTPException(status_code=404, detail=f"Record {rid} not found")
        child_records.append(child_rec)

    h = request.host_record
    host_rec = create_government_series_host_record(
        title=h.title,
        series=None,
        publisher=h.publisher,
        series_number=None,
        year=h.year,
        subjects=h.subjects,
        child_records=child_records
    )
    if request.holdings_data:
        add_holdings_and_item_fields(host_rec, request.holdings_data)
        
        # Add 945 field for Alma import profile with physical item information
        # This allows the host record to be imported with physical inventory
        holdings = request.holdings_data
        call_number = holdings.call_number or ''
        location = holdings.location_code or 'MAIN'
        library = 'MAIN'  # Default library since it's not in HoldingsItemData
        
        # Create a 945 field for the host record to enable physical item creation during import
        field_945 = create_945_field(
            call_number=call_number,
            barcode=None,  # Will be assigned during import
            location=location,
            library=library,
            item_policy='BOOK'  # Default policy for government documents
        )
        host_rec.add_field(field_945)

    host_id = crud.create_new_marc_record(db, host_rec.as_marc(), current_user.id)
    # Re-read through unified resolver (ensures consistent downstream fetch)
    host_rec = get_marc_by_id(host_id, include_edits=True)
    host_title = get_title_from_record(host_rec)
    host_w = _preferred_control_number(host_rec, str(host_id))
    # Ensure it contains explicit LOCAL prefix if it's using the local ID
    if not any(prefix in host_w for prefix in ['(OCoLC)', '(ORG)', '(LOCAL)']):
        host_w = f"(LOCAL){host_id}"
    _strip_existing_link_fields(host_rec)

    # Collect child record data for sorting
    child_data = []
    for cid in child_ids:
        child_rec = get_marc_by_id(cid, include_edits=True)
        if child_rec:
            child_data.append((cid, child_rec))
    
    # Sort child records by date then enumeration for proper 774 ordering
    sorted_child_data = _sort_child_records_for_774(child_data)

    # Add 774 fields to host and 773 fields to children in sorted order
    for ordinal, (cid, child_rec) in enumerate(sorted_child_data, 1):
        _strip_existing_link_fields(child_rec)
        # Normalized title for 774
        child_title = build_normalized_child_title(child_rec)
        child_w = _preferred_control_number(child_rec, str(cid))
        # 774 on host with sequential numbering based on sorted order - FIXED FOR ALMA COMPLIANCE
        host_rec.add_field(
            Field(
                tag='774',
                indicators=['0', '0'],  # Fixed: 0 for display constant, not 8
                subfields=[
                    Subfield('i', 'Contains (work):'),
                    Subfield('t', child_title),
                    Subfield('w', child_w),  # Keep LOCAL prefix for manual MMS ID replacement
                    Subfield('g', f'no: {ordinal}'),
                    Subfield('9', 'related')  # Fixed: Related for serial/periodical series boundwiths
                ]
            )
        )
        # 773 on child - FIXED FOR ALMA COMPLIANCE  
        child_rec.add_field(
            Field(
                tag='773',
                indicators=['0', ''],  # Fixed: 0 for display constant, not 8
                subfields=[
                    Subfield('i', 'Bound with:'),
                    Subfield('t', host_title),
                    Subfield('w', host_w),  # Keep LOCAL prefix for manual MMS ID replacement
                    Subfield('9', 'related')  # Fixed: Related for serial/periodical series boundwiths
                ]
            )
        )
        crud.save_edited_record(db, cid, child_rec.as_marc(), current_user.id)

    crud.save_edited_record(db, host_id, host_rec.as_marc(), current_user.id)

    return {
        "status": "success",
        "message": f"Created new host {host_id} with {len(child_ids)} constituents.",
        "host_id": host_id,
        "child_ids": child_ids
    }

@router.post("/boundwith/build", response_model=BoundwithPreviewResponse)
def boundwith_preview(
    body: BoundwithPreviewRequest,
    current_user = Depends(require_cataloger)
):
    """Return an auto-generated preview for a prospective boundwith host record."""
    if not body.record_ids:
        raise HTTPException(status_code=400, detail="record_ids required")
    data = build_boundwith_preview(body.record_ids)
    return BoundwithPreviewResponse(
        host_title=data.get("host_title", "Collection."),
        publisher=data.get("publisher"),
        year_range=data.get("year_range"),
        subjects=data.get("subjects", []),
        lines_774=data.get("lines_774", [])
    )

# -------- Host Listing / Search --------

@router.get("/boundwith/hosts")
def list_boundwith_hosts(
    q: str = Query("", description="Title contains"),
    page: int = 1,
    page_size: int = 25,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """
    Paginated list of created host (born-digital) records with child IDs.
    Title filtering done in-memory after MARC parse (host count expected small).
    """
    if page < 1: page = 1
    if page_size < 1: page_size = 25
    query = db.query(models.SudocCreatedRecord).order_by(models.SudocCreatedRecord.created_at.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    results = []
    q_low = q.lower()
    from io import BytesIO as _BytesIO
    for row in rows:
        rec = next(MARCReader(_BytesIO(row.marc_data), to_unicode=True, force_utf8=True), None)
        if not rec:
            continue
        title = _extract_host_title(rec)
        if q and q_low not in title.lower():
            continue
        children = _extract_child_ids(rec)
        results.append({
            "id": row.id,
            "title": title,
            "child_ids": children,
            "child_count": len(children),
            "created_at": row.created_at
        })

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "count": len(results),
        "results": results
    }

@router.get("/boundwith/hosts/{host_id}")
def boundwith_host_summary(
    host_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """
    Summary for a single created host (title + child IDs).
    """
    row = db.query(models.SudocCreatedRecord).filter(models.SudocCreatedRecord.id == host_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Host not found")
    from io import BytesIO as _BytesIO
    rec = next(MARCReader(_BytesIO(row.marc_data), to_unicode=True, force_utf8=True), None)
    if not rec:
        raise HTTPException(status_code=500, detail="Corrupt MARC")
    title = _extract_host_title(rec)
    children = _extract_child_ids(rec)
    return {
        "id": host_id,
        "title": title,
        "child_ids": children,
        "child_count": len(children),
        "created_at": row.created_at
    }

@router.delete("/boundwith/hosts/{host_id}")
def delete_boundwith_host(
    host_id: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Delete a created host record and its boundwith relationships"""
    # First check if the host record exists
    row = db.query(models.SudocCreatedRecord).filter(models.SudocCreatedRecord.id == host_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Host not found")
    
    # Parse the MARC record to get child IDs
    from io import BytesIO
    rec = next(MARCReader(BytesIO(row.marc_data), to_unicode=True, force_utf8=True), None)
    if rec:
        # Get child IDs from 774 fields
        child_ids = _extract_child_ids(rec)
        
        # For each child, remove the 773 link field
        for cid in child_ids:
            child_rec = get_marc_by_id(cid, include_edits=True)
            if not child_rec:
                continue
                
            # Remove 773 fields that link to this host
            for field in list(child_rec.get_fields('773')):
                # Check if this 773 links to our host
                ws = field.get_subfields('w')
                for w in ws:
                    if f"(LOCAL:{host_id})" in w or str(host_id) in w:
                        child_rec.remove_field(field)
            
            # Save the updated child record
            crud.save_edited_record(db, cid, child_rec.as_marc(), current_user.id)
    
    # Delete the host record
    db.delete(row)
    db.commit()
    
    return {"message": f"Host record {host_id} deleted successfully"}

@router.post("/cart/{cart_id}/hosts/{host_id}")
def add_host_to_cart(
    cart_id: int,
    host_id: int,
    include_children: bool = Query(False, description="Also add child records to cart"),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Add a host record to a cart, optionally with its children"""
    # First verify the host record exists and is a host
    host_info = get_record_with_boundwith_info(host_id)
    if not host_info:
        raise HTTPException(status_code=404, detail="Host record not found")
        
    if not host_info["isHost"]:
        raise HTTPException(status_code=400, detail="Record is not a host record")
    
    # Add the host record to the cart
    try:
        # Add host
        crud.add_to_cart(db, cart_id, host_id)
        
        # Optionally add children
        added_children = []
        if include_children and host_info["childIds"]:
            for child_id in host_info["childIds"]:
                try:
                    crud.add_to_cart(db, cart_id, child_id)
                    added_children.append(child_id)
                except Exception as e:
                    # Continue even if one child fails
                    print(f"Error adding child {child_id} to cart: {e}")
                    
        return {
            "message": "Host added to cart successfully", 
            "host_id": host_id,
            "children_added": added_children if include_children else []
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Replace the existing lookup endpoint with this enhanced version
@router.get("/lookup/{record_id}")
async def lookup_record_info(
    record_id: int,
    include_children: bool = Query(False, description="Include child records for hosts"),
    current_user = Depends(require_cataloger)
):
    """
    Get comprehensive record info including boundwith relationships.
    Works with all record types: created, edited, and original.
    """
    try:
        # This will check PostgreSQL for edited/created records first, then SQLite
        record_info = get_record_with_boundwith_info(record_id, include_children)
        
        if not record_info:
            raise HTTPException(status_code=404, detail=f"Record {record_id} not found")
            
        return record_info
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error retrieving record: {str(e)}")

@router.patch("/{record_id}/field/{field_index}")
async def update_marc_field(
    record_id: int,
    field_index: int,
    field_update: dict = Body(...),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Update a single MARC field in a record"""
    # Get the record
    record = get_marc_by_id(record_id, include_edits=True)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Get fields in the same sorted order as displayed to the user
    # This ensures the field_index matches what the user sees
    displayed_fields = get_record_fields(record_id, preserve_order=False)
    
    if field_index < 0 or field_index >= len(displayed_fields):
        raise HTTPException(status_code=404, detail=f"Field index {field_index} out of range (0-{len(displayed_fields)-1})")
    
    # Get the field information from the displayed fields list
    field_info = displayed_fields[field_index]
    tag_to_update = field_info['tag']
    
    # Find the actual field object in the record by matching tag and position
    # Since we need to account for multiple fields with the same tag, we need to 
    # count fields with the same tag up to this index
    fields_with_same_tag_before = 0
    for i in range(field_index):
        if displayed_fields[i]['tag'] == tag_to_update:
            fields_with_same_tag_before += 1
    
    # Find the actual field to update
    fields_of_this_tag = record.get_fields(tag_to_update)
    if fields_with_same_tag_before >= len(fields_of_this_tag):
        raise HTTPException(status_code=404, detail=f"Cannot find field {tag_to_update} at position {fields_with_same_tag_before}")
    
    old_field = fields_of_this_tag[fields_with_same_tag_before]
    print(f"Updating field at index {field_index}: {old_field.tag} -> {field_update.get('tag', old_field.tag)} (position {fields_with_same_tag_before} among {tag_to_update} fields)")
    print(f"Field update data: {field_update}")
    
    # Count fields before update
    fields_before = len(list(record.get_fields()))
    print(f"Record has {fields_before} fields before update")
    
    try:
        # Create a new field based on the update
        if old_field.is_control_field():
            # Control field (no indicators/subfields)
            new_field = Field(
                tag=field_update.get("tag", old_field.tag),
                data=field_update.get("data", old_field.data)
            )
        else:
            # Regular data field
            subfields = []
            for subfield in field_update.get("subfields", []):
                subfields.append(
                    Subfield(subfield["code"], subfield["value"])
                )
            
            indicators = field_update.get("indicators", [old_field.indicator1, old_field.indicator2])
            if len(indicators) < 2:
                indicators = [indicators[0], " "] if indicators else [" ", " "]
                
            new_field = Field(
                tag=field_update.get("tag", old_field.tag),
                indicators=[
                    indicators[0] or " ",
                    indicators[1] or " "
                ],
                subfields=subfields
            )
        
        # Replace the field in the record more safely
        # Use direct field replacement instead of remove/insert to avoid position issues
        try:
            # Find and replace the field directly
            for i, field_obj in enumerate(record.fields):
                if field_obj == old_field:
                    record.fields[i] = new_field
                    print(f"Replaced field at position {i}: {old_field.tag} -> {new_field.tag}")
                    break
            else:
                # If we couldn't find the field by reference, fallback to remove/add
                print(f"Could not find field by reference, using remove/add fallback")
                record.remove_field(old_field)
                record.add_field(new_field)
        except Exception as field_replace_error:
            print(f"Error in field replacement: {field_replace_error}")
            # Last resort fallback
            record.remove_field(old_field)
            record.add_field(new_field)
        
        # Count fields after update
        fields_after = len(list(record.get_fields()))
        print(f"Record has {fields_after} fields after update")
        
        # Save the updated record
        crud.save_edited_record(db, record_id, record.as_marc(), current_user.id)
        
        # Return updated fields (sorted for proper MARC order)
        updated_fields = get_record_fields(record_id, preserve_order=False)
        print(f"Returning {len(updated_fields)} fields after update (sorted)")
        return updated_fields
    except Exception as e:
        print(f"Error updating field: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating field: {str(e)}")

@router.post("/{record_id}/field/add")
async def add_marc_field(
    record_id: int,
    request_body = Body(...),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Add a new MARC field to a record"""
    # Get the record
    record = get_marc_by_id(record_id, include_edits=True)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    try:
        print(f"Raw request_body: {request_body} (type: {type(request_body)})")
        
        # Handle different data types that might be sent
        if isinstance(request_body, str):
            import json
            try:
                field_data = json.loads(request_body)
                print(f"Parsed JSON from string: {field_data}")
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}")
                raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")
        elif isinstance(request_body, dict):
            field_data = request_body
            print(f"Using dict directly: {field_data}")
        else:
            print(f"Unexpected data type: {type(request_body)}")
            raise HTTPException(status_code=400, detail=f"Unexpected data type: {type(request_body)}")
        
        # Extract field information from request
        tag = field_data.get('tag')
        indicators = field_data.get('indicators', [' ', ' '])
        subfields_data = field_data.get('subfields', {})
        
        # Handle alternative indicator format (ind1, ind2 instead of indicators array)
        if 'ind1' in field_data and 'ind2' in field_data:
            indicators = [field_data.get('ind1', ' '), field_data.get('ind2', ' ')]
        
        if not tag:
            raise HTTPException(status_code=400, detail="Field tag is required")
        
        # Validate tag format
        if not tag.isdigit() or len(tag) != 3:
            raise HTTPException(status_code=400, detail="Field tag must be 3 digits")
        
        print(f"Adding field {tag} to record {record_id}")
        
        # For 945 fields, check for duplicates based on barcode if present
        if tag == '945' and isinstance(subfields_data, dict):
            barcode = subfields_data.get('i')  # Barcode might be in subfield 'i' for some systems
            if not barcode:
                barcode = subfields_data.get('b')  # Standard barcode subfield
            
            if barcode:
                existing_945_fields = record.get_fields('945')
                for existing_field in existing_945_fields:
                    existing_barcode = existing_field.get('i') or existing_field.get('b')
                    if existing_barcode == barcode:
                        print(f"945 field with barcode {barcode} already exists, skipping addition")
                        raise HTTPException(status_code=400, detail=f"945 field with barcode {barcode} already exists")
        
        # Create the field
        if tag.startswith('00'):
            # Control field (001-009)
            field_data_content = field_data.get('data', '')
            new_field = Field(tag=tag, data=field_data_content)
        else:
            # Data field (010-999)
            # Ensure indicators are properly formatted
            ind1 = indicators[0] if len(indicators) > 0 else ' '
            ind2 = indicators[1] if len(indicators) > 1 else ' '
            
            # Convert subfields to Subfield objects
            subfield_list = []
            
            # Handle different subfield formats
            if isinstance(subfields_data, dict):
                # Format: {'l': 'ssd', 'i': 'U184037130967', 'c': '', 'n': ''}
                for code, value in subfields_data.items():
                    if code and value:  # Skip empty values
                        subfield_list.append(Subfield(code=code, value=value))
            elif isinstance(subfields_data, list):
                # Format: [{'code': 'a', 'value': 'something'}, ...]
                for sf in subfields_data:
                    if isinstance(sf, dict):
                        code = sf.get('code', '')
                        value = sf.get('value', '')
                        if code and value:
                            subfield_list.append(Subfield(code=code, value=value))
            
            new_field = Field(tag=tag, indicators=[ind1, ind2], subfields=subfield_list)
        
        # Add the field to the record
        record.add_field(new_field)
        
        # Save the updated record
        crud.save_edited_record(db, record_id, record.as_marc(), current_user.id)
        
        # Return updated fields (sorted for proper MARC order)
        updated_fields = get_record_fields(record_id, preserve_order=False)
        print(f"Successfully added field {tag}. Returning {len(updated_fields)} total fields")
        return updated_fields
        
    except Exception as e:
        print(f"Error adding field: {e}")
        print(f"Field data received: {field_data}")
        raise HTTPException(status_code=500, detail=f"Error adding field: {str(e)}")

@router.post("/{record_id}/field/945/add")
async def add_945_field(
    record_id: int,
    request_body = Body(...),
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Add a 945 field for Alma import profile with physical item information"""
    # Get the record
    record = get_marc_by_id(record_id, include_edits=True)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    try:
        print(f"Raw request_body: {request_body} (type: {type(request_body)})")
        
        # Handle different data types that might be sent
        if isinstance(request_body, str):
            import json
            try:
                item_data = json.loads(request_body)
                print(f"Parsed JSON from string: {item_data}")
            except json.JSONDecodeError as e:
                print(f"JSON decode error: {e}")
                raise HTTPException(status_code=400, detail=f"Invalid JSON format: {str(e)}")
        elif isinstance(request_body, dict):
            item_data = request_body
            print(f"Using dict directly: {item_data}")
        else:
            print(f"Unexpected data type: {type(request_body)}")
            raise HTTPException(status_code=400, detail=f"Unexpected data type: {type(request_body)}")
        
        # Extract item information from request
        call_number = item_data.get('call_number', '')
        barcode = item_data.get('barcode', '')
        location = item_data.get('location', 'MAIN')
        library = item_data.get('library', 'MAIN')
        item_policy = item_data.get('item_policy', 'BOOK')
        
        print(f"Adding 945 field to record {record_id}: call_number={call_number}, location={location}")
        
        # Check if a 945 field with the same barcode already exists to prevent duplicates
        existing_945_fields = record.get_fields('945')
        if barcode and existing_945_fields:
            for existing_field in existing_945_fields:
                existing_barcode = existing_field.get('b')  # Barcode is in subfield 'b'
                if existing_barcode == barcode:
                    print(f"945 field with barcode {barcode} already exists, skipping addition")
                    raise HTTPException(status_code=400, detail=f"945 field with barcode {barcode} already exists")
        
        # Create the 945 field using the helper function
        field_945 = create_945_field(
            call_number=call_number,
            barcode=barcode if barcode else None,
            location=location,
            library=library,
            item_policy=item_policy
        )
        
        # Add the field to the record
        record.add_field(field_945)
        
        # Save the updated record
        crud.save_edited_record(db, record_id, record.as_marc(), current_user.id)
        
        # Return updated fields (sorted for proper MARC order)
        updated_fields = get_record_fields(record_id, preserve_order=False)
        print(f"Successfully added 945 field. Returning {len(updated_fields)} total fields")
        return updated_fields
        
    except Exception as e:
        print(f"Error adding 945 field: {e}")
        print(f"Item data received: {item_data}")
        raise HTTPException(status_code=500, detail=f"Error adding 945 field: {str(e)}")

@router.delete("/{record_id}/field/{field_index}")
async def delete_marc_field(
    record_id: int,
    field_index: int,
    current_user = Depends(require_cataloger),
    db: Session = Depends(get_db)
):
    """Delete a MARC field from a record"""
    # Get the record
    record = get_marc_by_id(record_id, include_edits=True)
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    
    # Get fields in the same sorted order as displayed to the user
    # This ensures the field_index matches what the user sees
    displayed_fields = get_record_fields(record_id, preserve_order=False)
    
    if field_index < 0 or field_index >= len(displayed_fields):
        raise HTTPException(status_code=404, detail=f"Field index {field_index} out of range (0-{len(displayed_fields)-1})")
    
    # Get the field information from the displayed fields list
    field_info = displayed_fields[field_index]
    tag_to_delete = field_info['tag']
    
    # Find the actual field object in the record by matching tag and position
    # Since we need to account for multiple fields with the same tag, we need to 
    # count fields with the same tag up to this index
    fields_with_same_tag_before = 0
    for i in range(field_index):
        if displayed_fields[i]['tag'] == tag_to_delete:
            fields_with_same_tag_before += 1
    
    # Find the actual field to delete
    fields_of_this_tag = record.get_fields(tag_to_delete)
    if fields_with_same_tag_before >= len(fields_of_this_tag):
        raise HTTPException(status_code=404, detail=f"Cannot find field {tag_to_delete} at position {fields_with_same_tag_before}")
    
    field_to_delete = fields_of_this_tag[fields_with_same_tag_before]
    print(f"Deleting field at index {field_index}: {field_to_delete.tag} (position {fields_with_same_tag_before} among {tag_to_delete} fields)")
    
    try:
        # Remove the field from the record
        record.remove_field(field_to_delete)
        
        # Save the updated record
        crud.save_edited_record(db, record_id, record.as_marc(), current_user.id)
        
        # Return updated fields (sorted for proper MARC order)
        updated_fields = get_record_fields(record_id, preserve_order=False)
        print(f"Returning {len(updated_fields)} fields after deletion (sorted)")
        return updated_fields
        
    except Exception as e:
        print(f"Error deleting field: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting field: {str(e)}")
