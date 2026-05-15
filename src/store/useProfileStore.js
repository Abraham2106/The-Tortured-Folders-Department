import { create } from 'zustand';

export const useProfileStore = create((set, get) => ({
  profiles: [],
  activeProfile: null,
  currentView: 'profile-selector', // 'profile-selector' | 'main'
  
  fetchProfiles: async () => {
    try {
      if (!window.api?.profiles) return;
      const profiles = await window.api.profiles.list();
      set({ profiles });
    } catch (error) {
      console.error('Error fetching profiles:', error);
    }
  },
  
  selectProfile: (profile) => {
    set({ activeProfile: profile, currentView: 'main' });
  },
  
  createProfile: async (data) => {
    try {
      if (!window.api?.profiles) {
        throw new Error('API de Electron (window.api.profiles) no encontrada. ¿Está bien configurado el preload?');
      }
      console.log('Sending create profile request to main process...');
      const newProfile = await window.api.profiles.create(data);
      console.log('Main process returned:', newProfile);
      
      const currentProfiles = get().profiles || [];
      set({ profiles: [newProfile, ...currentProfiles] });
      return newProfile;
    } catch (error) {
      console.error('Error creating profile:', error);
      throw error;
    }
  },
  
  logout: () => {
    set({ activeProfile: null, currentView: 'profile-selector' });
  }
}));
