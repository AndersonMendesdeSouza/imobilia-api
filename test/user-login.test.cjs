process.env.JWT_SECRET = 'chave-exclusiva-para-testes-de-login-jwt';
require('reflect-metadata');
const path = require('node:path');
require('tsconfig-paths').register({
  baseUrl: path.resolve(__dirname, '..'),
  paths: { 'src/*': ['dist/*'] },
});
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { before, after, beforeEach, test } = require('node:test');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { getRepositoryToken } = require('@nestjs/typeorm');
const { Reflector } = require('@nestjs/core');
const {
  ClassSerializerInterceptor,
  ValidationPipe,
} = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const { UserModule } = require('../dist/user/user.module');
const { UserService } = require('../dist/user/user.service');
const { UserEntity } = require('../dist/user/entities/user.entity');
const { ImageEntity } = require('../dist/image/entities/image.entity');
const cloudinaryConfig = require('../dist/config/cloudinary.config');
const senha = 'SenhaTeste123!';
let app;
let jwt;
let fixture;
const usuarios = new Map();
const consultasLogin = [];

before(async () => {
  cloudinaryConfig.configureCloudinary = () => ({ uploader: {} });
  const repo = {
    findOne: async (options) => {
      if (options.select) consultasLogin.push(options);
      const usuario = options.where.id
        ? usuarios.get(options.where.id)
        : [...usuarios.values()].find(
            (usuario) => usuario.email === options.where.email,
          );
      if (!usuario) return null;
      const copy = Object.assign(new UserEntity(), usuario);
      if (!options.select?.senhaHash) delete copy.senhaHash;
      return copy;
    },
    create: (input) => Object.assign(new UserEntity(), input),
    save: async (input) => {
      const usuario = Object.assign(new UserEntity(), input, {
        id: randomUUID(),
        img: null,
        imoveis: [],
        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });
      usuarios.set(usuario.id, usuario);
      return usuario;
    },
  };
  const module = await Test.createTestingModule({ imports: [UserModule] })
    .overrideProvider(getRepositoryToken(UserEntity))
    .useValue(repo)
    .overrideProvider(getRepositoryToken(ImageEntity))
    .useValue({})
    .compile();
  app = module.createNestApplication({ logger: false });
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: true,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  jwt = module.get(JwtService);
  const usuario = await module.get(UserService).create({
    nome: 'Anunciante',
    email: 'login@example.com',
    senha,
    cidade: 'Buriti Alegre',
    estado: 'GO',
  });
  fixture = { ...usuarios.get(usuario.id) };
});
beforeEach(() => {
  usuarios.clear();
  usuarios.set(fixture.id, Object.assign(new UserEntity(), fixture));
  consultasLogin.length = 0;
});
after(async () => {
  if (app) await app.close();
});
const login = (body) =>
  request(app.getHttpServer()).post('/user/login').send(body);

test('valida o hash existente, normaliza o e-mail e retorna somente o JWT assinado', async () => {
  const response = await login({ usuario: ' LOGIN@EXAMPLE.COM ', senha });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(Object.keys(response.body), ['token']);
  const payload = await jwt.verifyAsync(response.body.token, {
    algorithms: ['HS256'],
  });
  assert.equal(payload.sub, fixture.id);
  assert.equal(payload.perfil, 'anunciante');
  assert.equal(payload.exp - payload.iat, 3600);
  assert.deepEqual(Object.keys(payload).sort(), [
    'exp',
    'iat',
    'perfil',
    'sub',
  ]);
  assert.deepEqual(consultasLogin[0], {
    where: { email: 'login@example.com' },
    select: { id: true, senhaHash: true, perfil: true, ativo: true },
  });
});

test('rejeita senha errada e usuário inexistente com a mesma resposta 401', async () => {
  const errada = await login({
    usuario: fixture.email,
    senha: 'SenhaIncorreta!',
  });
  const inexistente = await login({
    usuario: 'inexistente@example.com',
    senha,
  });
  assert.equal(errada.status, 401);
  assert.equal(inexistente.status, 401);
  assert.deepEqual(errada.body, inexistente.body);
  assert.equal(errada.body.message, 'Usuário ou senha inválidos.');
  assert.equal(errada.body.token, undefined);
});

test('não emite token para conta desativada', async () => {
  usuarios.get(fixture.id).ativo = false;
  const response = await login({ usuario: fixture.email, senha });
  assert.equal(response.status, 401);
  assert.equal(response.body.token, undefined);
});

test('um hash salvo inválido não autentica e não causa erro 500', async () => {
  usuarios.get(fixture.id).senhaHash = 'hash-invalido';
  assert.equal((await login({ usuario: fixture.email, senha })).status, 401);
});

for (const dto of [
  {},
  { usuario: 'login@example.com' },
  { senha },
  { usuario: 'email-invalido', senha },
  { usuario: 'login@example.com', senha: '' },
  { usuario: 'login@example.com', senha: 123 },
  { usuario: 'login@example.com', senha: 'a'.repeat(129) },
  { usuario: 'login@example.com', senha, perfil: 'administrador' },
]) {
  test(`valida os dados de entrada: ${JSON.stringify({ ...dto, senha: '[omitida]' })}`, async () => {
    assert.equal((await login(dto)).status, 400);
    assert.equal(consultasLogin.length, 0);
  });
}

test('usa o perfil do banco e rejeita um token adulterado', async () => {
  usuarios.get(fixture.id).perfil = 'administrador';
  const response = await login({ usuario: fixture.email, senha });
  assert.equal(response.status, 200);
  const payload = await jwt.verifyAsync(response.body.token);
  assert.equal(payload.perfil, 'administrador');
  const parts = response.body.token.split('.');
  parts[1] = Buffer.from(
    JSON.stringify({ ...payload, sub: randomUUID() }),
  ).toString('base64url');
  await assert.rejects(jwt.verifyAsync(parts.join('.')));
});

test('um usuário cadastrado pela API consegue fazer login com a senha enviada', async () => {
  const dto = {
    nome: 'Nova conta',
    email: 'nova@example.com',
    senha: 'OutraSenha123!',
    cidade: 'Buriti Alegre',
    estado: 'GO',
  };
  const criada = await request(app.getHttpServer()).post('/user').send(dto);
  assert.equal(criada.status, 201, JSON.stringify(criada.body));
  assert.equal(criada.body.senhaHash, undefined);
  const response = await login({ usuario: dto.email, senha: dto.senha });
  assert.equal(response.status, 200);
  assert.equal(
    (await jwt.verifyAsync(response.body.token)).sub,
    criada.body.id,
  );
});
