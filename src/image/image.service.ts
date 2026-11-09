import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ParseFilePipeBuilder,
} from '@nestjs/common';
import type { UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { configureCloudinary } from 'src/config/cloudinary.config';
import { ImageEntity } from './entities/image.entity';
import { ImgRequestDto } from 'src/dtos/request/img-request.dto';

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name);
  private readonly cloudinary = configureCloudinary();

  constructor(
    @InjectRepository(ImageEntity)
    private readonly repo: Repository<ImageEntity>,
  ) {}

  async uploadToCloudinary(
    file: Express.Multer.File,
  ): Promise<UploadApiResponse> {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      this.cloudinary.uploader
        .upload_stream(
          {
            folder: 'products',
          },
          (error, result) => {
            if (error) {
              reject(this.toUploadError(error));
              return;
            }

            if (!result) {
              reject(new Error('Cloudinary não retornou resultado do upload'));
              return;
            }

            resolve(result);
          },
        )
        .end(file.buffer);
    });
  }

  async createImages(dtos: ImgRequestDto[]): Promise<ImageEntity[]> {
    if (dtos.length === 0) return [];

    await this.validarArquivos(dtos.map((dto) => dto.file));

    const images: ImageEntity[] = [];
    const uploadedIds: string[] = [];

    try {
      for (const dto of dtos) {
        const uploadResult = await this.uploadToCloudinary(dto.file);
        uploadedIds.push(uploadResult.public_id);

        const image = this.repo.create({
          url: uploadResult.secure_url,
          publicUrlId: uploadResult.public_id,
          isPrimary: dto.isPrimary,
          imovelId: dto.imovelId ?? null,
          usuarioId: dto.usuarioId ?? null,
        });
        images.push(image);
      }

      return await this.repo.save(images);
    } catch (error) {
      for (const publicUrlId of uploadedIds) {
        await this.limparArquivo(publicUrlId);
      }
      throw error;
    }
  }

  async saveImage(
    dto: ImgRequestDto,
    imagemAtual?: ImageEntity | null,
  ): Promise<ImageEntity> {
    if (!imagemAtual) {
      const [imagem] = await this.createImages([dto]);
      return imagem;
    }

    await this.validarArquivos([dto.file]);
    const upload = await this.uploadToCloudinary(dto.file);
    const imagem = this.repo.create({
      id: imagemAtual.id,
      url: upload.secure_url,
      publicUrlId: upload.public_id,
      isPrimary: dto.isPrimary,
      usuarioId: dto.usuarioId ?? null,
      imovelId: dto.imovelId ?? null,
    });

    let salva: ImageEntity;
    try {
      salva = await this.repo.save(imagem);
    } catch (error) {
      if (upload.public_id !== imagemAtual.publicUrlId) {
        await this.limparArquivo(upload.public_id);
      }
      throw error;
    }

    if (imagemAtual.publicUrlId !== salva.publicUrlId) {
      await this.limparArquivo(imagemAtual.publicUrlId);
    }
    return salva;
  }

  private async validarArquivos(files: Express.Multer.File[]): Promise<void> {
    await new ParseFilePipeBuilder()
      .addMaxSizeValidator({
        maxSize: 1048577,
        errorMessage: 'Cada imagem deve ter até 1 MB.',
      })
      .addFileTypeValidator({
        fileType: /^image\/(jpeg|png|webp)$/,
        overrideMimeType: true,
        errorMessage: 'Envie imagens JPG, PNG ou WebP válidas.',
      })
      .build()
      .transform(files);
  }

  private async limparArquivo(publicUrlId: string): Promise<void> {
    try {
      const result: unknown =
        await this.cloudinary.uploader.destroy(publicUrlId);
      if (
        typeof result !== 'object' ||
        result === null ||
        !('result' in result) ||
        (result.result !== 'ok' && result.result !== 'not found')
      ) {
        this.logger.error(`Não foi possível limpar a imagem: ${publicUrlId}`);
      }
    } catch (error) {
      this.logger.error(
        `Erro ao limpar a imagem: ${publicUrlId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private toUploadError(error: UploadApiErrorResponse): Error {
    return new Error(error.message || 'Erro ao enviar imagem para Cloudinary');
  }

  // async deleteImages(imageIds: string[], companyId: string): Promise<void> {
  //   const images = await this.repo.find({
  //     where: { id: In(imageIds), companyId },
  //   });

  //   for (const image of images) {
  //     await this.deleteImageByPublicId(image.publicId);
  //     await this.repo.remove(image);
  //   }
  // }

  // async deleteImageByPublicId(publicId: string): Promise<void> {
  //   try {
  //     const response: unknown = await this.cloudinary.uploader.destroy(
  //       publicId,
  //       {
  //         invalidate: true,
  //       },
  //     );

  //     if (
  //       typeof response !== 'object' ||
  //       response === null ||
  //       !('result' in response) ||
  //       (response.result !== 'ok' && response.result !== 'not found')
  //     ) {
  //       throw new InternalServerErrorException(
  //         'Não foi possível excluir a imagem no Cloudinary.',
  //       );
  //     }
  //   } catch (error) {
  //     this.logger.error(
  //       `Erro ao excluir imagem do Cloudinary: ${publicId}`,
  //       error instanceof Error ? error.stack : undefined,
  //     );
  //     throw error;
  //   }
  // }

  // private toUploadError(error: UploadApiErrorResponse): Error {
  //   return new Error(error.message || 'Erro ao enviar imagem para Cloudinary');
  // }
}
