# backend/schemas/item.py

from pydantic import BaseModel
from typing import Optional

class ItemBase(BaseModel):
    barcode: str
    alternative_call_number: str
    location: Optional[str] = None
    floor: Optional[str] = None
    range_code: Optional[str] = None
    ladder: Optional[str] = None
    shelf: Optional[str] = None
    position: Optional[str] = None

class ItemCreate(ItemBase):
    pass

class ItemRead(ItemBase):
    id: int

    class Config:
        orm_mode = True

