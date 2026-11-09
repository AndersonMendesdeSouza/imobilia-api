import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from './user/user.module';
import { ImovelModule } from './imovel/imovel.module';
import { ImageModule } from './image/image.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: false },
  ), TypeOrmModule.forRoot({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_DATABASE,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    autoLoadEntities: true,
    synchronize: true,
  }), UserModule, ImovelModule, ImageModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
