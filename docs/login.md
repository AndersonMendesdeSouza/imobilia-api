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

O JWT é assinado com HS256, vale uma hora e contém o ID do usuário em `sub`, o `perfil` e os horários de emissão e expiração. Não contém senha nem hash. A chave é lida de `JWT_SECRET`, configurada na `.env` e ignorada pelo Git; não há chave padrão no código. Outros ambientes precisam configurar uma chave secreta aleatória de pelo menos 32 bytes.

E-mail inexistente, senha incorreta e conta desativada retornam HTTP 401 com a mesma mensagem: `Usuário ou senha inválidos.`. Dados ausentes, inválidos ou campos extras retornam 400.

Use o token em **Authorization → Bearer Token** no Postman. O `JwtAuthGuard` protege criação, edição e exclusão de imóveis: valida assinatura e expiração e preenche `request.user` com `id` e `perfil`. O `id` vem do `sub` do JWT. As consultas de imóveis permanecem públicas. Os demais endpoints de usuário mantêm o comportamento atual.

O cadastro continua em `POST /user` com JSON, e a foto em `PUT /user/:id/img` com o campo `file`.

`npm run test:login` verifica o fluxo com repositórios simulados, sem acessar o banco nem o Cloudinary.
