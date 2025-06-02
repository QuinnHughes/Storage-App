from fastapi import APIRouter, HTTPException
from backend.db.session import SessionLocal
from backend.db.models import Item

router = APIRouter()

@router.get("/{floor}/{range_id}/{ladder}/{shelf}")
def get_items_by_location(floor: str, range_id: str, ladder: str, shelf: str):
    session = SessionLocal()
    try:
        items = session.query(Item).filter_by(
            floor=floor,
            range=range_id,
            ladder=ladder,
            shelf=shelf
        ).order_by(Item.position).all()
        
        return [
            {
                "barcode": i.barcode,
                "alt_call_number": i.alt_call_number,
                "position": i.position
            }
            for i in items
        ]
    finally:
        session.close()
