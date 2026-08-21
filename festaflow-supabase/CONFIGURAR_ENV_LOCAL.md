# Configurar ambiente local

Crie o arquivo abaixo, que nao deve ser enviado para Git:

```text
festaflow-supabase/.env.local
```

Com as variaveis reais do Supabase:

```env
DATABASE_URL="postgresql://postgres:SENHA_URL_ENCODED@db.muyfhshqnazlyockmxmy.supabase.co:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:SENHA_URL_ENCODED@db.muyfhshqnazlyockmxmy.supabase.co:5432/postgres?sslmode=require"
NEXT_PUBLIC_SUPABASE_URL="https://muyfhshqnazlyockmxmy.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="SUA_SUPABASE_PUBLISHABLE_KEY"
SUPABASE_SECRET_KEY="SUA_SUPABASE_SECRET_KEY_APENAS_SERVIDOR"
```

Se a senha do banco tiver `@`, codifique como `%40`.

Nunca use `SUPABASE_SECRET_KEY` em componentes client-side.

## E-mail (opcional)

Para o envio automatico de e-mail ao concluir um atendimento, adicione tambem:

```env
SMTP_HOST="smtp.exemplo.com"
SMTP_PORT="587"
SMTP_USER="usuario_smtp"
SMTP_PASS="senha_smtp"
EMAIL_FROM="LeeveLimpeza <contato@leevelimpeza.com>"
```

Sem essas variaveis, o sistema funciona normalmente — o envio e apenas ignorado (com aviso no log do servidor), nunca quebra a conclusao do atendimento.