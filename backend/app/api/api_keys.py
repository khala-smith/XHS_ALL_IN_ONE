from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.deps import get_current_user
from backend.app.core.security import generate_api_key
from backend.app.core.time import shanghai_now
from backend.app.models import ApiKey, User

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


class CreateApiKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)


class CreateApiKeyResponse(BaseModel):
    id: int
    name: str
    key: str
    key_prefix: str
    expires_at: Optional[str] = None
    created_at: str


class ApiKeyInfo(BaseModel):
    id: int
    name: str
    key_prefix: str
    is_active: bool
    last_used_at: Optional[str] = None
    expires_at: Optional[str] = None
    created_at: str


def _serialize_api_key(api_key: ApiKey) -> dict:
    return {
        "id": api_key.id,
        "name": api_key.name,
        "key_prefix": api_key.key_prefix,
        "is_active": api_key.is_active,
        "last_used_at": api_key.last_used_at.isoformat() if api_key.last_used_at else None,
        "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
        "created_at": api_key.created_at.isoformat(),
    }


@router.get("")
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    keys = db.scalars(
        select(ApiKey)
        .where(ApiKey.user_id == current_user.id)
        .order_by(ApiKey.created_at.desc())
    ).all()
    return {"items": [_serialize_api_key(k) for k in keys]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: CreateApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_key, key_hash = generate_api_key()
    expires_at: Optional[datetime] = None
    if payload.expires_in_days:
        from datetime import timedelta
        expires_at = shanghai_now() + timedelta(days=payload.expires_in_days)

    api_key = ApiKey(
        user_id=current_user.id,
        name=payload.name,
        key_hash=key_hash,
        key_prefix=raw_key[:12],
        is_active=True,
        expires_at=expires_at,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return {
        "id": api_key.id,
        "name": api_key.name,
        "key": raw_key,
        "key_prefix": api_key.key_prefix,
        "expires_at": api_key.expires_at.isoformat() if api_key.expires_at else None,
        "created_at": api_key.created_at.isoformat(),
    }


@router.delete("/{key_id}")
def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_key = db.scalars(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    ).first()
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    db.delete(api_key)
    db.commit()
    return {"id": key_id, "status": "deleted"}


@router.patch("/{key_id}/deactivate")
def deactivate_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_key = db.scalars(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    ).first()
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    api_key.is_active = False
    db.commit()
    return _serialize_api_key(api_key)


@router.patch("/{key_id}/activate")
def activate_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_key = db.scalars(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    ).first()
    if api_key is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    api_key.is_active = True
    db.commit()
    return _serialize_api_key(api_key)
