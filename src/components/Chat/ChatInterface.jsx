import { useState, useRef, useEffect } from 'react';
import styles from './Chat.module.css';
import { Send, Loader2, FolderOpen, Sparkles, Stamp, Trash2, FileSearch } from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';

const INITIAL_MESSAGE = {
  id: 1,
  role: 'assistant',
  text: 'Buenas noches. Selecciona una carpeta para comenzar a organizar sus archivos.'
};

const canResolveProposal = (proposal) => proposal && (proposal.status === 'awaiting_approval' || proposal.status === 'modified');

export const ChatInterface = ({
  proposals,
  selectedProposalId,
  onProposalReceived,
  onSelectProposal,
  onApproveProposal,
  onRejectProposal
}) => {
  const { activeProfile } = useProfileStore();
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [targetDir, setTargetDir] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const messageListRef = useRef(null);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading, proposals]);

  const handleSelectFolder = async () => {
    const path = await window.api.dialog.openFolder();
    if (!path) return;

    setTargetDir(path);
    setMessages([
      INITIAL_MESSAGE,
      {
        id: Date.now(),
        role: 'system-notice',
        text: `Carpeta seleccionada: ${path}`
      },
      {
        id: Date.now() + 1,
        role: 'assistant',
        text: 'Directorio cargado. Analizando su contenido... ¿Cómo desea reorganizar sus archivos?'
      }
    ]);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !activeProfile?.id) return;

    const userText = input.trim();
    const userMsg = { id: Date.now(), role: 'user', text: userText };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = [
        ...messages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => ({ role: message.role, content: message.text })),
        { role: 'user', content: userText }
      ];

      const response = await window.api.chat.send(activeProfile.id, userText, history, targetDir);

      setMessages((prev) => {
        const next = [
          ...prev,
          {
            id: Date.now() + 1,
            role: 'assistant',
            text: response.message
          }
        ];

        if (response.proposal) {
          next.push({
            id: `${response.proposal.id}-bubble`,
            role: 'proposal',
            proposalId: response.proposal.id
          });
        }

        return next;
      });

      if (response.proposal && onProposalReceived) {
        onProposalReceived(response.proposal);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
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

  const getProposalById = (proposalId) => proposals.find((proposal) => proposal.id === proposalId);

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

          if (msg.role === 'proposal') {
            const proposal = getProposalById(msg.proposalId);
            if (!proposal) return null;

            return (
              <div key={msg.id} className={`${styles.messageWrapper} ${styles.wrapperAssistant}`}>
                <div className={styles.proposalBubble}>
                  <div className={styles.proposalHeader}>
                    <div className={styles.proposalTag}>
                      <Sparkles size={14} />
                      <span>Sugerencia HITL</span>
                    </div>
                    <button
                      className={styles.proposalInspectBtn}
                      onClick={() => onSelectProposal(proposal.id)}
                    >
                      <FileSearch size={14} />
                      <span>Expediente</span>
                    </button>
                  </div>

                  <h4 className={styles.proposalTitle}>{proposal.title}</h4>
                  <p className={styles.proposalText}>{proposal.summary}</p>

                  <div className={styles.proposalMeta}>
                    <span>Estado: {proposal.status}</span>
                    <span>Acciones: {proposal.diffs.length}</span>
                    <span>Riesgo: {proposal.riskLevel}</span>
                  </div>

                  {proposal.id === selectedProposalId ? (
                    <div className={styles.selectedNote}>Expediente abierto en el panel derecho.</div>
                  ) : null}

                  {canResolveProposal(proposal) ? (
                    <div className={styles.proposalActions}>
                      <button
                        className={styles.proposalSecondary}
                        onClick={() => onRejectProposal(proposal.id)}
                      >
                        <Trash2 size={14} />
                        <span>Descartar</span>
                      </button>
                      <button
                        className={styles.proposalPrimary}
                        onClick={() => onApproveProposal(proposal.id)}
                      >
                        <Stamp size={14} />
                        <span>Sellar y ejecutar</span>
                      </button>
                    </div>
                  ) : (
                    <div className={styles.proposalResolved}>
                      {proposal.status === 'approved'
                        ? 'La propuesta fue aprobada y registrada.'
                        : 'La propuesta fue descartada.'}
                    </div>
                  )}
                </div>
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
            <button
              className={styles.clearDirBtn}
              onClick={() => {
                setTargetDir(null);
                setMessages([INITIAL_MESSAGE]);
              }}
            >
              ×
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className={styles.form}>
          <button
            type="button"
            className={styles.folderButton}
            onClick={handleSelectFolder}
            title="Seleccionar carpeta destino"
          >
            <FolderOpen size={18} />
          </button>
          <textarea
            className={styles.textarea}
            placeholder={targetDir ? 'Describa cómo organizar esta carpeta...' : 'Seleccione una carpeta primero...'}
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
