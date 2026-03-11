import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';

/**
 * GoogleStrategy.validate() unit tests
 *
 * The strategy pulls a GoogleUserProfile from the Passport profile object and
 * calls done(null, profile) — it does NOT check email_verified (OQ-BE-02 resolved).
 */
describe('GoogleStrategy.validate', () => {
  let strategy: GoogleStrategy;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        GOOGLE_CLIENT_ID: 'test-client-id',
        GOOGLE_CLIENT_SECRET: 'test-client-secret',
        GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    strategy = module.get<GoogleStrategy>(GoogleStrategy);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate()', () => {
    it('should return a GoogleUserProfile when profile has email and photo', async () => {
      const mockProfile = {
        id: 'google-123',
        displayName: 'John Doe',
        emails: [{ value: 'john@example.com', verified: true }],
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      const done = jest.fn();
      await strategy.validate('access-token', 'refresh-token', mockProfile, done);

      expect(done).toHaveBeenCalledTimes(1);
      expect(done).toHaveBeenCalledWith(null, {
        googleId: 'google-123',
        email: 'john@example.com',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/photo.jpg',
      });
      // done must not be called with an error as first arg
      const [err, user] = done.mock.calls[0];
      expect(err).toBeNull();
      expect(user).toBeDefined();
    });

    it('should set avatarUrl to null when photos is null (no crash)', async () => {
      const mockProfile = {
        id: 'google-456',
        displayName: 'Jane Doe',
        emails: [{ value: 'jane@example.com' }],
        photos: null,
      };

      const done = jest.fn();
      await strategy.validate('access-token', 'refresh-token', mockProfile, done);

      expect(done).toHaveBeenCalledWith(null, expect.objectContaining({
        avatarUrl: null,
      }));
    });

    it('should set avatarUrl to null when photos array is empty', async () => {
      const mockProfile = {
        id: 'google-789',
        displayName: 'No Photo User',
        emails: [{ value: 'nophoto@example.com' }],
        photos: [],
      };

      const done = jest.fn();
      await strategy.validate('access-token', 'refresh-token', mockProfile, done);

      const [err, user] = done.mock.calls[0];
      expect(err).toBeNull();
      expect(user.avatarUrl).toBeNull();
    });

    it('should set email to undefined (not throw) when emails array is empty', async () => {
      // The implementation uses emails?.[0]?.value — if array is empty, email = undefined
      // The strategy does NOT validate email presence — it passes through to service layer.
      // OQ-BE-02: email_verified is NOT checked here intentionally.
      const mockProfile = {
        id: 'google-000',
        displayName: 'No Email User',
        emails: [],
        photos: [{ value: 'https://example.com/photo.jpg' }],
      };

      const done = jest.fn();
      await expect(
        strategy.validate('access-token', 'refresh-token', mockProfile, done),
      ).resolves.not.toThrow();

      // done is called — validation is deferred to service layer
      expect(done).toHaveBeenCalledTimes(1);
      const [err, user] = done.mock.calls[0];
      expect(err).toBeNull();
      expect(user.email).toBeUndefined();
    });

    it('should NOT check email_verified field (OQ-BE-02 resolved)', async () => {
      // Both verified and unverified emails should pass through equally
      const verifiedProfile = {
        id: 'google-v',
        displayName: 'Verified User',
        emails: [{ value: 'verified@example.com', verified: true }],
        photos: [],
      };
      const unverifiedProfile = {
        id: 'google-u',
        displayName: 'Unverified User',
        emails: [{ value: 'unverified@example.com', verified: false }],
        photos: [],
      };

      const doneVerified = jest.fn();
      const doneUnverified = jest.fn();

      await strategy.validate('at', 'rt', verifiedProfile, doneVerified);
      await strategy.validate('at', 'rt', unverifiedProfile, doneUnverified);

      // Both should succeed — no error, no rejection based on verified flag
      const [errV] = doneVerified.mock.calls[0];
      const [errU] = doneUnverified.mock.calls[0];
      expect(errV).toBeNull();
      expect(errU).toBeNull();
    });

    it('should map googleId correctly from profile.id', async () => {
      const mockProfile = {
        id: 'unique-google-id-99',
        displayName: 'Test User',
        emails: [{ value: 'test@example.com' }],
        photos: [{ value: 'https://example.com/avatar.png' }],
      };

      const done = jest.fn();
      await strategy.validate('at', 'rt', mockProfile, done);

      const [, user] = done.mock.calls[0];
      expect(user.googleId).toBe('unique-google-id-99');
    });
  });
});
