# backend/schemas.py

from pydantic import BaseModel

class EmptySlotDetail(BaseModel):
    location:       str
    floor:          str
    range:          str
    ladder:         str
    shelf:          str
    empty_position: int

    class Config:
        orm_mode = True
