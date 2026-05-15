import React, { useState } from 'react';
import styles from './DiffPreview.module.css';
import { useProfileStore } from '../../store/useProfileStore';

export const DiffPreview = ({ diffs }) => {
  const { activeProfile } = useProfileStore();
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState(null);

  const handleExecute = async () => {
    if (!activeProfile || !diffs || diffs.length === 0 || isExecuting) return;

    if (!confirm(`Are you sure you want to execute ${diffs.length} file operations? This cannot be undone in this version.`)) {
      return;
    }

    setIsExecuting(true);
    try {
      const res = await window.api.fs.execute(activeProfile.id, diffs);
      setResult(res);
    } catch (error) {
      console.error('Execution error:', error);
      alert('Failed to execute file operations. See console for details.');
    } finally {
      setIsExecuting(false);
    }
  };

  if (result) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Execution Result: {result.status.toUpperCase()}</h3>
        <div className={styles.summaryBox}>
          <p>Total: {result.summary.total}</p>
          <p className={styles.successText}>Success: {result.summary.success}</p>
          <p className={styles.failedText}>Failed: {result.summary.failed}</p>
          <p className={styles.skippedText}>Skipped: {result.summary.skipped}</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => setResult(null)}>Done</button>
      </div>
    );
  }

  if (!diffs || diffs.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No changes proposed yet.</p>
        <p className={styles.subText}>Describe how you want to organize your files in the chat.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Proposed Restructuring Plan</h3>
      <div className={styles.diffList}>
        {diffs.map((diff) => {
          const actionLabel = diff.action === 'mkdir' ? '📁 CREAR'
            : diff.action === 'move-dir' ? '📦 MOVER CARPETA'
            : '📄 MOVER';
          const actionClass = diff.action === 'mkdir' ? styles.actionMkdir
            : diff.action === 'move-dir' ? styles.actionMoveDir
            : styles.actionMove;

          return (
            <div key={diff.id} className={styles.diffItem}>
              <span className={`${styles.actionBadge} ${actionClass}`}>{actionLabel}</span>
              <div className={styles.fileName}>{diff.fileName}</div>
              {diff.action !== 'mkdir' && (
                <div className={styles.action}>
                  <span className={styles.moveArrow}>→</span>
                  <span className={styles.targetDir}>{diff.targetDir}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button className={styles.btnSecondary} disabled={isExecuting}>Discard</button>
        <button 
          className={styles.btnPrimary} 
          onClick={handleExecute}
          disabled={isExecuting}
        >
          {isExecuting ? 'Executing...' : 'Approve & Execute'}
        </button>
      </div>
    </div>
  );
};
