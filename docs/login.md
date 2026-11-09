# Login pelo Postman

Use `POST http://localhost:3000/user/login`, com **Authorization → No Auth** e **Body → raw → JSON**:

```json
{
  "usuario": "contato@example.com",
  "senha": "SuaSenhaCadastrada"
}
```

`usuario` é o e-mail cadastrado, normalizado para minúsculas. A senha é comparada com o hash scrypt já utilizado no cadastro, sem alterar espaços ou capitalização.

Sucesso: HTTP 200, retornando somente:

```json
{
  "token": "JWT_ASSINADO"
}
```

O JWT é assinado com HS256, vale uma hora e contém o ID do usuário em `sub`, o `perfil` e os horários de emissão e expiração. Não contém senha nem hash. A chave é lida de `JWT_SECRET`, configurada na `.env` e ignorada pelo Git; não há chave padrão no código. Outros ambientes precisam configurar uma chave privada aleatória de pelo menos 32 bytes.

E-mail inexistente, senha incorreta e conta desativada retornam HTTP 401 com a mesma mensagem: `Usuário ou senha inválidos.`. Dados ausentes, inválidos ou campos extras retornam 400.

Neste passo o endpoint apenas emite o token. As outras rotas continuam com os trechos de autenticação comentados; ainda não existe guard para validar Bearer Token e preencher `request.user`.

O cadastro continua em `POST /user` com JSON, e a foto em `PUT /user/:id/img` com o campo `file`.

`npm run test:login` verifica o fluxo com repositórios simulados, sem acessar o banco nem o Cloudinary.
