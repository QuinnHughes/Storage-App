# backend/api/analytics.py

from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
from db.session import SessionLocal
from db.models import Item, Analytics
from core.utils import parse_alt_call_number

router = APIRouter()


@router.post("/")
def upload_analytics(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")

    try:
        df = pd.read_excel(file.file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Unable to read Excel file: {e}")

    session = SessionLocal()
    inserted = 0
    errors = []

    for idx, row in df.iterrows():
        barcode = str(row.get("barcode", "")).strip()
        item_call = str(row.get("item_call_number", "")).strip()
        title = str(row.get("title", "")).strip()
        call_number = str(row.get("permanent_call_number", "")).strip()
        status = str(row.get("lifecycle", "")).strip()

        if not barcode:
            errors.append({"row": idx + 2, "error": "Missing barcode"})
            continue

        # Look up the item by barcode
        item = session.query(Item).filter(Item.barcode == barcode).first()
        if not item:
            errors.append({"row": idx + 2, "barcode": barcode, "error": "No matching item"})
            continue

        # Optionally parse item.alternative_call_number
        parsed = parse_alt_call_number(item.alternative_call_number)

        db_analytics = Analytics(
            barcode=barcode,
            alternative_call_number=item.alternative_call_number,
            title=title,
            call_number=call_number,
            status=status
        )

        try:
            session.add(db_analytics)
            session.commit()
            inserted += 1
        except Exception as e:
            session.rollback()
            errors.append({"row": idx + 2, "barcode": barcode, "error": str(e)})

    session.close()
    return {"inserted": inserted, "errors": errors}


@router.get("/review-needed")
def get_review_needed():
    session = SessionLocal()
    results = session.query(Analytics).filter_by(status="needs_review").all()
    session.close()

    return [
        {
            "barcode": a.barcode,
            "alternative_call_number": a.alternative_call_number,
            "title": a.title,
            "call_number": a.call_number
        }
        for a in results
    ]
