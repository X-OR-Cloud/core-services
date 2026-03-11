import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';
import { Organization } from '../organization/organization.schema';
import { User } from '../user/user.schema';
import { LicenseService } from '../license/license.service';
import { AuthProvider } from '../../core/enums/auth-provider.enum';
import { UserStatuses } from '../../core/enums/user.enum';
import { AccessTokenTypes } from '../../core/enums/other.enum';
import { GoogleUserProfile } from './dto/google-auth.dto';

/**
 * AuthService — Google SSO related methods
 *
 * Covers: handleGoogleCallback, generateStateToken, validateAndConsumeStateToken
 */
describe('AuthService (Google SSO)', () => {
  let service: AuthService;
  let mockUserRepo: jest.Mocked<any>;
  let mockTokenStorage: jest.Mocked<Partial<TokenStorageService>>;
  let mockLicenseService: jest.Mocked<any>;

  const JWT_SECRET = 'test-jwt-secret-for-unit-tests';

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.JWT_EXPIRES_IN = '1h';
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    delete process.env.JWT_EXPIRES_IN;
  });

  beforeEach(async () => {
    mockUserRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      updateOne: jest.fn(),
    };

    mockTokenStorage = {
      storeOAuthStateToken: jest.fn(),
      validateAndConsumeOAuthStateToken: jest.fn(),
      storeRefreshToken: jest.fn(),
    };

    mockLicenseService = {
      getLicensesForJWT: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(Organization.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: mockUserRepo },
        { provide: TokenStorageService, useValue: mockTokenStorage },
        { provide: LicenseService, useValue: mockLicenseService },
        // HttpService is required by AuthService constructor — provide a stub
        {
          provide: HttpService,
          useValue: { post: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // handleGoogleCallback
  // ---------------------------------------------------------------------------
  describe('handleGoogleCallback()', () => {
    const baseGoogleUser: GoogleUserProfile = {
      googleId: 'g-123',
      email: 'user@example.com',
      displayName: 'Test User',
      avatarUrl: 'https://example.com/photo.jpg',
    };

    it('Scenario 1: New user — creates user and returns accessToken + refreshToken', async () => {
      // findOne by googleId → null (user not in DB)
      // findOne by username → null (email not taken)
      // create → new user document
      mockUserRepo.findOne
        .mockResolvedValueOnce(null) // googleId lookup
        .mockResolvedValueOnce(null); // username lookup

      const createdUser = {
        _id: { toString: () => 'new-user-id-123' },
        username: 'user@example.com',
        status: UserStatuses.Active,
        role: 'organization.viewer',
        provider: AuthProvider.GOOGLE,
        owner: { orgId: '', groupId: '', agentId: '', appId: '' },
      };
      mockUserRepo.create.mockResolvedValue(createdUser);
      mockTokenStorage.storeRefreshToken.mockReturnValue(undefined);

      const result = await service.handleGoogleCallback(baseGoogleUser);

      // Should return token data, not an error
      expect('error' in result).toBe(false);
      const tokenData = result as any;
      expect(tokenData.accessToken).toBeDefined();
      expect(typeof tokenData.accessToken).toBe('string');
      expect(tokenData.refreshToken).toBeDefined();
      expect(typeof tokenData.refreshToken).toBe('string');
      expect(tokenData.tokenType).toBe(AccessTokenTypes.Bearer);
      expect(mockUserRepo.create).toHaveBeenCalledTimes(1);
      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'user@example.com',
          password: null,
          provider: AuthProvider.GOOGLE,
          googleId: 'g-123',
          status: UserStatuses.Active,
        }),
      );
    });

    it('Scenario 2: Existing active Google user — returns tokens and calls updateLastLogin', async () => {
      const existingUser = {
        _id: { toString: () => 'existing-user-id' },
        username: 'user@example.com',
        status: UserStatuses.Active,
        provider: AuthProvider.GOOGLE,
        role: 'organization.viewer',
        owner: { orgId: '', groupId: '', agentId: '', appId: '' },
      };

      // findOne by googleId → existing user
      mockUserRepo.findOne.mockResolvedValue(existingUser);
      mockUserRepo.updateOne.mockResolvedValue({ modifiedCount: 1 });
      mockTokenStorage.storeRefreshToken.mockReturnValue(undefined);

      const result = await service.handleGoogleCallback(baseGoogleUser);

      expect('error' in result).toBe(false);
      const tokenData = result as any;
      expect(tokenData.accessToken).toBeDefined();
      expect(tokenData.refreshToken).toBeDefined();

      // updateLastLogin is done via userRepo.updateOne
      expect(mockUserRepo.updateOne).toHaveBeenCalledWith(
        { _id: existingUser._id },
        { $set: expect.objectContaining({ lastLoginAt: expect.any(Date) }) },
      );
      // create should NOT be called
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('Scenario 3: Email conflict — email belongs to a local account → returns { error: "email_conflict" }', async () => {
      const localUser = {
        _id: { toString: () => 'local-user-id' },
        username: 'user@example.com',
        provider: AuthProvider.LOCAL,
        status: UserStatuses.Active,
      };

      mockUserRepo.findOne
        .mockResolvedValueOnce(null)      // googleId lookup → not found
        .mockResolvedValueOnce(localUser); // username lookup → found (local account)

      const result = await service.handleGoogleCallback(baseGoogleUser);

      expect(result).toEqual({ error: 'email_conflict' });
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('Scenario 4: Account suspended — existing Google user with inactive status → returns { error: "account_suspended" }', async () => {
      const suspendedUser = {
        _id: { toString: () => 'suspended-user-id' },
        username: 'user@example.com',
        status: UserStatuses.Inactive,
        provider: AuthProvider.GOOGLE,
      };

      mockUserRepo.findOne.mockResolvedValue(suspendedUser);

      const result = await service.handleGoogleCallback(baseGoogleUser);

      expect(result).toEqual({ error: 'account_suspended' });
      expect(mockUserRepo.updateOne).not.toHaveBeenCalled();
      expect(mockUserRepo.create).not.toHaveBeenCalled();
    });

    it('Scenario 5: DB error during createGoogleUser — propagates the error', async () => {
      const dbError = new Error('Database connection failed');

      mockUserRepo.findOne
        .mockResolvedValueOnce(null) // googleId lookup
        .mockResolvedValueOnce(null); // username lookup

      mockUserRepo.create.mockRejectedValue(dbError);

      await expect(service.handleGoogleCallback(baseGoogleUser)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // generateStateToken
  // ---------------------------------------------------------------------------
  describe('generateStateToken()', () => {
    it('should return a 64-character hex string', () => {
      mockTokenStorage.storeOAuthStateToken.mockReturnValue(undefined);

      const token = service.generateStateToken();

      expect(typeof token).toBe('string');
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should call storeOAuthStateToken with the generated token', () => {
      mockTokenStorage.storeOAuthStateToken.mockReturnValue(undefined);

      const token = service.generateStateToken();

      expect(mockTokenStorage.storeOAuthStateToken).toHaveBeenCalledWith(token);
    });

    it('should return different values on successive calls (random)', () => {
      mockTokenStorage.storeOAuthStateToken.mockReturnValue(undefined);

      const token1 = service.generateStateToken();
      const token2 = service.generateStateToken();

      expect(token1).not.toBe(token2);
    });
  });

  // ---------------------------------------------------------------------------
  // validateAndConsumeStateToken
  // ---------------------------------------------------------------------------
  describe('validateAndConsumeStateToken()', () => {
    it('should return true for a valid stored token', () => {
      mockTokenStorage.validateAndConsumeOAuthStateToken.mockReturnValue(true);

      const result = service.validateAndConsumeStateToken('valid-state-token');

      expect(result).toBe(true);
      expect(mockTokenStorage.validateAndConsumeOAuthStateToken).toHaveBeenCalledWith(
        'valid-state-token',
      );
    });

    it('should return false for an unknown/invalid token', () => {
      mockTokenStorage.validateAndConsumeOAuthStateToken.mockReturnValue(false);

      const result = service.validateAndConsumeStateToken('invalid-token');

      expect(result).toBe(false);
    });

    it('should return false for an empty string', () => {
      mockTokenStorage.validateAndConsumeOAuthStateToken.mockReturnValue(false);

      const result = service.validateAndConsumeStateToken('');

      expect(result).toBe(false);
      expect(mockTokenStorage.validateAndConsumeOAuthStateToken).toHaveBeenCalledWith('');
    });

    it('should enforce single-use: second validation of same token returns false', () => {
      // First call: valid; second call: already consumed
      mockTokenStorage.validateAndConsumeOAuthStateToken
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const first = service.validateAndConsumeStateToken('one-time-token');
      const second = service.validateAndConsumeStateToken('one-time-token');

      expect(first).toBe(true);
      expect(second).toBe(false);
    });
  });
});
