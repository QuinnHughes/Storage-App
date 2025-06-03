# backend/api/upload.py

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import pandas as pd
from io import BytesIO

from db import crud, models
from schemas.item import ItemCreate, ItemRead
from schemas.analytics import AnalyticsCreate, AnalyticsErrorCreate, AnalyticsRead
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


###────────── File-Upload Endpoints ───────────────────

@router.post("/items-file")
async def upload_items_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Accepts an XLSX or XLS file with columns: 'barcode', 'alternative_call_number'.
    Parses and inserts or updates each row in the items table.
    If a barcode already exists, its fields are updated to the new values.
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

    # 2) Normalize column names: lowercase, strip whitespace, remove BOM, replace spaces with underscores
    df.columns = [
        col.lower().strip().replace("\ufeff", "").replace(" ", "_")
        for col in df.columns
    ]

    # 3) Ensure required columns exist
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

    # 4) Iterate rows
    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        alt_call = str(row["alternative_call_number"]).strip()

        # Parse alt_call into components: ["S","1","01B","03","04","005"]
        parts = alt_call.split("-")
        if len(parts) != 6:
            errors.append({"row": idx + 2, "barcode": barcode, "error": "Invalid call number format"})
            continue

        location, floor, range_code, ladder, shelf, position = parts

        existing_item = crud.get_item_by_barcode(db, barcode)
        if existing_item:
            # Update existing record
            existing_item.alternative_call_number = alt_call
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
            # Create new record
            item_in = ItemCreate(
                barcode=barcode,
                alternative_call_number=alt_call,
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
                errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})

    return {
        "filename": file.filename,
        "total_rows": int(df.shape[0]),
        "inserted": inserted,
        "updated": updated,
        "errors": errors
    }


@router.post("/analytics-file")
async def upload_analytics_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Accepts an XLSX or XLS file with columns:
      'barcode', 'item_call_number', 'title', 'permanent_call_number', 'lifecycle'.

    For each row:
    - If the barcode exists in items, insert into analytics (overwriting alt_call_number from item).
    - Otherwise, insert into analytics_errors.
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

    # 2) Normalize column names: lowercase, strip whitespace, remove BOM, replace spaces with underscores
    df.columns = [
        col.lower().strip().replace("\ufeff", "").replace(" ", "_")
        for col in df.columns
    ]

    # 3) Ensure required columns exist
    needed_cols = {"barcode", "item_call_number", "title", "permanent_call_number", "lifecycle"}
    if not needed_cols.issubset(df.columns):
        return {
            "detail": "Missing required columns",
            "seen_columns": df.columns.tolist(),
            "required": list(needed_cols),
        }

    inserted = 0
    error_inserted = 0
    errors = []

    # 4) Iterate rows
    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        title = str(row["title"]).strip()
        call_number = str(row["permanent_call_number"]).strip()
        status = str(row["lifecycle"]).strip()

        existing_item = crud.get_item_by_barcode(db, barcode)
        if existing_item:
            # Insert or update analytics: if record exists, update; else insert
            existing_analytics = db.query(models.Analytics).filter(
                models.Analytics.barcode == barcode
            ).first()
            if existing_analytics:
                existing_analytics.alternative_call_number = existing_item.alternative_call_number
                existing_analytics.title = title
                existing_analytics.call_number = call_number
                existing_analytics.status = status
                try:
                    db.commit()
                    inserted += 1  # count updates here as “inserted” for simplicity
                except Exception as e:
                    db.rollback()
                    errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
            else:
                analytics_in = AnalyticsCreate(
                    barcode=barcode,
                    alternative_call_number=existing_item.alternative_call_number,
                    title=title,
                    call_number=call_number,
                    status=status
                )
                try:
                    crud.create_analytics(db, analytics_in)
                    inserted += 1
                except Exception as e:
                    errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
        else:
            err_in = AnalyticsErrorCreate(
                barcode=barcode,
                alternative_call_number=None,
                title=title,
                call_number=call_number,
                status=status,
                error_reason="No matching barcode"
            )
            try:
                crud.create_analytics_error(db, err_in)
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
