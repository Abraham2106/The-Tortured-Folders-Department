import React, { useState, useEffect } from 'react';
import styles from './History.module.css';
import { RotateCcw, Calendar, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { useProfileStore } from '../../store/useProfileStore';

export const HistoryView = () => {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRollingBack, setIsRollingBack] = useState(null); // id of tx being rolled back
  const { activeProfile } = useProfileStore();

  const fetchHistory = async () => {
    if (!activeProfile) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await window.api.transactions.list(activeProfile.id);
      setTransactions(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeProfile]);

  const handleRollback = async (id) => {
    if (!window.confirm('Are you sure you want to revert this organization? This will move files back to their original locations.')) {
      return;
    }

    setIsRollingBack(id);
    try {
      const result = await window.api.transactions.rollback(id);
      alert(`Rollback completed: ${result.successCount} moved back, ${result.failCount} failed.`);
      fetchHistory(); // Refresh list
    } catch (error) {
      console.error('Rollback failed:', error);
      alert('Rollback failed. See console for details.');
    } finally {
      setIsRollingBack(null);
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading archival records...</div>;
  }

  if (transactions.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Calendar size={48} className={styles.emptyIcon} />
        <h3>No records found</h3>
        <p>Your archival history is currently empty.</p>
      </div>
    );
  }

  return (
    <div className={styles.historyContainer}>
      <h2 className={styles.title}>Archival History</h2>
      <div className={styles.list}>
        {transactions.map((tx) => (
          <div key={tx.id} className={styles.txItem}>
            <div className={styles.txInfo}>
              <div className={styles.txHeader}>
                <span className={styles.txDate}>
                  {new Date(tx.timestamp).toLocaleString()}
                </span>
                <span className={`${styles.statusBadge} ${styles[tx.status]}`}>
                  {tx.status === 'completed' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                  {tx.status}
                </span>
              </div>
              <div className={styles.txDetails}>
                <FileText size={14} />
                <span>{tx.operations.length} operations processed</span>
              </div>
            </div>
            
            <button 
              className={styles.rollbackBtn}
              onClick={() => handleRollback(tx.id)}
              disabled={isRollingBack !== null}
              title="Undo this organization"
            >
              {isRollingBack === tx.id ? (
                <div className={styles.spinner} />
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Revert</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
