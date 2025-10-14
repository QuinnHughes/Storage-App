# backend/api/upload.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import pandas as pd
from io import BytesIO
import json
import re

from db import crud, models
from schemas.item import ItemCreate, ItemRead
from schemas.analytics import AnalyticsCreate, AnalyticsErrorCreate, AnalyticsRead
from db.session import get_db

router = APIRouter()


@router.post("/item", response_model=ItemRead)
def create_item_endpoint(item_in: ItemCreate, db: Session = Depends(get_db)):
    existing = crud.get_item_by_barcode(db, item_in.barcode)
    if existing:
        raise HTTPException(status_code=400, detail="Item with this barcode already exists.")
    return crud.create_item(db, item_in)


@router.post("/items-file")
async def upload_items_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = file.filename.lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files are supported.")

    contents = await file.read()

    try:
        engine = "openpyxl" if filename.endswith(".xlsx") else None
        df = pd.read_excel(BytesIO(contents), engine=engine)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read Excel file: {e}")

    df.columns = [
        col.lower().strip().replace("\ufeff", "").replace(" ", "_")
        for col in df.columns
    ]

    required_cols = {"barcode", "alternative_call_number"}
    if not required_cols.issubset(df.columns):
        return {
            "detail": "Missing required columns",
            "seen_columns": df.columns.tolist(),
            "required": list(required_cols),
        }

    inserted = 0
    updated = 0
    errors = []

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        alternative_call_number = str(row["alternative_call_number"]).strip()
        parts = alternative_call_number.split("-")
        if len(parts) != 6:
            errors.append({"row": idx + 2, "barcode": barcode, "error": "Invalid call number format"})
            continue

        location, floor, range_code, ladder, shelf, position = parts
        existing_item = crud.get_item_by_barcode(db, barcode)
        if existing_item:
            existing_item.alternative_call_number = alternative_call_number
            existing_item.location = location
            existing_item.floor = floor
            existing_item.range_code = range_code
            existing_item.ladder = ladder
            existing_item.shelf = shelf
            existing_item.position = position
            try:
                db.commit()
                updated += 1
            except Exception as e:
                db.rollback()
                errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
        else:
            item_in = ItemCreate(
                barcode=barcode,
                alternative_call_number=alternative_call_number,
                location=location,
                floor=floor,
                range_code=range_code,
                ladder=ladder,
                shelf=shelf,
                position=position
            )
            try:
                crud.create_item(db, item_in)
                inserted += 1
            except Exception as e:
                db.rollback()
                errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})

    return {
        "filename": file.filename,
        "total_rows": int(df.shape[0]),
        "inserted": inserted,
        "updated": updated,
        "errors": errors
    }


def parse_call_number_components(acn: str):
    """
    Parse alternative call number to extract floor, range_code.
    Format: S-{floor}-{range}-{ladder}-{shelf}-{position}
    Returns tuple: (floor, range_code) or (None, None) if invalid
    """
    if not acn or acn == "nan":
        return None, None
    match = re.match(r'S-(\w+)-(\d+[A-Z]*)-(\d+)-(\d+)-(.+)', acn)
    if match:
        return match.group(1), match.group(2)
    return None, None


def is_within_items_range(analytics_acn: str, db: Session) -> bool:
    """
    Check if analytics alternative_call_number falls within range of existing items.
    Only analytics records that could theoretically match scanned items should be flagged as errors.
    """
    floor, range_code = parse_call_number_components(analytics_acn)
    if not floor or not range_code:
        return False
    
    # Check if any items exist with this floor and range combination
    existing = db.query(models.Item).filter(
        models.Item.floor == floor,
        models.Item.range_code == range_code
    ).first()
    
    return existing is not None


