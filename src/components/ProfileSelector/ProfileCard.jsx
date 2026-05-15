import React from 'react';
import styles from './styles.module.css';
import { Plus } from 'lucide-react';

export const ProfileCard = ({ profile, onClick, isNew }) => {
  if (isNew) {
    return (
      <div className={`${styles.card} ${styles.addCard}`} onClick={onClick}>
        <div className={styles.avatar}>
          <Plus size={24} />
        </div>
        <span className={styles.cardName}>Nuevo perfil</span>
      </div>
    );
  }

  const initials = profile.name.substring(0, 2).toUpperCase();

  return (
    <div className={styles.card} onClick={() => onClick(profile)}>
      <div className={styles.avatar}>
        {initials}
      </div>
      <span className={styles.cardName}>{profile.name}</span>
    </div>
  );
};
