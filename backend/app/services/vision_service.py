"""
vision_service.py - Florence-2 image captioning + OCR.

Gated behind ENABLE_VISION env var. Lazy-loads on first use.
"""

# CODEX-FIX: add gated Florence-2 service so PDF/page images become queryable chunks.

import asyncio
import logging
import threading

logger = logging.getLogger(__name__)


class VisionService:
    def __init__(self):
        self._model = None
        self._processor = None
        self._device = "cpu"
        self._lock = threading.Lock()
        from app.core.config import get_settings

        self._settings = get_settings()

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def _load(self):
        with self._lock:
            if self._model is not None:
                return
            model_id = self._settings.VISION_MODEL
            logger.info("Loading vision model %s", model_id)
            import time
            import torch
            from transformers import AutoModelForCausalLM, AutoProcessor

            started = time.time()
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32
            self._processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
            self._model = AutoModelForCausalLM.from_pretrained(
                model_id,
                torch_dtype=dtype,
                trust_remote_code=True,
            ).to(device)
            self._device = device
            logger.info(
                "Vision model %s loaded in %.1fs on %s",
                model_id,
                time.time() - started,
                device,
            )

    def _describe_sync(
        self,
        image_bytes: bytes,
        page_number: int,
        image_index: int,
        context_text: str = "",
    ) -> str:
        from PIL import Image
        import io
        import torch

        self._load()

        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            width, height = image.size
            if width < 50 or height < 50:
                return ""

            results: list[str] = []

            inputs = self._processor(text="<OCR>", images=image, return_tensors="pt").to(self._device)
            with torch.no_grad():
                ids = self._model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=256,
                    do_sample=False,
                )
            ocr_text = self._processor.decode(ids[0], skip_special_tokens=True).strip()
            if ocr_text:
                results.append(f"Text in image: {ocr_text}")

            inputs = self._processor(
                text="<DETAILED_CAPTION>",
                images=image,
                return_tensors="pt",
            ).to(self._device)
            with torch.no_grad():
                ids = self._model.generate(
                    input_ids=inputs["input_ids"],
                    pixel_values=inputs["pixel_values"],
                    max_new_tokens=256,
                    do_sample=False,
                )
            caption = self._processor.decode(ids[0], skip_special_tokens=True).strip()
            if caption:
                results.append(f"Visual content: {caption}")

            if not results:
                return ""

            context_suffix = f". Nearby text: {context_text[:500]}" if context_text else ""
            description = ". ".join(results)
            return f"[IMAGE - page {page_number}, image {image_index}]: {description}{context_suffix}"

        except Exception as exc:
            logger.warning(
                "Vision description failed for page %s image %s: %s",
                page_number,
                image_index,
                exc,
            )
            return ""

    async def describe_image(
        self,
        image_bytes: bytes,
        page_number: int,
        image_index: int,
        context_text: str = "",
    ) -> str:
        if not self._settings.ENABLE_VISION:
            return ""
        return await asyncio.to_thread(
            self._describe_sync,
            image_bytes,
            page_number,
            image_index,
            context_text,
        )


_vision_service: VisionService | None = None


def get_vision_service() -> VisionService:
    global _vision_service
    if _vision_service is None:
        _vision_service = VisionService()
    return _vision_service
