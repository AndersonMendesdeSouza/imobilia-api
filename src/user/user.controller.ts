import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  ValidationPipe,
  ParseUUIDPipe,
  SerializeOptions,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { UserRequestDto } from '../dtos/request/user-request.dto';
import { UserResponseDto } from '../dtos/response/user-response.dto';
import { LoginRequestDto } from '../dtos/request/login-request.dto';
import { LoginResponseDto } from '../dtos/response/login-response.dto';

type RequestAutenticado = Request & { user?: { id: string } };

@Controller('user')
@SerializeOptions({ type: UserResponseDto })
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(
    @Body() userRequest: UserRequestDto,
    // @Req() request: RequestAutenticado,
  ) {
    return this.userService.create(userRequest);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ type: LoginResponseDto })
  login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    return this.userService.login(dto);
  }

  @Get()
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  @Put(':id/img')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 1048576, files: 1 } }),
  )
  updateImg(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
    // @Req() request: RequestAutenticado,
  ) {
    return this.userService.updateImg(id, file);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        expectedType: UserRequestDto,
        skipUndefinedProperties: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    userRequest: Partial<UserRequestDto>,
    @Req() request: RequestAutenticado,
  ) {
    // return this.userService.update(id, userRequest, this.getUsuarioId(request));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: RequestAutenticado,
  ) {
    // return this.userService.remove(id, this.getUsuarioId(request));
  }

  private getUsuarioId(request: RequestAutenticado): string {
    if (!request.user?.id) {
      throw new UnauthorizedException('Entre na sua conta para continuar.');
    }
    return request.user.id;
  }
}
