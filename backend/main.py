import logging
import os
import threading
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from openai import OpenAI, OpenAIError, RateLimitError
from pydantic import BaseModel, Field, field_validator
from openai.types.responses import Response

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

VECTOR_STORE_ID_FILE = BASE_DIR / ".vector_store_id"
VECTOR_STORE_LOCK = threading.Lock()
FILE_PROCESSING_TIMEOUT_SECONDS = 180
logger = logging.getLogger(__name__)

app = FastAPI(title="Enterprise RAG API", version="0.1.0")


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, question: str) -> str:
        if not question.strip():
            raise ValueError("Question must not be blank.")
        return question.strip()


class Citation(BaseModel):
    file_id: str
    filename: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]


class DocumentUploadResponse(BaseModel):
    filename: str
    status: str


@app.exception_handler(OpenAIError)
async def handle_openai_error(_request: Request, exc: OpenAIError) -> JSONResponse:
    error_code = getattr(exc, "code", None)
    logger.error(
        "OpenAI request failed (%s, status %s, code %s).",
        type(exc).__name__,
        getattr(exc, "status_code", None),
        error_code,
    )
    if isinstance(exc, RateLimitError) and error_code in {
        "credit_balance_exhausted",
        "insufficient_quota",
    }:
        return JSONResponse(
            status_code=402,
            content={
                "detail": (
                    "La cuenta de OpenAI no tiene créditos disponibles. "
                    "Activa la facturación o añade créditos para generar respuestas."
                )
            },
        )
    if isinstance(exc, RateLimitError):
        return JSONResponse(
            status_code=429,
            content={
                "detail": (
                    "OpenAI está limitando las solicitudes. "
                    "Espera unos instantes y vuelve a intentarlo."
                )
            },
        )
    return JSONResponse(
        status_code=502,
        content={"detail": "The OpenAI request failed. Check the server configuration and try again."},
    )


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on the backend.",
        )
    return OpenAI(api_key=api_key)


def get_vector_store_id(client: OpenAI) -> str:
    configured_id = os.getenv("OPENAI_VECTOR_STORE_ID")
    if configured_id:
        return configured_id

    with VECTOR_STORE_LOCK:
        if VECTOR_STORE_ID_FILE.exists():
            stored_id = VECTOR_STORE_ID_FILE.read_text(encoding="utf-8").strip()
            if stored_id:
                return stored_id

        vector_store = client.vector_stores.create(name="enterprise-knowledge-base")
        VECTOR_STORE_ID_FILE.write_text(vector_store.id, encoding="utf-8")
        return vector_store.id


def wait_for_file_processing(
    client: OpenAI,
    vector_store_id: str,
    file_id: str,
) -> str:
    deadline = time.monotonic() + FILE_PROCESSING_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        vector_store_file = client.vector_stores.files.retrieve(
            vector_store_id=vector_store_id,
            file_id=file_id,
        )
        if vector_store_file.status == "completed":
            return vector_store_file.status
        if vector_store_file.status in {"failed", "cancelled"}:
            raise HTTPException(
                status_code=422,
                detail="OpenAI could not process this document.",
            )
        time.sleep(1)

    raise HTTPException(
        status_code=504,
        detail="Document processing did not finish in time. Try again later.",
    )


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/documents", response_model=DocumentUploadResponse)
def upload_document(file: UploadFile = File(...)) -> DocumentUploadResponse:
    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(status_code=400, detail="A document filename is required.")

    client = get_openai_client()
    vector_store_id = get_vector_store_id(client)
    uploaded_file = client.files.create(
        file=(filename, file.file, file.content_type or "application/octet-stream"),
        purpose="assistants",
    )
    client.vector_stores.files.create(
        vector_store_id=vector_store_id,
        file_id=uploaded_file.id,
    )
    status = wait_for_file_processing(client, vector_store_id, uploaded_file.id)
    return DocumentUploadResponse(filename=filename, status=status)


def get_citations(response: Response) -> list[Citation]:
    citations: dict[str, Citation] = {}
    for item in response.output:
        if item.type != "message":
            continue
        for content in item.content:
            if content.type != "output_text":
                continue
            for annotation in content.annotations:
                if annotation.type == "file_citation":
                    citations[annotation.file_id] = Citation(
                        file_id=annotation.file_id,
                        filename=annotation.filename,
                    )
    return list(citations.values())


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    model = os.getenv("OPENAI_MODEL", "gpt-6-astra")
    client = get_openai_client()
    vector_store_id = get_vector_store_id(client)
    response = client.responses.create(
        model=model,
        instructions=(
            "Answer using only information found in the provided company documents. "
            "If the documents do not contain enough information, say so clearly. "
            "Do not invent facts."
        ),
        input=request.question,
        tools=[
            {
                "type": "file_search",
                "vector_store_ids": [vector_store_id],
            }
        ],
    )
    if not response.output_text:
        raise HTTPException(
            status_code=502,
            detail="The model did not return a text answer.",
        )
    return ChatResponse(answer=response.output_text, citations=get_citations(response))
