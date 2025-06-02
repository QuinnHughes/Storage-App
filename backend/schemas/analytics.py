from pydantic import BaseModel

class AnalyticsUpload(BaseModel):
    barcode: str
    alt_call_number: str
    title: str
    call_number: str
    status: str
