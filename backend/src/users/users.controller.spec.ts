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
  });
});
