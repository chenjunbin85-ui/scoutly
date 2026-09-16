import json
import logging
from openai import OpenAI
from app.config import settings
from app.prompts.scoring_prompt import SYSTEM_PROMPT, build_user_prompt

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self):
        self.client = OpenAI(
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL,
        )
        self.model = settings.DEEPSEEK_MODEL
        self.temperature = settings.LLM_TEMPERATURE
        self.max_tokens = settings.LLM_MAX_TOKENS

    async def score_post(self, product: dict, post: dict) -> dict | None:
        """对单个 Reddit 帖子进行评分，返回结构化 JSON 结果"""
        user_prompt = build_user_prompt(product, post)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            logger.info(f"LLM response: finish_reason={response.choices[0].finish_reason}, content_length={len(content) if content else 0}")
            if not content:
                logger.error("LLM returned empty content")
                return None
            try:
                result = json.loads(content)
                return result
            except json.JSONDecodeError as e:
                logger.error(f"LLM output JSON parse failed: {e}")
                logger.error(f"Raw content (first 500 chars): {content[:500]}")
                return None
        except Exception as e:
            logger.error(f"LLM API call failed: {e}")
            return None


llm_client = LLMClient()
