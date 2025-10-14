from pydantic import BaseModel
from typing import Optional

class WeededItemCreate(BaseModel):
    alternative_call_number: str
    barcode: str
    scanned_barcode: Optional[str] = None

class WeededItem(BaseModel):
    id: int
    alternative_call_number: str
    barcode: str
    scanned_barcode: Optional[str] = None
    is_weeded: bool

    class Config:
        from_attributes = True
