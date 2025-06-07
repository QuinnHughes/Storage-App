# backend/db/models.py

from sqlalchemy import Column, Integer, String, DateTime
from .base import Base

class Item(Base):
    __tablename__ = "items"

    id                      = Column(Integer, primary_key=True, index=True)
    barcode                 = Column(String, unique=True, index=True, nullable=False)
    alternative_call_number = Column(String, index=True, nullable=False)

    # parsed from alternative_call_number
    location   = Column(String, index=True, nullable=True)  # e.g. "S"
    floor      = Column(String, index=True, nullable=True)  # e.g. "1"
    range_code = Column(String, index=True, nullable=True)  # e.g. "01B"
    ladder     = Column(String, nullable=True)              # e.g. "03"
    shelf      = Column(String, nullable=True)              # e.g. "04"
    position   = Column(String, nullable=True)              # e.g. "005"


class Analytics(Base):
    __tablename__ = "analytics"

    id                          = Column(Integer, primary_key=True, index=True)
    barcode                     = Column(String, index=True, nullable=False)   # matches Item.barcode
    alternative_call_number     = Column(String, index=True, nullable=True)    # matches Item.alternative_call_number
    title                       = Column(String, nullable=True)
    location_code               = Column(String, nullable=True)               # from "Location Code"
    item_policy                 = Column(String, nullable=True)               # from "Item Policy"
    call_number                 = Column(String, nullable=True)               # from "Permanent Call Number"
    description                 = Column(String, nullable=True)               # from "Description"
    status                      = Column(String, nullable=True)               # from "Lifecycle"


class AnalyticsError(Base):
    __tablename__ = "analytics_errors"

    id                          = Column(Integer, primary_key=True, index=True)
    barcode                     = Column(String, index=True, nullable=False)
    alternative_call_number     = Column(String, index=True, nullable=True)
    title                       = Column(String, nullable=True)
    call_number                 = Column(String, nullable=True)
    status                      = Column(String, nullable=True)
    error_reason                = Column(String, nullable=False)
