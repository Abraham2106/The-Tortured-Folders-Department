import React, { useState, useRef, useEffect } from 'react';
import styles from './Chat.module.css';
import { Send, Loader2, FolderOpen } from 'lucide-react';

const INITIAL_MESSAGE = {
  id: 1,
  role: 'assistant',
  text: 'Buenas noches. Selecciona una carpeta para comenzar a organizar sus archivos.'
};

export const ChatInterface = ({ onDiffsReceived }) => {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [targetDir, setTargetDir] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const messageListRef = useRef(null);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSelectFolder = async () => {
    const path = await window.api.dialog.openFolder();
    if (!path) return;

    setTargetDir(path);
    // Reset conversation with a context-aware system message
    setMessages([
      INITIAL_MESSAGE,
      {
        id: Date.now(),
        role: 'system-notice',
        text: `📁 Carpeta seleccionada: ${path}`
      },
      {
        id: Date.now() + 1,
        role: 'assistant',
        text: `Directorio cargado. Analizando su contenido... ¿Cómo desea reorganizar sus archivos?`
      }
    ]);
    onDiffsReceived && onDiffsReceived([]);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMsg = { id: Date.now(), role: 'user', text: userText };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // Only pass real chat messages (user/assistant) to the LLM, not system-notices
      const history = [
        ...messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.text })),
        { role: 'user', content: userText }
      ];

      const response = await window.api.chat.send(userText, history, targetDir);
      
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: response.message
        }
      ]);

      if (response.diffs && onDiffsReceived) {
        onDiffsReceived(response.diffs);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: 'Error al conectar con el motor de archivo. Asegúrese de que el proxy esté corriendo.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messageList} ref={messageListRef}>
        {messages.map((msg) => {
          if (msg.role === 'system-notice') {
            return (
              <div key={msg.id} className={styles.systemNotice}>
                {msg.text}
              </div>
            );
          }
          return (
            <div 
              key={msg.id} 
              className={`${styles.messageWrapper} ${msg.role === 'user' ? styles.wrapperUser : styles.wrapperAssistant}`}
            >
              <div className={`${styles.message} ${msg.role === 'user' ? styles.msgUser : styles.msgAssistant}`}>
                {msg.text}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className={`${styles.messageWrapper} ${styles.wrapperAssistant}`}>
            <div className={`${styles.message} ${styles.msgAssistant} ${styles.loading}`}>
              <Loader2 className={styles.spinner} size={18} />
              <span>Analizando...</span>
            </div>
          </div>
        )}
      </div>
      
      <div className={styles.inputArea}>
        {targetDir && (
          <div className={styles.targetDirInfo}>
            <FolderOpen size={14} className={styles.dirIcon} />
            <span className={styles.dirPath} title={targetDir}>{targetDir}</span>
            <button className={styles.clearDirBtn} onClick={() => { setTargetDir(null); setMessages([INITIAL_MESSAGE]); onDiffsReceived && onDiffsReceived([]); }}>×</button>
          </div>
        )}
        <form onSubmit={handleSend} className={styles.form}>
          <button 
            type="button" 
            className={styles.folderButton}
            onClick={handleSelectFolder}
            title="Select target folder"
          >
            <FolderOpen size={18} />
          </button>
          <textarea
            className={styles.textarea}
            placeholder={targetDir ? "Describa cómo organizar esta carpeta..." : "Seleccione una carpeta primero..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            disabled={isLoading || !targetDir}
            rows={3}
          />
          <button 
            type="submit" 
            className={styles.sendButton}
            disabled={!input.trim() || isLoading || !targetDir}
          >
            {isLoading ? <Loader2 className={styles.spinner} size={18} /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
};



