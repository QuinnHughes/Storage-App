# backend/schemas/analytics.py

from pydantic import BaseModel
from typing import Optional

# ───── Analytics Models ─────

class AnalyticsBase(BaseModel):
    barcode: str
    alternative_call_number: Optional[str] = None
    title: Optional[str] = None
    call_number: Optional[str] = None
    status: Optional[str] = None
    location_code: Optional[str] = None
    item_policy: Optional[str] = None
    description: Optional[str] = None
    has_item_link: bool = False

class AnalyticsCreate(AnalyticsBase):
    pass

class AnalyticsRead(AnalyticsBase):
    id: int

    class Config:
        from_attributes = True

# ───── Analytics Error Models ─────

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
        from_attributes = True
