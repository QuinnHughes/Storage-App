# backend/schemas/analytics.py

from pydantic import BaseModel
from typing import Optional

class AnalyticsBase(BaseModel):
    barcode: str
    alternative_call_number: Optional[str] = None
    title: Optional[str] = None
    call_number: Optional[str] = None
    status: Optional[str] = None

class AnalyticsCreate(AnalyticsBase):
    pass

class AnalyticsRead(AnalyticsBase):
    id: int

    class Config:
        orm_mode = True


class AnalyticsErrorBase(BaseModel):
    barcode: str
    alternative_call_number: Optional[str] = None
    title: Optional[str] = None
    call_number: Optional[str] = None
    status: Optional[str] = None
    error_reason: str

class AnalyticsErrorCreate(AnalyticsErrorBase):
    pass

class AnalyticsErrorRead(AnalyticsErrorBase):
    id: int

    class Config:
        orm_mode = True
