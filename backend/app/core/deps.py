from __future__ import annotations

import hashlib

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.security import decode_token
from backend.app.core.time import shanghai_now
from backend.app.models import ApiKey, PlatformAccount, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

API_KEY_HEADER = "X-API-Key"


def _authenticate_via_api_key(request: Request, db: Session) -> User | None:
    raw_key = request.headers.get(API_KEY_HEADER)
    if not raw_key:
        return None
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    api_key = db.scalars(
        select(ApiKey).where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
    ).first()
    if api_key is None:
        return None
    if api_key.expires_at and api_key.expires_at < shanghai_now():
        return None
    api_key.last_used_at = shanghai_now()
    db.commit()
    return db.get(User, api_key.user_id)


def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Try API Key first
    user = _authenticate_via_api_key(request, db)
    if user is not None:
        return user

    # Fall back to JWT Bearer token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    if payload.get("token_type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.get(User, payload["user_id"])
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def resolve_account(
    db: Session,
    current_user: User,
    account_id: str,
    *,
    platform: str = "xhs",
    sub_type: str | None = None,
) -> PlatformAccount:
    """Resolve account by numeric ID or external_user_id (XHS native ID)."""
    account = None
    if account_id.isdigit():
        account = db.get(PlatformAccount, int(account_id))
    if account is None:
        stmt = select(PlatformAccount).where(
            PlatformAccount.user_id == current_user.id,
            PlatformAccount.platform == platform,
            PlatformAccount.external_user_id == account_id,
        )
        if sub_type:
            stmt = stmt.where(PlatformAccount.sub_type == sub_type)
        account = db.scalars(stmt.order_by(PlatformAccount.updated_at.desc())).first()
    if (
        account is None
        or account.user_id != current_user.id
        or account.platform != platform
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if sub_type and account.sub_type != sub_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account
