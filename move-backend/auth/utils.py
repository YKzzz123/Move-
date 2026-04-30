from __future__ import annotations

import bcrypt

# bcrypt 硬限制 72 字节；与 Pydantic 密码长度上限对齐即可


def hash_password(plain_password: str) -> str:
    """Hash a plain password for storage (bcrypt，不经过 passlib，避免与 bcrypt 5.x 不兼容)."""
    pw = plain_password.encode("utf-8")
    if len(pw) > 72:
        pw = pw[:72]
    digest: bytes = bcrypt.hashpw(pw, bcrypt.gensalt())
    return digest.decode("ascii")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against a stored bcrypt hash string."""
    pw = plain_password.encode("utf-8")
    if len(pw) > 72:
        pw = pw[:72]
    return bcrypt.checkpw(pw, hashed_password.encode("ascii"))
