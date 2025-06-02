from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
from backend.db.session import SessionLocal
from backend.db.models import Item, Analytics
from backend.core.utils import parse_alt_call_number

router = APIRouter()

@router.post("/")
def upload_analytics(file: UploadFile = File(...)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files supported")

    df = pd.read_excel(file.file)
    session = SessionLocal()

    for _, row in df.iterrows():
        barcode = str(row["Barcode"]).strip()
        item_call_number = str(row["Item Call Number"]).strip()
        title = str(row.get("Title", ""))
        call_number = str(row.get("Permanent Call Number", ""))

        matched = session.query(Item).filter_by(
            barcode=barcode,
            alt_call_number=item_call_number
        ).first()

        status = "linked" if matched else "needs_review"

        analytics = Analytics(
            barcode=barcode,
            alt_call_number=item_call_number,
            title=title,
            call_number=call_number,
            status=status
        )
        session.add(analytics)

    session.commit()
    session.close()
    return {"message": "Analytics processed and attached where matched."}

@router.get("/review-needed")
def get_review_needed():
    session = SessionLocal()
    results = session.query(Analytics).filter_by(status="needs_review").all()
    session.close()
    
    return [
        {
            "barcode": a.barcode,
            "alt_call_number": a.alt_call_number,
            "title": a.title,
            "call_number": a.call_number
        }
        for a in results
    ]