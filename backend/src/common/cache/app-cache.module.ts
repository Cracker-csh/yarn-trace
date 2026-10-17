import { Global, Module } from '@nestjs/common';
import { AppCacheService } from './app-cache.service';

@Global()
@Module({
  providers: [AppCacheService],
  exports: [AppCacheService],
})
export class AppCacheModule {}
