import React, { useEffect, useState } from 'react';
import styles from './styles.module.css';
import { useProfileStore } from '../../store/useProfileStore';
import { ProfileCard } from './ProfileCard';
import { CreateProfileModal } from './CreateProfileModal';

export const ProfileSelector = () => {
  const { profiles, fetchProfiles, selectProfile } = useProfileStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>The Tortured Folders Department</h1>
        <p className={styles.subtitle}>Selecciona un archivo para comenzar la sesión.</p>
      </div>

      <div className={styles.grid}>
        {profiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            onClick={selectProfile}
          />
        ))}
        <ProfileCard isNew onClick={() => setIsModalOpen(true)} />
      </div>

      {isModalOpen && (
        <CreateProfileModal onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
};
