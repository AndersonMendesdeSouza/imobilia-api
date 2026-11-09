# Foto do usuário pelo Postman

1. Crie o usuário normalmente em `POST http://localhost:3000/user`, com JSON.
2. Copie o `id` retornado.
3. Envie `PUT http://localhost:3000/user/ID-DO-USUARIO/img`.
4. Selecione **Authorization → No Auth** para o teste local atual.
5. Em **Body → form-data**, adicione `file`, selecione o tipo **File** e escolha a foto.

O ID precisa ser um UUID de usuário existente. Não envie DTO nem `usuarioId` no Body. Deixe o Postman gerar o Content-Type multipart.

A rota aceita uma imagem JPG, PNG ou WebP de até 1 MB e retorna o usuário com `img` preenchido. Os endpoints de consulta também carregam a imagem.

Ao reenviar uma foto, o registro de imagem é atualizado mantendo o mesmo ID. O arquivo antigo no Cloudinary é removido depois de salvar o novo; uma falha de limpeza é registrada no log. Se salvar a imagem falhar, o serviço tenta remover o upload novo e mantém a foto anterior.

O `@Req()` permanece comentado conforme solicitado. A rota está sem autenticação para os testes locais; a autorização para alterar a foto ainda está pendente.

Para verificar o endpoint sem conectar ao banco ou ao Cloudinary, execute `npm run test:user-img`.
