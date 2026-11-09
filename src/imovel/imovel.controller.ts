import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ValidationPipe,
  ParseUUIDPipe,
  Req,
  HttpCode,
  HttpStatus,
  SerializeOptions,
  UseInterceptors,
  UseGuards,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ImovelService } from './imovel.service';
import { ImovelRequestDto } from '../dtos/request/imovel-request.dto';
import { ImovelResponseDto } from '../dtos/response/imovel-response.dto';
import type { RequestAutenticado } from '../auth/request-autenticado';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('imovel')
@SerializeOptions({ type: ImovelResponseDto })
export class ImovelController {
  constructor(private readonly imovelService: ImovelService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: 1048576, fields: 80, fieldSize: 65536 },
    }),
  )
  async create(
    @Body('dto') dto: string,
    @Req() request: RequestAutenticado,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    let dados: unknown;
    try {
      dados = JSON.parse(dto);
    } catch {
      throw new BadRequestException('O campo dto deve conter um JSON válido.');
    }

    const imovelRequest = (await new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }).transform(dados, {
      type: 'body',
      metatype: ImovelRequestDto,
    })) as ImovelRequestDto;

    return this.imovelService.create(imovelRequest, request.user.id, files);
  }

  @Get()
  findAll() {
    return this.imovelService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.imovelService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        expectedType: ImovelRequestDto,
        skipUndefinedProperties: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    imovelRequest: Partial<ImovelRequestDto>,
    @Req() request: RequestAutenticado,
  ) {
    return this.imovelService.update(id, imovelRequest, request.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestAutenticado,
  ) {
    return this.imovelService.remove(id, request.user.id);
  }
}
