import { useState } from 'react';
import styles from './DiffPreview.module.css';
import { Stamp, Trash2, PenTool, RotateCcw, Sparkles, AlertTriangle } from 'lucide-react';

const cloneDiffs = (diffs = []) => JSON.parse(JSON.stringify(diffs ?? []));

const getActionLabel = (action) => {
  if (action === 'mkdir') return 'CREAR';
  if (action === 'move-dir') return 'MOVER CARPETA';
  if (action === 'rmdir') return 'ELIMINAR';
  return 'MOVER';
};

const getActionClass = (action) => {
  if (action === 'mkdir') return styles.actionMkdir;
  if (action === 'move-dir') return styles.actionMoveDir;
  if (action === 'rmdir') return styles.actionRmdir;
  return styles.actionMove;
};

const canResolveProposal = (proposal) => proposal && (proposal.status === 'awaiting_approval' || proposal.status === 'modified');

export const DiffPreview = ({
  proposals,
  currentProposal,
  pendingProposals,
  onSelectProposal,
  onApproveProposal,
  onRejectProposal,
  onUpdateProposal
}) => {
  const [draftState, setDraftState] = useState({ proposalId: null, diffs: [] });
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditingCurrentProposal = isEditing && draftState.proposalId === currentProposal?.id;
  const displayedDiffs = isEditingCurrentProposal
    ? draftState.diffs
    : currentProposal?.diffs || [];

  const beginEditing = () => {
    if (!currentProposal) return;

    setDraftState({
      proposalId: currentProposal.id,
      diffs: cloneDiffs(currentProposal.diffs || [])
    });
    setIsEditing(true);
  };

  const handleDraftTargetChange = (diffId, nextTarget) => {
    setDraftState((prev) => ({
      ...prev,
      diffs: prev.diffs.map((diff) => (
      diff.id === diffId
        ? {
            ...diff,
            target: nextTarget,
            targetDir: nextTarget
          }
        : diff
      ))
    }));
  };

  const handleApplyCollisionRename = (collision) => {
    if (!isEditingCurrentProposal) {
      beginEditing();
    }

    setDraftState((prev) => ({
      ...prev,
      diffs: prev.diffs.map((diff) => (
        diff.id === collision.diffId
          ? {
              ...diff,
              target: collision.suggestedTarget,
              targetDir: collision.suggestedTarget,
              overwrite: false
            }
          : diff
      ))
    }));
  };

  const handleApplyOverwrite = (collision) => {
    if (!isEditingCurrentProposal) {
      beginEditing();
    }

    setDraftState((prev) => ({
      ...prev,
      diffs: prev.diffs.map((diff) => (
        diff.id === collision.diffId
          ? {
              ...diff,
              overwrite: true
            }
          : diff
      ))
    }));
  };

  const handleSaveDraft = async () => {
    if (!currentProposal) return;

    setIsSubmitting(true);
    try {
      await onUpdateProposal(currentProposal.id, draftState.diffs);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save draft proposal:', error);
      alert('No se pudo guardar la edición del expediente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!currentProposal) return;

    setIsSubmitting(true);
    try {
      const response = await onApproveProposal(
        currentProposal.id,
        isEditingCurrentProposal ? draftState.diffs : currentProposal.diffs
      );
      if (response?.status === 'collision') {
        beginEditing();
      }
    } catch (error) {
      console.error('Approval error:', error);
      alert('No se pudo ejecutar la propuesta. Revise la consola para más detalles.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!currentProposal) return;

    setIsSubmitting(true);
    try {
      await onRejectProposal(currentProposal.id);
    } catch (error) {
      console.error('Reject error:', error);
      alert('No se pudo descartar la propuesta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentProposal && proposals.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No hay expedientes pendientes.</p>
        <p className={styles.subText}>Describe cómo quieres organizar tus archivos y la IA preparará una propuesta para firma humana.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Human-in-the-Loop Desk</h3>

      <div className={styles.pendingTray}>
        <div className={styles.pendingHeader}>
          <Sparkles size={16} />
          <span>Bandeja de Pendientes</span>
        </div>
        {pendingProposals.length === 0 ? (
          <div className={styles.pendingEmpty}>No hay propuestas esperando firma.</div>
        ) : (
          <div className={styles.pendingList}>
            {pendingProposals.map((proposal) => (
              <button
                key={proposal.id}
                className={`${styles.pendingItem} ${currentProposal?.id === proposal.id ? styles.pendingItemActive : ''}`}
                onClick={() => onSelectProposal(proposal.id)}
              >
                <span className={styles.pendingTitle}>{proposal.title}</span>
                <span className={styles.pendingMeta}>
                  {proposal.source} · {proposal.diffs.length} acciones · {proposal.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {currentProposal ? (
        <div className={styles.detailPanel}>
          <div className={styles.headerBlock}>
            <div>
              <h4 className={styles.proposalTitle}>{currentProposal.title}</h4>
              <p className={styles.summary}>{currentProposal.summary}</p>
            </div>
            <div className={styles.statusColumn}>
              <span className={`${styles.statusBadge} ${styles[currentProposal.status] || ''}`}>
                {currentProposal.status}
              </span>
              <span className={styles.confidence}>AI: {Math.round((currentProposal.aiConfidence || 0) * 100)}%</span>
            </div>
          </div>

          {currentProposal.collisions?.length > 0 ? (
            <div className={styles.collisionBox}>
              <div className={styles.collisionHeader}>
                <AlertTriangle size={16} />
                <span>Colisiones detectadas antes de tocar el sistema de archivos</span>
              </div>
              {currentProposal.collisions.map((collision) => (
                <div key={`${currentProposal.id}-${collision.diffId}`} className={styles.collisionItem}>
                  <div className={styles.collisionText}>
                    <div>{collision.targetPath}</div>
                    <div className={styles.collisionHint}>
                      {collision.type === 'existing_target'
                        ? 'Ya existe un destino con este nombre.'
                        : 'Dos operaciones apuntan al mismo destino.'}
                    </div>
                  </div>
                  <div className={styles.collisionActions}>
                    {collision.suggestedTarget ? (
                      <button
                        className={styles.btnSecondary}
                        onClick={() => handleApplyCollisionRename(collision)}
                      >
                        Renombrar como sugerido
                      </button>
                    ) : null}
                    {collision.canOverwrite ? (
                      <button
                        className={styles.btnSecondary}
                        onClick={() => handleApplyOverwrite(collision)}
                      >
                        Sobrescribir
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {currentProposal.executionResult ? (
            <div className={styles.summaryBox}>
              <p>Total: {currentProposal.executionResult.summary.total}</p>
              <p className={styles.successText}>Success: {currentProposal.executionResult.summary.success}</p>
              <p className={styles.failedText}>Failed: {currentProposal.executionResult.summary.failed}</p>
              <p className={styles.skippedText}>Skipped: {currentProposal.executionResult.summary.skipped}</p>
            </div>
          ) : null}

          <div className={styles.diffList}>
            {displayedDiffs.map((diff) => (
              <div key={diff.id} className={styles.diffItem}>
                <span className={`${styles.actionBadge} ${getActionClass(diff.action)}`}>
                  {getActionLabel(diff.action)}
                </span>
                <div className={styles.fileName}>{diff.fileName}</div>
                {diff.source ? (
                  <div className={styles.pathBlock}>
                    <span className={styles.pathLabel}>Antes</span>
                    <span className={styles.pathValue}>{diff.source}</span>
                  </div>
                ) : null}
                {diff.target ? (
                  <div className={styles.pathBlock}>
                    <span className={styles.pathLabel}>Después</span>
                    {isEditingCurrentProposal && canResolveProposal(currentProposal) && diff.action !== 'rmdir' ? (
                      <input
                        className={styles.pathInput}
                        value={draftState.diffs.find((item) => item.id === diff.id)?.target || ''}
                        onChange={(event) => handleDraftTargetChange(diff.id, event.target.value)}
                      />
                    ) : (
                      <span className={styles.pathValue}>{diff.target}</span>
                    )}
                  </div>
                ) : null}
                {diff.overwrite ? (
                  <div className={styles.overwriteNote}>Modo de colisión: sobrescribir destino existente.</div>
                ) : null}
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            {canResolveProposal(currentProposal) ? (
              <>
                <button
                  className={styles.btnSecondary}
                  onClick={handleReject}
                  disabled={isSubmitting}
                >
                  <Trash2 size={14} />
                  <span>Descartar</span>
                </button>
                <button
                  className={styles.btnSecondary}
                  onClick={() => {
                    if (isEditingCurrentProposal) {
                      setIsEditing(false);
                      return;
                    }
                    beginEditing();
                  }}
                  disabled={isSubmitting}
                >
                  <PenTool size={14} />
                  <span>{isEditingCurrentProposal ? 'Cancelar edición' : 'Editar'}</span>
                </button>
                {isEditingCurrentProposal ? (
                  <button
                    className={styles.btnSecondary}
                    onClick={handleSaveDraft}
                    disabled={isSubmitting}
                  >
                    <RotateCcw size={14} />
                    <span>Guardar cambios</span>
                  </button>
                ) : null}
                <button
                  className={styles.btnPrimary}
                  onClick={handleApprove}
                  disabled={isSubmitting}
                >
                  <Stamp size={14} />
                  <span>{isSubmitting ? 'Ejecutando...' : 'Sellar y Ejecutar'}</span>
                </button>
              </>
            ) : (
              <div className={styles.resolutionNote}>
                {currentProposal.status === 'approved'
                  ? 'La propuesta fue ejecutada y registrada en auditoría.'
                  : 'La propuesta fue descartada antes de tocar el sistema de archivos.'}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
