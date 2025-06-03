# backend/api/upload.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import pandas as pd
from io import BytesIO
from typing import List

from db import crud, models
from schemas.item import ItemCreate, ItemRead
from schemas.analytics import AnalyticsCreate, AnalyticsRead
from db.session import get_db

router = APIRouter()

###────────── Existing CRUD Endpoints ─────────────────

@router.post("/item", response_model=ItemRead)
def create_item_endpoint(item_in: ItemCreate, db: Session = Depends(get_db)):
    """
    Creates a single Item. If barcode exists, returns 400.
    """
    existing = crud.get_item_by_barcode(db, item_in.barcode)
    if existing:
        raise HTTPException(status_code=400, detail="Item with this barcode already exists.")
    db_item = crud.create_item(db, item_in)
    return db_item

@router.get("/items", response_model=List[ItemRead])
def list_items_endpoint(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Returns a paginated list of all items.
    """
    return crud.list_items(db, skip=skip, limit=limit)


###────────── File-Upload Endpoints ───────────────────

@router.post("/items-file")
async def upload_items_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Accepts an XLSX file with columns: 'barcode', 'alternative_call_number'.
    Parses and inserts each row into the items table.
    Returns a summary of successes and failures.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files are supported.")

    contents = await file.read()
    try:
        df = pd.read_excel(BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to read Excel file.")

    required_cols = {"barcode", "alternative_call_number"}
    if not required_cols.issubset(df.columns.str.lower()):
        # Accept mixed-case by lowercasing columns for the check
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns. Expected 'barcode' and 'alternative_call_number'."
        )

    inserted = 0
    errors = []

    # Normalize column names to lowercase to handle case variations
    df.columns = [col.lower() for col in df.columns]

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        alt_call = str(row["alternative_call_number"]).strip()

        # Parse alt_call into components: ["S","1","02B","03","04","005"]
        parts = alt_call.split("-")
        if len(parts) != 6:
            errors.append({"row": idx + 2, "barcode": barcode, "error": "Invalid call number format"})
            continue

        _, floor, range_code, ladder, shelf, position = parts
        item_in = ItemCreate(
            barcode=barcode,
            alt_call_number=alt_call,
            floor=floor,
            range=range_code,
            ladder=ladder,
            shelf=shelf,
            position=position
        )

        try:
            crud.create_item(db, item_in)
            inserted += 1
        except Exception as e:
            errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})

    return {
        "filename": file.filename,
        "total_rows": int(df.shape[0]),
        "inserted": inserted,
        "errors": errors
    }


@router.post("/analytics-file")
async def upload_analytics_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Accepts an XLSX file with columns including: 'Barcode', 'Item Call Number', 'Title', 'Permanent Call Number', 'Lifecycle'.
    For each row, if the barcode exists in items, insert into analytics; otherwise record as missing.
    Returns a summary of successes and failures.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files are supported.")

    contents = await file.read()
    try:
        df = pd.read_excel(BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to read Excel file.")

    # Ensure the required columns exist (case-insensitive)
    needed_cols = {"barcode", "item call number", "title", "permanent call number", "lifecycle"}
    if not needed_cols.issubset({col.lower() for col in df.columns}):
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns. Expected at least: {', '.join(needed_cols)}"
        )

    inserted = 0
    skipped = []
    errors = []

    # Normalize column names
    df.columns = [col.lower() for col in df.columns]

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        alt_call = str(row["item call number"]).strip()
        title = str(row["title"]).strip()
        call_number = str(row["permanent call number"]).strip()
        status = str(row["lifecycle"]).strip()

        # Check if that barcode exists in items table
        existing_item = crud.get_item_by_barcode(db, barcode)
        if not existing_item:
            skipped.append({"row": idx + 2, "barcode": barcode, "reason": "No matching item"})
            continue

        analytics_in = AnalyticsCreate(
            barcode=barcode,
            alt_call_number=alt_call,
            title=title,
            call_number=call_number,
            status=status
        )

        try:
            crud.create_analytics(db, analytics_in)
            inserted += 1
        except Exception as e:
            errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})

    return {
        "filename": file.filename,
        "total_rows": int(df.shape[0]),
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors
    }
