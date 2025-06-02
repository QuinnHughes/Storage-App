from sqlalchemy import Column, Integer, String, ForeignKey
from backend.db.base import Base

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, unique=True, index=True)
    alt_call_number = Column(String)
    floor = Column(String)
    range = Column(String)
    ladder = Column(String)
    shelf = Column(String)
    position = Column(String)

class Analytics(Base):
    __tablename__ = "analytics"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, index=True)
    alt_call_number = Column(String)
    title = Column(String)
    call_number = Column(String)
    status = Column(String)  # "linked" or "needs_review"