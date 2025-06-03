# backend/schemas/analytics.py

from pydantic import BaseModel

class AnalyticsBase(BaseModel):
    barcode: str
    alt_call_number: str
    title: str
    call_number: str
    status: str

class AnalyticsCreate(AnalyticsBase):
    pass

class AnalyticsRead(AnalyticsBase):
    id: int

    class Config:
        from_attributes = True   # instead of orm_mode for Pydantic V2
