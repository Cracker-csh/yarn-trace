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
    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
      });
      if (!role) {
        throw new BadRequestException(`Role with ID "${dto.roleId}" not found`);
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
      message: 'Temporary password generated successfully. Please provide this temporary credential to the user.',
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

