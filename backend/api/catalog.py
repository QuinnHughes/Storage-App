# backend/api/catalog.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db import crud
from schemas.item import ItemRead
from db.session import get_db

router = APIRouter()

@router.get("/items/{barcode}", response_model=ItemRead)
def get_item_endpoint(barcode: str, db: Session = Depends(get_db)):
    """
    Fetch a single item by barcode.
    """
    item = crud.get_item_by_barcode(db, barcode)
    return item

@router.get("/items-by-shelf", response_model=list[ItemRead])
def list_by_shelf_endpoint(
    floor: str,
    range: str,
    ladder: str,
    shelf: str,
    db: Session = Depends(get_db)
):
    """
    Fetch all items on a given shelf (by floor, range, ladder, shelf).
    Query example: /items-by-shelf?floor=1&range=02B&ladder=03&shelf=04
    """
    return crud.list_items_by_shelf(db, floor, range, ladder, shelf)
