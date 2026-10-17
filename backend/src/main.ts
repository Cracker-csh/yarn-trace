import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 4000;
  // CORS Configuration
  const rawCorsOrigin = configService.get<string>('cors.origin') || 'http://localhost:3000';
  const allowTunnelOrigins = configService.get<boolean>('cors.allowTunnelOrigins') ?? true;

  // Parse comma-separated origins from environment variable
  const configuredOrigins = rawCorsOrigin
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Default local development origins
  const defaultAllowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:4000',
    'http://127.0.0.1:4000',
  ];

  // Regex patterns for development preview tunnels (Cloudflare, LocalTunnel, ngrok)
  const tunnelOriginRegex = /^https:\/\/[a-zA-Z0-9-]+\.(trycloudflare\.com|loca\.lt|ngrok-free\.app|ngrok\.io)$/;
  // Regex pattern for Vercel deployments (production, staging, and preview deployments)
  const vercelOriginRegex = /^https:\/\/[a-zA-Z0-9-_.]+\.vercel\.app$/;
  // Regex pattern for private LAN development origins (e.g. mobile testing over Wi-Fi)
  const lanOriginRegex = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

  // Response Compression (Gzip / Deflate for fast JSON transfers)
  app.use(
    compression({
      threshold: 1024, // only compress responses >= 1KB
    }),
  );

  // Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI compatibility
    }),
  );

  // Enable CORS with dynamic origin resolution & credentials support
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman, server-to-server)
      if (!requestOrigin) {
        return callback(null, true);
      }

      const normalizedOrigin = requestOrigin.replace(/\/+$/, '');

      // 1. Check explicitly configured origins from CORS_ORIGIN
      if (configuredOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // 2. Check default local development origins
      if (defaultAllowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // 3. Check Vercel deployments (production and preview branches)
      if (vercelOriginRegex.test(normalizedOrigin)) {
        return callback(null, true);
      }

      // 4. Check preview tunnel patterns (including *.trycloudflare.com) if enabled
      if (allowTunnelOrigins && tunnelOriginRegex.test(normalizedOrigin)) {
        return callback(null, true);
      }

      // 5. Check LAN development origins for local Wi-Fi mobile testing
      if (lanOriginRegex.test(normalizedOrigin)) {
        return callback(null, true);
      }

      logger.warn(`CORS blocked request from origin: ${requestOrigin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Bypass-Tunnel-Reminder',
      'bypass-tunnel-reminder',
    ],
    exposedHeaders: ['Authorization'],
    maxAge: 86400,
  });

  // Global API Prefix: /api/v1
  app.setGlobalPrefix('api/v1');

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filters
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // Global Interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger / OpenAPI Setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('YarnTrace API')
    .setDescription('Yarn Inventory & Production Traceability API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'YarnTrace API Documentation',
  });

  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 YarnTrace API backend server is running on: http://localhost:${port}/api/v1`);
  logger.log(`📑 Interactive Swagger Documentation: http://localhost:${port}/api/docs`);
  logger.log(`🩺 Health endpoint available at: http://localhost:${port}/api/v1/health`);
}

bootstrap();
