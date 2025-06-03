# backend/schemas/item.py

from pydantic import BaseModel

class ItemBase(BaseModel):
    barcode: str
    alt_call_number: str
    floor: str
    range: str
    ladder: str
    shelf: str
    position: str

class ItemCreate(ItemBase):
    pass

class ItemRead(ItemBase):
    id: int

    class Config:
        from_attributes = True   # instead of orm_mode for Pydantic V2
