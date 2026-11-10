import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerfilUsuario, TipoImovel } from '../dtos/enums/enums';
import { ImovelRequestDto } from '../dtos/request/imovel-request.dto';
import { UserService } from '../user/user.service';
import { UserEntity } from '../user/entities/user.entity';
import { ImovelEntity } from './entities/imovel.entity';
import { ImageService } from 'src/image/image.service';

@Injectable()
export class ImovelService {
  private readonly logger = new Logger(ImovelService.name);

  constructor(
    @InjectRepository(ImovelEntity)
    private readonly imovelRepository: Repository<ImovelEntity>,
    private readonly userService: UserService,
    private readonly imgService: ImageService,
  ) {}

  async create(
    imovelRequest: ImovelRequestDto,
    usuarioId: string,
    files: Express.Multer.File[] = [],
  ): Promise<ImovelEntity> {
    const usuario = await this.buscarUsuarioAtivo(usuarioId);
    if (!files.length)
      throw new BadRequestException('Envie ao menos uma imagem do imóvel.');
    const imovel = this.imovelRepository.create({
      usuarioId: usuario.id,
      titulo: imovelRequest.titulo.trim(),
      descricao: imovelRequest.descricao.trim(),
      tipo: imovelRequest.tipo,
      finalidade: imovelRequest.finalidade,
      valor: imovelRequest.valor.toString(),
      condominioMensal: imovelRequest.condominioMensal.toString(),
      iptuMensal: imovelRequest.iptuMensal.toString(),
      cidade: imovelRequest.cidade.trim(),
      estado: imovelRequest.estado,
      bairro: imovelRequest.bairro.trim(),
      area: imovelRequest.area.toString(),
      quartos: imovelRequest.quartos,
      banheiros: imovelRequest.banheiros,
      vagasGaragem: imovelRequest.vagasGaragem,
      comodidades: imovelRequest.comodidades,
      destaque: false,
    });

    if (imovel.tipo === TipoImovel.LOTE) {
      imovel.quartos = 0;
      imovel.banheiros = 0;
      imovel.vagasGaragem = 0;
    }

    const salvo = await this.imovelRepository.save(imovel);

    await this.imgService.createImages(
      files.map((file, index) => ({
        file,
        isPrimary: index === 0,
        imovelId: salvo.id,
        usuarioId: null,
      })),
    );

    return this.findOne(salvo.id);
  }

  async findAll(): Promise<ImovelEntity[]> {
    return this.imovelRepository.find({
      relations: { usuario: { img: true }, imagens: true },
      order: { criadoEm: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ImovelEntity> {
    const imovel = await this.imovelRepository.findOne({
      where: { id },
      relations: { usuario: { img: true }, imagens: true },
    });

    if (!imovel) throw new NotFoundException('Imóvel não encontrado.');
    return imovel;
  }

  async update(
    id: string,
    imovelRequest: Partial<ImovelRequestDto>,
    usuarioId: string,
    files: Express.Multer.File[] = [],
  ): Promise<ImovelEntity> {
    const usuario = await this.buscarUsuarioAtivo(usuarioId);
    const imovel = await this.findOne(id);
    this.validarResponsavel(imovel, usuario);

    const imagensRemovidas = imovelRequest.imagensRemovidas ?? [];
    for (const imagemId of imagensRemovidas) {
      if (!imovel.imagens.some((imagem) => imagem.id === imagemId)) {
        throw new BadRequestException(
          'Uma das imagens informadas não pertence a este imóvel.',
        );
      }
    }

    const imagensMantidas = imovel.imagens.filter(
      (imagem) => !imagensRemovidas.includes(imagem.id),
    );
    const alterandoImagens = files.length > 0 || imagensRemovidas.length > 0;
    const totalImagens = imagensMantidas.length + files.length;
    if (alterandoImagens && totalImagens === 0) {
      throw new BadRequestException('O imóvel deve ter ao menos uma imagem.');
    }
    if (alterandoImagens && totalImagens > 20) {
      throw new BadRequestException('O imóvel pode ter no máximo 20 imagens.');
    }

    // Envia as novas fotos antes de remover as antigas para preservar as atuais se o upload falhar.
    const novasImagens = await this.imgService.createImages(
      files.map((file) => ({
        file,
        isPrimary: false,
        imovelId: imovel.id,
        usuarioId: null,
      })),
    );
    imovel.imagens = [...imovel.imagens, ...novasImagens];

    this.imovelRepository.merge(imovel, {
      titulo: imovelRequest.titulo?.trim(),
      descricao: imovelRequest.descricao?.trim(),
      tipo: imovelRequest.tipo,
      finalidade: imovelRequest.finalidade,
      valor: imovelRequest.valor?.toString(),
      condominioMensal: imovelRequest.condominioMensal?.toString(),
      iptuMensal: imovelRequest.iptuMensal?.toString(),
      cidade: imovelRequest.cidade?.trim(),
      estado: imovelRequest.estado,
      bairro: imovelRequest.bairro?.trim(),
      area: imovelRequest.area?.toString(),
      quartos: imovelRequest.quartos,
      banheiros: imovelRequest.banheiros,
      vagasGaragem: imovelRequest.vagasGaragem,
      comodidades: imovelRequest.comodidades,
    });

    if (imovel.tipo === TipoImovel.LOTE) {
      imovel.quartos = 0;
      imovel.banheiros = 0;
      imovel.vagasGaragem = 0;
    }

    try {
      await this.imovelRepository.save(imovel);
    } catch (error) {
      try {
        await this.imgService.deleteImages(
          novasImagens.map((imagem) => imagem.id),
        );
      } catch (cleanupError) {
        this.logger.error(
          'Não foi possível remover as novas imagens após falha ao atualizar o imóvel.',
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        );
      }
      throw error;
    }

    if (alterandoImagens) {
      await this.imgService.deleteImages(imagensRemovidas);
      await this.imgService.definirImagemPrincipal([
        ...imagensMantidas,
        ...novasImagens,
      ]);
    }
    return this.findOne(id);
  }

  async remove(id: string, usuarioId: string): Promise<void> {
    const usuario = await this.buscarUsuarioAtivo(usuarioId);
    const imovel = await this.findOne(id);
    this.validarResponsavel(imovel, usuario);

    await this.imgService.deleteImages(
      imovel.imagens.map((imagem) => imagem.id),
    );
    await this.imovelRepository.remove(imovel);
  }

  private async buscarUsuarioAtivo(usuarioId: string): Promise<UserEntity> {
    if (!usuarioId)
      throw new UnauthorizedException('Entre na sua conta para continuar.');

    const usuario = await this.userService.findOne(usuarioId);
    if (!usuario.ativo)
      throw new ForbiddenException('Sua conta está desativada.');
    return usuario;
  }

  private validarResponsavel(imovel: ImovelEntity, usuario: UserEntity): void {
    if (usuario.perfil === PerfilUsuario.ADMINISTRADOR) return;
    if (imovel.usuarioId !== usuario.id) {
      throw new ForbiddenException(
        'Você só pode alterar ou excluir seus próprios imóveis.',
      );
    }
  }
}
