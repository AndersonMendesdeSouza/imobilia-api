import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL') ?? '';
  const sslEnabled =
    configService.get<string>('DB_SSL') === 'true' ||
    configService.get<string>('NODE_ENV') === 'production' ||
    /render\.com|railway\.app|neon\.tech|supabase\.co|sslmode=require|ssl=true/i.test(
      databaseUrl,
    );

  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: sslEnabled
      ? {
          rejectUnauthorized: false,
        }
      : false,
    autoLoadEntities: true,
    synchronize: true,
  };
};
