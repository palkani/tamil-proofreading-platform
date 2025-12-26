import hmac
import hashlib
import os
from app.core.config import settings


def hash_with_secret(raw: str) -> str:
    """
    Hash the presented key using the HMAC secret configured in API_KEY_SECRET.
    This must mirror how CLIENT_REGISTRY is built at startup.
    """
    secret = os.environ.get("API_KEY_SECRET", "change-me")
    return hmac.new(secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_api_key(client_id: str, presented_key: str) -> bool:
    """
    Compare the HMAC of the presented key against the stored hash for the client.
    """
    stored = settings.CLIENT_REGISTRY.get(client_id)
    if not stored:
        return False
    candidate = hash_with_secret(presented_key)
    return hmac.compare_digest(stored, candidate)

