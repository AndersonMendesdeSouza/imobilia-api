import { Module } from '@nestjs/common';
import { ImovelService } from './imovel.service';
import { ImovelController } from './imovel.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImovelEntity } from './entities/imovel.entity';
import { ImageEntity } from '../image/entities/image.entity';
import { UserModule } from '../user/user.module';
import { ImageModule } from 'src/image/image.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImovelEntity, ImageEntity]), UserModule, ImageModule],
  controllers: [ImovelController],
  providers: [ImovelService],
})
export class ImovelModule {}
