from pydantic import BaseModel

class EmptySlotDetail(BaseModel):
    floor: str
    range: str
    ladder: str
    shelf: str
    empty_position: str
