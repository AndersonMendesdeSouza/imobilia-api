import { Expose } from 'class-transformer';

export class ImgResponseDto {
  @Expose()
  id: string;

  @Expose()
  url: string;

  @Expose()
  publicUrlId: string;

  @Expose()
  isPrimary: boolean;

  @Expose()
  imovelId: string | null;

  @Expose()
  usuarioId: string | null;
}
