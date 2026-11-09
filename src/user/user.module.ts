import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserEntity } from './entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from '../image/entities/image.entity';
import { ImageModule } from '../image/image.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ImageEntity]),
    ImageModule,
    JwtModule.registerAsync({
      useFactory: (): JwtModuleOptions => {
        const secret = process.env.JWT_SECRET;

console.log('JWT definido:', secret !== undefined);
console.log('JWT tamanho:', Buffer.byteLength(secret ?? '', 'utf8'));
        if (!secret || Buffer.byteLength(secret) < 32) {
          throw new Error('Configure JWT_SECRET com pelo menos 32 bytes.');
        }
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: 3600 },
        };
      },
    }),
  ],
  controllers: [UserController],
  providers: [UserService, JwtAuthGuard],
  exports: [UserService, JwtModule, JwtAuthGuard],
})
export class UserModule {}
