import type { PerfilUsuario } from '../enums/enums';
import { Expose, Transform, Type } from 'class-transformer';
import { ImgResponseDto } from './img-response.dto';
import { ImovelResponseDto } from './imovel-response.dto';

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  nome: string;

  @Expose()
  email: string;

  @Expose()
  perfil: PerfilUsuario;

  @Expose()
  ativo: boolean;

  @Expose()
  @Type(() => ImgResponseDto)
  img: ImgResponseDto | null;

  @Expose()
  @Type(() => ImovelResponseDto)
  imoveis: Omit<ImovelResponseDto, 'usuario'>[];

  @Expose()
  telefone: string | null;

  @Expose()
  descricao: string | null;

  @Expose()
  cidade: string;

  @Expose()
  estado: string;

  @Expose()
  @Transform(
    ({ value }: { value: Date | string }) =>
      value instanceof Date ? value.toISOString() : value,
    { toPlainOnly: true },
  )
  criadoEm: string;

  @Expose()
  @Transform(
    ({ value }: { value: Date | string }) =>
      value instanceof Date ? value.toISOString() : value,
    { toPlainOnly: true },
  )
  atualizadoEm: string;
}
