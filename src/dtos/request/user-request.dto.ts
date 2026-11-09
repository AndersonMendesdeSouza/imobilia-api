import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  ArrayMaxSize,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PerfilUsuario } from '../enums/enums';
import { ESTADOS_BRASILEIROS } from '../estados';
import { ImgRequestDto } from './img-request.dto';

// Criação de contas restrita à administração; senhaHash nunca vem do cliente.
export class UserRequestDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 150)
  nome: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(8, 128)
  senha: string;

  @IsString()
  @Length(2, 100)
  cidade: string;

  @IsIn(ESTADOS_BRASILEIROS)
  estado: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ImgRequestDto)
  imgs?: ImgRequestDto[];

  @IsOptional()
  @IsString()
  @Length(8, 20)
  telefone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2500)
  descricao?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(PerfilUsuario)
  perfil?: PerfilUsuario;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  ativo?: boolean;
}
