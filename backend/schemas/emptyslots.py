# backend/schemas/emptyslots.py

from pydantic import BaseModel
from typing  import Optional

class EmptySlotDetail(BaseModel):
    floor: str
    range: str
    ladder: str
    shelf: int              # ← changed from str to int
    empty_position: Optional[str]

    class Config:
        from_attributes = True