async def process_analytics_stream(contents: bytes, filename: str, db: Session):
    """
    Stream analytics file processing with progress updates.
    Yields JSON progress updates.
    """
    filename_lower = filename.lower()
    if not (filename_lower.endswith(".xlsx") or filename_lower.endswith(".xls")):
        yield json.dumps({"error": "Only .xlsx or .xls files are supported."}) + "\n"
        return

    try:
        engine = "openpyxl" if filename_lower.endswith(".xlsx") else None
        df = pd.read_excel(BytesIO(contents), engine=engine)
    except Exception as e:
        yield json.dumps({"error": f"Unable to read Excel file: {e}"}) + "\n"
        return

    df.columns = [
        col.lower().strip().replace("\ufeff", "").replace(" ", "_")
        for col in df.columns
    ]

    needed_cols = {
        "barcode", "title", "permanent_call_number", "lifecycle",
        "location_code", "item_policy", "description", "alternative_call_number"
    }
    if not needed_cols.issubset(df.columns):
        yield json.dumps({
            "error": "Missing required columns",
            "seen_columns": df.columns.tolist(),
            "required": list(needed_cols),
        }) + "\n"
        return

    total_rows = len(df)
    inserted = 0
    error_inserted = 0
    skipped_out_of_range = 0
    errors = []
    
    # Send initial progress
    yield json.dumps({
        "status": "processing",
        "progress": 0,
        "total": total_rows,
        "processed": 0,
        "inserted": 0,
        "errors_inserted": 0,
        "skipped_out_of_range": 0
    }) + "\n"

    BATCH_SIZE = 100
    batch_count = 0

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        title = str(row["title"]).strip()
        call_number = str(row["permanent_call_number"]).strip()
        status = str(row["lifecycle"]).strip()
        alternative_call_number = str(row["alternative_call_number"]).strip()
        location_code = str(row["location_code"]).strip()
        item_policy = str(row["item_policy"]).strip()
        description = str(row["description"]).strip()

        # Check if item exists to set has_item_link
        existing_item = crud.get_item_by_barcode(db, barcode)
        has_item_link = existing_item is not None
        
        # Always save or update analytics record
        existing_analytics = db.query(models.Analytics).filter(
            models.Analytics.barcode == barcode
        ).first()
        
        if existing_analytics:
            # Update existing analytics record
            existing_analytics.alternative_call_number = alternative_call_number
            existing_analytics.title = title
            existing_analytics.call_number = call_number
            existing_analytics.status = status
            existing_analytics.location_code = location_code
            existing_analytics.item_policy = item_policy
            existing_analytics.description = description
            existing_analytics.has_item_link = has_item_link
            try:
                db.commit()
                inserted += 1
            except Exception as e:
                db.rollback()
                errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
        else:
            # Create new analytics record
            analytics_in = AnalyticsCreate(
                barcode=barcode,
                alternative_call_number=alternative_call_number,
                title=title,
                call_number=call_number,
                status=status,
                location_code=location_code,
                item_policy=item_policy,
                description=description,
                has_item_link=has_item_link
            )
            try:
                crud.create_analytics(db, analytics_in)
                inserted += 1
            except Exception as e:
                db.rollback()
                errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
        
        # Create analytics error when:
        # An item exists at this alternative_call_number location, but has a different barcode
        # This indicates a shelving error or mislabeled item
        if alternative_call_number and alternative_call_number != "nan":
            item_at_location = db.query(models.Item).filter(
                models.Item.alternative_call_number == alternative_call_number
            ).first()
            
            if item_at_location and item_at_location.barcode != barcode:
                # Found an item at this location with a different barcode - this is an error!
                err_in = AnalyticsErrorCreate(
                    barcode=barcode,
                    alternative_call_number=alternative_call_number,
                    title=title,
                    call_number=call_number,
                    status=status,
                    error_reason=f"Barcode mismatch: Item at location has barcode {item_at_location.barcode}"
                )
                try:
                    crud.create_analytics_error(db, err_in)
                    error_inserted += 1
                except Exception as e:
                    db.rollback()
                    # Ignore duplicate constraint errors for analytics_errors
                    pass

        batch_count += 1
        
        # Send progress updates every BATCH_SIZE rows
        if batch_count >= BATCH_SIZE:
            progress = int((idx + 1) / total_rows * 100)
            yield json.dumps({
                "status": "processing",
                "progress": progress,
                "total": total_rows,
                "processed": idx + 1,
                "inserted": inserted,
                "errors_inserted": error_inserted,
                "skipped_out_of_range": skipped_out_of_range
            }) + "\n"
            batch_count = 0

    # Send final result
    yield json.dumps({
        "status": "complete",
        "filename": filename,
        "total_rows": total_rows,
        "inserted": inserted,
        "errors_inserted": error_inserted,
        "skipped_out_of_range": skipped_out_of_range,
        "errors": errors,
        "progress": 100
    }) + "\n"


@router.post("/analytics-file")
async def upload_analytics_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Upload analytics file with streaming progress updates.
    Returns a stream of JSON objects with progress information.
    """
    # Read file contents before streaming (file gets closed after this function returns)
    contents = await file.read()
    filename = file.filename
    
    return StreamingResponse(
        process_analytics_stream(contents, filename, db),
        media_type="application/x-ndjson"
    )
