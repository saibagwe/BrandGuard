"""Global pytest configuration and fixtures for backend tests."""
import pytest
from app.llm.provider import llm


@pytest.fixture(autouse=True)
def default_stub_mode(monkeypatch):
    """Ensure LLM calls default to stub mode during automated test execution."""
    monkeypatch.setattr(llm, "_stub", True)
