import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: AppCacheService,
  ) {}

  async findAll(includeInactive = false) {
    const cacheKey = `parties:all:${includeInactive}`;
    return this.cacheService.getOrSet(cacheKey, async () => {
      return this.prisma.party.findMany({
        where: includeInactive ? {} : { isActive: true },
        include: {
          _count: {
            select: {
              suppliedLots: true,
              purchaseOrders: true,
              deliveries: true,
              transactions: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      });
    }, 60);
  }

  async findById(id: string) {
    const party = await this.prisma.party.findUnique({
      where: { id },
      include: {
        suppliedLots: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            suppliedLots: true,
            purchaseOrders: true,
            deliveries: true,
            transactions: true,
          },
        },
      },
    });

    if (!party) {
      throw new NotFoundException(`Party with ID "${id}" not found`);
    }

    return party;
  }

  async create(dto: CreatePartyDto, userId?: string) {
    const existing = await this.prisma.party.findUnique({
      where: { code: dto.code.trim().toUpperCase() },
    });

    if (existing) {
      throw new ConflictException(`Party with code "${dto.code}" already exists`);
    }

    const party = await this.prisma.party.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        type: dto.type,
        contactPerson: dto.contactPerson?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        gstNumber: dto.gstNumber?.trim() || null,
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'CREATE_PARTY',
        module: 'COMMERCIAL',
        entityType: 'Party',
        entityId: party.id,
        newValue: party as unknown as object,
        metadata: { partyCode: party.code, name: party.name },
      },
    });

    this.cacheService.delPattern(/^parties/);
    return party;
  }

  async update(id: string, dto: UpdatePartyDto, userId?: string) {
    const existing = await this.findById(id);

    const updated = await this.prisma.party.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        type: dto.type !== undefined ? dto.type : undefined,
        contactPerson: dto.contactPerson !== undefined ? dto.contactPerson?.trim() || null : undefined,
        email: dto.email !== undefined ? dto.email?.trim() || null : undefined,
        phone: dto.phone !== undefined ? dto.phone?.trim() || null : undefined,
        address: dto.address !== undefined ? dto.address?.trim() || null : undefined,
        gstNumber: dto.gstNumber !== undefined ? dto.gstNumber?.trim() || null : undefined,
        isActive: dto.isActive !== undefined ? dto.isActive : undefined,
      },
    });

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: 'UPDATE_PARTY',
        module: 'COMMERCIAL',
        entityType: 'Party',
        entityId: updated.id,
        oldValue: existing as unknown as object,
        newValue: updated as unknown as object,
        metadata: { partyCode: updated.code },
      },
    });

    this.cacheService.delPattern(/^parties/);
    return updated;
  }

  async deactivate(id: string, userId?: string) {
    return this.update(id, { isActive: false }, userId);
  }
}
