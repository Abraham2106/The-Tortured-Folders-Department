import { useEffect } from 'react';
import styles from './HitlToastStack.module.css';
import { Sparkles, Stamp, Trash2, Inbox } from 'lucide-react';

export const HitlToastStack = ({
  proposals,
  hiddenToastIds,
  onHideToast,
  onApproveProposal,
  onRejectProposal,
  onSelectProposal
}) => {
  const visibleToasts = proposals.filter((proposal) =>
    proposal.riskLevel === 'low' &&
    (proposal.status === 'awaiting_approval' || proposal.status === 'modified') &&
    !hiddenToastIds.includes(proposal.id)
  ).slice(0, 3);

  useEffect(() => {
    const timers = visibleToasts.map((proposal) => setTimeout(() => {
      onHideToast(proposal.id);
    }, 10000));

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [visibleToasts, onHideToast]);

  if (visibleToasts.length === 0) return null;

  return (
    <div className={styles.stack}>
      {visibleToasts.map((proposal) => (
        <div key={proposal.id} className={styles.toast}>
          <div className={styles.header}>
            <div className={styles.label}>
              <Sparkles size={14} />
              <span>Sugerencia rápida</span>
            </div>
            <span className={styles.risk}>Cierre automático en 10 s</span>
          </div>

          <div className={styles.title}>{proposal.title}</div>
          <div className={styles.summary}>{proposal.summary}</div>

          <div className={styles.actions}>
            <button
              className={styles.secondaryBtn}
              onClick={() => {
                onSelectProposal(proposal.id);
                onHideToast(proposal.id);
              }}
            >
              <Inbox size={14} />
              <span>Bandeja</span>
            </button>
            <button
              className={styles.secondaryBtn}
              onClick={() => onRejectProposal(proposal.id)}
            >
              <Trash2 size={14} />
              <span>Descartar</span>
            </button>
            <button
              className={styles.primaryBtn}
              onClick={() => onApproveProposal(proposal.id)}
            >
              <Stamp size={14} />
              <span>Sellar</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
