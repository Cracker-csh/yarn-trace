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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/permissions.decorator';
import { Request } from 'express';
import { UserStatus } from '@prisma/client';

interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    email?: string;
    role?: { code?: string };
    permissions?: string[];
  };
}

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Get all registered users' })
  async findAll() {
    const data = await this.usersService.findAll();
    return {
      message: 'Users retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Get user details by ID' })
  async findOne(@Param('id') id: string) {
    const data = await this.usersService.findOne(id);
    return {
      message: 'User retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Create a new user account (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(
    @Body() dto: CreateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.usersService.create(dto, adminUserId);
    return {
      message: 'User created successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Update user details (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.usersService.update(id, dto, adminUserId);
    return {
      message: 'User updated successfully',
      data,
    };
  }

  @Patch(':id/status')
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Activate or deactivate a user account (Admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: UserStatus,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.usersService.updateStatus(id, status, adminUserId);
    return {
      message: 'User status updated successfully',
      data,
    };
  }

  @Post(':id/reset-password')
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Reset a user password and issue a temporary credential (Admin only)' })
  @ApiResponse({ status: 200, description: 'Temporary password issued successfully' })
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.usersService.resetPassword(id, dto, adminUserId);
    return {
      message: data.message,
      data,
    };
  }

  @Delete(':id')
  @RequirePermission('manage_users')
  @ApiOperation({ summary: 'Delete or safely deactivate a user account (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted or safely deactivated' })
  @ApiResponse({ status: 400, description: 'Self-deletion or last administrator deletion blocked' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const adminUserId = req.user?.id;
    const data = await this.usersService.delete(id, adminUserId);
    return {
      message: data.message,
      data,
    };
  }
}
