import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PerfilUsuario } from '../dtos/enums/enums';
import type { RequestAutenticado } from './request-autenticado';

interface JwtPayload {
  sub?: string;
  perfil?: PerfilUsuario;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestAutenticado>();
    const token =
      request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) {
      throw new UnauthorizedException('Informe um token Bearer válido.');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Token inválido.');
    }
    if (typeof payload.sub !== 'string' || !isUUID(payload.sub)) {
      throw new UnauthorizedException('Token inválido.');
    }
    if (
      payload.perfil !== PerfilUsuario.ADMINISTRADOR &&
      payload.perfil !== PerfilUsuario.ANUNCIANTE
    ) {
      throw new UnauthorizedException('Token inválido.');
    }
    if (typeof payload.exp !== 'number' || !Number.isSafeInteger(payload.exp)) {
      throw new UnauthorizedException('Token inválido.');
    }

    request.user = { id: payload.sub, perfil: payload.perfil };
    return true;
  }
}
