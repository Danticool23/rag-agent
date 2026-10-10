import { useEffect, useRef, useState } from "react";

async function readResponse(response) {
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.detail || "Ocurrió un error. Inténtalo de nuevo.");
  }
  return result;
}

function App() {
  const [health, setHealth] = useState("checking");
  const [file, setFile] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const conversationEnd = useRef(null);

  useEffect(() => {
    fetch("/api/health")
      .then(readResponse)
      .then(() => setHealth("online"))
      .catch(() => setHealth("offline"));
  }, []);

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) return;

    setUploading(true);
    setError("");
    const body = new FormData();
    body.append("file", file);

    try {
      const result = await readResponse(
        await fetch("/api/documents", { method: "POST", body }),
      );
      setDocuments((current) => [
        ...current,
        { filename: result.filename, status: result.status },
      ]);
      setFile(null);
      event.target.reset();
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk(event) {
    event.preventDefault();
    const currentQuestion = question.trim();
    if (!currentQuestion || asking) return;

    setQuestion("");
    setError("");
    setMessages((current) => [
      ...current,
      { role: "user", content: currentQuestion },
    ]);
    setAsking(true);

    try {
      const result = await readResponse(
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: currentQuestion }),
        }),
      );
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.answer, citations: result.citations },
      ]);
    } catch (chatError) {
      setError(chatError.message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Archivo, inicio">
          <span className="brand-mark" aria-hidden="true">a.</span>
          <span>archivo</span>
        </a>

        <div className="side-label">TU ESPACIO</div>
        <div className="workspace-card">
          <span className="workspace-icon" aria-hidden="true">N</span>
          <span className="workspace-name">
            <strong>Mi empresa</strong>
            <small>Espacio de trabajo</small>
          </span>
          <span className="more-icon" aria-hidden="true">···</span>
        </div>

        <div className="side-label document-label">
          <span>DOCUMENTOS</span>
          <span className="document-count">{documents.length}</span>
        </div>
        <ul className="document-list">
          {documents.map((document, index) => (
            <li key={`${document.filename}-${index}`}>
              <span className="file-icon" aria-hidden="true">↳</span>
              <span title={document.filename}>{document.filename}</span>
            </li>
          ))}
          {documents.length === 0 && (
            <li className="empty-documents">Tus archivos aparecerán aquí.</li>
          )}
        </ul>

        <div className="sidebar-footer">
          <span className={`status-dot ${health}`} aria-hidden="true" />
          <span>{health === "online" ? "Sistema conectado" : health === "offline" ? "Sistema desconectado" : "Conectando..."}</span>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Mi empresa</span><span className="breadcrumb-slash">/</span><strong>Asistente</strong>
          </div>
          <div className="topbar-badge"><span /> IA EMPRESARIAL</div>
        </header>

        <div className="content">
          <section className="intro">
            <div className="eyebrow"><span /> TU BASE DE CONOCIMIENTO</div>
            <h1>Las respuestas<br />están <em>en tus archivos.</em></h1>
            <p>Sube documentos y conversa con la información de tu empresa.</p>
          </section>

          <form className="upload-card" onSubmit={handleUpload}>
            <div className="upload-icon" aria-hidden="true">↑</div>
            <div className="upload-copy">
              <strong>Añade conocimiento</strong>
              <span>{file ? file.name : "Selecciona un documento para empezar a consultar."}</span>
            </div>
            <label className="file-picker">
              <span>{file ? "Cambiar archivo" : "Elegir archivo"}</span>
              <input
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                aria-label="Seleccionar un documento"
              />
            </label>
            <button className="upload-button" type="submit" disabled={!file || uploading}>
              {uploading ? "Procesando..." : "Subir"}
            </button>
          </form>

          <section className={`chat-panel ${messages.length ? "has-messages" : ""}`}>
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="sparkle" aria-hidden="true">✳</div>
                <h2>¿Qué necesitas saber?</h2>
                <p>Pregunta sobre políticas, procesos o cualquier documento que hayas subido.</p>
                <div className="suggestions">
                  <button type="button" onClick={() => setQuestion("¿Qué documentos están disponibles?")}>¿Qué documentos están disponibles?</button>
                  <button type="button" onClick={() => setQuestion("Resume la información más importante.")}>Resume la información más importante</button>
                </div>
              </div>
            ) : (
              <div className="messages" aria-live="polite">
                {messages.map((message, index) => (
                  <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                    <div className="message-label">{message.role === "user" ? "TÚ" : "ARCHIVO"}</div>
                    <p>{message.content}</p>
                    {message.citations?.length > 0 && (
                      <div className="citations">
                        <span>FUENTES</span>
                        {message.citations.map((citation) => (
                          <span className="citation" key={citation.file_id}>{citation.filename}</span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
                {asking && <div className="thinking" role="status">Buscando en tus documentos…</div>}
                <div ref={conversationEnd} />
              </div>
            )}
          </section>

          {error && <div className="error-banner" role="alert">{error}</div>}

          <form className="question-form" onSubmit={handleAsk}>
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Escribe tu pregunta aquí..."
              aria-label="Escribe tu pregunta"
              maxLength={4000}
            />
            <span className="input-hint">↵</span>
            <button type="submit" disabled={!question.trim() || asking} aria-label="Enviar pregunta">
              <span aria-hidden="true">↑</span>
            </button>
          </form>
          <div className="disclaimer">Las respuestas se generan a partir de tus documentos. Verifica la información importante.</div>
        </div>
      </section>
    </main>
  );
}

export default App;
