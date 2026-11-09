import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError, Repository } from 'typeorm';
import { PerfilUsuario } from '../dtos/enums/enums';
import { UserRequestDto } from '../dtos/request/user-request.dto';
import { UserEntity } from './entities/user.entity';
import { ImageService } from '../image/image.service';
import { LoginRequestDto } from '../dtos/request/login-request.dto';
import { LoginResponseDto } from '../dtos/response/login-response.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly imageService: ImageService,
    private readonly jwtService: JwtService,
  ) {}

  async create(
    userRequest: UserRequestDto,
    // usuarioAutenticadoId: string,
  ): Promise<UserEntity> {
    // const administrador = await this.buscarUsuarioAtivo(usuarioAutenticadoId);
    // if (administrador.perfil !== PerfilUsuario.ADMINISTRADOR) {
    //   throw new ForbiddenException(
    //     'Somente o administrador pode criar contas.',
    //   );
    // }

    const email = userRequest.email.trim().toLowerCase();
    const existente = await this.userRepository.findOne({ where: { email } });
    if (existente)
      throw new ConflictException('Este email já está cadastrado.');

    const usuario = this.userRepository.create({
      nome: userRequest.nome.trim(),
      email,
      senhaHash: await this.gerarSenhaHash(userRequest.senha),
      perfil: userRequest.perfil ?? PerfilUsuario.ANUNCIANTE,
      ativo: userRequest.ativo ?? true,
      telefone: userRequest.telefone ?? null,
      descricao: userRequest.descricao ?? null,
      cidade: userRequest.cidade.trim(),
      estado: userRequest.estado,
      img: null,
    });

    try {
      const salvo = await this.userRepository.save(usuario);
      return this.findOne(salvo.id);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException('Este email já está cadastrado.');
      }
      throw error;
    }
  }

  async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const usuario = await this.userRepository.findOne({
      where: { email: dto.usuario.trim().toLowerCase() },
      select: { id: true, senhaHash: true, perfil: true, ativo: true },
    });

    // Mantém o cálculo de senha mesmo quando o e-mail não está cadastrado.
    const hash =
      usuario?.senhaHash ??
      `scrypt$32768$8$3$${'0'.repeat(32)}$${'0'.repeat(128)}`;
    const senhaValida = await this.verificarSenha(dto.senha, hash);

    if (!usuario || !usuario.ativo || !senhaValida) {
      throw new UnauthorizedException('Usuário ou senha inválidos.');
    }

    const token = await this.jwtService.signAsync({
      sub: usuario.id,
      perfil: usuario.perfil,
    });
    return { token };
  }

  async findAll(): Promise<UserEntity[]> {
    return this.userRepository.find({
      relations: { img: true, imoveis: { imagens: true } },
      order: { nome: 'ASC' },
    });
  }

  async findOne(id: string): Promise<UserEntity> {
    const usuario = await this.userRepository.findOne({
      where: { id },
      relations: { img: true, imoveis: { imagens: true } },
    });
    if (!usuario) throw new NotFoundException('Usuário não encontrado.');
    return usuario;
  }

  async updateImg(id: string, file: Express.Multer.File): Promise<UserEntity> {
    const usuario = await this.findOne(id);

    await this.imageService.saveImage(
      {
        file,
        isPrimary: true,
        usuarioId: usuario.id,
        imovelId: null,
      },
      usuario.img,
    );

    return this.findOne(usuario.id);
  }

  // async update(
  //   id: string,
  //   userRequest: Partial<UserRequestDto>,
  //   usuarioAutenticadoId: string,
  // ): Promise<UserEntity> {
  //   const responsavel = await this.buscarUsuarioAtivo(usuarioAutenticadoId);
  //   const administrador = responsavel.perfil === PerfilUsuario.ADMINISTRADOR;
  //   if (!administrador && responsavel.id !== id) {
  //     throw new ForbiddenException('Você só pode editar sua própria conta.');
  //   }
  //   if (
  //     !administrador &&
  //     (userRequest.perfil !== undefined || userRequest.ativo !== undefined)
  //   ) {
  //     throw new ForbiddenException(
  //       'Somente o administrador pode alterar permissões ou ativar e desativar contas.',
  //     );
  //   }

  //   const usuario = await this.findOne(id);
  //   const email = userRequest.email?.trim().toLowerCase();
  //   if (email !== undefined && email !== usuario.email) {
  //     const existente = await this.userRepository.findOne({ where: { email } });
  //     if (existente && existente.id !== id) {
  //       throw new ConflictException('Este email já está cadastrado.');
  //     }
  //   }

  //   this.userRepository.merge(usuario, {
  //     nome: userRequest.nome?.trim(),
  //     email,
  //     telefone: userRequest.telefone,
  //     descricao: userRequest.descricao,
  //     cidade: userRequest.cidade?.trim(),
  //     estado: userRequest.estado,
  //   });

  //   if (administrador) {
  //     if (userRequest.perfil !== undefined) usuario.perfil = userRequest.perfil;
  //     if (userRequest.ativo !== undefined) usuario.ativo = userRequest.ativo;
  //   }
  //   if (userRequest.senha !== undefined) {
  //     usuario.senhaHash = await this.gerarSenhaHash(userRequest.senha);
  //   }

  //   // Integre aqui a alteração das imagens quando userRequest.imgs for enviado.
  //   try {
  //     await this.userRepository.save(usuario);
  //     return this.findOne(id);
  //   } catch (error) {
  //     if (
  //       error instanceof QueryFailedError &&
  //       'code' in error &&
  //       error.code === '23505'
  //     ) {
  //       throw new ConflictException('Este email já está cadastrado.');
  //     }
  //     throw error;
  //   }
  // }

  // async remove(id: string, usuarioAutenticadoId: string): Promise<void> {
  //   // const administrador = await this.buscarUsuarioAtivo(usuarioAutenticadoId);
  //   if (administrador.perfil !== PerfilUsuario.ADMINISTRADOR) {
  //     throw new ForbiddenException(
  //       'Somente o administrador pode excluir contas.',
  //     );
  //   }

  //   const usuario = await this.findOne(id);
  //   try {
  //     await this.userRepository.remove(usuario);
  //   } catch (error) {
  //     if (
  //       error instanceof QueryFailedError &&
  //       'code' in error &&
  //       error.code === '23503'
  //     ) {
  //       throw new ConflictException(
  //         'Este usuário possui registros vinculados. Desative a conta ou remova os vínculos antes de excluir.',
  //       );
  //     }
  //     throw error;
  //   }
  //   // Integre a remoção do arquivo no Cloudinary usando usuario.img.
  // }

  // private async buscarUsuarioAtivo(id: string): Promise<UserEntity> {
  //   if (!id)
  //     throw new UnauthorizedException('Entre na sua conta para continuar.');
  //   const usuario = await this.findOne(id);
  //   if (!usuario.ativo)
  //     throw new ForbiddenException('Sua conta está desativada.');
  //   return usuario;
  // }

  private async verificarSenha(
    senha: string,
    senhaHash: string,
  ): Promise<boolean> {
    const partes = senhaHash.match(
      /^scrypt\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{128})$/,
    );
    if (!partes) return false;

    const [, salt, hashSalvo] = partes;
    const hashCalculado = await this.calcularHash(senha, salt);
    return timingSafeEqual(Buffer.from(hashSalvo, 'hex'), hashCalculado);
  }

  private async gerarSenhaHash(senha: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = await this.calcularHash(senha, salt);
    return `scrypt$32768$8$3$${salt}$${hash.toString('hex')}`;
  }

  private calcularHash(senha: string, salt: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      scrypt(
        senha,
        salt,
        64,
        { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
        (error, resultado) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(resultado);
        },
      );
    });
  }
}
