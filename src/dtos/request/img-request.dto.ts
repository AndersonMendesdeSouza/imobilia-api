import { Transform } from 'class-transformer';
import type { } from 'multer';
import {
  IsBoolean,
  IsDefined,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class ImgRequestDto {
  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  file: Express.Multer.File;

  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsDefined()
  @IsBoolean()
  isPrimary: boolean;

  @IsOptional()
  @IsString()
  usuarioId?: string | null;

  @IsOptional()
  @IsString()
  imovelId?: string | null;
}
