import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from 'src/app.controller';
import { AppService } from 'src/app.service';
import { ImageEntity } from './entities/image.entity';
import { ImageService } from './image.service';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity])],
  providers: [ImageService],
  exports: [ImageService],
})
export class ImageModule {}
