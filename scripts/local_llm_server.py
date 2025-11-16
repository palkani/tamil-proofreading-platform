import os
from typing import Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, TextGenerationPipeline

MODEL_NAME = os.getenv("LOCAL_LLM_MODEL", "abhinand/tamil-llama-7b-instruct-v0.2")
MAX_NEW_TOKENS = int(os.getenv("LOCAL_LLM_MAX_TOKENS", "512"))
DEFAULT_TEMPERATURE = float(os.getenv("LOCAL_LLM_TEMPERATURE", "0.2"))
DEFAULT_TOP_P = float(os.getenv("LOCAL_LLM_TOP_P", "0.9"))

app = FastAPI(title="ProofTamil Local LLM", version="1.0")


class GenerateRequest(BaseModel):
    prompt: str
    max_new_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None


class GenerateResponse(BaseModel):
    generated_text: str


def load_pipeline() -> TextGenerationPipeline:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, use_fast=False)

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        device_map="auto",
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        load_in_4bit=torch.cuda.is_available(),
    )

    generator = TextGenerationPipeline(
        model=model,
        tokenizer=tokenizer,
        max_new_tokens=MAX_NEW_TOKENS,
        temperature=DEFAULT_TEMPERATURE,
        top_p=DEFAULT_TOP_P,
        do_sample=True,
    )

    return generator


pipeline = load_pipeline()


@app.post("/generate", response_model=GenerateResponse)
async def generate_text(request: GenerateRequest) -> GenerateResponse:
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt must not be empty")

    generation_kwargs = {
        "max_new_tokens": request.max_new_tokens or MAX_NEW_TOKENS,
        "temperature": request.temperature or DEFAULT_TEMPERATURE,
        "top_p": request.top_p or DEFAULT_TOP_P,
    }

    outputs = pipeline(request.prompt, **generation_kwargs)
    generated_text = outputs[0]["generated_text"]

    return GenerateResponse(generated_text=generated_text)


@app.get("/healthz")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_NAME}
