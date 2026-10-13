import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    email?: string;
    role?: { code?: string };
    permissions?: string[];
  };
}

@ApiTags('Roles & Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('manage_roles')
  @ApiOperation({ summary: 'Get all system roles and their permissions' })
  async findAll() {
    const data = await this.rolesService.findAll();
    return {
      message: 'Roles retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @RequirePermission('manage_roles')
  @ApiOperation({ summary: 'Get a single role by ID with permissions' })
  async findOne(@Param('id') id: string) {
    const data = await this.rolesService.findOne(id);
    return {
      message: 'Role retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermission('manage_roles')
  @ApiOperation({ summary: 'Create a new custom role (Admin only)' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 409, description: 'Role name or code already exists' })
  async create(
    @Body() dto: CreateRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.rolesService.create(dto, adminUserId);
    return {
      message: 'Role created successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermission('manage_roles')
  @ApiOperation({ summary: 'Update a role (Admin only)' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.rolesService.update(id, dto, adminUserId);
    return {
      message: 'Role updated successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermission('manage_roles')
  @ApiOperation({ summary: 'Delete a role (Admin only, must have 0 assigned users)' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  @ApiResponse({ status: 400, description: 'Role has assigned users' })
  @ApiResponse({ status: 403, description: 'Primary ADMIN role cannot be deleted' })
  async remove(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.rolesService.remove(id, adminUserId);
    return data;
  }

  @Post(':id/permissions')
  @RequirePermission('manage_roles')
  @ApiOperation({ summary: 'Assign permissions to a role (replaces current set)' })
  @ApiResponse({ status: 200, description: 'Permissions assigned successfully' })
  async assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.rolesService.assignPermissions(id, dto, adminUserId);
    return {
      message: 'Permissions assigned successfully. Note: changes take effect on user\'s next login or token refresh.',
      data,
    };
  }
}
