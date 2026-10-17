import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppCacheService } from '../common/cache/app-cache.service';

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: AppCacheService,
  ) {}

  async findAll() {
    return this.cacheService.getOrSet(
      'permissions:all',
      async () => {
        return this.prisma.permission.findMany({
          orderBy: [{ module: 'asc' }, { name: 'asc' }],
        });
      },
      300,
    );
  }
}
