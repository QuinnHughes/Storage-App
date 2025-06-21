from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from db.session import get_db
from db.models import User, UserLog
from core.auth import SECRET_KEY, ALGORITHM

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Open a DB session
        db: Session = next(get_db())
        user_id = None

        # Try to extract user from Bearer token
        auth: str = request.headers.get("Authorization", "")
        token = auth.removeprefix("Bearer ").strip()
        if token:
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                username = payload.get("sub")
                if username:
                    user = db.query(User).filter_by(username=username).first()
                    user_id = user.id if user else None
            except JWTError:
                pass

        # Create and commit the log entry
        log = UserLog(
            user_id=user_id,
            path=request.url.path,
            method=request.method,
            status_code=response.status_code,
            detail=None  # you could add more detail if you want
        )
        db.add(log)
        db.commit()

        return response
