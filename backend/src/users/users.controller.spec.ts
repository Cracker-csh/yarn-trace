import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Request } from 'express';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUsersService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    resetPassword: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all users from service', async () => {
      const mockResult = [{ id: 'user-1', email: 'test@yarntrace.com' }];
      mockUsersService.findAll.mockResolvedValue(mockResult);

      const res = await controller.findAll();

      expect(mockUsersService.findAll).toHaveBeenCalled();
      expect(res.data).toEqual(mockResult);
      expect(res.message).toBe('Users retrieved successfully');
    });

    it('should never expose password hashes or plaintext passwords in user list', async () => {
      const mockResult = [
        {
          id: 'user-1',
          email: 'test@yarntrace.com',
          firstName: 'Admin',
          lastName: 'User',
          role: { code: 'ADMIN', name: 'Administrator' },
        },
      ];
      mockUsersService.findAll.mockResolvedValue(mockResult);

      const res = await controller.findAll();

      res.data.forEach((user: Record<string, unknown>) => {
        expect(user.passwordHash).toBeUndefined();
        expect(user.refreshTokenHash).toBeUndefined();
        expect(user.password).toBeUndefined();
        expect(user.temporaryPassword).toBeUndefined();
      });
    });
  });

  describe('delete', () => {
    it('should pass target id and adminUserId to usersService.delete', async () => {
      const mockDeleteResult = {
        action: 'DELETED',
        permanent: true,
        deactivated: false,
        userId: 'user-to-delete',
        email: 'test@yarntrace.com',
        message: 'User account permanently deleted successfully.',
        references: {},
      };
      mockUsersService.delete.mockResolvedValue(mockDeleteResult);

      const mockReq = {
        user: { id: 'admin-request-id' },
      } as unknown as Request;

      const res = await controller.delete('user-to-delete', mockReq);

      expect(mockUsersService.delete).toHaveBeenCalledWith(
        'user-to-delete',
        'admin-request-id',
      );
      expect(res.data).toEqual(mockDeleteResult);
      expect(res.message).toBe(mockDeleteResult.message);
    });
  });

  describe('updateStatus', () => {
    it('should enforce requirePermission("manage_users") on updateStatus', () => {
      const permissions = Reflect.getMetadata(
        'permissions',
        UsersController.prototype.updateStatus,
      );
      expect(permissions).toBeDefined();
      expect(permissions).toContain('manage_users');
    });

    it('should forward status update to usersService.updateStatus', async () => {
      const mockResult = { id: 'u-1', status: 'INACTIVE' };
      mockUsersService.updateStatus.mockResolvedValue(mockResult);

      const mockReq = { user: { id: 'admin-1' } } as unknown as Request;
      const res = await controller.updateStatus('u-1', 'INACTIVE' as any, mockReq);

      expect(mockUsersService.updateStatus).toHaveBeenCalledWith('u-1', 'INACTIVE', 'admin-1');
      expect(res.data).toEqual(mockResult);
    });
  });

  describe('update', () => {
    it('should enforce requirePermission("manage_users") on update', () => {
      const permissions = Reflect.getMetadata(
        'permissions',
        UsersController.prototype.update,
      );
      expect(permissions).toBeDefined();
      expect(permissions).toContain('manage_users');
    });
  });

  describe('resetPassword', () => {
    it('should pass target id, dto, and adminUserId to usersService.resetPassword', async () => {
      const mockResetResult = {
        userId: 'user-target',
        email: 'target@yarntrace.com',
        temporaryPassword: 'YT#123456789',
        message: 'Temporary password generated successfully.',
      };
      mockUsersService.resetPassword.mockResolvedValue(mockResetResult);

      const mockReq = {
        user: { id: 'admin-request-id' },
      } as unknown as Request;

      const res = await controller.resetPassword(
        'user-target',
        { reason: 'User forgot password' },
        mockReq,
      );

      expect(mockUsersService.resetPassword).toHaveBeenCalledWith(
        'user-target',
        { reason: 'User forgot password' },
        'admin-request-id',
      );
      expect(res.data).toEqual(mockResetResult);
    });

    it('should enforce requirePermission("manage_users") on the reset-password endpoint', () => {
      const permissions = Reflect.getMetadata(
        'permissions',
        UsersController.prototype.resetPassword,
      );
      expect(permissions).toBeDefined();
      expect(permissions).toContain('manage_users');
    });

    it('should block unauthorized users lacking manage_users permission via PermissionsGuard', () => {
      const reflector = new (require('@nestjs/core').Reflector)();
      const guard = new PermissionsGuard(reflector);

      // Unauthorized context: user has no admin role and lacks manage_users
      const unauthorizedContext = {
        getHandler: () => UsersController.prototype.resetPassword,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: 'unauthorized-user',
              role: { code: 'OPERATOR' },
              permissions: ['view_yarn_stock', 'record_consumption'],
            },
          }),
        }),
      } as any;

      expect(guard.canActivate(unauthorizedContext)).toBe(false);

      // Authorized context with manage_users permission
      const authorizedContext = {
        getHandler: () => UsersController.prototype.resetPassword,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              id: 'authorized-admin',
              role: { code: 'ADMIN' },
              permissions: ['manage_users'],
            },
          }),
        }),
      } as any;

      expect(guard.canActivate(authorizedContext)).toBe(true);
    });
  });
});
