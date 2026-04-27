"""LLM provider chain for POWERGRID SmartOps."""

# CODEX-FIX: replace LangChain provider wrapper with direct async-safe Gemini, Groq, and HF failover.

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError

logger = logging.getLogger(__name__)


Message = dict[str, str]
ProviderCall = Callable[[list[Message], str, str], tuple[str, str]]


class LLMService:
    """Generate responses through configured free-tier providers with failover."""

    TIMEOUT_SECONDS = 30

    def __init__(self):
        self.settings = get_settings()
        self.last_provider: str | None = None

    async def complete(self, messages: list[Message], system: str = "") -> tuple[str, str]:
        errors: list[str] = []
        providers = self._provider_order()

        for provider in providers:
            for model in self._models_for(provider):
                if not self._provider_configured(provider):
                    errors.append(f"{provider}: missing API key")
                    continue
                try:
                    text, provider_name = await asyncio.wait_for(
                        self._complete_provider(provider, model, messages, system),
                        timeout=self.TIMEOUT_SECONDS,
                    )
                    self.last_provider = provider_name
                    return text, provider_name
                except Exception as exc:
                    message = f"{provider}/{model}: {exc}"
                    logger.warning("LLM provider failed: %s", message)
                    errors.append(message)

        raise ServiceUnavailableError(
            "All LLM providers failed.",
            details={"providers": errors},
        )

    def _provider_order(self) -> list[str]:
        requested = self.settings.DEFAULT_LLM_PROVIDER.lower()
        canonical = {
            "gemini": "gemini",
            "google": "gemini",
            "groq": "groq",
            "hf": "huggingface",
            "huggingface": "huggingface",
        }.get(requested, "gemini")
        ordered = [canonical, "gemini", "groq", "huggingface"]
        deduped: list[str] = []
        for provider in ordered:
            if provider not in deduped:
                deduped.append(provider)
        return deduped

    def _models_for(self, provider: str) -> list[str]:
        if provider == "gemini":
            primary = self.settings.DEFAULT_LLM_MODEL or "gemini-2.0-flash"
            models = [primary, "gemini-2.0-flash", "gemini-1.5-flash"]
        elif provider == "groq":
            primary = (
                self.settings.DEFAULT_LLM_MODEL
                if self.settings.DEFAULT_LLM_PROVIDER.lower() == "groq"
                else "llama-3.3-70b-versatile"
            )
            models = [primary, "llama-3.3-70b-versatile", "mixtral-8x7b-32768"]
        else:
            models = ["meta-llama/Llama-3.3-70B-Instruct"]

        deduped: list[str] = []
        for model in models:
            if model and model not in deduped:
                deduped.append(model)
        return deduped

    def _provider_configured(self, provider: str) -> bool:
        if provider == "gemini":
            return bool(self.settings.GOOGLE_API_KEY)
        if provider == "groq":
            return bool(self.settings.GROQ_API_KEY)
        if provider == "huggingface":
            return bool(self.settings.HF_API_TOKEN)
        return False

    async def _complete_provider(
        self,
        provider: str,
        model: str,
        messages: list[Message],
        system: str,
    ) -> tuple[str, str]:
        if provider == "gemini":
            return await asyncio.to_thread(self._gemini_generate_with_retry, messages, system, model)
        if provider == "groq":
            return await asyncio.to_thread(self._groq_generate_with_retry, messages, system, model)
        if provider == "huggingface":
            return await asyncio.to_thread(self._hf_generate_with_retry, messages, system, model)
        raise ValueError(f"Unsupported provider: {provider}")

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=8), reraise=True)
    def _gemini_generate_with_retry(
        self,
        messages: list[Message],
        system: str,
        model: str,
    ) -> tuple[str, str]:
        import google.generativeai as genai

        genai.configure(api_key=self.settings.GOOGLE_API_KEY)
        gemini_model = genai.GenerativeModel(model_name=model, system_instruction=system or None)
        prompt = self._flatten_messages(messages)
        response = gemini_model.generate_content(
            prompt,
            generation_config={"temperature": 0.2},
            request_options={"timeout": self.TIMEOUT_SECONDS},
        )
        text = getattr(response, "text", "") or ""
        if not text.strip():
            raise RuntimeError("empty Gemini response")
        return text.strip(), f"gemini:{model}"

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=8), reraise=True)
    def _groq_generate_with_retry(
        self,
        messages: list[Message],
        system: str,
        model: str,
    ) -> tuple[str, str]:
        from groq import Groq

        client = Groq(api_key=self.settings.GROQ_API_KEY, timeout=self.TIMEOUT_SECONDS)
        payload = self._openai_messages(messages, system)
        response = client.chat.completions.create(
            model=model,
            messages=payload,
            temperature=0.2,
        )
        text = response.choices[0].message.content or ""
        if not text.strip():
            raise RuntimeError("empty Groq response")
        return text.strip(), f"groq:{model}"

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=8), reraise=True)
    def _hf_generate_with_retry(
        self,
        messages: list[Message],
        system: str,
        model: str,
    ) -> tuple[str, str]:
        from huggingface_hub import InferenceClient

        client = InferenceClient(model=model, token=self.settings.HF_API_TOKEN, timeout=self.TIMEOUT_SECONDS)
        payload = self._openai_messages(messages, system)

        if hasattr(client, "chat_completion"):
            response = client.chat_completion(
                messages=payload,
                max_tokens=1024,
                temperature=0.2,
            )
        else:
            response = client.chat.completions.create(
                model=model,
                messages=payload,
                max_tokens=1024,
                temperature=0.2,
            )

        text = self._extract_hf_text(response)
        if not text.strip():
            raise RuntimeError("empty Hugging Face response")
        return text.strip(), f"huggingface:{model}"

    def _openai_messages(self, messages: list[Message], system: str) -> list[dict[str, str]]:
        payload: list[dict[str, str]] = []
        if system:
            payload.append({"role": "system", "content": system})
        payload.extend({"role": message["role"], "content": message["content"]} for message in messages)
        return payload

    def _flatten_messages(self, messages: list[Message]) -> str:
        return "\n\n".join(
            f"{message.get('role', 'user').title()}: {message.get('content', '')}"
            for message in messages
        )

    def _extract_hf_text(self, response: Any) -> str:
        if isinstance(response, str):
            return response
        if isinstance(response, dict):
            choices = response.get("choices") or []
            if choices:
                message = choices[0].get("message") or {}
                return str(message.get("content") or choices[0].get("text") or "")
            return str(response.get("generated_text") or "")
        choices = getattr(response, "choices", None)
        if choices:
            message = getattr(choices[0], "message", None)
            return str(getattr(message, "content", "") or getattr(choices[0], "text", ""))
        return str(getattr(response, "generated_text", ""))


_llm_service: LLMService | None = None


def get_llm_service() -> LLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = LLMService()
    return _llm_service


llm_service = get_llm_service()
