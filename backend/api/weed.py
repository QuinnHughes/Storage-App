# backend/api/weed.py

from fastapi               import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm        import Session
import pandas as pd

from db.session            import get_db
from db                     import crud
from core.auth              import require_cataloger
from schemas.weeded_item    import WeededItemCreate, WeededItem

router = APIRouter()

@router.post("/upload", response_model=list[WeededItem])
def upload_weed_list(
    file: UploadFile = File(...),
    db: Session       = Depends(get_db),
    user              = Depends(require_cataloger)
):
    # 1) Read file
    try:
        df = pd.read_excel(file.file)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Excel file")

    # 2) Normalize headers
    df.columns = (
        df.columns
          .str.strip()
          .str.lower()
          .str.replace(r"\s+", "_", regex=True)
    )
    # Normalizes the nefarious U and u so they actually show up as weeded by the double barcode logic
    df["barcode"]         = df["barcode"].astype(str).str.strip().str.upper()
    df["scanned_barcode"] = df["scanned_barcode"].astype(str).str.strip().str.upper()
   
    # 3) Ensure required columns exist
    for col in ("alternative_call_number", "barcode", "scanned_barcode"):
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing column: {col}")

    # 4) Drop exact duplicates within this upload
    df = df.drop_duplicates(subset=["alternative_call_number", "barcode"])

    # 5) Fetch already‐weeded keys to skip
    existing = {
        (w.alternative_call_number, w.barcode)
        for w in crud.get_weeded_items(db)
    }

    # 6) Build Pydantic inputs, skipping any that already exist
    wis: list[WeededItemCreate] = []
    for row in df.itertuples(index=False, name="Row"):
        key = (row.alternative_call_number, row.barcode)
        if key in existing:
            continue
        wis.append(
            WeededItemCreate(
                alternative_call_number = row.alternative_call_number,
                barcode                 = row.barcode,
                scanned_barcode         = row.scanned_barcode,
            )
        )

    # 7) If nothing new remains, return empty list
    if not wis:
        return []

    # 8) Bulk‐insert new items and return them
    created = crud.bulk_create_weeded_items(db, wis)
    return created
