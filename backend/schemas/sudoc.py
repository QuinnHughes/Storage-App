# backend/schemas/sudoc.py

from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime

class SudocSummary(BaseModel):
    id:        int
    sudoc:     str
    title:     str
    zip_file:  str
    oclc:      Optional[str]

class MarcFieldOut(BaseModel):
    tag:       str
    ind1:      str
    ind2:      str
    subfields: Dict[str, str]

class SudocCartItem(BaseModel):
    id: int
    cart_id: int  # Add this
    record_id: int
    added_at: datetime = None  # Make optional with default None

    class Config:
        from_attributes = True

class SudocCartBase(BaseModel):
    name: str

class SudocCartCreate(SudocCartBase):
    pass

class SudocCartRead(BaseModel):
    id: int
    name: str 
    created_at: datetime
    items: List[int] = []

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class SudocCart(SudocCartBase):
    id: int
    created_at: datetime
    items: List[SudocCartItem] = []  # Add this line

    class Config:
        from_attributes = True
