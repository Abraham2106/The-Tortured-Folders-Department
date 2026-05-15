import React, { useState } from 'react';
import styles from './styles.module.css';
import { useProfileStore } from '../../store/useProfileStore';
import { ErrorMessages } from '../../errors/messages';

export const CreateProfileModal = ({ onClose }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createProfile = useProfileStore((state) => state.createProfile);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre no puede estar vacío');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await createProfile({ name: name.trim() });
      onClose();
    } catch (err) {
      console.error('Error creating profile:', err);
      setError(err.message || ErrorMessages.PROFILE_CREATE_FAILED);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <h2 className={styles.modalTitle}>Crear nuevo perfil</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="profileName">
              Nombre
            </label>
            <input
              id="profileName"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Trabajo, Personal..."
              autoFocus
              disabled={isSubmitting}
            />
            {error && <span className={styles.error}>{error}</span>}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
