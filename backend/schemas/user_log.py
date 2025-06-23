from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UserLogSchema(BaseModel):
    id: int
    user_id: Optional[int]
    path: str
    method: str
    status_code: int
    detail: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True
