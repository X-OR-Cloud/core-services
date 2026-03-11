import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './user.service';
import { User } from './user.schema';
import { AuthProvider } from '../../core/enums/auth-provider.enum';
import { UserStatuses } from '../../core/enums/user.enum';
import { CreateGoogleUserData } from './user.dto';

/**
 * UsersService — Google SSO related methods
 *
 * Covers: findByGoogleId, createGoogleUser, updateLastLogin
 *
 * Note: UsersService extends BaseService from @hydrabyte/base which requires the
 * Mongoose model to be injected.  We provide a manual mock of the model so tests
 * remain fast and isolated from a real database.
 */
describe('UsersService (Google SSO)', () => {
  let service: UsersService;

  // Full mock of a Mongoose Model instance including the constructor pattern
  // used by createGoogleUser (new this.model({ ... })).
  let mockModelInstance: jest.Mocked<any>;
  let mockModel: jest.Mocked<any>;

  beforeEach(async () => {
    // Mock document instance returned by `new model(data)`
    mockModelInstance = {
      save: jest.fn(),
    };

    // Model constructor mock — called as `new this.model(data)`
    mockModel = jest.fn().mockImplementation(() => mockModelInstance) as any;

    // Static query methods
    mockModel.findOne = jest.fn();
    mockModel.updateOne = jest.fn();
    mockModel.find = jest.fn();
    mockModel.countDocuments = jest.fn();
    mockModel.aggregate = jest.fn();

    // BaseService needs these as well
    mockModel.findById = jest.fn();
    mockModel.create = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getModelToken(User.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // findByGoogleId
  // ---------------------------------------------------------------------------
  describe('findByGoogleId()', () => {
    it('should return a user when the Google ID is found', async () => {
      const mockUser = {
        _id: 'user-id-1',
        googleId: 'g-123',
        username: 'user@example.com',
        provider: AuthProvider.GOOGLE,
        isDeleted: false,
      };

      const execMock = jest.fn().mockResolvedValue(mockUser);
      mockModel.findOne.mockReturnValue({ exec: execMock });

      const result = await service.findByGoogleId('g-123');

      expect(result).toEqual(mockUser);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        googleId: 'g-123',
        isDeleted: false,
      });
    });

    it('should return null when the Google ID is not found', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      mockModel.findOne.mockReturnValue({ exec: execMock });

      const result = await service.findByGoogleId('non-existent-id');

      expect(result).toBeNull();
      // Must NOT throw
    });

    it('should return null for an empty string googleId', async () => {
      const execMock = jest.fn().mockResolvedValue(null);
      mockModel.findOne.mockReturnValue({ exec: execMock });

      const result = await service.findByGoogleId('');

      expect(result).toBeNull();
      expect(mockModel.findOne).toHaveBeenCalledWith({
        googleId: '',
        isDeleted: false,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // createGoogleUser
  // ---------------------------------------------------------------------------
  describe('createGoogleUser()', () => {
    const validData: CreateGoogleUserData = {
      username: 'google.user@example.com',
      googleId: 'g-987',
      fullname: 'Google User',
      avatarUrl: 'https://example.com/avatar.jpg',
      provider: AuthProvider.GOOGLE,
      status: UserStatuses.Active,
      role: 'organization.viewer',
    };

    it('should create a user with provider=google and password=null', async () => {
      const savedUser = {
        _id: 'new-google-user-id',
        username: validData.username,
        googleId: validData.googleId,
        password: null,
        provider: AuthProvider.GOOGLE,
        status: UserStatuses.Active,
        role: 'organization.viewer',
        owner: { orgId: '', groupId: '', userId: '', agentId: '', appId: '' },
        isDeleted: false,
      };
      mockModelInstance.save.mockResolvedValue(savedUser);

      const result = await service.createGoogleUser(validData);

      expect(result).toEqual(savedUser);

      // Verify the model constructor was called with correct fields
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          username: validData.username,
          password: null,
          provider: AuthProvider.GOOGLE,
          googleId: validData.googleId,
          status: UserStatuses.Active,
          role: 'organization.viewer',
          isDeleted: false,
        }),
      );

      // Verify save() was called
      expect(mockModelInstance.save).toHaveBeenCalledTimes(1);
    });

    it('should use username as fullname when fullname is not provided', async () => {
      const dataWithoutFullname: CreateGoogleUserData = {
        ...validData,
        fullname: undefined,
      };

      const savedUser = {
        _id: 'user-id-no-fullname',
        username: dataWithoutFullname.username,
        fullname: dataWithoutFullname.username, // falls back to username
        password: null,
        provider: AuthProvider.GOOGLE,
      };
      mockModelInstance.save.mockResolvedValue(savedUser);

      const result = await service.createGoogleUser(dataWithoutFullname);

      expect(result).toBeDefined();
      // The implementation uses `data.fullname || data.username` as fullname
      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({
          fullname: dataWithoutFullname.username,
        }),
      );
    });

    it('should set avatarUrl to null when provided as null', async () => {
      const dataWithNullAvatar: CreateGoogleUserData = {
        ...validData,
        avatarUrl: null,
      };

      const savedUser = { _id: 'uid', avatarUrl: null, password: null };
      mockModelInstance.save.mockResolvedValue(savedUser);

      await service.createGoogleUser(dataWithNullAvatar);

      expect(mockModel).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: null }),
      );
    });

    it('should propagate error when save() fails', async () => {
      mockModelInstance.save.mockRejectedValue(new Error('Unique constraint violation'));

      await expect(service.createGoogleUser(validData)).rejects.toThrow(
        'Unique constraint violation',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // updateLastLogin
  // ---------------------------------------------------------------------------
  describe('updateLastLogin()', () => {
    it('should call updateOne with lastLoginAt and updatedAt for the given userId', async () => {
      const execMock = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      mockModel.updateOne.mockReturnValue({ exec: execMock });

      const userId = 'user-id-abc';
      await service.updateLastLogin(userId);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        {
          $set: expect.objectContaining({
            lastLoginAt: expect.any(Date),
            updatedAt: expect.any(Date),
          }),
        },
      );
      expect(execMock).toHaveBeenCalledTimes(1);
    });

    it('should resolve without error for a valid userId', async () => {
      const execMock = jest.fn().mockResolvedValue({ modifiedCount: 1 });
      mockModel.updateOne.mockReturnValue({ exec: execMock });

      await expect(service.updateLastLogin('any-valid-id')).resolves.toBeUndefined();
    });

    it('should propagate error if updateOne fails', async () => {
      const execMock = jest.fn().mockRejectedValue(new Error('DB write error'));
      mockModel.updateOne.mockReturnValue({ exec: execMock });

      await expect(service.updateLastLogin('bad-id')).rejects.toThrow('DB write error');
    });
  });
});
