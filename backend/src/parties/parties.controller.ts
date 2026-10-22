import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PartiesService } from './parties.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';
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

@ApiTags('Parties & Suppliers')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Get()
  @RequirePermission('manage_parties', 'manage_suppliers')
  @ApiOperation({ summary: 'Get all active parties for dropdown selection and management' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  async findAll(@Query('includeInactive') includeInactive?: string) {
    const data = await this.partiesService.findAll(includeInactive === 'true');
    return {
      message: 'Parties retrieved successfully',
      data,
    };
  }

  @Get(':id')
  @RequirePermission('manage_parties', 'manage_suppliers')
  @ApiOperation({ summary: 'Get single party by ID' })
  async findById(@Param('id') id: string) {
    const data = await this.partiesService.findById(id);
    return {
      message: 'Party retrieved successfully',
      data,
    };
  }

  @Post()
  @RequirePermission('manage_parties')
  @ApiOperation({ summary: 'Create new party in Party Master (Admin only)' })
  async create(@Body() dto: CreatePartyDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.partiesService.create(dto, userId);
    return {
      message: 'Party created successfully',
      data,
    };
  }

  @Patch(':id')
  @RequirePermission('manage_parties')
  @ApiOperation({ summary: 'Update party details (Admin only)' })
  async update(@Param('id') id: string, @Body() dto: UpdatePartyDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.partiesService.update(id, dto, userId);
    return {
      message: 'Party updated successfully',
      data,
    };
  }

  @Delete(':id')
  @RequirePermission('manage_parties')
  @ApiOperation({ summary: 'Deactivate party (Admin only)' })
  async deactivate(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    const data = await this.partiesService.deactivate(id, userId);
    return {
      message: 'Party deactivated successfully',
      data,
    };
  }
}
