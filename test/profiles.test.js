import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as profilesService from '../electron/database/profiles.js';
import * as connection from '../electron/database/connection.js';

vi.mock('../electron/database/connection.js', () => ({
  getDb: vi.fn(),
}));

describe('Profiles Service', () => {
  let mockDb;
  let mockPrepare;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockPrepare = vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([{ id: '1', name: 'Test Profile' }]),
      get: vi.fn().mockReturnValue({ id: '1', name: 'Test Profile' }),
      run: vi.fn(),
    });
    
    mockDb = {
      prepare: mockPrepare,
    };
    
    connection.getDb.mockReturnValue(mockDb);
  });

  it('should list profiles', () => {
    const profiles = profilesService.listProfiles();
    expect(profiles).toEqual([{ id: '1', name: 'Test Profile' }]);
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('SELECT * FROM profiles'));
  });

  it('should create profile', () => {
    const profile = profilesService.createProfile('New Profile', null, 'brisa');
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO profiles'));
    expect(profile).toEqual({ id: '1', name: 'Test Profile' });
  });

  it('should get profile by id', () => {
    const profile = profilesService.getProfile('1');
    expect(profile).toEqual({ id: '1', name: 'Test Profile' });
    expect(mockPrepare).toHaveBeenCalledWith('SELECT * FROM profiles WHERE id = ?');
  });
});
