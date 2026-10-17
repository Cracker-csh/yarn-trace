import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

interface CachedUser {
  data: any;
  expiresAt: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly userCache = new Map<string, CachedUser>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.accessSecret') ||
        'yarntrace_super_secure_access_secret_token_2026_key',
    });
  }

  async validate(payload: JwtPayload) {
    const cacheKey = payload.sub;
    const now = Date.now();
    const cached = this.userCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    // Combine role permissions with direct user overrides
    const rolePermissions =
      user.role?.rolePermissions.map((rp) => rp.permission.key) || [];
    const directGranted = user.userPermissions
      .filter((up) => up.isGranted)
      .map((up) => up.permission.key);
    const directRevoked = new Set(
      user.userPermissions
        .filter((up) => !up.isGranted)
        .map((up) => up.permission.key),
    );

    const mergedPermissions = Array.from(
      new Set([...rolePermissions, ...directGranted]),
    ).filter((key) => !directRevoked.has(key));

    const validatedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: {
        id: user.role.id,
        name: user.role.name,
        code: user.role.code,
      },
      permissions: mergedPermissions,
    };

    // Cache user permissions for 30 seconds to speed up concurrent requests
    this.userCache.set(cacheKey, {
      data: validatedUser,
      expiresAt: now + 30_000,
    });

    return validatedUser;
  }
}
