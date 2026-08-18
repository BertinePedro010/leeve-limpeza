# Copiar e rodar no Windows

Copie a pasta `festaflow-desktop` para:

```text
H:\Projetos\festaflow-desktop
```

Depois execute os comandos abaixo no PowerShell ou Prompt de Comando.

## 1. Entrar na pasta

```bat
cd /d H:\Projetos\festaflow-desktop
```

## 2. Instalar dependencias

```bat
npm install
npm run install:all
```

Ou use:

```bat
scripts\01-instalar.bat
```

## 3. Criar banco SQLite e popular dados

```bat
npm run db:push
npm run db:seed
```

Ou use:

```bat
scripts\02-criar-banco.bat
```

## 4. Rodar o sistema local

```bat
npm run dev
```

Ou use:

```bat
scripts\03-rodar-dev.bat
```

## 5. Gerar o instalador .exe

```bat
npm run dist
```

Ou use:

```bat
scripts\04-gerar-exe.bat
```

O instalador sera criado em:

```text
H:\Projetos\festaflow-desktop\release
```

## Login

```text
Email: admin@festaflow.local
Senha: admin123
```
