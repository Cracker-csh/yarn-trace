import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { AppCacheService } from '../common/cache/app-cache.service';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly cacheService: AppCacheService,
  ) {}

  public invalidateRolesCaches() {
    this.cacheService.delPattern(/^roles/);
    this.cacheService.del('permissions:all');
  }

  async findAll() {
    return this.cacheService.getOrSet(
      'roles:all',
      async () => {
        return this.prisma.role.findMany({
          include: {
            rolePermissions: {
              include: { permission: true },
            },
            _count: {
              select: { users: true },
            },
          },
          orderBy: { name: 'asc' },
        });
      },
      120,
    );
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    return role;
  }

  async create(dto: CreateRoleDto, adminUserId?: string) {
    // Check name uniqueness
    const existingName = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (existingName) {
      throw new ConflictException(`A role with name "${dto.name}" already exists`);
    }

    // Check code uniqueness
    const existingCode = await this.prisma.role.findUnique({
      where: { code: dto.code },
    });
    if (existingCode) {
      throw new ConflictException(`A role with code "${dto.code}" already exists`);
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name.trim(),
        code: dto.code.trim(),
        description: dto.description?.trim() || null,
        isSystem: false,
      },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    await this.auditService.log({
      userId: adminUserId,
      action: 'CREATE',
      module: 'GOVERNANCE',
      entityType: 'Role',
      entityId: role.id,
      newValue: { name: role.name, code: role.code, description: role.description },
    });

    this.invalidateRolesCaches();
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, adminUserId?: string) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    // Check name uniqueness if changing
    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.prisma.role.findUnique({
        where: { name: dto.name },
      });
      if (nameConflict) {
        throw new ConflictException(`A role with name "${dto.name}" already exists`);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name.trim();
    if (dto.description !== undefined) updateData.description = dto.description?.trim() || null;

    const role = await this.prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: {
          select: { users: true },
        },
      },
    });

    // Audit log with before/after
    const oldValue: Record<string, unknown> = {};
    const newValue: Record<string, unknown> = {};

    if (dto.name !== undefined && dto.name !== existing.name) {
      oldValue.name = existing.name;
      newValue.name = role.name;
    }
    if (dto.description !== undefined && dto.description !== existing.description) {
      oldValue.description = existing.description;
      newValue.description = role.description;
    }

    if (Object.keys(newValue).length > 0) {
      await this.auditService.log({
        userId: adminUserId,
        action: 'UPDATE',
        module: 'GOVERNANCE',
        entityType: 'Role',
        entityId: role.id,
        oldValue,
        newValue,
        metadata: { roleCode: role.code },
      });
    }

    this.invalidateRolesCaches();
    return role;
  }

  async remove(id: string, adminUserId?: string) {
    const existing = await this.prisma.role.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    if (existing.code === 'ADMIN') {
      throw new ForbiddenException('The primary Administrator (ADMIN) role cannot be deleted');
    }

    if (existing._count.users > 0) {
      throw new BadRequestException(
        `Cannot delete role "${existing.name}" because ${existing._count.users} user(s) are still assigned to it. Reassign them first.`,
      );
    }

    // Delete role-permission mappings first, then the role
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.role.delete({ where: { id } }),
    ]);

    await this.auditService.log({
      userId: adminUserId,
      action: 'DELETE',
      module: 'GOVERNANCE',
      entityType: 'Role',
      entityId: id,
      oldValue: { name: existing.name, code: existing.code },
    });

    this.invalidateRolesCaches();
    return { message: `Role "${existing.name}" deleted successfully` };
  }

  /**
   * Replace the permission set for a role.
   * Performs a diff-based sync: removes permissions not in the new set,
   * adds permissions that are new.
   *
   * NOTE: Changes to role permissions take effect on the user's next
   * login or token refresh, since permissions are loaded into the JWT
   * at authentication time. This is by design — the existing auth
   * architecture is not modified.
   */
  async assignPermissions(id: string, dto: AssignPermissionsDto, adminUserId?: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID "${id}" not found`);
    }

    // Validate all permission IDs exist
    const permissions = await this.prisma.permission.findMany({
      where: { id: { in: dto.permissionIds } },
    });

    if (permissions.length !== dto.permissionIds.length) {
      const foundIds = new Set(permissions.map((p) => p.id));
      const invalid = dto.permissionIds.filter((pid) => !foundIds.has(pid));
      throw new BadRequestException(`Invalid permission IDs: ${invalid.join(', ')}`);
    }

    const existingPermIds = new Set(role.rolePermissions.map((rp) => rp.permissionId));
    const newPermIds = new Set(dto.permissionIds);

    const toAdd = dto.permissionIds.filter((pid) => !existingPermIds.has(pid));
    const toRemove = role.rolePermissions
      .filter((rp) => !newPermIds.has(rp.permissionId))
      .map((rp) => rp.id);

    await this.prisma.$transaction([
      // Remove revoked permissions
      ...(toRemove.length > 0
        ? [this.prisma.rolePermission.deleteMany({ where: { id: { in: toRemove } } })]
        : []),
      // Add newly granted permissions
      ...(toAdd.length > 0
        ? [
            this.prisma.rolePermission.createMany({
              data: toAdd.map((permissionId) => ({
                roleId: id,
                permissionId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);

    // Audit the permission change
    const oldPermKeys = role.rolePermissions.map((rp) => rp.permission.key);
    const newPermKeys = permissions.map((p) => p.key);

    await this.auditService.log({
      userId: adminUserId,
      action: 'ASSIGN_PERMISSIONS',
      module: 'GOVERNANCE',
      entityType: 'Role',
      entityId: id,
      oldValue: { permissions: oldPermKeys },
      newValue: { permissions: newPermKeys },
      metadata: { roleCode: role.code, roleName: role.name },
    });

    this.invalidateRolesCaches();
    // Return the updated role
    return this.findOne(id);
  }
}
