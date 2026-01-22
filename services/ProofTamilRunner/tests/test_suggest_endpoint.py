"""
Integration tests for the suggest API endpoint.
"""

import os
import importlib
import pytest
from fastapi.testclient import TestClient

def setup_app():
    # Use a deterministic auth config for tests
    os.environ["API_KEY"] = "demo-key"
    os.environ["API_KEY_SECRET"] = "demo-secret"
    os.environ["CLIENT_ID"] = "demo-client"
    os.environ["RATE_LIMIT_PER_MIN"] = "1000"
    import app.core.config as config
    importlib.reload(config)
    import app.core.security as security
    importlib.reload(security)
    import app.middleware.auth as authmw
    importlib.reload(authmw)
    import app.main as main
    importlib.reload(main)
    return main.app


AUTH_HEADERS = {"X-Client-Id": "demo-client", "X-API-Key": "demo-key"}


def test_suggest_endpoint_basic():
    """Test basic suggest endpoint functionality."""
    app = setup_app()
    client = TestClient(app)
    response = client.get("/transliterate/suggest?q=m&limit=5", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "suggestions" in data
    assert isinstance(data["suggestions"], list)
    assert len(data["suggestions"]) > 0


def test_suggest_endpoint_with_mode():
    """Test suggest endpoint with mode parameter."""
    app = setup_app()
    client = TestClient(app)
    response = client.get("/transliterate/suggest?q=m&limit=5&mode=smart", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    response_strict = client.get("/transliterate/suggest?q=m&limit=5&mode=strict", headers=AUTH_HEADERS)
    assert response_strict.status_code == 200
    data_strict = response_strict.json()
    assert data_strict["success"] is True


def test_suggest_endpoint_with_context():
    """Test suggest endpoint with context."""
    app = setup_app()
    client = TestClient(app)
    response = client.get(
        "/transliterate/suggest?q=m&limit=5&context=என்&cursor=2",
        headers=AUTH_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "meta" in data


def test_suggest_endpoint_validation_q_too_long():
    """Test validation for q too long."""
    app = setup_app()
    client = TestClient(app)
    long_q = "a" * 41
    response = client.get(f"/transliterate/suggest?q={long_q}", headers=AUTH_HEADERS)
    # FastAPI validation error (query param constraints)
    assert response.status_code == 422


def test_suggest_endpoint_validation_limit_invalid():
    """Test validation for invalid limit."""
    app = setup_app()
    client = TestClient(app)
    response = client.get("/transliterate/suggest?q=m&limit=0", headers=AUTH_HEADERS)
    # FastAPI validation error (query param constraints)
    assert response.status_code == 422

    response = client.get("/transliterate/suggest?q=m&limit=21", headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_suggest_endpoint_validation_mode_invalid():
    """Test validation for invalid mode."""
    app = setup_app()
    client = TestClient(app)
    response = client.get("/transliterate/suggest?q=m&mode=invalid", headers=AUTH_HEADERS)
    assert response.status_code == 422  # FastAPI validation error


def test_suggest_endpoint_response_format():
    """Test response format matches expected schema."""
    app = setup_app()
    client = TestClient(app)
    response = client.get("/transliterate/suggest?q=m&limit=3", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()

    # Check structure
    assert "success" in data
    assert "suggestions" in data
    assert "meta" in data

    # Check suggestion format
    if data["suggestions"]:
        suggestion = data["suggestions"][0]
        assert "word" in suggestion
        assert "score" in suggestion
        assert isinstance(suggestion["word"], str)
        assert isinstance(suggestion["score"], (int, float))


def test_suggest_endpoint_meta_diagnostics():
    """Test that meta contains diagnostics."""
    app = setup_app()
    client = TestClient(app)
    response = client.get("/transliterate/suggest?q=m&limit=5", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()

    meta = data.get("meta", {})
    assert "algorithm_version" in meta
    assert "layers_used" in meta
    assert "cache_hits" in meta

    # Check headers
    assert "X-Algorithm-Version" in response.headers
    assert "X-Layers-Used" in response.headers

