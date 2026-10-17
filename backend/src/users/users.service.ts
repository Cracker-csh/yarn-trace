import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { HashUtil } from '../common/utils/hash.util';
import { UserStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly userSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    phoneNumber: true,
    status: true,
    role: {
      select: { id: true, name: true, code: true },
    },
    createdAt: true,
    updatedAt: true,
  };

  async findAll() {
    return this.prisma.user.findMany({
      select: this.userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...this.userSelect,
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  async create(dto: CreateUserDto, adminUserId?: string) {
    // Validate email uniqueness
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('A user with this email address already exists');
    }

    // Validate role exists
    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });
    if (!role) {
      throw new BadRequestException(`Role with ID "${dto.roleId}" not found`);
    }

    const passwordHash = await HashUtil.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phoneNumber: dto.phoneNumber?.trim() || null,
        roleId: dto.roleId,
      },
      select: this.userSelect,
    });

    // Audit log
    await this.auditService.log({
      userId: adminUserId,
      action: 'CREATE',
      module: 'GOVERNANCE',
      entityType: 'User',
      entityId: user.id,
      newValue: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.name,
        status: user.status,
      },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, adminUserId?: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect,
    });

    if (!existing) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Validate role if changing
    if (dto.roleId && dto.roleId !== existing.role.id) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) {
        throw new BadRequestException(`Role with ID "${dto.roleId}" not found`);
      }

      // Protect last active administrator account from demotion
      if (existing.role.code === 'ADMIN' && role.code !== 'ADMIN' && existing.status === UserStatus.ACTIVE) {
        const activeAdminCount = await this.prisma.user.count({
          where: {
            role: { code: 'ADMIN' },
            status: UserStatus.ACTIVE,
          },
        });

        if (activeAdminCount <= 1) {
          throw new BadRequestException(
            'Cannot demote the last active administrator account. At least one active administrator is required for system operation and recovery.',
          );
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.firstName !== undefined) updateData.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName.trim();
    if (dto.phoneNumber !== undefined) updateData.phoneNumber = dto.phoneNumber?.trim() || null;
    if (dto.roleId !== undefined) updateData.roleId = dto.roleId;

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: this.userSelect,
    });

    // Audit log with before/after
    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};

    if (dto.firstName !== undefined && dto.firstName !== existing.firstName) {
      oldValue.firstName = existing.firstName;
      newValue.firstName = user.firstName;
    }
    if (dto.lastName !== undefined && dto.lastName !== existing.lastName) {
      oldValue.lastName = existing.lastName;
      newValue.lastName = user.lastName;
    }
    if (dto.phoneNumber !== undefined && dto.phoneNumber !== existing.phoneNumber) {
      oldValue.phoneNumber = existing.phoneNumber;
      newValue.phoneNumber = user.phoneNumber;
    }
    if (dto.roleId !== undefined && dto.roleId !== existing.role.id) {
      oldValue.role = existing.role.name;
      newValue.role = user.role.name;
    }

    if (Object.keys(newValue).length > 0) {
      await this.auditService.log({
        userId: adminUserId,
        action: 'UPDATE',
        module: 'GOVERNANCE',
        entityType: 'User',
        entityId: user.id,
        oldValue,
        newValue,
        metadata: { targetUserEmail: user.email },
      });
    }

    return user;
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    adminUserId?: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect,
    });

    if (!existing) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    if (existing.status === status) {
      return existing;
    }

    // Prevent deactivating your own account
    if (adminUserId === id && status !== 'ACTIVE') {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    // Protect last active administrator account from deactivation
    if (existing.role.code === 'ADMIN' && status !== 'ACTIVE') {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: { code: 'ADMIN' },
          status: UserStatus.ACTIVE,
        },
      });

      if (activeAdminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete or deactivate the last active administrator account. At least one active administrator is required for system operation and recovery.',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: this.userSelect,
    });

    await this.auditService.log({
      userId: adminUserId,
      action: 'USER_STATUS_CHANGE',
      module: 'GOVERNANCE',
      entityType: 'User',
      entityId: user.id,
      oldValue: { status: existing.status },
      newValue: { status: user.status },
      metadata: { targetUserEmail: user.email },
    });

    return user;
  }

  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    adminUserId?: string,
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // Determine temporary password
    const temporaryPassword =
      dto.temporaryPassword?.trim() ||
      this.generateSecureTemporaryPassword();

    // Hash the temporary password using HashUtil (bcrypt)
    const passwordHash = await HashUtil.hash(temporaryPassword);

    // Update user's passwordHash and revoke refresh token sessions
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        refreshTokenHash: null,
      },
    });

    // Record audit log entry without exposing plaintext credentials or password hashes
    await this.auditService.log({
      userId: adminUserId,
      action: 'USER_PASSWORD_RESET',
      module: 'GOVERNANCE',
      entityType: 'User',
      entityId: existing.id,
      metadata: {
        targetUserEmail: existing.email,
        reason: dto.reason?.trim() || 'Admin initiated temporary password reset',
        sessionsRevoked: true,
      },
    });

    return {
      userId: existing.id,
      email: existing.email,
      temporaryPassword,
      requiresPasswordChange: true,
      message: 'Temporary password generated successfully. Please provide this temporary credential to the user. The user must change their password on next login.',
    };
  }

  async delete(id: string, adminUserId?: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    // 1. Prevent self-deletion
    if (adminUserId && adminUserId === id) {
      throw new BadRequestException('You cannot delete your own account to prevent administrative lockout');
    }

    // 2. Protect critical system accounts and last active administrator
    if (targetUser.role.code === 'ADMIN') {
      const activeAdminCount = await this.prisma.user.count({
        where: {
          role: { code: 'ADMIN' },
          status: UserStatus.ACTIVE,
        },
      });

      if (targetUser.status === UserStatus.ACTIVE && activeAdminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete or deactivate the last active administrator account. At least one active administrator is required for system operation and recovery.',
        );
      }

      const totalAdminCount = await this.prisma.user.count({
        where: {
          role: { code: 'ADMIN' },
        },
      });

      if (totalAdminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete the primary administrator account. The system requires at least one administrator account.',
        );
      }
    }

    // 3. Inspect historical business records and foreign-key dependencies
    const [
      transactionCount,
      productionOrderCount,
      allocationCount,
      consumptionCount,
      returnCount,
      outputCount,
      auditLogCount,
    ] = await Promise.all([
      this.prisma.transaction.count({ where: { createdById: id } }),
      this.prisma.productionOrder.count({ where: { createdById: id } }),
      this.prisma.yarnAllocation.count({ where: { allocatedById: id } }),
      this.prisma.consumptionRecord.count({ where: { recordedById: id } }),
      this.prisma.productionReturn.count({ where: { recordedById: id } }),
      this.prisma.productionOutput.count({ where: { recordedById: id } }),
      this.prisma.auditLog.count({ where: { userId: id } }),
    ]);

    const totalHistoricalReferences =
      transactionCount +
      productionOrderCount +
      allocationCount +
      consumptionCount +
      returnCount +
      outputCount +
      auditLogCount;

    // 4. Safe deactivation if historical records exist to preserve audit trails & relational integrity
    if (totalHistoricalReferences > 0) {
      await this.prisma.user.update({
        where: { id },
        data: {
          status: UserStatus.INACTIVE,
          refreshTokenHash: null,
        },
      });

      const refParts: string[] = [];
      if (transactionCount > 0) refParts.push(`${transactionCount} stock transaction(s)`);
      if (productionOrderCount > 0) refParts.push(`${productionOrderCount} production order(s)`);
      if (allocationCount > 0) refParts.push(`${allocationCount} yarn allocation(s)`);
      if (consumptionCount > 0) refParts.push(`${consumptionCount} consumption record(s)`);
      if (returnCount > 0) refParts.push(`${returnCount} production return(s)`);
      if (outputCount > 0) refParts.push(`${outputCount} production output(s)`);
      if (auditLogCount > 0) refParts.push(`${auditLogCount} audit log(s)`);

      const refSummary = refParts.join(', ');

      await this.auditService.log({
        userId: adminUserId,
        action: 'USER_DEACTIVATE_PRESERVE_HISTORY',
        module: 'GOVERNANCE',
        entityType: 'User',
        entityId: targetUser.id,
        oldValue: { status: targetUser.status },
        newValue: { status: UserStatus.INACTIVE },
        metadata: {
          targetUserEmail: targetUser.email,
          reason: 'Safe deactivation performed instead of permanent deletion due to protected historical references',
          references: {
            transactions: transactionCount,
            productionOrders: productionOrderCount,
            allocations: allocationCount,
            consumptions: consumptionCount,
            returns: returnCount,
            outputs: outputCount,
            auditLogs: auditLogCount,
          },
        },
      });

      return {
        action: 'DEACTIVATED' as const,
        permanent: false,
        deactivated: true,
        userId: targetUser.id,
        email: targetUser.email,
        message: `User account "${targetUser.firstName} ${targetUser.lastName}" has protected historical records (${refSummary}). To preserve audit trails and business history, the account was safely deactivated instead of permanently deleted.`,
        references: {
          transactions: transactionCount,
          productionOrders: productionOrderCount,
          allocations: allocationCount,
          consumptions: consumptionCount,
          returns: returnCount,
          outputs: outputCount,
          auditLogs: auditLogCount,
        },
      };
    }

    // 5. Permanent deletion for users without protected references
    await this.prisma.userPermission.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });

    await this.auditService.log({
      userId: adminUserId,
      action: 'USER_PERMANENT_DELETE',
      module: 'GOVERNANCE',
      entityType: 'User',
      entityId: targetUser.id,
      oldValue: {
        email: targetUser.email,
        firstName: targetUser.firstName,
        lastName: targetUser.lastName,
        role: targetUser.role.name,
        status: targetUser.status,
      },
      newValue: null,
      metadata: {
        targetUserEmail: targetUser.email,
        permanent: true,
      },
    });

    return {
      action: 'DELETED' as const,
      permanent: true,
      deactivated: false,
      userId: targetUser.id,
      email: targetUser.email,
      message: `User account "${targetUser.firstName} ${targetUser.lastName}" was permanently deleted successfully.`,
      references: {},
    };
  }

  private generateSecureTemporaryPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
    const randomBytes = crypto.randomBytes(9);
    let result = 'YT#';
    for (let i = 0; i < randomBytes.length; i++) {
      result += chars[randomBytes[i] % chars.length];
    }
    return result;
  }
}

