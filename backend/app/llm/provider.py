"""LLM provider — all Gemini calls are isolated to this module."""
from __future__ import annotations

import json
import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


class LLMProvider:
    def __init__(self):
        self._stub = not bool(settings.GEMINI_API_KEY)
        if not self._stub:
            import google.generativeai as genai  # noqa: PLC0415
            genai.configure(api_key=settings.GEMINI_API_KEY)
            self._genai = genai
            self._model = genai.GenerativeModel(settings.LLM_MODEL)
            self._vision_model = genai.GenerativeModel(settings.VISION_MODEL)
        else:
            logger.warning("GEMINI_API_KEY not set — using stub LLM responses.")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_json(self, prompt: str, schema: dict) -> dict:
        """Call LLM and parse JSON response. Retries once on parse error."""
        if self._stub:
            return {}

        for attempt in range(2):
            try:
                response = self._model.generate_content(
                    prompt + "\n\nRespond ONLY with valid JSON matching this schema:\n" + json.dumps(schema)
                )
                text = response.text.strip()
                # Strip markdown code fences if present
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                return json.loads(text.strip())
            except (json.JSONDecodeError, ValueError) as exc:
                if attempt == 1:
                    logger.error("Failed to parse LLM JSON after retry: %s", exc)
                    return {}
        return {}

    def generate_text(self, prompt: str) -> str:
        """Return plain text from LLM."""
        if self._stub:
            return "stub"
        try:
            response = self._model.generate_content(prompt)
            return response.text.strip()
        except Exception as exc:
            logger.error("generate_text error: %s", exc)
            return ""

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Return embedding vectors. Returns 768-dim zeros on stub."""
        if self._stub:
            return [[0.0] * 768 for _ in texts]
        try:
            results = []
            for text in texts:
                result = self._genai.embed_content(
                    model=settings.EMBED_MODEL,
                    content=text,
                    task_type="retrieval_document",
                )
                results.append(result["embedding"])
            return results
        except Exception as exc:
            logger.error("embed error: %s", exc)
            return [[0.0] * 768 for _ in texts]

    def analyze_image(self, image_bytes: bytes, prompt: str, schema: dict) -> dict:
        """Analyze image with vision model."""
        if self._stub:
            return {}
        try:
            import PIL.Image  # noqa: PLC0415
            import io  # noqa: PLC0415
            img = PIL.Image.open(io.BytesIO(image_bytes))
            full_prompt = prompt + "\n\nRespond ONLY with valid JSON matching: " + json.dumps(schema)
            response = self._vision_model.generate_content([full_prompt, img])
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text.strip())
        except Exception as exc:
            logger.error("analyze_image error: %s", exc)
            return {}


# Singleton
llm = LLMProvider()
