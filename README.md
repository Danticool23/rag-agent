# Asistente RAG empresarial

MVP local para cargar documentos y consultarlos desde una interfaz React. FastAPI usa OpenAI File Search con Responses API; los archivos y la clave de OpenAI se envían únicamente desde el backend.

## Requisitos

- Python 3.10 o posterior.
- Node.js 20.19 o posterior (o 22.12 o posterior).
- Una clave de API de OpenAI y acceso a un modelo que admita File Search.

## Configuración y ejecución

1. Completa `backend/.env` usando `backend/.env.example` como referencia. Define `OPENAI_API_KEY`; `OPENAI_MODEL` tiene como valor inicial el modelo mostrado en el ejemplo oficial de File Search. Comprueba que ese modelo está disponible para tu cuenta.
2. Crea un entorno virtual e instala las dependencias:

   ```powershell
   py -3.14 -m venv backend\.venv
   backend\.venv\Scripts\Activate.ps1
   python -m pip install -r backend\requirements.txt
   ```

   Si PowerShell impide activar el entorno, invoca directamente `backend\.venv\Scripts\python.exe` y `backend\.venv\Scripts\pip.exe`.

3. Inicia el backend desde la raíz del proyecto:

   ```powershell
   backend\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --reload
   ```

4. En otra terminal, inicia Vite:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

5. Abre la dirección local que muestra Vite. El proxy de desarrollo dirige las peticiones `/api` al backend en `http://127.0.0.1:8000`.

## Documentos y almacenamiento

El primer documento crea un Vector Store de OpenAI. Su identificador se guarda en `backend/.vector_store_id` para reutilizar la misma colección tras reiniciar el backend. Este archivo está excluido de Git. Para usar otra colección, define `OPENAI_VECTOR_STORE_ID` en `backend/.env`.

OpenAI almacena los archivos cargados y los procesa para búsqueda; verifica que esto cumple las políticas de datos de tu organización antes de subir documentos empresariales. Las llamadas al proveedor y el almacenamiento del Vector Store requieren acceso de red y pueden generar cargos.

## API

- `GET /api/health`: estado del backend.
- `POST /api/documents`: carga un documento multipart y espera a que termine el procesamiento.
- `POST /api/chat`: recibe `{"question":"..."}` y devuelve una respuesta con las fuentes disponibles.
