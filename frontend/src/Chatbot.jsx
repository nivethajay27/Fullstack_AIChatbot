import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { API_BASE_URL } from './config';

const defaultUsage = {
  inputTokens: 0,
  outputTokens: 0,
  availableTokens: 1000,
};

const formatTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    Authorization: `Bearer ${token}`,
  };
};

const readApiError = async (response, fallback) => {
  try {
    const data = await response.json();
    if (data?.error) return data.error;
  } catch {
    return fallback;
  }
  return fallback;
};

function Chatbot() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState([]);
  const [previewUrls, setPreviewUrls] = useState({});
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [tokenUsage, setTokenUsage] = useState(defaultUsage);
  const [error, setError] = useState('');
  const [sessionFilter, setSessionFilter] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const previewUrlsRef = useRef({});

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );

  const filteredSessions = useMemo(() => {
    if (sessionFilter === 'trash') return sessions.filter((session) => Boolean(session.deletedAt));
    if (sessionFilter === 'archived') return sessions.filter((session) => !session.deletedAt && session.archived);
    return sessions.filter((session) => !session.deletedAt && !session.archived);
  }, [sessions, sessionFilter]);

  const visibleSessions = useMemo(() => {
    if (!searchQuery.trim()) return filteredSessions;
    if (!Array.isArray(searchResults)) return [];
    return searchResults;
  }, [filteredSessions, searchQuery, searchResults]);

  const selectedAttachments = useMemo(
    () => attachments.filter((item) => selectedAttachmentIds.includes(item.id)),
    [attachments, selectedAttachmentIds],
  );
  const isTrashSession = Boolean(activeSession?.deletedAt);

  const fetchSessions = async () => {
    const response = await fetch(`${API_BASE_URL}/sessions?includeArchived=true`, {
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(await readApiError(response, 'Failed to load sessions'));
    }
    const data = await response.json();
    const next = data.sessions || [];
    setSessions(next);
    return next;
  };

  const fetchMessages = async (sessionId) => {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/messages`, {
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(await readApiError(response, 'Failed to load messages'));
    const data = await response.json();
    setMessages(data.messages || []);
  };

  const fetchAttachments = async (sessionId) => {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/attachments`, {
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error(await readApiError(response, 'Failed to load attachments'));
    const data = await response.json();
    setAttachments(data.attachments || []);
  };

  const createSession = async () => {
    const response = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ title: 'New chat' }),
    });
    if (!response.ok) throw new Error('Failed to create session');
    const data = await response.json();
    await fetchSessions();
    return data.session;
  };

  const bootstrap = async () => {
    setIsBootstrapping(true);
    setError('');
    try {
      const existing = await fetchSessions();
      const firstActive = existing.find((session) => !session.archived);
      if (!firstActive) {
        const created = await createSession();
        setActiveSessionId(created.id);
      } else {
        setActiveSessionId(firstActive.id);
      }
    } catch (bootstrapError) {
      setError(bootstrapError.message || 'Could not initialize chat.');
    } finally {
      setIsBootstrapping(false);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    const load = async () => {
      try {
        await Promise.all([fetchMessages(activeSessionId), fetchAttachments(activeSessionId)]);
        setSelectedAttachmentIds([]);
      } catch (loadError) {
        setError(loadError.message || 'Failed to load session details.');
      }
    };
    load();
  }, [activeSessionId]);

  useEffect(() => {
    if (!visibleSessions.length) return;
    if (!activeSessionId || !visibleSessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(visibleSessions[0].id);
    }
  }, [visibleSessions, activeSessionId]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/sessions/search?q=${encodeURIComponent(query)}&view=${encodeURIComponent(sessionFilter)}`,
          {
            headers: { ...getAuthHeaders() },
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error('Search failed');
        }
        const data = await response.json();
        setSearchResults(data.sessions || []);
      } catch (searchError) {
        if (searchError.name === 'AbortError') return;
        setError(searchError.message || 'Search failed.');
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery, sessionFilter]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadPreviews = async () => {
      const imageAttachments = attachments.filter((item) => item.isImage);
      const entries = await Promise.all(
        imageAttachments.map(async (attachment) => {
          try {
            const response = await fetch(`${API_BASE_URL}/attachments/${attachment.id}/blob`, {
              headers: { ...getAuthHeaders() },
              signal: controller.signal,
            });
            if (!response.ok) return [attachment.id, null];
            const blob = await response.blob();
            return [attachment.id, URL.createObjectURL(blob)];
          } catch {
            return [attachment.id, null];
          }
        }),
      );

      if (cancelled) {
        entries.forEach(([, url]) => {
          if (url) URL.revokeObjectURL(url);
        });
        return;
      }

      setPreviewUrls((prev) => {
        Object.values(prev).forEach((url) => URL.revokeObjectURL(url));
        const next = Object.fromEntries(entries.filter(([, url]) => Boolean(url)));
        previewUrlsRef.current = next;
        return next;
      });
    };

    loadPreviews();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attachments, activeSessionId]);

  useEffect(
    () => () => {
      Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const handleNewChat = async () => {
    try {
      const session = await createSession();
      setSessionFilter('active');
      setActiveSessionId(session.id);
      setMessages([]);
      setAttachments([]);
      setSelectedAttachmentIds([]);
      setError('');
      setTokenUsage(defaultUsage);
    } catch (createError) {
      setError(createError.message || 'Could not create chat.');
    }
  };

  const handleRename = async () => {
    if (!activeSession) return;
    const nextTitle = window.prompt('Rename conversation', activeSession.title);
    if (!nextTitle || !nextTitle.trim()) return;

    const response = await fetch(`${API_BASE_URL}/sessions/${activeSession.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ title: nextTitle.trim() }),
    });
    if (!response.ok) {
      setError('Failed to rename session.');
      return;
    }
    await fetchSessions();
  };

  const handleArchiveState = async (archived) => {
    if (!activeSession) return;
    const response = await fetch(`${API_BASE_URL}/sessions/${activeSession.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ archived }),
    });
    if (!response.ok) {
      setError(`Failed to ${archived ? 'archive' : 'unarchive'} session.`);
      return;
    }
    await fetchSessions();
    if (archived) {
      setSessionFilter('active');
    } else {
      setSessionFilter('active');
      setActiveSessionId(activeSession.id);
    }
  };

  const handleTrash = async () => {
    if (!activeSession) return;
    const ok = window.confirm('Move this conversation to Trash?');
    if (!ok) return;

    const response = await fetch(`${API_BASE_URL}/sessions/${activeSession.id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) {
      setError('Failed to move session to trash.');
      return;
    }
    await fetchSessions();
    setSessionFilter('active');
  };

  const handleRestore = async () => {
    if (!activeSession) return;
    const response = await fetch(`${API_BASE_URL}/sessions/${activeSession.id}/restore`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) {
      setError('Failed to restore session.');
      return;
    }
    await fetchSessions();
    setSessionFilter('active');
    setActiveSessionId(activeSession.id);
  };

  const handleDeletePermanent = async () => {
    if (!activeSession) return;
    const ok = window.confirm('Delete this trashed conversation permanently?');
    if (!ok) return;
    const response = await fetch(`${API_BASE_URL}/sessions/${activeSession.id}/permanent`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) {
      setError('Failed to permanently delete session.');
      return;
    }
    await fetchSessions();
  };

  const toggleAttachment = (attachmentId) => {
    setSelectedAttachmentIds((prev) =>
      prev.includes(attachmentId) ? prev.filter((id) => id !== attachmentId) : [...prev, attachmentId],
    );
  };

  const uploadFiles = async (files) => {
    if (!activeSessionId || !files.length || isTrashSession) return;
    setError('');
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE_URL}/sessions/${activeSessionId}/attachments`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Failed to upload ${file.name}`);
      }
    }
    await fetchAttachments(activeSessionId);
  };

  const handleDeleteAttachment = async (attachmentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to delete attachment');
      setSelectedAttachmentIds((prev) => prev.filter((id) => id !== attachmentId));
      if (activeSessionId) {
        await fetchAttachments(activeSessionId);
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete attachment.');
    }
  };

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      await uploadFiles(files);
    } catch (uploadError) {
      setError(uploadError.message || 'Upload failed.');
    } finally {
      event.target.value = '';
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragOver(false);
    if (isTrashSession) return;
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    try {
      await uploadFiles(files);
    } catch (uploadError) {
      setError(uploadError.message || 'Upload failed.');
    }
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!activeSessionId || !message.trim() || isTyping || isTrashSession) return;

    const text = message.trim();
    const tempUserId = `u-${Date.now()}`;
    const tempBotId = `b-${Date.now()}`;
    setError('');
    setIsTyping(true);
    setMessage('');

    setMessages((prev) => [
      ...prev,
      {
        id: tempUserId,
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      },
      {
        id: tempBotId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${activeSessionId}/messages/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          text,
          attachmentIds: selectedAttachmentIds,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to stream response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const eventData = JSON.parse(line);
          if (eventData.type === 'error') throw new Error(eventData.error || 'Streaming failed');

          if (eventData.type === 'assistant_delta') {
            setMessages((prev) =>
              prev.map((item) =>
                item.id === tempBotId ? { ...item, content: `${item.content}${eventData.delta}` } : item,
              ),
            );
          }

          if (eventData.type === 'assistant_done' && eventData.message) {
            setMessages((prev) => prev.map((item) => (item.id === tempBotId ? eventData.message : item)));
            if (eventData.usage) {
              setTokenUsage({
                inputTokens: eventData.usage.inputTokens || 0,
                outputTokens: eventData.usage.outputTokens || 0,
                availableTokens: eventData.usage.availableTokens ?? defaultUsage.availableTokens,
              });
            }
          }
        }
      }
      setSelectedAttachmentIds([]);
      await fetchSessions();
    } catch (streamError) {
      setError(streamError.message || 'Could not send message.');
      setMessages((prev) =>
        prev.map((item) =>
          item.id === tempBotId
            ? {
                ...item,
                content: 'Sorry, something went wrong while generating this response.',
              }
            : item,
        ),
      );
    } finally {
      setIsTyping(false);
    }
  };

  if (isBootstrapping) {
    return (
      <main className="chatbot-container">
        <div className="chat-session">
          <p className="empty-state">Loading chats...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="chatbot-container">
      <div className="previous-chats">
        <div className="panel-title">
          <h2>Chats</h2>
          <button className="new-chat-button" onClick={handleNewChat} type="button">
            + New Chat
          </button>
        </div>

        <div className="session-filter">
          <button
            type="button"
            className={sessionFilter === 'active' ? 'active' : ''}
            onClick={() => setSessionFilter('active')}
          >
            Active
          </button>
          <button
            type="button"
            className={sessionFilter === 'archived' ? 'active' : ''}
            onClick={() => setSessionFilter('archived')}
          >
            Archived
          </button>
          <button
            type="button"
            className={sessionFilter === 'trash' ? 'active' : ''}
            onClick={() => setSessionFilter('trash')}
          >
            Trash
          </button>
        </div>

        <input
          className="session-search"
          type="text"
          placeholder="Search chats and messages..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <div className="chat-history-list">
          {visibleSessions.map((session) => (
            <button
              key={session.id}
              className={`chat-history-item ${session.id === activeSessionId ? 'active' : ''}`}
              onClick={() => setActiveSessionId(session.id)}
              type="button"
            >
              <strong>{session.title}</strong>
              <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="chat-session">
        <div className="chat-toolbar">
          <div className="session-title">{activeSession?.title || 'Conversation'}</div>
          <div className="toolbar-actions">
            {sessionFilter !== 'trash' && <button type="button" onClick={handleRename}>Rename</button>}
            {sessionFilter !== 'trash' && !activeSession?.archived && <button type="button" onClick={() => handleArchiveState(true)}>Archive</button>}
            {sessionFilter !== 'trash' && activeSession?.archived && <button type="button" onClick={() => handleArchiveState(false)}>Unarchive</button>}
            {sessionFilter !== 'trash' && <button type="button" onClick={handleTrash}>Trash</button>}
            {sessionFilter === 'trash' && <button type="button" onClick={handleRestore}>Restore</button>}
            {sessionFilter === 'trash' && <button type="button" onClick={handleDeletePermanent}>Delete Permanently</button>}
          </div>
        </div>

        <div className="token-usage">
          <div>
            <span>Input</span>
            <strong>{tokenUsage.inputTokens}</strong>
          </div>
          <div>
            <span>Output</span>
            <strong>{tokenUsage.outputTokens}</strong>
          </div>
          <div>
            <span>Available</span>
            <strong>{tokenUsage.availableTokens}</strong>
          </div>
        </div>

        <section className="messages-panel">
          {messages.length ? (
            messages.map((chat) => (
              <p key={chat.id} className={chat.role === 'user' ? 'user_msg' : 'bot_msg'}>
                <span className="role">{chat.role === 'user' ? 'YOU' : 'BOT'}</span>
                <span className="message-content">{chat.content}</span>
                <span className="timestamp">{formatTime(chat.createdAt)}</span>
              </p>
            ))
          ) : (
            <p className="empty-state">No messages yet. Ask something to start the chat.</p>
          )}
        </section>

        {isTyping && (
          <div className="typing-state">
            <p>
              <i>Bot is typing...</i>
            </p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={sendMessage}>
          <div
            className={`composer ${isDragOver ? 'drag-over' : ''} ${isTrashSession ? 'disabled' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (isTrashSession) return;
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <div className="composer-attachments">
              {selectedAttachments.map((attachment) => (
                <div key={attachment.id} className="composer-attachment-chip">
                  {attachment.isImage && previewUrls[attachment.id] ? (
                    <img
                      src={previewUrls[attachment.id]}
                      alt={attachment.originalName}
                      onClick={() =>
                        setLightboxImage({
                          src: previewUrls[attachment.id],
                          alt: attachment.originalName,
                        })
                      }
                    />
                  ) : (
                    <span className="pdf-badge">PDF</span>
                  )}
                  <span>{attachment.originalName}</span>
                  <button
                    type="button"
                    className="chip-action"
                    onClick={() => toggleAttachment(attachment.id)}
                    title="Remove from prompt"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="chip-action danger"
                    onClick={() => handleDeleteAttachment(attachment.id)}
                    title="Delete attachment"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="composer-row">
              <label className="upload-label compact">
                +
                <input type="file" accept=".pdf,image/*" multiple onChange={handleUpload} disabled={isTrashSession} />
              </label>
              <input
                type="text"
                name="message"
                value={message}
                placeholder="Type a message, or drag/drop PDF/images here..."
                onChange={(event) => setMessage(event.target.value)}
                disabled={isTrashSession}
              />
              <button className="send-button" type="submit" disabled={isTyping || isTrashSession}>
                Send
              </button>
            </div>

            <div className="attachment-list">
              {attachments.map((attachment) => (
                <button
                  key={attachment.id}
                  className={`attachment-item ${selectedAttachmentIds.includes(attachment.id) ? 'selected' : ''}`}
                  type="button"
                  onClick={() => toggleAttachment(attachment.id)}
                >
                  {attachment.isImage && previewUrls[attachment.id] && (
                    <img
                      src={previewUrls[attachment.id]}
                      alt={attachment.originalName}
                      onClick={(event) => {
                        event.stopPropagation();
                        setLightboxImage({
                          src: previewUrls[attachment.id],
                          alt: attachment.originalName,
                        });
                      }}
                    />
                  )}
                  <span>{attachment.originalName}</span>
                </button>
              ))}
            </div>
            {isTrashSession && <p className="trash-note">Restore this chat to send new messages.</p>}
          </div>
        </form>
      </div>

      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)} role="presentation">
          <div className="lightbox-content" onClick={(event) => event.stopPropagation()} role="presentation">
            <button className="lightbox-close" type="button" onClick={() => setLightboxImage(null)}>
              ×
            </button>
            <img src={lightboxImage.src} alt={lightboxImage.alt} />
            <p>{lightboxImage.alt}</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default Chatbot;
