
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import pandas as pd
from io import BytesIO

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
        if filename.endswith(".xlsx"):
            df = pd.read_excel(BytesIO(contents), engine="openpyxl")
        else:
            import xlrd
            df = pd.read_excel(BytesIO(contents), engine="xlrd")
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
    filename = file.filename.lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files are supported.")

    contents = await file.read()

    try:
        if filename.endswith(".xlsx"):
            df = pd.read_excel(BytesIO(contents), engine="openpyxl")
        else:
            import xlrd
            df = pd.read_excel(BytesIO(contents), engine="xlrd")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read Excel file: {e}")

    df.columns = [
        col.lower().strip().replace("\ufeff", "").replace(" ", "_")
        for col in df.columns
    ]

    needed_cols = {
        "barcode", "title", "permanent_call_number", "lifecycle",
        "location_code", "item_policy", "description", "alternative_call_number"
    }
    if not needed_cols.issubset(df.columns):
        return {
            "detail": "Missing required columns",
            "seen_columns": df.columns.tolist(),
            "required": list(needed_cols),
        }

    inserted = 0
    error_inserted = 0
    errors = []

    for idx, row in df.iterrows():
        barcode = str(row["barcode"]).strip()
        title = str(row["title"]).strip()
        call_number = str(row["permanent_call_number"]).strip()
        status = str(row["lifecycle"]).strip()
        alternative_call_number = str(row["alternative_call_number"]).strip()
        location_code = str(row["location_code"]).strip()
        item_policy = str(row["item_policy"]).strip()
        description = str(row["description"]).strip()

        existing_item = crud.get_item_by_barcode(db, barcode)
        if existing_item:
            existing_analytics = db.query(models.Analytics).filter(
                models.Analytics.barcode == barcode
            ).first()
            if existing_analytics:
                existing_analytics.alternative_call_number = alternative_call_number
                existing_analytics.title = title
                existing_analytics.call_number = call_number
                existing_analytics.status = status
                existing_analytics.location_code = location_code
                existing_analytics.item_policy = item_policy
                existing_analytics.description = description
                try:
                    db.commit()
                    inserted += 1
                except Exception as e:
                    db.rollback()
                    errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
            else:
                analytics_in = AnalyticsCreate(
                    barcode=barcode,
                    alternative_call_number=alternative_call_number,
                    title=title,
                    call_number=call_number,
                    status=status,
                    location_code=location_code,
                    item_policy=item_policy,
                    description=description
                )
                try:
                    crud.create_analytics(db, analytics_in)
                    inserted += 1
                except Exception as e:
                    errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})
        else:
            err_in = AnalyticsErrorCreate(
                barcode=barcode,
                alternative_call_number=alternative_call_number,
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
