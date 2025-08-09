# backend/db/models.py

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, UniqueConstraint, Index, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import datetime
from .base import Base

class Item(Base):
    __tablename__ = "items"

    id                      = Column(Integer, primary_key=True, index=True)
    barcode                 = Column(String, unique=True, index=True, nullable=False)
    alternative_call_number = Column(String, index=True, nullable=False)

    # parsed from alternative_call_number
    location   = Column(String, index=True, nullable=True)
    floor      = Column(String, index=True, nullable=True)
    range_code = Column(String, index=True, nullable=True)
    ladder     = Column(String, nullable=True)
    shelf      = Column(String, nullable=True)
    position   = Column(String, nullable=True)


class Analytics(Base):
    __tablename__ = "analytics"

    id                      = Column(Integer, primary_key=True, index=True)
    barcode                 = Column(String, index=True, nullable=False)
    alternative_call_number = Column(String, index=True, nullable=True)
    title                   = Column(String, nullable=True)
    location_code           = Column(String, nullable=True)
    item_policy             = Column(String, nullable=True)
    call_number             = Column(String, nullable=True)
    description             = Column(String, nullable=True)
    status                  = Column(String, nullable=True)



class AnalyticsError(Base):
    __tablename__ = "analytics_errors"
    __table_args__ = (
        UniqueConstraint(
            'barcode',
            'alternative_call_number',
            'title',
            'call_number',
            'status',
            'error_reason',
            name='uq_analytics_error_all_fields'
        ),
    )

    id                      = Column(Integer, primary_key=True, index=True)
    barcode                 = Column(String, index=True, nullable=False)
    alternative_call_number = Column(String, index=True, nullable=True)
    title                   = Column(String, nullable=True)
    call_number             = Column(String, nullable=True)
    status                  = Column(String, nullable=True)
    error_reason            = Column(String, nullable=False)


class WeededItem(Base):
    __tablename__ = "weeded_items"
    id                      = Column(Integer, primary_key=True, index=True)
    alternative_call_number = Column(String, nullable=False)
    barcode                 = Column(String, nullable=False)
    scanned_barcode         = Column(String, nullable=True)
    is_weeded               = Column(Boolean, default=False, nullable=False)
    created_at              = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role            = Column(String, nullable=False)


class UserLog(Base):
    __tablename__ = "user_logs"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    path        = Column(String, nullable=False)
    method      = Column(String, nullable=False)
    status_code = Column(Integer, nullable=False)
    detail      = Column(String, nullable=True)
    timestamp   = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="logs")

User.logs = relationship("UserLog", back_populates="user", cascade="all, delete-orphan")

class SudocCart(Base):
    __tablename__ = "sudoc_carts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    items = relationship("SudocCartItem", back_populates="cart", cascade="all, delete-orphan")

class SudocCartItem(Base):
    __tablename__ = "sudoc_cart_items"
    
    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("sudoc_carts.id"))
    record_id = Column(Integer, nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    cart = relationship("SudocCart", back_populates="items")

class SudocEditedRecord(Base):
    __tablename__ = "sudoc_edited_records"
    
    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, nullable=False)  # Original record ID
    marc_data = Column(LargeBinary, nullable=False)   # Changed from String to LargeBinary for binary MARC data
    edited_at = Column(DateTime(timezone=True), server_default=func.now())
    edited_by = Column(Integer, ForeignKey("users.id"))
    
    # Index to quickly find edited versions
    __table_args__ = (
        Index('ix_edited_record_id', 'record_id'),
    )
