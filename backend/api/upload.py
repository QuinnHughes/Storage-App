# backend/api/upload.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import pandas as pd
from io import BytesIO
from typing import List

from db import models
from db.session import get_db
from schemas.item import ItemCreate, ItemRead
from schemas.analytics import AnalyticsCreate, AnalyticsErrorCreate, AnalyticsRead, AnalyticsErrorRead
from db import crud

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

###────────── File-Upload Endpoints ───────────────────

@router.post("/items-file")
async def upload_items_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Accepts an XLSX or XLS file with columns: 'barcode', 'alternative_call_number'.
    Parses and inserts each row into the items table unconditionally.
    """
    filename = file.filename.lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files are supported.")

    contents = await file.read()

    # 1) Read Excel into DataFrame
    try:
        if filename.endswith(".xlsx"):
            df = pd.read_excel(BytesIO(contents), engine="openpyxl")
        else:
            try:
                import xlrd  # noqa: F401
            except ImportError:
                raise HTTPException(
                    status_code=400,
                    detail="Reading .xls files requires the 'xlrd' library. Install xlrd>=2.0.1 or convert to .xlsx."
                )
            df = pd.read_excel(BytesIO(contents), engine="xlrd")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read Excel file: {e}")

    # 2) Check required columns (case-insensitive)
    required_cols = {"barcode", "alternative_call_number"}
    lower_cols = {c.lower() for c in df.columns}
    if not required_cols.issubset(lower_cols):
        missing = required_cols - lower_cols
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}. Expected 'barcode' and 'alternative_call_number'."
        )

    # Normalize column names to lowercase
    df.columns = [col.lower() for col in df.columns]

    inserted = 0
    errors = []

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        alt_call = str(row["alternative_call_number"]).strip()

        # Parse alt_call into components: ["S","1","01B","03","04","005"]
        parts = alt_call.split("-")
        if len(parts) != 6:
            errors.append({"row": idx + 2, "barcode": barcode, "error": "Invalid call number format"})
            continue

        location, floor, range_code, ladder, shelf, position = parts

        item_in = ItemCreate(
            barcode=barcode,
            alt_call_number=alt_call,
            location=location,
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
    Accepts an XLSX or XLS file with columns:
      'barcode', 'item call number', 'title', 'permanent call number', 'lifecycle'.

    Logic:
    1) If both barcode AND item call number match the same Item:
         → insert into analytics table.
    2) Otherwise (partial match or no match):
         → insert into analytics_errors table, with an error_reason.
    """
    filename = file.filename.lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files are supported.")

    contents = await file.read()

    # 1) Read Excel into DataFrame
    try:
        if filename.endswith(".xlsx"):
            df = pd.read_excel(BytesIO(contents), engine="openpyxl")
        else:
            try:
                import xlrd  # noqa: F401
            except ImportError:
                raise HTTPException(
                    status_code=400,
                    detail="Reading .xls files requires the 'xlrd' library. Install xlrd>=2.0.1 or convert to .xlsx."
                )
            df = pd.read_excel(BytesIO(contents), engine="xlrd")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read Excel file: {e}")

    # 2) Ensure required columns exist (case-insensitive)
    needed_cols = {"barcode", "item call number", "title", "permanent call number", "lifecycle"}
    lower_cols = {c.lower() for c in df.columns}
    if not needed_cols.issubset(lower_cols):
        missing = needed_cols - lower_cols
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing)}. Expected at least: {', '.join(needed_cols)}"
        )

    # Normalize column names
    df.columns = [col.lower() for col in df.columns]

    inserted = 0
    error_inserted = 0
    errors = []

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        alt_call = str(row["item call number"]).strip()
        title = str(row["title"]).strip()
        call_number = str(row["permanent call number"]).strip()
        status = str(row["lifecycle"]).strip()

        # 1) Check for a full match: both barcode AND alt_call_number must match the SAME Item
        item_full = db.query(models.Item).filter(
            models.Item.barcode == barcode,
            models.Item.alternative_call_number == alt_call
        ).first()

        if item_full:
            # Insert into analytics
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
            continue

        # 2) Partial‐match logic
        barcode_match = crud.get_item_by_barcode(db, barcode) is not None
        acn_match = db.query(models.Item).filter(
            models.Item.alternative_call_number == alt_call
        ).first() is not None

        if barcode_match or acn_match:
            reason = "Partial match (only barcode or only alt_call matches)"
        else:
            reason = "No matching item (neither barcode nor alt_call matches)"

        # Insert into analytics_errors
        error_in = AnalyticsErrorCreate(
            barcode=barcode,
            alt_call_number=alt_call,
            title=title,
            call_number=call_number,
            status=status,
            error_reason=reason
        )
        try:
            crud.create_analytics_error(db, error_in)
            error_inserted += 1
        except Exception as e:
            errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})

    return {
        "filename": file.filename,
        "total_rows": int(df.shape[0]),
        "inserted": inserted,
        "errors_inserted": error_inserted,
        "errors": errors
    }
