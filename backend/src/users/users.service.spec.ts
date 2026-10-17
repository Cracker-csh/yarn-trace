import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { HashUtil } from '../common/utils/hash.util';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    userPermission: {
      deleteMany: jest.fn(),
    },
    transaction: {
      count: jest.fn(),
    },
    productionOrder: {
      count: jest.fn(),
    },
    yarnAllocation: {
      count: jest.fn(),
    },
    consumptionRecord: {
      count: jest.fn(),
    },
    productionReturn: {
      count: jest.fn(),
    },
    productionOutput: {
      count: jest.fn(),
    },
    auditLog: {
      count: jest.fn(),
    },
    role: {
      findUnique: jest.fn(),
    },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should never select or expose passwordHash', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'admin@yarntrace.com',
          firstName: 'Admin',
          lastName: 'User',
          phoneNumber: '+919876543210',
          status: UserStatus.ACTIVE,
          role: { id: 'role-admin', name: 'Administrator', code: 'ADMIN' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(mockUsers);

      const users = await service.findAll();

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        select: expect.objectContaining({
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          role: { select: { id: true, name: true, code: true } },
        }),
        orderBy: { createdAt: 'desc' },
      });

      // Verify passwordHash is not included in the select criteria
      const selectArgs = mockPrismaService.user.findMany.mock.calls[0][0].select;
      expect(selectArgs.passwordHash).toBeUndefined();
      expect(selectArgs.refreshTokenHash).toBeUndefined();

      expect(users).toHaveLength(1);
      expect((users[0] as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    const targetUserId = 'user-reset-1';
    const adminUserId = 'admin-1';

    it('should throw NotFoundException if user to reset does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword(targetUserId, {}, adminUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should securely hash the temporary password using bcrypt and revoke sessions', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        email: 'operator@yarntrace.com',
        firstName: 'Dev',
        lastName: 'Operator',
        status: UserStatus.ACTIVE,
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const hashSpy = jest.spyOn(HashUtil, 'hash').mockResolvedValue('bcrypt_hashed_value');

      const result = await service.resetPassword(
        targetUserId,
        { temporaryPassword: 'ExplicitTempPass123#' },
        adminUserId,
      );

      expect(hashSpy).toHaveBeenCalledWith('ExplicitTempPass123#');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: {
          passwordHash: 'bcrypt_hashed_value',
          refreshTokenHash: null,
        },
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminUserId,
          action: 'USER_PASSWORD_RESET',
          entityType: 'User',
          entityId: targetUserId,
          metadata: expect.objectContaining({
            sessionsRevoked: true,
          }),
        }),
      );

      // Verify audit log metadata never contains the plaintext password
      const auditMeta = mockAuditService.log.mock.calls[0][0].metadata;
      expect(auditMeta.temporaryPassword).toBeUndefined();
      expect(auditMeta.password).toBeUndefined();

      expect(result.temporaryPassword).toBe('ExplicitTempPass123#');
      expect(result.userId).toBe(targetUserId);

      hashSpy.mockRestore();
    });
  });

  describe('delete', () => {
    const adminUserId = 'admin-user-id';
    const targetUserId = 'target-user-id';

    it('should throw NotFoundException if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.delete('nonexistent-id', adminUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should prevent self-deletion to prevent administrative lockout', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: adminUserId,
        email: 'admin@yarntrace.com',
        role: { code: 'ADMIN', name: 'Administrator' },
      });

      await expect(service.delete(adminUserId, adminUserId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(adminUserId, adminUserId)).rejects.toThrow(
        'You cannot delete your own account',
      );
    });

    it('should prevent deletion of the last active administrator', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        email: 'lastadmin@yarntrace.com',
        status: UserStatus.ACTIVE,
        role: { code: 'ADMIN', name: 'Administrator' },
      });

      mockPrismaService.user.count.mockImplementation((args) => {
        if (args?.where?.status === UserStatus.ACTIVE) {
          return Promise.resolve(1); // Only 1 active admin exists
        }
        return Promise.resolve(1);
      });

      await expect(service.delete(targetUserId, adminUserId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(targetUserId, adminUserId)).rejects.toThrow(
        'Cannot delete or deactivate the last active administrator account',
      );
    });

    it('should prevent deletion of the only administrator account in the system', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        email: 'solo_admin@yarntrace.com',
        status: UserStatus.INACTIVE,
        role: { code: 'ADMIN', name: 'Administrator' },
      });

      mockPrismaService.user.count.mockImplementation((args) => {
        if (args?.where?.status === UserStatus.ACTIVE) {
          return Promise.resolve(0);
        }
        return Promise.resolve(1); // Total admin count is 1
      });

      await expect(service.delete(targetUserId, adminUserId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(targetUserId, adminUserId)).rejects.toThrow(
        'Cannot delete the primary administrator account',
      );
    });

    it('should perform safe deactivation when user has historical stock transactions', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        email: 'stockhead@yarntrace.com',
        firstName: 'Suresh',
        lastName: 'Verma',
        status: UserStatus.ACTIVE,
        role: { code: 'STOCK_HEAD', name: 'Stock Head' },
      });

      // User has recorded stock transactions
      mockPrismaService.transaction.count.mockResolvedValue(15);
      mockPrismaService.productionOrder.count.mockResolvedValue(0);
      mockPrismaService.yarnAllocation.count.mockResolvedValue(0);
      mockPrismaService.consumptionRecord.count.mockResolvedValue(0);
      mockPrismaService.productionReturn.count.mockResolvedValue(0);
      mockPrismaService.productionOutput.count.mockResolvedValue(0);
      mockPrismaService.auditLog.count.mockResolvedValue(4);

      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.delete(targetUserId, adminUserId);

      // Verify user was NOT deleted from database (FK constraint protected)
      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();

      // Verify user was safely deactivated and sessions revoked
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: {
          status: UserStatus.INACTIVE,
          refreshTokenHash: null,
        },
      });

      // Verify audit log record
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminUserId,
          action: 'USER_DEACTIVATE_PRESERVE_HISTORY',
          entityType: 'User',
          entityId: targetUserId,
          newValue: { status: UserStatus.INACTIVE },
          metadata: expect.objectContaining({
            references: expect.objectContaining({
              transactions: 15,
              auditLogs: 4,
            }),
          }),
        }),
      );

      expect(result.action).toBe('DEACTIVATED');
      expect(result.permanent).toBe(false);
      expect(result.deactivated).toBe(true);
      expect(result.references.transactions).toBe(15);
      expect(result.message).toContain('protected historical records');
    });

    it('should perform safe deactivation when user has production or allocation records', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        email: 'prodlead@yarntrace.com',
        firstName: 'Anil',
        lastName: 'Patel',
        status: UserStatus.ACTIVE,
        role: { code: 'PRODUCTION_HEAD', name: 'Production Head' },
      });

      mockPrismaService.transaction.count.mockResolvedValue(0);
      mockPrismaService.productionOrder.count.mockResolvedValue(3);
      mockPrismaService.yarnAllocation.count.mockResolvedValue(5);
      mockPrismaService.consumptionRecord.count.mockResolvedValue(8);
      mockPrismaService.productionReturn.count.mockResolvedValue(0);
      mockPrismaService.productionOutput.count.mockResolvedValue(2);
      mockPrismaService.auditLog.count.mockResolvedValue(1);

      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.delete(targetUserId, adminUserId);

      expect(mockPrismaService.user.delete).not.toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: targetUserId },
        data: {
          status: UserStatus.INACTIVE,
          refreshTokenHash: null,
        },
      });

      expect(result.action).toBe('DEACTIVATED');
      expect(result.permanent).toBe(false);
      expect(result.deactivated).toBe(true);
      expect(result.references.productionOrders).toBe(3);
    });

    it('should permanently delete a user who has zero historical business records', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: targetUserId,
        email: 'temporary_operator@yarntrace.com',
        firstName: 'Temp',
        lastName: 'Worker',
        status: UserStatus.ACTIVE,
        role: { code: 'STOCK_NORMAL', name: 'Stock Normal User' },
      });

      // No references whatsoever
      mockPrismaService.transaction.count.mockResolvedValue(0);
      mockPrismaService.productionOrder.count.mockResolvedValue(0);
      mockPrismaService.yarnAllocation.count.mockResolvedValue(0);
      mockPrismaService.consumptionRecord.count.mockResolvedValue(0);
      mockPrismaService.productionReturn.count.mockResolvedValue(0);
      mockPrismaService.productionOutput.count.mockResolvedValue(0);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      mockPrismaService.userPermission.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.user.delete.mockResolvedValue({});

      const result = await service.delete(targetUserId, adminUserId);

      expect(mockPrismaService.userPermission.deleteMany).toHaveBeenCalledWith({
        where: { userId: targetUserId },
      });
      expect(mockPrismaService.user.delete).toHaveBeenCalledWith({
        where: { id: targetUserId },
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: adminUserId,
          action: 'USER_PERMANENT_DELETE',
          entityType: 'User',
          entityId: targetUserId,
        }),
      );

      expect(result.action).toBe('DELETED');
      expect(result.permanent).toBe(true);
      expect(result.deactivated).toBe(false);
      expect(result.message).toContain('permanently deleted successfully');
    });
  });
});
