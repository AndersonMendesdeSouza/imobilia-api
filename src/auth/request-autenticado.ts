import type { Request } from 'express';
import type { PerfilUsuario } from '../dtos/enums/enums';

export interface RequestAutenticado extends Request {
  user: {
    id: string;
    perfil: PerfilUsuario;
  };
}
