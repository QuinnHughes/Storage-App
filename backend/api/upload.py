from fastapi import APIRouter, UploadFile, File, HTTPException
import pandas as pd
from backend.db.session import SessionLocal
from backend.db.models import Item

router = APIRouter()

def parse_alt_call_number(call: str):
    """Extract floor, range, ladder, shelf, position from alternative call number."""
    parts = call.split("-")
    if len(parts) < 6:
        raise ValueError(f"Invalid alternative call number format: {call}")
    return {
        "floor": parts[1],
        "range": parts[2],
        "ladder": parts[3],
        "shelf": parts[4],
        "position": parts[5],
    }

@router.post("/items")
def upload_items(file: UploadFile = File(...)):
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")

    df = pd.read_excel(file.file)

    required_columns = {"barcode", "alternative_call_number"}
    if not required_columns.issubset(df.columns.str.lower()):
        raise HTTPException(status_code=400, detail=f"Required columns: {required_columns}")

    session = SessionLocal()
    for _, row in df.iterrows():
        alt = row["alternative_call_number"]
        try:
            parsed = parse_alt_call_number(alt)
        except ValueError as e:
            continue  # or optionally log and skip

        item = Item(
            barcode=row["barcode"],
            alt_call_number=alt,
            floor=parsed["floor"],
            range=parsed["range"],
            ladder=parsed["ladder"],
            shelf=parsed["shelf"],
            position=parsed["position"]
        )
        session.add(item)

    session.commit()
    session.close()

    return {"message": "Items uploaded and parsed successfully"}
